const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5021';

// ========== 型 ==========

/** バックグラウンドジョブの状態（Prisma enum BackgroundJobStatus と一致）。 */
export type JobStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';

/**
 * 起票可能な AI ジョブ種別。
 * バックエンド JobService.ALLOWED_TYPES と一致させる。
 *   - AI_MERMAID_OBJECTMAP … Mermaid → オブジェクト関係性マップ（parse + 永続）
 *   - AI_MERMAID_FLOW       … Mermaid → 業務フロー（parse 結果を result に返す compute）
 *   - AI_KPI                … KPI 生成（DRAFT で永続）
 *   - AI_ISSUE_SUGGEST      … 課題ノード提案（parse 結果を result に返す compute）
 */
export type JobType =
  | 'AI_MERMAID_OBJECTMAP'
  | 'AI_MERMAID_FLOW'
  | 'AI_KPI'
  | 'AI_ISSUE_SUGGEST';

/** バックグラウンドジョブ（GET /api/jobs/:id・一覧のレスポンス形）。 */
export interface Job {
  id: string;
  type: string;
  status: JobStatus;
  /** 完了時の結果（type ごとに { kind, ... } 構造。未完了は null）。 */
  result: unknown | null;
  /** 失敗時のエラーメッセージ。 */
  error: string | null;
  /** 進捗（0〜100）。 */
  progress: number;
  /** リトライ回数。 */
  attempts: number;
  projectId: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  /** payload は一覧/取得で返るが本文では基本未使用。 */
  payload?: Record<string, unknown> | null;
}

/** ジョブ起票レスポンス（POST /api/projects/:projectId/ai-jobs）。 */
export interface EnqueueJobResult {
  jobId: string;
  status: JobStatus;
}

// ========== 内部ヘルパ ==========

function headers(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  const t = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  if (t) h['Authorization'] = `Bearer ${t}`;
  return h;
}

/** バックエンドの分かりやすいエラーメッセージを優先して投げる。 */
async function throwApiError(res: Response, fallback: string): Promise<never> {
  let msg = fallback;
  try {
    const data = await res.json();
    if (data?.message) {
      msg = Array.isArray(data.message) ? data.message.join(' / ') : data.message;
    } else if (data?.error) {
      msg = data.error;
    }
  } catch {
    /* JSON でなければ既定メッセージ */
  }
  throw new Error(msg);
}

// ========== API ==========

/**
 * AI ジョブを起票する。POST /api/projects/:projectId/ai-jobs {type, payload}
 *
 * 本番（QStash あり）では QUEUED の {jobId, status} を即返し、実行は別プロセスで進む。
 * ローカル（QStash なし）では inline 実行され、status は SUCCEEDED/FAILED で返ることがある。
 * いずれの場合も getJob でポーリングして終端状態を待てばよい。
 */
export async function enqueueAiJob(
  projectId: string,
  type: JobType,
  payload?: Record<string, unknown>,
): Promise<EnqueueJobResult> {
  const res = await fetch(`${API_URL}/api/projects/${projectId}/ai-jobs`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ type, payload }),
  });
  if (!res.ok) {
    await throwApiError(res, 'ジョブの起票に失敗しました');
  }
  return res.json();
}

/** 単一ジョブ取得（ポーリング用）。GET /api/jobs/:id */
export async function getJob(id: string): Promise<Job> {
  const res = await fetch(`${API_URL}/api/jobs/${id}`, { headers: headers() });
  if (!res.ok) {
    await throwApiError(res, 'ジョブの取得に失敗しました');
  }
  return res.json();
}

/** プロジェクトの直近ジョブ一覧。GET /api/projects/:projectId/jobs?limit= */
export async function listJobs(projectId: string, limit?: number): Promise<Job[]> {
  const q = typeof limit === 'number' && limit > 0 ? `?limit=${limit}` : '';
  const res = await fetch(`${API_URL}/api/projects/${projectId}/jobs${q}`, {
    headers: headers(),
  });
  if (!res.ok) {
    await throwApiError(res, 'ジョブ一覧の取得に失敗しました');
  }
  return res.json();
}

/** 終端状態（これ以上ポーリング不要）か。 */
export function isTerminalStatus(status: JobStatus): boolean {
  return status === 'SUCCEEDED' || status === 'FAILED';
}
