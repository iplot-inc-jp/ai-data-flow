/**
 * issue-markdown.ts — イシューツリー ⇄ markdown段落（インデント箇条書き）の双方向変換。
 *
 * ユーザー要望「イシューツリーは、mdの段落でできるように」を実現する中核。
 * markdown が真実の源泉で、ツリー描画・編集の両方がこの純粋関数を経由する。
 *
 * 記法:
 *   # ルートの問い                         ← 任意。tree.rootQuestion になる
 *   - [○] 入荷が遅れる @table:suppliers     ← なぜ型: ○確定/×否定/△未確認/?要ヒアリング
 *     - [×] 発注点が低い :: 在庫が減ってから発注  ← " :: " 以降は検証根拠(evidence)
 *   - 【未確認/要ヒアリング】承認が遅れる        ← ?(NEEDS_HEARING) と同義
 *   - [採用] EDI連携で自動発注                ← 打ち手型: 採用/保留/不採用
 *
 *   インデントは2スペース=1階層（タブは2スペース換算）。
 *   @flow:<id> / @crud:<id> / @table:<name> / @gap:<id> / @node:<id> はリンクとして抽出。
 *
 * React に依存しない（単体テスト可能）。
 */

export type Verification = 'CONFIRMED' | 'REJECTED' | 'UNKNOWN' | 'NEEDS_HEARING' | 'NA';
export type Recommendation = 'ADOPT' | 'HOLD' | 'REJECT' | 'NA';
export type IssueLinkType = 'flow' | 'crud' | 'table' | 'gap' | 'node';

export interface IssueLink {
  type: IssueLinkType;
  value: string;
}

export interface ParsedIssueNode {
  label: string;
  verification: Verification;
  recommendation: Recommendation;
  evidence?: string;
  links: IssueLink[];
  children: ParsedIssueNode[];
}

export interface ParsedIssueTree {
  title?: string;
  nodes: ParsedIssueNode[];
}

// --- トークン対応表 ---

const VERIFY_FROM_TOKEN: Record<string, Verification> = {
  '○': 'CONFIRMED', '◯': 'CONFIRMED', '◎': 'CONFIRMED',
  '×': 'REJECTED', '✕': 'REJECTED', 'x': 'REJECTED', 'X': 'REJECTED',
  '△': 'UNKNOWN', '▲': 'UNKNOWN',
  '?': 'NEEDS_HEARING', '？': 'NEEDS_HEARING',
};

const VERIFY_TO_SYMBOL: Record<Verification, string> = {
  CONFIRMED: '○',
  REJECTED: '×',
  UNKNOWN: '△',
  NEEDS_HEARING: '?',
  NA: '',
};

const RECO_FROM_TOKEN: Record<string, Recommendation> = {
  採用: 'ADOPT', '★': 'ADOPT',
  保留: 'HOLD', '☆': 'HOLD',
  不採用: 'REJECT',
};

const RECO_TO_TOKEN: Record<Recommendation, string> = {
  ADOPT: '採用',
  HOLD: '保留',
  REJECT: '不採用',
  NA: '',
};

const LINK_RE = /@(flow|crud|table|gap|node):([^\s]+)/g;
const NEEDS_HEARING_PREFIX = /^【\s*(未確認|要ヒアリング|要計測)[^】]*】\s*/;

const INDENT_UNIT = 2;

// ===========================================
// パース
// ===========================================

export function parseIssueMarkdown(markdown: string): ParsedIssueTree {
  const rawLines = (markdown ?? '').replace(/\t/g, '  ').split('\n');

  let title: string | undefined;
  const roots: ParsedIssueNode[] = [];
  // stack: 各階層の最後のノードと、その「インデント空白数」
  const stack: Array<{ indent: number; node: ParsedIssueNode }> = [];

  for (const raw of rawLines) {
    if (raw.trim() === '') continue;

    // 見出し（ルートの問い）
    const heading = raw.match(/^#{1,6}\s+(.*)$/);
    if (heading && stack.length === 0 && roots.length === 0) {
      title = heading[1].trim();
      continue;
    }

    // 箇条書き行
    const bullet = raw.match(/^(\s*)[-*]\s+(.*)$/);
    if (!bullet) continue;

    const indent = bullet[1].length;
    const node = parseLineContent(bullet[2]);

    // 親を決定（自分より浅いインデントまで stack を巻き戻す）
    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }
    if (stack.length === 0) {
      roots.push(node);
    } else {
      stack[stack.length - 1].node.children.push(node);
    }
    stack.push({ indent, node });
  }

  return { title, nodes: roots };
}

