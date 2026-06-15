// 外部課題トラッカー（Backlog / Jira）接続の型・API ヘルパー。
//
// CSV を介さず、Backlog / Jira の課題をフル移行（full）または差分同期（incremental）して
// Task に取り込む。取り込み本体は backend の TRACKER_IMPORT ジョブが実行するため、
// ここは設定 CRUD・接続テスト・取り込み起票のみを扱う。
//
// 認可: 一覧/CRUD/test/import はすべてプロジェクト管理者限定。非管理者には backend が
// 403 を返すため、呼び出し側で「管理者のみ」案内を出し分ける。
//
// 秘匿情報: credential（Backlog APIキー / Jira APIトークン）はレスポンスで返らない
// （hasCredential のみ）。更新時も「入力があったときだけ」差し替える（誤クリア防止）。
//
// raw fetch + localStorage の accessToken で実装する（lib/webhooks.ts と同方針）。

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5021';

// ---------------------------------------------------------------------------
// 型
// ---------------------------------------------------------------------------

/** 対応プロバイダ（backend IssueTrackerProvider と一致）。 */
export type TrackerProvider = 'BACKLOG' | 'JIRA';

/** プロバイダ別の表示メタ（選択肢の描画・ラベルに使う）。 */
export const TRACKER_PROVIDERS: {
  value: TrackerProvider;
  label: string;
  /** host 入力のプレースホルダ / 補足。 */
  hostLabel: string;
  hostPlaceholder: string;
  hostHint: string;
  /** credential（鍵）入力のラベル / 補足。 */
  credentialLabel: string;
  credentialHint: string;
  /** email を要求するか（Jira のみ true）。 */
  requiresEmail: boolean;
}[] = [
  {
    value: 'BACKLOG',
    label: 'Backlog',
    hostLabel: 'スペースホスト',
    hostPlaceholder: 'example.backlog.com',
    hostHint: 'Backlog のスペースのホスト名（例: iplot.backlog.com）。https:// は不要です。',
    credentialLabel: 'API キー',
    credentialHint:
      'Backlog の「個人設定 → API」で発行した API キー。課題の読み取り権限が必要です。',
    requiresEmail: false,
  },
  {
    value: 'JIRA',
    label: 'Jira',
    hostLabel: 'サイト URL',
    hostPlaceholder: 'https://your-domain.atlassian.net',
    hostHint: 'Atlassian サイトの URL（例: https://your-domain.atlassian.net）。',
    credentialLabel: 'API トークン',
    credentialHint:
      'Atlassian アカウントの「セキュリティ → API トークン」で発行したトークン。認証メールと併用します。',
    requiresEmail: true,
  },
];

export function trackerProviderMeta(provider: TrackerProvider) {
  return (
    TRACKER_PROVIDERS.find((p) => p.value === provider) ?? TRACKER_PROVIDERS[0]
  );
}

export function trackerProviderLabel(provider: string): string {
  return TRACKER_PROVIDERS.find((p) => p.value === provider)?.label ?? provider;
}

/**
 * トラッカー接続のレスポンス形（backend TrackerConnectionController.toResponse）。
 * credential 自体は返らず、設定済みか否かだけ hasCredential で示される。
 */
export interface TrackerConnection {
  id: string;
  projectId: string;
  provider: TrackerProvider;
  /** Backlog: スペースhost / Jira: サイトURL（正規化済み）。 */
  host: string;
  /** Jira のみ。Backlog では null。 */
  email: string | null;
  /** APIキー/トークンが設定済みか（値そのものは返らない）。 */
  hasCredential: boolean;
  projectKey: string | null;
  autoSync: boolean;
  syncIntervalMinutes: number;
  /** 'active'（正常）/ 'error'（直近の接続テスト失敗）など。 */
  status: string;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 作成入力（POST /projects/:id/tracker-connections）。 */
export interface CreateTrackerConnectionInput {
  provider: TrackerProvider;
  host: string;
  /** Jira のみ必須。 */
  email?: string;
  /** Backlog APIキー / Jira APIトークン（平文。サーバ側で暗号化保存）。 */
  credential: string;
  projectKey?: string;
  autoSync?: boolean;
  syncIntervalMinutes?: number;
}

/**
 * 更新入力（PATCH /tracker-connections/:id）。
 * credential の扱い:
 *   - 省略（undefined）/ 空文字 '' … 変更なし（誤クリア防止）
 *   - 非空文字列                     … 再暗号化して差し替え
 */
export interface UpdateTrackerConnectionInput {
  host?: string;
  email?: string;
  credential?: string;
  projectKey?: string;
  autoSync?: boolean;
  syncIntervalMinutes?: number;
}

/** 接続テスト結果（POST /tracker-connections/:id/test）。 */
export interface TrackerTestResult {
  ok: boolean;
  /** 確認できたプロジェクト数や自分の表示名など軽い診断。 */
  detail?: string;
  /** 失敗時のメッセージ（秘匿情報は含まない）。 */
  error?: string;
}

/**
 * Webhook 管理 API のレスポンス（backend ManageTrackerWebhookUseCase.WebhookUrlResult）。
 * url には秘密トークンが含まれる（管理者のみ取得可）。webhook 無効なら url=null。
 */
export interface WebhookUrlResult {
  /** 秘密トークンを埋め込んだ受信用 URL。webhook 無効なら null。 */
  url: string | null;
}

/** 取り込みモード。full=全件移行 / incremental=lastSyncedAt 以降の差分。 */
export type TrackerImportMode = 'full' | 'incremental';

/** 取り込み起票結果（POST /tracker-connections/:id/import → TRACKER_IMPORT ジョブ）。 */
export interface TrackerImportEnqueueResult {
  jobId: string;
  status: string;
}

/**
 * TRACKER_IMPORT ジョブの result（job.result の中身）。
 * backend TrackerImportResult に kind: 'TRACKER_IMPORT' を付けたもの。
 */
export interface TrackerImportJobResult {
  kind: 'TRACKER_IMPORT';
  provider: string;
  mode: TrackerImportMode;
  fetched: number;
  created: number;
  updated: number;
  skipped: number;
  commentsCreated: number;
  errors: string[];
}

/** job.result が TRACKER_IMPORT 形かを判定する型ガード。 */
export function isTrackerImportResult(
  value: unknown,
): value is TrackerImportJobResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { kind?: unknown }).kind === 'TRACKER_IMPORT'
  );
}

