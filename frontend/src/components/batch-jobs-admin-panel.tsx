'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import {
  Loader2,
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertCircle,
  ServerCog,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  ShieldAlert,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { HelpTooltip } from '@/components/ui/help-tooltip';
import { useTableSort } from '@/lib/use-table-sort';
import { SortableTh } from '@/components/ui/sortable-th';
import {
  listBatchJobs,
  retryJob,
  JobApiError,
  type Job,
  type JobAttempt,
  type JobStatus,
} from '@/lib/jobs';

// ---- ステータスバッジのメタ ----
const statusMeta: Record<JobStatus, { label: string; jp: string; badge: string }> = {
  QUEUED: { label: 'QUEUED', jp: '待機', badge: 'text-gray-600 bg-gray-50 border-gray-300' },
  RUNNING: { label: 'RUNNING', jp: '実行中', badge: 'text-blue-700 bg-blue-50 border-blue-300' },
  SUCCEEDED: { label: 'SUCCEEDED', jp: '成功', badge: 'text-emerald-700 bg-emerald-50 border-emerald-300' },
  FAILED: { label: 'FAILED', jp: '失敗', badge: 'text-red-700 bg-red-50 border-red-300' },
};

// 状態フィルタの並び（「すべて」を先頭に）。
const STATUS_FILTERS: { value: JobStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'すべて' },
  { value: 'SUCCEEDED', label: '成功' },
  { value: 'FAILED', label: '失敗' },
  { value: 'RUNNING', label: '実行中' },
  { value: 'QUEUED', label: '待機' },
];

// ---- ジョブ種別の日本語表示 ----
const typeMeta: Record<string, string> = {
  AI_MERMAID_OBJECTMAP: 'Mermaid → オブジェクト関係性マップ',
  AI_MERMAID_FLOW: 'Mermaid → 業務フロー',
  AI_KPI: 'KPI 生成',
  AI_ISSUE_SUGGEST: '課題ノード提案',
  WEBHOOK_DELIVERY: 'Webhook 配信',
};

function typeLabel(type: string): string {
  return typeMeta[type] ?? type;
}