function parseLineContent(content: string): ParsedIssueNode {
  let text = content;
  let verification: Verification = 'NA';
  let recommendation: Recommendation = 'NA';

  // 先頭の [token]
  const bracket = text.match(/^\[([^\]]*)\]\s*/);
  if (bracket) {
    const token = bracket[1].trim();
    if (token in VERIFY_FROM_TOKEN) verification = VERIFY_FROM_TOKEN[token];
    else if (token in RECO_FROM_TOKEN) recommendation = RECO_FROM_TOKEN[token];
    text = text.slice(bracket[0].length);
  }

  // 【未確認/要ヒアリング】プレフィックス
  if (NEEDS_HEARING_PREFIX.test(text)) {
    if (verification === 'NA') verification = 'NEEDS_HEARING';
    text = text.replace(NEEDS_HEARING_PREFIX, '');
  }

  // evidence（" :: " 以降）
  let evidence: string | undefined;
  const ev = text.split(' :: ');
  if (ev.length > 1) {
    text = ev[0];
    evidence = ev.slice(1).join(' :: ').trim() || undefined;
  }

  // リンク抽出
  const links: IssueLink[] = [];
  text = text.replace(LINK_RE, (_m, type: string, value: string) => {
    links.push({ type: type as IssueLinkType, value });
    return '';
  });

  return {
    label: text.replace(/\s+/g, ' ').trim(),
    verification,
    recommendation,
    evidence,
    links,
    children: [],
  };
}

// ===========================================
// シリアライズ
// ===========================================

export function serializeIssueTree(nodes: ParsedIssueNode[], title?: string): string {
  const lines: string[] = [];
  if (title && title.trim()) lines.push(`# ${title.trim()}`, '');
  for (const n of nodes) writeNode(n, 0, lines);
  return lines.join('\n');
}

function writeNode(node: ParsedIssueNode, depth: number, out: string[]): void {
  const indent = ' '.repeat(depth * INDENT_UNIT);
  let line = `${indent}- `;

  const sym = VERIFY_TO_SYMBOL[node.verification];
  if (sym) line += `[${sym}] `;
  else if (node.recommendation !== 'NA') line += `[${RECO_TO_TOKEN[node.recommendation]}] `;

  line += node.label;

  for (const link of node.links ?? []) line += ` @${link.type}:${link.value}`;
  if (node.evidence) line += ` :: ${node.evidence}`;

  out.push(line);
  for (const child of node.children ?? []) writeNode(child, depth + 1, out);
}

// ===========================================
// 便利関数
// ===========================================

/** ツリーを深さ優先で平坦化（parentIndex 付き）。永続化（IssueNode 階層）に使う。 */
export function flattenIssueTree(
  nodes: ParsedIssueNode[],
): Array<{ node: ParsedIssueNode; depth: number; order: number; parentIndex: number | null }> {
  const out: Array<{ node: ParsedIssueNode; depth: number; order: number; parentIndex: number | null }> = [];
  const walk = (list: ParsedIssueNode[], depth: number, parentIndex: number | null) => {
    list.forEach((node, order) => {
      const myIndex = out.length;
      out.push({ node, depth, order, parentIndex });
      walk(node.children ?? [], depth + 1, myIndex);
    });
  };
  walk(nodes, 0, null);
  return out;
}

export const VERIFICATION_LABEL: Record<Verification, string> = {
  CONFIRMED: '○ 確定',
  REJECTED: '× 否定',
  UNKNOWN: '△ 未確認',
  NEEDS_HEARING: '要ヒアリング',
  NA: '—',
};

export const RECOMMENDATION_LABEL: Record<Recommendation, string> = {
  ADOPT: '採用',
  HOLD: '保留',
  REJECT: '不採用',
  NA: '—',
};
