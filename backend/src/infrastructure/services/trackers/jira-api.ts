/**
 * Atlassian Jira Cloud REST API v3 の薄ラッパ（課題取得 = pull 専用）。
 *
 * 認証は Basic（email:apiToken を base64）。host はサイト URL（例 https://xxx.atlassian.net）。
 * 課題は GET /rest/api/3/search を JQL + startAt/maxResults でページングして全件取得する。
 * description/comment は ADF（Atlassian Document Format, JSON）なのでプレーンテキストに畳む。
 *
 * Backlog は ipro-bot に参考実装があるが Jira は無いため新規実装。
 */
import { assertSafeOutboundUrl } from '../url-safety';
import { fetchWithRetry } from './rate-limit';
import {
  ListIssuesOptions,
  NormalizedComment,
  NormalizedIssue,
  TrackerTestResult,
} from './types';

/** 課題取得の暴走防止（1 import あたりの上限）。 */
const DEFAULT_MAX_ISSUES = 5000;
/** 1 ページの件数（Jira の上限は通常 100）。 */
const PAGE_SIZE = 100;
/** コメント取得の 1 課題あたり上限。 */
const COMMENT_MAX = 100;

/** siteUrl を正規化（末尾スラッシュ除去）。スキームは保持（https 前提）。 */
export function normalizeSiteUrl(raw: string): string {
  let s = (raw || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(s)) {
    // スキーム省略時は https を補う（Jira Cloud は https）。
    s = `https://${s}`;
  }
  return s;
}

/**
 * SSRF 対策: siteUrl を assertSafeOutboundUrl で検証する。
 * 内部/メタデータ宛（169.254.169.254 / localhost 等）は UnsafeUrlError を投げる。
 * Authorization ヘッダはここでは付かないため、エラーに秘匿情報は載らない。
 * 接続作成/更新時の事前検証と、各 fetch 直前の再検証（TOCTOU 緩和）の双方から呼ぶ。
 */
export async function assertJiraSiteUrlSafe(siteUrl: string): Promise<void> {
  await assertSafeOutboundUrl(normalizeSiteUrl(siteUrl));
}

function authHeader(email: string, apiToken: string): string {
  const token = Buffer.from(`${email}:${apiToken}`).toString('base64');
  return `Basic ${token}`;
}