function statusBadge(status: JobStatus) {
  const sm = statusMeta[status] ?? statusMeta.QUEUED;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border font-medium ${sm.badge}`}
    >
      {status === 'RUNNING' && <Loader2 className="h-3 w-3 animate-spin" />}
      {status === 'SUCCEEDED' && <CheckCircle2 className="h-3 w-3" />}
      {status === 'FAILED' && <AlertCircle className="h-3 w-3" />}
      {sm.jp}
    </span>
  );
}

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(ms: number | null): string {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

// 日時文字列をソート用の数値（エポックms）に変換する。未設定・不正値は null（末尾送り）。
function dateSortValue(value: string | null): number | null {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

const JOB_SORT_ACCESSORS: Record<string, (job: Job) => string | number | null | undefined> = {
  status: (job) => (statusMeta[job.status] ?? statusMeta.QUEUED).label,
  type: (job) => typeLabel(job.type),
  attempts: (job) => job.attempts,
  updatedAt: (job) => dateSortValue(job.updatedAt),
};

/** 1つの試行記録（attemptRecords[i]）の表示行。 */
function AttemptRow({ attempt }: { attempt: JobAttempt }) {
  return (
    <tr className="border-b border-gray-100 align-top">
      <td className="px-3 py-2 text-gray-700 whitespace-nowrap">#{attempt.attemptNo}</td>
      <td className="px-3 py-2">{statusBadge(attempt.status)}</td>
      <td className="px-3 py-2 text-gray-700">
        {attempt.status === 'FAILED' && attempt.error ? (
          <span className="inline-flex items-start gap-1 text-red-600">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            <span className="break-all whitespace-pre-wrap">{attempt.error}</span>
          </span>
        ) : attempt.status === 'SUCCEEDED' ? (
          <span className="text-emerald-700">完了</span>
        ) : (
          '—'
        )}
      </td>
      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
        {formatDateTime(attempt.startedAt)}
      </td>
      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
        {formatDateTime(attempt.finishedAt)}
      </td>
      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
        {formatDuration(attempt.durationMs)}
      </td>
    </tr>
  );
}

/** 行を展開したときの試行履歴テーブル。 */
function AttemptsTable({ attempts }: { attempts: JobAttempt[] }) {
  if (attempts.length === 0) {
    return (
      <p className="py-3 text-sm text-gray-400 text-center">
        試行履歴はまだありません（未実行）。
      </p>
    );
  }
  const thClass = 'font-medium border-b border-gray-200 text-left';
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-100 bg-gray-50/40">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-gray-50 text-left text-gray-600">
            <th className={`px-3 py-2 ${thClass} w-[70px]`}>試行</th>
            <th className={`px-3 py-2 ${thClass} w-[110px]`}>結果</th>
            <th className={`px-3 py-2 ${thClass}`}>エラー</th>
            <th className={`px-3 py-2 ${thClass} w-[150px]`}>開始</th>
            <th className={`px-3 py-2 ${thClass} w-[150px]`}>終了</th>
            <th className={`px-3 py-2 ${thClass} w-[90px]`}>所要</th>
          </tr>
        </thead>
        <tbody>
          {attempts.map((a) => (
            <AttemptRow key={a.id} attempt={a} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface JobsTableProps {
  jobs: Job[];
  projectId: string;
  openId: string | null;
  onToggleOpen: (id: string) => void;
  retryingId: string | null;
  onRetry: (job: Job) => void;
}

function JobsTable({
  jobs,
  projectId,
  openId,
  onToggleOpen,
  retryingId,
  onRetry,
}: JobsTableProps) {
  const { sorted, sortKey, sortDir, toggleSort } = useTableSort(jobs, JOB_SORT_ACCESSORS);
  const thClass = 'font-medium border-b border-gray-200';
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-gray-50 text-left text-gray-600">
            <th className="px-3 py-2 w-[36px] border-b border-gray-200" />
            <SortableTh
              label="状態"
              sortKey="status"
              current={sortKey}
              dir={sortDir}
              onToggle={toggleSort}
              className={`${thClass} w-[110px]`}
            >
              <HelpTooltip text="ジョブの状態。待機（QUEUED）→実行中（RUNNING）→成功（SUCCEEDED）または失敗（FAILED）。行を開くと試行ごとの履歴を確認できます。" />
            </SortableTh>
            <SortableTh
              label="種別"
              sortKey="type"
              current={sortKey}
              dir={sortDir}
              onToggle={toggleSort}
              className={thClass}
            />
            <th className={`px-3 py-2 ${thClass} w-[200px] text-left font-medium`}>対象</th>
            <SortableTh
              label="リトライ"
              sortKey="attempts"
              current={sortKey}
              dir={sortDir}
              onToggle={toggleSort}
              className={`${thClass} w-[100px]`}
            >
              <HelpTooltip text="実行を試みた回数 / 最大試行回数。自動リトライ（QStash）と手動再実行を含みます。" />
            </SortableTh>
            <SortableTh
              label="最終更新"
              sortKey="updatedAt"
              current={sortKey}
              dir={sortDir}
              onToggle={toggleSort}
              className={`${thClass} w-[150px]`}
            />
            <th className={`px-3 py-2 ${thClass} w-[110px] text-left font-medium`}>操作</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((job) => {
            const open = openId === job.id;
            const attempts = job.attemptRecords ?? [];
            // 再実行は FAILED のみ（SUCCEEDED の再実行は確定 result の破棄や
            // 非冪等ジョブの重複生成・二重課金を招くため許可しない）。
            const canRetry = job.status === 'FAILED';
            const isRetrying = retryingId === job.id;
            // 対象プロジェクト: この画面はプロジェクト配下なので基本同一だが、
            // projectId null（プロジェクト非紐付）の場合に区別できるよう表示する。
            const target =
              job.projectId === null
                ? '（プロジェクト未紐付）'
                : job.projectId === projectId
                  ? 'このプロジェクト'
                  : job.projectId;
            return (
              <Fragment key={job.id}>
                <tr
                  className="border-b border-gray-100 hover:bg-gray-50/60 align-top"
                >
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => onToggleOpen(job.id)}
                      className="text-gray-400 hover:text-gray-700"
                      title={open ? '試行履歴を閉じる' : '試行履歴を開く'}
                      aria-expanded={open}
                    >
                      {open ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>
                  </td>
                  <td className="px-3 py-2">{statusBadge(job.status)}</td>
                  <td className="px-3 py-2 text-gray-700">{typeLabel(job.type)}</td>
                  <td className="px-3 py-2 text-gray-500">
                    <span className="break-all">{target}</span>
                  </td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                    <span
                      className={
                        typeof job.maxAttempts === 'number' &&
                        job.attempts >= job.maxAttempts &&
                        job.status === 'FAILED'
                          ? 'text-red-600 font-medium'
                          : ''
                      }
                    >
                      {job.attempts}
                      {typeof job.maxAttempts === 'number' ? ` / ${job.maxAttempts}` : ''}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                    {formatDateTime(job.updatedAt)}
                  </td>
                  <td className="px-3 py-2">
                    {canRetry ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onRetry(job)}
                        disabled={isRetrying}
                        className="h-7 border-gray-300 text-gray-700"
                        title="このジョブを再実行（QUEUED に戻して再起票）"
                      >
                        {isRetrying ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <>
                            <RotateCcw className="h-3.5 w-3.5 mr-1" />
                            再実行
                          </>
                        )}
                      </Button>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                </tr>
                {open && (
                  <tr className="border-b border-gray-100 bg-gray-50/30">
                    <td />
                    <td colSpan={6} className="px-3 py-3">
                      <AttemptsTable attempts={attempts} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

interface BatchJobsAdminPanelProps {
  projectId: string;
  /** 取得件数の上限（既定 50）。 */
  limit?: number;
}

/**
 * 【管理者向け】バックグラウンド処理 / バッチ管理ビュー。
 *
 * GET /api/projects/:projectId/batch-jobs（管理者限定）を取得し、
 *  - 状態バッジ・種別・対象プロジェクト・リトライ回数（attempts/maxAttempts）・最終更新時刻
 *  - 行展開で試行ごとの履歴（attemptNo / 成否 / エラー全文 / 開始-終了 / duration）
 *  - 失敗ジョブの「再実行」ボタン（POST /api/jobs/:id/retry → 一覧リフレッシュ）
 *  - 状態フィルタ・更新ボタン
 * を表示する。
 *
 * 非管理者は batch-jobs が 403 を返すため、「管理者のみ」の案内を表示する
 * （バックエンドの認可が最終的な防御線。フロントは表示の出し分けのみ）。
 */
export function BatchJobsAdminPanel({ projectId, limit = 50 }: BatchJobsAdminPanelProps) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 管理者でない（batch-jobs が 403）と判明したら true。
  const [forbidden, setForbidden] = useState(false);
  const [statusFilter, setStatusFilter] = useState<JobStatus | 'ALL'>('ALL');
  const [openId, setOpenId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const fetchJobs = useCallback(
    async (withSpinner: boolean) => {
      if (withSpinner) setLoading(true);
      setError(null);
      try {
        const data = await listBatchJobs(projectId, {
          status: statusFilter === 'ALL' ? undefined : statusFilter,
          limit,
        });
        setForbidden(false);
        setJobs(Array.isArray(data) ? data : []);
      } catch (err) {
        if (err instanceof JobApiError && err.status === 403) {
          setForbidden(true);
          setJobs([]);
        } else {
          setError(err instanceof Error ? err.message : 'バッチジョブ一覧の取得に失敗しました');
        }
      } finally {
        if (withSpinner) setLoading(false);
      }
    },
    [projectId, statusFilter, limit],
  );

  useEffect(() => {
    void fetchJobs(true);
  }, [fetchJobs]);

  const handleToggleOpen = useCallback((id: string) => {
    setOpenId((prev) => (prev === id ? null : id));
  }, []);

  const handleRetry = useCallback(
    async (job: Job) => {
      setRetryingId(job.id);
      setActionMsg(null);
      try {
        await retryJob(job.id);
        setActionMsg({ kind: 'ok', text: `ジョブ「${typeLabel(job.type)}」を再実行しました。` });
        await fetchJobs(false);
      } catch (err) {
        setActionMsg({
          kind: 'err',
          text: err instanceof Error ? err.message : 'ジョブの再実行に失敗しました',
        });
      } finally {
        setRetryingId(null);
      }
    },
    [fetchJobs],
  );

  return (
    <Card className="bg-white border-gray-200">
      <CardContent className="p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
            <ServerCog className="h-5 w-5 text-gray-500" />
            バックグラウンド処理 / バッチ管理
            <HelpTooltip text="AIによるMermaid解析やKPI生成などの重い処理は、バックグラウンドジョブとして非同期で実行されます。管理者はここで各ジョブの状態・試行履歴・失敗理由を確認し、失敗したジョブを再実行できます。" />
            <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-700">
              <ShieldAlert className="h-3 w-3" />
              管理者限定
            </span>
          </h2>
          {!forbidden && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 p-0.5">
                {STATUS_FILTERS.map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    onClick={() => setStatusFilter(f.value)}
                    className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                      statusFilter === f.value
                        ? 'bg-white text-gray-900 shadow-sm border border-gray-200'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void fetchJobs(false)}
                className="border-gray-300 text-gray-700"
                title="一覧を再取得"
              >
                <RefreshCw className="h-4 w-4 mr-1.5" />
                更新
              </Button>
            </div>
          )}
        </div>

        {actionMsg && (
          <div
            className={`flex items-center gap-2 rounded-lg border p-2.5 text-sm ${
              actionMsg.kind === 'ok'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-red-200 bg-red-50 text-red-700'
            }`}
          >
            {actionMsg.kind === 'ok' ? (
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
            )}
            <span>{actionMsg.text}</span>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-8 text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            読み込み中...
          </div>
        ) : forbidden ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center">
              <ShieldAlert className="h-6 w-6 text-amber-500" />
            </div>
            <p className="text-gray-700 font-medium">この機能は管理者のみが利用できます</p>
            <p className="text-sm text-gray-500 max-w-md">
              バッチジョブの一覧・試行履歴・再実行は、プロジェクトの管理者（組織のオーナー/管理者またはスーパー管理者）のみが操作できます。
            </p>
          </div>
        ) : error ? (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={() => void fetchJobs(true)}>
              再読み込み
            </Button>
          </div>
        ) : jobs.length === 0 ? (
          <p className="flex items-center gap-2 py-6 text-sm text-gray-400">
            <Clock className="h-4 w-4" />
            {statusFilter === 'ALL'
              ? 'バックグラウンド処理の履歴はまだありません。'
              : 'この状態のジョブはありません。'}
          </p>
        ) : (
          <JobsTable
            jobs={jobs}
            projectId={projectId}
            openId={openId}
            onToggleOpen={handleToggleOpen}
            retryingId={retryingId}
            onRetry={handleRetry}
          />
        )}
      </CardContent>
    </Card>
  );
}