// ---------------------------------------------------------------------------
// fetch ヘルパー
// ---------------------------------------------------------------------------

/** API エラー。403（管理者のみ）の出し分けに status を保持する。 */
export class TrackerApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'TrackerApiError';
    this.status = status;
  }
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const token =
    typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const data = await res.json().catch(() => ({}) as Record<string, unknown>);
    const raw = (data as { message?: unknown }).message;
    const message = Array.isArray(raw)
      ? raw.join(' / ')
      : typeof raw === 'string'
        ? raw
        : `API Error: ${res.status}`;
    throw new TrackerApiError(message, res.status);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const trackersApi = {
  /** GET /api/projects/:projectId/tracker-connections（管理者限定。credential は返らない） */
  list: (projectId: string) =>
    fetch(`${API_URL}/api/projects/${projectId}/tracker-connections`, {
      headers: authHeaders(),
    }).then((r) => handle<TrackerConnection[]>(r)),

  /** POST /api/projects/:projectId/tracker-connections */
  create: (projectId: string, input: CreateTrackerConnectionInput) =>
    fetch(`${API_URL}/api/projects/${projectId}/tracker-connections`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(input),
    }).then((r) => handle<TrackerConnection>(r)),

  /** PATCH /api/tracker-connections/:id */
  update: (id: string, input: UpdateTrackerConnectionInput) =>
    fetch(`${API_URL}/api/tracker-connections/${id}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify(input),
    }).then((r) => handle<TrackerConnection>(r)),

  /** DELETE /api/tracker-connections/:id */
  delete: (id: string) =>
    fetch(`${API_URL}/api/tracker-connections/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    }).then((r) => handle<{ success: boolean }>(r)),

  /** POST /api/tracker-connections/:id/test（接続確認。ok/detail/error を返す） */
  test: (id: string) =>
    fetch(`${API_URL}/api/tracker-connections/${id}/test`, {
      method: 'POST',
      headers: authHeaders(),
    }).then((r) => handle<TrackerTestResult>(r)),

  /**
   * POST /api/tracker-connections/:id/import（フル移行 or 差分同期を起票）。
   * TRACKER_IMPORT ジョブの {jobId, status} を返す。進捗は useBackgroundJob でポーリングする。
   */
  import: (id: string, mode: TrackerImportMode) =>
    fetch(`${API_URL}/api/tracker-connections/${id}/import`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ mode }),
    }).then((r) => handle<TrackerImportEnqueueResult>(r)),

  // -------------------------------------------------------------------------
  // Webhook（インバウンド同期）管理。秘密入り URL は管理者のみ取得可。
  // -------------------------------------------------------------------------

  /**
   * GET /api/tracker-connections/:id/webhook/url
   * 現在の Webhook URL を取得（無効なら url=null）。管理画面の再表示用。
   */
  getWebhookUrl: (id: string) =>
    fetch(`${API_URL}/api/tracker-connections/${id}/webhook/url`, {
      headers: authHeaders(),
    }).then((r) => handle<WebhookUrlResult>(r)),

  /**
   * POST /api/tracker-connections/:id/webhook/enable
   * Webhook を有効化し、秘密入り URL を返す。
   */
  enableWebhook: (id: string) =>
    fetch(`${API_URL}/api/tracker-connections/${id}/webhook/enable`, {
      method: 'POST',
      headers: authHeaders(),
    }).then((r) => handle<WebhookUrlResult>(r)),

  /**
   * POST /api/tracker-connections/:id/webhook/regenerate
   * Webhook URL を再生成（旧 URL は無効化）し、新 URL を返す。
   */
  regenerateWebhook: (id: string) =>
    fetch(`${API_URL}/api/tracker-connections/${id}/webhook/regenerate`, {
      method: 'POST',
      headers: authHeaders(),
    }).then((r) => handle<WebhookUrlResult>(r)),

  /**
   * POST /api/tracker-connections/:id/webhook/disable
   * Webhook を無効化（秘密を破棄）。url=null を返す。
   */
  disableWebhook: (id: string) =>
    fetch(`${API_URL}/api/tracker-connections/${id}/webhook/disable`, {
      method: 'POST',
      headers: authHeaders(),
    }).then((r) => handle<WebhookUrlResult>(r)),
};
