// リスクマネジメント（REAL table）用の型・APIヘルパー。
//
// 旧来の RecordSheet（projectId × 'risk-register', {rows}）ではなく、
// 専用テーブル Risk を直接 CRUD する。
// 既存の他ページと同じく API_URL + /api への raw fetch（localStorage の accessToken）を使う。

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5021';

function getHeaders(): Record<string, string> {
  const token =
    typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

// ---------------------------------------------------------------------------
// 型
// ---------------------------------------------------------------------------

/** リスク・ボトルネック（Risk テーブル） */
export interface Risk {
  id: string;
  projectId: string;
  code: string | null; // リスクID（表示用）
  type: string | null; // 種別（リスク / ボトルネック）
  event: string | null; // 事象内容
  causeCategory: string | null; // 原因区分（人 / 情報 / 決裁 / 技術 / 外部）
  probability: string | null; // 発生確率（高 / 中 / 低）
  impact: string | null; // 影響度（高 / 中 / 低）
  priority: string | null; // 優先度（高 / 中 / 低）
  countermeasure: string | null; // 対応策（予防・軽減）
  needsMtg: string | null; // 対応MTG（要 / 不要）
  mtgDate: string | null; // MTG設定日
  deadline: string | null; // 期限
  owner: string | null; // 担当
  status: string | null; // ステータス
  note: string | null; // 備考
  order: number;
  createdAt?: string;
  updatedAt?: string;
}

/** 作成・更新で送る入力（すべて任意）。 */
export type RiskInput = Partial<
  Omit<Risk, 'id' | 'projectId' | 'createdAt' | 'updatedAt'>
>;

// ---------------------------------------------------------------------------
// Risk API
// ---------------------------------------------------------------------------

export async function listRisks(projectId: string): Promise<Risk[]> {
  const res = await fetch(`${API_URL}/api/projects/${projectId}/risks`, {
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error('リスクの読み込みに失敗しました');
  return res.json();
}

export async function createRisk(
  projectId: string,
  input: RiskInput,
): Promise<Risk> {
  const res = await fetch(`${API_URL}/api/projects/${projectId}/risks`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error('リスクの作成に失敗しました');
  return res.json();
}

export async function updateRisk(
  id: string,
  input: RiskInput,
): Promise<Risk> {
  const res = await fetch(`${API_URL}/api/risks/${id}`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error('リスクの更新に失敗しました');
  return res.json();
}

export async function deleteRisk(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/risks/${id}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error('リスクの削除に失敗しました');
}

// ---------------------------------------------------------------------------
// 区分定義・集計（純粋・テスト可能）
// ---------------------------------------------------------------------------

export const LEVELS = ['高', '中', '低'] as const;
export type Level = (typeof LEVELS)[number];

export const RISK_TYPES = ['リスク', 'ボトルネック'] as const;
export const CAUSE_CATEGORIES = ['人', '情報', '決裁', '技術', '外部'] as const;
export const NEEDS_MTG_OPTIONS = ['要', '不要'] as const;
export const STATUS_OPTIONS = [
  '未対応',
  '対応中',
  '監視中',
  '解消',
] as const;

/** 優先度ごとの件数。 */
export type PriorityCounts = {
  high: number;
  mid: number;
  low: number;
  other: number;
};

/**
 * 優先度の生値を 高/中/低/その他 に分類する。
 * 高/high/h、中/mid/medium/m、低/low/l を許容（大文字小文字・前後空白を無視）。
 * いずれにも一致しない値・未設定は 'other'。純粋関数（テスト可能）。
 */
export function classifyPriority(
  raw: string | null | undefined,
): 'high' | 'mid' | 'low' | 'other' {
  const p = (raw ?? '').trim();
  if (!p) return 'other';
  if (/高|high|h/i.test(p)) return 'high';
  if (/中|mid|medium|m/i.test(p)) return 'mid';
  if (/低|low|l/i.test(p)) return 'low';
  return 'other';
}

/** リスク一覧から優先度ごとの件数を集計する。純粋関数（テスト可能）。 */
export function countByPriority(risks: Risk[]): PriorityCounts {
  const acc: PriorityCounts = { high: 0, mid: 0, low: 0, other: 0 };
  for (const r of risks) {
    acc[classifyPriority(r.priority)] += 1;
  }
  return acc;
}

/**
 * 発生確率 × 影響度 から推奨優先度を導く（高×高=高 など）。
 * 完全一致のみ評価し、いずれかが未区分なら '' を返す。純粋関数（テスト可能）。
 */
export function suggestPriority(
  probability: string | null | undefined,
  impact: string | null | undefined,
): Level | '' {
  const pr = pickLevel(probability);
  const im = pickLevel(impact);
  if (!pr || !im) return '';
  const score = (lv: Level) => (lv === '高' ? 3 : lv === '中' ? 2 : 1);
  const total = score(pr) + score(im);
  if (total >= 5) return '高';
  if (total >= 4) return '中';
  return '低';
}

/** 高/中/低 のいずれかに完全一致すればその値、それ以外は '' を返す。 */
export function pickLevel(raw: string | null | undefined): Level | '' {
  const t = (raw ?? '').trim();
  return (LEVELS as readonly string[]).includes(t) ? (t as Level) : '';
}
