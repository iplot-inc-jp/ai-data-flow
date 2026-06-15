'use client';

// アジャイル / エピックボード。
//
// issueType=EPIC のタスクをグループ（カラム）にし、配下（epicId 一致）の
// Story / Task / Subtask / Bug をツリー（親子 parentId）でぶら下げて表示する。
// - スプリント・issueType でフィルタ。
// - エピックごとに storyPoints 合計と進捗（status 集計）を表示。
// - エピック未割当（epicId null）の束も「エピック未割当」グループとして表示。
//
// データは既存 tasksApi.list（TasksResponse）を流用。表示専用（編集はタスク管理側）。

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PageHeader } from '@/components/ui/page-header';
import { HowToPanel } from '@/components/ui/how-to-panel';
import {
  Loader2,
  Layers,
  ListTodo,
  ListChecks,
  Flag,
  X,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import {
  tasksApi,
  buildTaskTree,
  flattenTaskTree,
  formatSp,
  countTaskStatuses,
  taskStatusLabels,
  taskIssueTypeLabels,
  taskIssueTypeMeta,
  taskIssueTypeOf,
  TASK_STATUSES,
  TASK_ISSUE_TYPES,
  type Task,
  type TaskTreeNode,
} from '@/lib/tasks';

const ALL = 'ALL';

/** これを超える配下件数のグループは既定で折りたたむ。 */
const COLLAPSE_THRESHOLD = 50;

export default function AgileBoardPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  // フィルタ
  const [filterSprint, setFilterSprint] = useState<string>(ALL);
  const [filterIssueType, setFilterIssueType] = useState<string>(ALL);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const data = await tasksApi.list(projectId);
      setTasks(data.tasks ?? []);
    } catch (err) {
      console.error('Failed to fetch tasks:', err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // ------------------------------------------------------------------
  // 派生データ
  // ------------------------------------------------------------------

  // スプリント候補（空でないものを昇順）
  const sprintOptions = useMemo(() => {
    const set = new Set<string>();
    tasks.forEach((t) => {
      if (t.sprint) set.add(t.sprint);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ja'));
  }, [tasks]);

  // エピック（issueType=EPIC のタスク）。タイトル順。
  const epics = useMemo(
    () =>
      tasks
        .filter((t) => taskIssueTypeOf(t) === 'EPIC')
        .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, 'ja')),
    [tasks]
  );

  // フィルタ：スプリント・issueType。エピック配下のツリーを保つため、
  // 「マッチした行とその祖先（parentId 連鎖）」を残す（タスク一覧と同方針）。
  const visibleIds = useMemo(() => {
    const anyFilter = filterSprint !== ALL || filterIssueType !== ALL;
    if (!anyFilter) return null; // null = 全件

    const matches = (t: Task) => {
      if (filterSprint !== ALL && (t.sprint ?? '') !== filterSprint) return false;
      if (filterIssueType !== ALL && taskIssueTypeOf(t) !== filterIssueType)
        return false;
      return true;
    };

    const parentById = new Map<string, string | null>();
    tasks.forEach((t) => parentById.set(t.id, t.parentId));

    const keep = new Set<string>();
    for (const t of tasks) {
      if (matches(t)) {
        keep.add(t.id);
        let p = t.parentId;
        while (p && parentById.has(p) && !keep.has(p)) {
          keep.add(p);
          p = parentById.get(p) ?? null;
        }
      }
    }
    return keep;
  }, [tasks, filterSprint, filterIssueType]);

  // 実在する EPIC タスクの id 集合。epicId がこの Set に無いタスクは未割当として扱う。
  const epicIdSet = useMemo(() => new Set(epics.map((e) => e.id)), [epics]);

  // 非エピックタスク（エピック配下にぶら下げる対象）を「実効エピック」でグルーピング。
  // 実効エピック = parentId を上に辿って最初に見つかる「有効な epicId を持つ祖先（or
  // 自身）」が指すエピック。これによりサブタスク等の孫も集計・表示から漏れない。
  // null（未割当）は特別キー UNASSIGNED に集約する。
  const UNASSIGNED = '__unassigned__';

  // 各タスクの「実効エピック id」（実在 EPIC を指す or 未割当なら null）を解決する。
  const effectiveEpicById = useMemo(() => {
    const taskById = new Map<string, Task>();
    for (const t of tasks) taskById.set(t.id, t);

    // タスク t 自身〜祖先を辿り、最初に当たる有効な epicId を返す。循環は seen でガード。
    const resolve = (start: Task): string | null => {
      let cur: Task | undefined = start;
      const seen = new Set<string>();
      while (cur) {
        if (seen.has(cur.id)) break; // 既存データの循環
        seen.add(cur.id);
        const eid = cur.epicId;
        if (eid && epicIdSet.has(eid)) return eid;
        cur = cur.parentId ? taskById.get(cur.parentId) : undefined;
      }
      return null;
    };

    const map = new Map<string, string | null>();
    for (const t of tasks) map.set(t.id, resolve(t));
    return map;
  }, [tasks, epicIdSet]);

  const childrenByEpic = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      if (taskIssueTypeOf(t) === 'EPIC') continue; // エピック自身は子に含めない
      if (visibleIds && !visibleIds.has(t.id)) continue;
      const key = effectiveEpicById.get(t.id) ?? UNASSIGNED;
      const arr = map.get(key) ?? [];
      arr.push(t);
      map.set(key, arr);
    }
    return map;
  }, [tasks, visibleIds, effectiveEpicById]);

  // 表示するエピック（フィルタ後）。フィルタで自身もしくは配下が残ったものだけ。
  const visibleEpics = useMemo(() => {
    if (!visibleIds) return epics;
    return epics.filter(
      (e) => visibleIds.has(e.id) || (childrenByEpic.get(e.id)?.length ?? 0) > 0
    );
  }, [epics, visibleIds, childrenByEpic]);

  const unassignedChildren = childrenByEpic.get(UNASSIGNED) ?? [];

  const hasActiveFilters = filterSprint !== ALL || filterIssueType !== ALL;
  const resetFilters = () => {
    setFilterSprint(ALL);
    setFilterIssueType(ALL);
  };

  // 件数（エピック数 / 未割当の塊有無）
  const hasAnyContent =
    visibleEpics.length > 0 || unassignedChildren.length > 0;

  // ------------------------------------------------------------------
  // 描画
  // ------------------------------------------------------------------
  if (loading) {
    return (
      <div className="flex items-center justify-center h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="アジャイル（エピックボード）"
        description="エピックごとに配下のストーリー／タスクをツリーで俯瞰し、ストーリーポイント合計と進捗を確認します"
        help="issueType=EPIC のタスクをグループにし、配下（同じエピックに属する）のストーリー・タスク・サブタスク・バグをツリー表示します。スプリント・種別でフィルタでき、エピックごとに SP 合計と状態別の進捗を集計します。エピック未割当のタスクは「エピック未割当」にまとまります。"
        backHref={`/dashboard/projects/${projectId}`}
        actions={
          <>
            <HowToPanel
              steps={[
                'タスク管理でタスクの「種別」を EPIC にすると、ここにエピックのグループが現れます。',
                'タスクの「エピック」に EPIC タスクを指定すると、そのエピック配下にツリー表示されます。',
                '各タスクに「ストーリーポイント（SP）」を入れると、エピックごとに合計が集計されます。',
                'スプリント・種別で絞り込み、対象スプリントのスコープと進捗を確認できます。',
                'エピック未割当のタスクは「エピック未割当」グループにまとまります。',
              ]}
            />
            <Link href="../tasks">
              <Button variant="outline" className="gap-1.5">
                <ListChecks className="h-4 w-4" />
                タスク一覧
              </Button>
            </Link>
          </>
        }
      />

      {/* フィルタバー */}
      <Card className="bg-white border-gray-200">
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={filterSprint} onValueChange={setFilterSprint}>
              <SelectTrigger className="w-[200px] bg-white border-gray-300 h-10">
                <SelectValue placeholder="スプリント" />
              </SelectTrigger>
              <SelectContent className="bg-white">
                <SelectItem value={ALL}>すべてのスプリント</SelectItem>
                {sprintOptions.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterIssueType} onValueChange={setFilterIssueType}>
              <SelectTrigger className="w-[170px] bg-white border-gray-300 h-10">
                <SelectValue placeholder="種別" />
              </SelectTrigger>
              <SelectContent className="bg-white">
                <SelectItem value={ALL}>すべての種別</SelectItem>
                {TASK_ISSUE_TYPES.map((it) => (
                  <SelectItem key={it} value={it}>
                    {taskIssueTypeLabels[it].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={resetFilters}
                className="text-gray-500 gap-1"
              >
                <X className="h-3.5 w-3.5" />
                クリア
              </Button>
            )}

            <span className="ml-auto text-xs text-gray-400">
              エピック {visibleEpics.length} 件
              {unassignedChildren.length > 0 && '・未割当 1 件'}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* 本体 */}
      {!hasAnyContent ? (
        <Card className="bg-white border-gray-200">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <Layers className="h-8 w-8 text-gray-400" />
            </div>
            <p className="text-gray-500 mb-2">
              {tasks.length === 0
                ? 'タスクがありません'
                : '条件に一致するエピック／タスクがありません'}
            </p>
            <p className="text-sm text-gray-400 mb-4">
              タスク管理で種別 EPIC のタスクを作り、各タスクにエピックを割り当てましょう
            </p>
            <Link href="../tasks">
              <Button variant="outline" className="gap-1.5">
                <ListChecks className="h-4 w-4" />
                タスク管理へ
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {visibleEpics.map((epic) => (
            <EpicGroup
              key={epic.id}
              projectId={projectId}
              epic={epic}
              items={childrenByEpic.get(epic.id) ?? []}
            />
          ))}

          {/* エピック未割当 */}
          {unassignedChildren.length > 0 && (
            <EpicGroup
              projectId={projectId}
              epic={null}
              items={unassignedChildren}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// エピックグループ（ヘッダ：SP 合計・進捗 + 配下ツリー）
// ---------------------------------------------------------------------------

function EpicGroup({
  projectId,
  epic,
  items,
}: {
  projectId: string;
  epic: Task | null;
  items: Task[];
}) {
  // 大量バックログ対策：配下件数が閾値超のグループは既定で折りたたむ。
  const [open, setOpen] = useState(items.length <= COLLAPSE_THRESHOLD);

  // 配下タスクをツリー化（実効エピックでまとめた集合内の parentId 連鎖でインデント）。
  // 親がこのグループ外のもの（祖先経由で帰属したサブタスク等）は buildTaskTree が
  // ルート昇格するため、表示から漏れない。
  const tree = useMemo(() => buildTaskTree(items), [items]);
  const nodes = useMemo(() => flattenTaskTree(tree), [tree]);

  // SP 合計（エピック自身は含めず配下のみ集計。null は 0）
  const totalSp = useMemo(
    () => items.reduce((sum, t) => sum + (t.storyPoints ?? 0), 0),
    [items]
  );

  // 状態集計（配下タスクのみ）
  const counts = useMemo(() => countTaskStatuses(items), [items]);

  const total = items.length;
  const done = counts.RESOLVED + counts.CLOSED;
  const donePct = total > 0 ? Math.round((done / total) * 100) : 0;

  const epicMeta = taskIssueTypeLabels.EPIC;

  return (
    <Card className="bg-white border-gray-200 overflow-hidden">
      {/* ヘッダ */}
      <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 bg-gray-50/60 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 text-gray-500 hover:text-gray-700"
          aria-label={open ? '折りたたむ' : '展開する'}
        >
          {open ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>

        {epic ? (
          <>
            <span
              className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-medium ${epicMeta.color}`}
            >
              {epicMeta.label}
            </span>
            <Link
              href={`/dashboard/projects/${projectId}/tasks/${epic.id}`}
              className="font-semibold text-gray-900 hover:text-blue-600 hover:underline"
            >
              {epic.title}
            </Link>
            {epic.sprint && (
              <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] text-indigo-600 border border-indigo-200">
                {epic.sprint}
              </span>
            )}
          </>
        ) : (
          <>
            <span className="inline-flex items-center gap-1.5 text-gray-500">
              <Layers className="h-4 w-4" />
              <span className="font-semibold text-gray-700">
                エピック未割当
              </span>
            </span>
          </>
        )}

        {/* SP 合計・件数・進捗 */}
        <div className="ml-auto flex items-center gap-4">
          <span className="text-xs text-gray-500">
            SP 合計{' '}
            <span className="font-semibold text-gray-700 tabular-nums">
              {formatSp(totalSp)}
            </span>
          </span>
          <span className="text-xs text-gray-500">
            タスク{' '}
            <span className="font-semibold text-gray-700 tabular-nums">
              {total}
            </span>
          </span>
          <div className="flex items-center gap-2 min-w-[160px]">
            <div className="h-1.5 w-24 rounded-full bg-gray-200">
              <div
                className="h-1.5 rounded-full bg-emerald-500"
                style={{ width: `${donePct}%` }}
              />
            </div>
            <span className="w-9 text-right text-[11px] text-gray-500 tabular-nums">
              {donePct}%
            </span>
          </div>
        </div>
      </div>

      {/* ステータス内訳バッジ */}
      {open && (
        <>
          <div className="flex flex-wrap items-center gap-1.5 px-4 py-2 border-b border-gray-50">
            {TASK_STATUSES.map((s) => {
              const meta = taskStatusLabels[s];
              return (
                <span
                  key={s}
                  className={`inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5 text-[11px] ${meta.color}`}
                  title={`${meta.label}: ${counts[s]} 件`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                  {meta.label}
                  <span className="tabular-nums font-medium">{counts[s]}</span>
                </span>
              );
            })}
          </div>

          {/* 配下ツリー */}
          {nodes.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-gray-400">
              <ListTodo className="mx-auto mb-1 h-5 w-5 text-gray-300" />
              配下のタスクがありません
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {nodes.map((node) => (
                <ChildRow key={node.id} projectId={projectId} node={node} />
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 配下タスクの 1 行（種別バッジ・状態・SP・スプリント）
// ---------------------------------------------------------------------------

function ChildRow({
  projectId,
  node,
}: {
  projectId: string;
  node: TaskTreeNode;
}) {
  const issueType = taskIssueTypeOf(node);
  const itMeta = taskIssueTypeMeta(issueType);
  const status = taskStatusLabels[node.status];

  return (
    <li className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50">
      {/* インデント＋種別＋タイトル */}
      <div
        className="flex min-w-0 flex-1 items-center gap-2"
        style={{ paddingLeft: node.depth * 18 }}
      >
        <span
          className={`inline-flex shrink-0 items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${itMeta.color}`}
        >
          {itMeta.label}
        </span>
        {node.milestone && (
          <Flag className="h-3.5 w-3.5 shrink-0 text-amber-500" />
        )}
        <Link
          href={`/dashboard/projects/${projectId}/tasks/${node.id}`}
          className="truncate font-medium text-gray-900 hover:text-blue-600 hover:underline"
        >
          {node.title}
        </Link>
      </div>

      {/* スプリント */}
      {node.sprint ? (
        <span className="hidden shrink-0 rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] text-indigo-600 border border-indigo-200 sm:inline">
          {node.sprint}
        </span>
      ) : null}

      {/* SP */}
      <span className="w-14 shrink-0 text-right text-xs text-gray-500 tabular-nums">
        {node.storyPoints != null ? `${formatSp(node.storyPoints)} SP` : '—'}
      </span>

      {/* 状態 */}
      <span
        className={`inline-flex shrink-0 items-center gap-1.5 rounded border px-1.5 py-0.5 text-[11px] ${status.color}`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
        {status.label}
      </span>
    </li>
  );
}