async function jget<T>(
  siteUrl: string,
  email: string,
  apiToken: string,
  path: string,
  params?: Record<string, string | number | undefined>,
): Promise<T> {
  const u = new URL(`${normalizeSiteUrl(siteUrl)}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v != null && v !== '') u.searchParams.set(k, String(v));
    }
  }
  // SSRF 対策: fetch 直前に宛先ホストを再検証する（webhook と同じ運用）。
  await assertJiraSiteUrlSafe(siteUrl);
  // レート制限(429)/一時障害(503) は Retry-After を尊重して再試行する。
  const res = await fetchWithRetry(() =>
    fetch(u.toString(), {
      headers: {
        authorization: authHeader(email, apiToken),
        accept: 'application/json',
      },
      redirect: 'manual',
    }),
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Jira API ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

/**
 * POST で JSON body を送る（拡張 JQL 検索 /rest/api/3/search/jql 用）。
 * 旧 GET /search は 410 で撤去されたため、課題検索はこちらを使う。
 * 長い JQL でも URL 長制限に当たらないよう body 送信にする。
 */
async function jpost<T>(
  siteUrl: string,
  email: string,
  apiToken: string,
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  // SSRF 対策: fetch 直前に宛先ホストを再検証する（webhook と同じ運用）。
  await assertJiraSiteUrlSafe(siteUrl);
  const requestUrl = `${normalizeSiteUrl(siteUrl)}${path}`;
  const payload = JSON.stringify(body);
  // レート制限(429)/一時障害(503) は Retry-After を尊重して再試行する。
  const res = await fetchWithRetry(() =>
    fetch(requestUrl, {
      method: 'POST',
      headers: {
        authorization: authHeader(email, apiToken),
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: payload,
      redirect: 'manual',
    }),
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Jira API ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

// ===== Jira の生レスポンス型（最小限） =====
interface JiraUser {
  displayName?: string;
}

interface JiraTimeTracking {
  originalEstimateSeconds?: number;
  timeSpentSeconds?: number;
}

interface JiraIssueFields {
  summary?: string;
  description?: unknown; // ADF or null
  status?: { name?: string };
  priority?: { name?: string } | null;
  assignee?: JiraUser | null;
  duedate?: string | null;
  // Jira の開始日はカスタムフィールド差があるため、標準で取れる範囲のみ扱う。
  parent?: { key?: string } | null;
  timetracking?: JiraTimeTracking | null;
  created?: string | null;
  updated?: string | null;
}

interface JiraIssueRaw {
  key?: string;
  fields?: JiraIssueFields;
}

/**
 * 拡張 JQL 検索 /rest/api/3/search/jql のレスポンス。
 * 旧 /search と異なり total は無く、ページングは nextPageToken（カーソル）で行う。
 * isLast が true、または nextPageToken が無ければ最終ページ。
 */
interface JiraSearchResponse {
  issues?: JiraIssueRaw[];
  nextPageToken?: string | null;
  isLast?: boolean;
}

interface JiraCommentRaw {
  author?: JiraUser | null;
  body?: unknown; // ADF
  created?: string | null;
}

interface JiraCommentResponse {
  comments?: JiraCommentRaw[];
}

/**
 * ADF（Atlassian Document Format）/ プレーン文字列をプレーンテキストへ畳む。
 * ノードを再帰的に辿り text を連結、paragraph/heading 境界で改行を入れる。
 * 文字列がそのまま来た場合はそのまま返す（古い API 形式の保険）。
 */
export function adfToText(node: unknown): string {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (typeof node !== 'object') return String(node);

  const n = node as {
    type?: string;
    text?: string;
    content?: unknown[];
  };

  let out = '';
  if (typeof n.text === 'string') out += n.text;
  if (Array.isArray(n.content)) {
    for (const child of n.content) out += adfToText(child);
  }
  // ブロック境界で改行（段落/見出し/リスト項目）。
  if (
    n.type === 'paragraph' ||
    n.type === 'heading' ||
    n.type === 'listItem' ||
    n.type === 'blockquote'
  ) {
    out += '\n';
  }
  return out;
}

function cleanText(node: unknown): string | null {
  const t = adfToText(node).replace(/\n{3,}/g, '\n\n').trim();
  return t.length > 0 ? t : null;
}

/**
 * 接続テスト: 自分の情報（/myself）を取得して ok/エラーを返す。
 * projectKey 指定時はそのプロジェクトの存在も軽く確認する。
 */
export async function jiraTest(
  siteUrl: string,
  email: string,
  apiToken: string,
  projectKey?: string | null,
): Promise<TrackerTestResult> {
  try {
    const me = await jget<{ displayName?: string; emailAddress?: string }>(
      siteUrl,
      email,
      apiToken,
      '/rest/api/3/myself',
    );
    if (projectKey) {
      const proj = await jget<{ key?: string; name?: string }>(
        siteUrl,
        email,
        apiToken,
        `/rest/api/3/project/${encodeURIComponent(projectKey)}`,
      );
      return {
        ok: true,
        detail: `${me.displayName ?? me.emailAddress ?? 'ユーザー'} としてプロジェクト「${proj.name ?? proj.key}」に接続できました`,
      };
    }
    return {
      ok: true,
      detail: `${me.displayName ?? me.emailAddress ?? 'ユーザー'} として接続できました`,
    };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? String(e) };
  }
}

/** JQL を組み立てる（projectKey と updatedSince を考慮）。 */
function buildJql(
  projectKey?: string | null,
  updatedSince?: string | null,
): string {
  const clauses: string[] = [];
  if (projectKey) clauses.push(`project = "${projectKey.replace(/"/g, '')}"`);
  if (updatedSince) {
    const d = new Date(updatedSince);
    if (!Number.isNaN(d.getTime())) {
      // Jira JQL の日時形式 "yyyy/MM/dd HH:mm"。
      const fmt = jiraJqlDate(d);
      clauses.push(`updated >= "${fmt}"`);
    }
  }
  const where = clauses.length > 0 ? clauses.join(' AND ') : '';
  // 安定したページングのため order by を付与。
  return `${where}${where ? ' ' : ''}ORDER BY updated DESC`.trim();
}

function jiraJqlDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}/${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

/** 1 課題のコメントを取得して正規化（古い順）。 */
async function fetchComments(
  siteUrl: string,
  email: string,
  apiToken: string,
  issueKey: string,
): Promise<NormalizedComment[]> {
  const resp = await jget<JiraCommentResponse>(
    siteUrl,
    email,
    apiToken,
    `/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment`,
    { maxResults: COMMENT_MAX, orderBy: 'created' },
  );
  return (resp.comments ?? [])
    .map((c) => ({
      authorName: c.author?.displayName ?? null,
      body: cleanText(c.body) ?? '',
      createdAt: c.created ?? null,
    }))
    .filter((c) => c.body.trim().length > 0);
}

/**
 * 課題を全件取得して NormalizedIssue[] を返す（startAt/maxResults ページング）。
 *   - projectKey 指定時はそのプロジェクトに限定。
 *   - updatedSince で差分取得（JQL `updated >=`）。
 *   - timetracking から originalEstimate/timeSpent を時間に換算。
 *   - parent.key を parentExternalKey に写す（subtask の親）。
 */
export async function jiraListIssues(
  siteUrl: string,
  email: string,
  apiToken: string,
  projectKey?: string | null,
  opts: ListIssuesOptions = {},
): Promise<NormalizedIssue[]> {
  const jql = buildJql(projectKey, opts.updatedSince);
  const maxIssues = opts.maxIssues ?? DEFAULT_MAX_ISSUES;
  const fields = [
    'summary',
    'description',
    'status',
    'priority',
    'assignee',
    'duedate',
    'parent',
    'timetracking',
    'created',
    'updated',
  ];

  // 拡張 JQL 検索 /rest/api/3/search/jql を使う（旧 GET /search は 410 で撤去）。
  // ページングは nextPageToken（カーソル）。total が無いので「次トークンが無い/isLast/空ページ」で終端。
  const raws: JiraIssueRaw[] = [];
  let nextPageToken: string | null | undefined = undefined;
  // 無限ループ防止: maxIssues 上限 + 反復回数の安全弁
  // （新エンドポイントは nextPageToken が尽きないバグ報告があるため、ページ数も上限で縛る）。
  const maxPages = Math.ceil(maxIssues / PAGE_SIZE) + 1;
  let pages = 0;
  const seenTokens = new Set<string>();
  while (raws.length < maxIssues && pages < maxPages) {
    const body: Record<string, unknown> = {
      jql,
      maxResults: PAGE_SIZE,
      fields,
    };
    if (nextPageToken) body.nextPageToken = nextPageToken;
    const resp = await jpost<JiraSearchResponse>(
      siteUrl,
      email,
      apiToken,
      '/rest/api/3/search/jql',
      body,
    );
    pages++;
    const page = resp.issues ?? [];
    if (page.length === 0) break;
    raws.push(...page);
    if (resp.isLast === true) break;
    const token: string | null = resp.nextPageToken ?? null;
    // 次トークンが無い、または同じトークンが再び来た（報告のあるループバグ）なら終端。
    if (!token || seenTokens.has(token)) break;
    seenTokens.add(token);
    nextPageToken = token;
  }

  const issues: NormalizedIssue[] = [];
  for (const r of raws.slice(0, maxIssues)) {
    if (!r.key) continue;
    const f = r.fields ?? {};
    const est = f.timetracking?.originalEstimateSeconds;
    const spent = f.timetracking?.timeSpentSeconds;

    let comments: NormalizedComment[] | undefined;
    if (opts.includeComments) {
      try {
        comments = await fetchComments(siteUrl, email, apiToken, r.key);
      } catch {
        comments = undefined;
      }
    }

    issues.push({
      externalKey: r.key,
      title: f.summary ?? '(no title)',
      description: cleanText(f.description),
      status: f.status?.name ?? null,
      priority: f.priority?.name ?? null,
      assigneeName: f.assignee?.displayName ?? null,
      // Jira 標準には開始日が無いため null（カスタムフィールド差があるため扱わない）。
      startDate: null,
      dueDate: f.duedate ?? null,
      estimatedHours: typeof est === 'number' ? roundHours(est / 3600) : null,
      actualHours: typeof spent === 'number' ? roundHours(spent / 3600) : null,
      parentExternalKey: f.parent?.key ?? null,
      comments,
    });
  }
  return issues;
}

/** 秒→時間換算の丸め（小数 2 桁）。 */
function roundHours(h: number): number {
  return Math.round(h * 100) / 100;
}
