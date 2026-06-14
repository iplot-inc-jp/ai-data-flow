/**
 * 外部トラッカー API（Backlog / Jira）のレート制限(429)/一時障害(503) 向けの
 * リトライ + 指数バックオフ ヘルパ。
 *
 * 背景: フル移行は『課題ページ取得 + 1 課題ごとのコメント取得』で数千の逐次 REST 呼び出しが
 * 走る。Backlog/Jira は API キー/ユーザ単位の分間制限があり 429 が現実的に返る。
 * 課題ページングのループは try/catch の外にあるため、429 を素通しすると import 全体が
 * 途中で abort し『全件取得』が部分状態で止まる（lastSyncedAt も中途半端になる）。
 *
 * 方針:
 *   - 429 / 503 のときだけ Retry-After（秒 or HTTP-date）を尊重して待機し再試行する。
 *   - Retry-After が無ければ指数バックオフ（base * 2^n、上限 30s）。
 *   - リトライ上限を超えたら最後のレスポンスを呼び出し側へ返し、従来どおりの throw に委ねる。
 *   - それ以外のステータス（4xx 等）は即座にレスポンスを返し、呼び出し側の判定に任せる。
 */

/** 既定のリトライ回数（初回 + リトライ）。 */
const DEFAULT_MAX_RETRIES = 5;
/** バックオフの基準ミリ秒。 */
const BASE_DELAY_MS = 1000;
/** バックオフの上限ミリ秒（Retry-After 不在時）。 */
const MAX_DELAY_MS = 30_000;
/** リトライ対象のステータス（レート制限 / 一時障害）。 */
const RETRYABLE_STATUS = new Set([429, 503]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry-After ヘッダを解釈してミリ秒に変換する。
 * 数値（秒）または HTTP-date を許容。解釈不能/負なら null。
 */
function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed) * 1000;
  }
  const dateMs = Date.parse(trimmed);
  if (!Number.isNaN(dateMs)) {
    const delta = dateMs - Date.now();
    return delta > 0 ? delta : 0;
  }
  return null;
}

/**
 * doFetch を実行し、429/503 の間はリトライする。
 * 最終的に得られた Response（成功でも失敗でも）を返す。Retry-After を尊重し、
 * 無ければ指数バックオフ（上限 MAX_DELAY_MS）で待機する。
 */
export async function fetchWithRetry(
  doFetch: () => Promise<Response>,
  maxRetries: number = DEFAULT_MAX_RETRIES,
): Promise<Response> {
  let attempt = 0;
  // 初回 + maxRetries 回まで試行する。
  for (;;) {
    const res = await doFetch();
    if (!RETRYABLE_STATUS.has(res.status) || attempt >= maxRetries) {
      return res;
    }
    const retryAfter = parseRetryAfter(res.headers.get('retry-after'));
    const backoff = Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS);
    const waitMs = retryAfter != null ? retryAfter : backoff;
    // レスポンス本文は読まずに破棄して接続を解放する。
    await res.body?.cancel?.().catch(() => undefined);
    await sleep(waitMs);
    attempt++;
  }
}
