// タスク Webhook（outbound）設定の型・APIヘルパー。
//
// 方向は Brain Pro → 外部（ipro-kun 等）。実際の配信は backend の
// WEBHOOK_DELIVERY ジョブが行い、ここは設定 CRUD とテスト起票のみを扱う。
// 認可: CRUD/一覧/test はすべてプロジェクト管理者限定。非管理者は 403 が返る。
//
// raw fetch + localStorage の accessToken で実装する（lib/tasks.ts と同方針）。

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5021';

// ---------------------------------------------------------------------------
// 型
// ---------------------------------------------------------------------------

/** 購読可能なタスクイベント（backend の許可リストと一致）。 */
export type WebhookEvent =
  | 'task.created'
  | 'task.updated'
  | 'task.status_changed'
  | 'task.deleted';

/** 全イベント（チェックボックス描画順）と日本語ラベル。 */
export const WEBHOOK_EVENTS: { value: WebhookEvent; label: string; desc: string }[] = [
  { value: 'task.created', label: '作成', desc: 'タスクが新規作成されたとき' },
  { value: 'task.updated', label: '更新', desc: 'タスクの内容が更新されたとき' },
  {
    value: 'task.status_changed',
    label: 'ステータス変更',
    desc: 'タスクの状態（未対応→処理中など）が変わったとき',
  },
  { value: 'task.deleted', label: '削除', desc: 'タスクが削除されたとき' },
];

export function webhookEventLabel(event: string): string {
  return WEBHOOK_EVENTS.find((e) => e.value === event)?.label ?? event;
}

/**
 * Webhook のレスポンス形（backend WebhookController.toResponse）。
 * secret 自体は返らず、存在有無だけ hasSecret で示される。
 */
export interface Webhook {
  id: string;
  projectId: string;
  targetUrl: string;
  events: string[];
  label: string | null;
  active: boolean;
  /** 署名シークレットが設定済みか（値そのものは返らない）。 */
  hasSecret: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 作成入力（POST /projects/:id/webhooks）。 */
export interface CreateWebhookInput {
  targetUrl: string;
  /** 省略 or 空なら署名なし。 */
  secret?: string;
  events: WebhookEvent[];
  label?: string;
  active?: boolean;
}

/**
 * 更新入力（PATCH /webhooks/:id）。
 * secret の扱い:
 *   - 省略（undefined） … 変更なし
 *   - 空文字 ''        … 変更なし（誤クリア防止）
 *   - null             … 署名シークレットを解除
 *   - 非空文字列        … 再暗号化して差し替え
 */
export interface UpdateWebhookInput {
  targetUrl?: string;
  secret?: string | null;
  events?: WebhookEvent[];
  label?: string | null;
  active?: boolean;
}

/** テスト送信のレスポンス（起票したジョブの id/status）。 */
export interface WebhookTestResult {
  jobId: string;
  status: string;
}

// ---------------------------------------------------------------------------
// fetch ヘルパー
// ---------------------------------------------------------------------------

/** API エラー。403（管理者のみ）の出し分けに status を保持する。 */
export class WebhookApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'WebhookApiError';
    this.status = status;
  }
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token =
    typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const data = await res.json().catch(() => ({} as Record<string, unknown>));
    const raw = (data as { message?: unknown }).message;
    const message = Array.isArray(raw)
      ? raw.join(' / ')
      : typeof raw === 'string'
        ? raw
        : `API Error: ${res.status}`;
    throw new WebhookApiError(message, res.status);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const webhooksApi = {
  /** GET /api/projects/:projectId/webhooks（管理者限定。secret は返らない） */
  list: (projectId: string) =>
    fetch(`${API_URL}/api/projects/${projectId}/webhooks`, {
      headers: authHeaders(),
    }).then((r) => handle<Webhook[]>(r)),

  /** POST /api/projects/:projectId/webhooks */
  create: (projectId: string, input: CreateWebhookInput) =>
    fetch(`${API_URL}/api/projects/${projectId}/webhooks`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(input),
    }).then((r) => handle<Webhook>(r)),

  /** PATCH /api/webhooks/:id */
  update: (id: string, input: UpdateWebhookInput) =>
    fetch(`${API_URL}/api/webhooks/${id}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify(input),
    }).then((r) => handle<Webhook>(r)),

  /** DELETE /api/webhooks/:id */
  delete: (id: string) =>
    fetch(`${API_URL}/api/webhooks/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    }).then((r) => handle<{ success: boolean }>(r)),

  /** POST /api/webhooks/:id/test（テスト配信を1件起票） */
  test: (id: string) =>
    fetch(`${API_URL}/api/webhooks/${id}/test`, {
      method: 'POST',
      headers: authHeaders(),
    }).then((r) => handle<WebhookTestResult>(r)),
};
