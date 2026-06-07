'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PageHeader } from '@/components/ui/page-header';
import { HelpTooltip } from '@/components/ui/help-tooltip';
import { HowToPanel } from '@/components/ui/how-to-panel';
import {
  Loader2,
  GanttChartSquare,
  ChevronRight,
  ChevronDown,
  Flag,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  tasksApi,
  buildTaskTree,
  computeWbsNumbers,
  flattenTaskTree,
  taskStatusLabels,
  taskPriorityLabels,
  TASK_STATUSES,
  TASK_PRIORITIES,
  type Task,
  type TaskStatus,
  type TaskPriority,
  type TaskDependency,
  type TaskRole,
  type TaskTreeNode,
} from '@/lib/tasks';
import {
  computeGanttLayout,
  computeDateRange,
  startOfDay,
  type GanttRow,
} from '@/lib/gantt';

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

const ROW_HEIGHT = 36; // 1 行の高さ（左右ペインで一致させる）
const HEADER_HEIGHT = 48; // 日付軸ヘッダーの高さ
const BAR_HEIGHT = 16; // タスクバーの高さ
const SUMMARY_HEIGHT = 6; // 親（サマリー）バーの太さ

const NONE = '__none__';

type ZoomMode = 'day' | 'week';
const ZOOM_PX: Record<ZoomMode, number> = { day: 28, week: 8 };

const WEEKDAY_JP = ['日', '月', '火', '水', '木', '金', '土'];

// ---------------------------------------------------------------------------
// 編集フォーム
// ---------------------------------------------------------------------------

type FormState = {
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeName: string;
  assigneeRoleId: string;
  startDate: string;
  dueDate: string;
  progress: number;
  milestone: boolean;
};

const emptyForm: FormState = {
  title: '',
  description: '',
  status: 'OPEN',
  priority: 'MEDIUM',
  assigneeName: '',
  assigneeRoleId: '',
  startDate: '',
  dueDate: '',
  progress: 0,
  milestone: false,
};

// ---------------------------------------------------------------------------
// ページ
// ---------------------------------------------------------------------------

export default function GanttPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const [tasks, setTasks] = useState<Task[]>([]);
  const [dependencies, setDependencies] = useState<TaskDependency[]>([]);
  const [roles, setRoles] = useState<TaskRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [zoom, setZoom] = useState<ZoomMode>('day');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // 編集ダイアログ
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);

  // 縦スクロール同期（左右ペイン）
  const leftBodyRef = useRef<HTMLDivElement>(null);
  const rightBodyRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef(false);

  // ---------------------------------------------------------------------
  // データ取得
  // ---------------------------------------------------------------------
  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [data, roleList] = await Promise.all([
        tasksApi.list(projectId),
        tasksApi.listRoles(projectId).catch(() => [] as TaskRole[]),
      ]);
      setTasks(data.tasks ?? []);
      setDependencies(data.dependencies ?? []);
      setRoles(roleList ?? []);
    } catch (err) {
      console.error('Failed to fetch tasks:', err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // ---------------------------------------------------------------------
  // 派生データ
  // ---------------------------------------------------------------------
  const tree = useMemo(() => buildTaskTree(tasks), [tasks]);
  const wbs = useMemo(() => computeWbsNumbers(tree), [tree]);
  const allNodes = useMemo(() => flattenTaskTree(tree), [tree]);

  const roleNameById = useMemo(() => {
    const m = new Map<string, string>();
    roles.forEach((r) => m.set(r.id, r.name));
    return m;
  }, [roles]);

  const hasChildren = useMemo(() => {
    const s = new Set<string>();
    tasks.forEach((t) => {
      if (t.parentId) s.add(t.parentId);
    });
    return s;
  }, [tasks]);

  // 折りたたみを反映した可視ノード（祖先のどれかが閉じていれば隠す）
  const visibleNodes = useMemo(() => {
    const out: TaskTreeNode[] = [];
    const walk = (nodes: TaskTreeNode[], hiddenByAncestor: boolean) => {
      for (const n of nodes) {
        if (!hiddenByAncestor) out.push(n);
        const isCollapsed = collapsed.has(n.id);
        walk(n.children, hiddenByAncestor || isCollapsed);
      }
    };
    walk(tree, false);
    return out;
  }, [tree, collapsed]);

  const today = useMemo(() => startOfDay(new Date()), []);

  // 全タスクから表示レンジを求め（折りたたみに依らず安定させる）、
  // ガントレイアウトは「可視ノード」に対して計算する。
  const dateRange = useMemo(
    () => computeDateRange(tasks, { pad: 3, today }),
    [tasks, today]
  );

  const pxPerDay = ZOOM_PX[zoom];

  const layout = useMemo(
    () =>
      computeGanttLayout(visibleNodes, {
        pxPerDay,
        rangeStart: dateRange.rangeStart,
        rangeEnd: dateRange.rangeEnd,
        dependencies,
        tickStepDays: zoom === 'week' ? 7 : 1,
      }),
    [visibleNodes, pxPerDay, dateRange, dependencies, zoom]
  );

  const rowByTaskId = useMemo(() => {
    const m = new Map<string, GanttRow>();
    layout.rows.forEach((r) => m.set(r.taskId, r));
    return m;
  }, [layout.rows]);

  const todayX = useMemo(() => {
    const diff = Math.round(
      (today.getTime() - dateRange.rangeStart.getTime()) / 86400000
    );
    if (diff < 0 || diff > layout.totalDays - 1) return null;
    return diff * pxPerDay;
  }, [today, dateRange.rangeStart, layout.totalDays, pxPerDay]);

  // ---------------------------------------------------------------------
  // スクロール同期
  // ---------------------------------------------------------------------
  const handleLeftScroll = () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    if (rightBodyRef.current && leftBodyRef.current) {
      rightBodyRef.current.scrollTop = leftBodyRef.current.scrollTop;
    }
    syncingRef.current = false;
  };
  const handleRightScroll = () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    if (rightBodyRef.current && leftBodyRef.current) {
      leftBodyRef.current.scrollTop = rightBodyRef.current.scrollTop;
    }
    syncingRef.current = false;
  };

  const toggleCollapse = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ---------------------------------------------------------------------
  // 編集ダイアログ
  // ---------------------------------------------------------------------
  const openEdit = (task: Task) => {
    setEditingId(task.id);
    setForm({
      title: task.title,
      description: task.description ?? '',
      status: task.status,
      priority: task.priority,
      assigneeName: task.assigneeName ?? '',
      assigneeRoleId: task.assigneeRoleId ?? '',
      startDate: task.startDate ? task.startDate.slice(0, 10) : '',
      dueDate: task.dueDate ? task.dueDate.slice(0, 10) : '',
      progress: task.progress ?? 0,
      milestone: task.milestone,
    });
    setError(null);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!editingId) return;
    if (!form.title.trim()) {
      setError('タイトルは必須です');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await tasksApi.update(editingId, {
        title: form.title.trim(),
        description: form.description.trim() || null,
        status: form.status,
        priority: form.priority,
        assigneeName: form.assigneeName.trim() || null,
        assigneeRoleId: form.assigneeRoleId || null,
        startDate: form.startDate || null,
        dueDate: form.dueDate || null,
        progress: clampProgress(form.progress),
        milestone: form.milestone,
      });
      setDialogOpen(false);
      await fetchAll();
    } catch (err: any) {
      setError(err?.message || '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  // ---------------------------------------------------------------------
  // 描画
  // ---------------------------------------------------------------------
  if (loading) {
    return (
      <div className="flex items-center justify-center h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const bodyHeight = Math.max(visibleNodes.length, 1) * ROW_HEIGHT;

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <GanttChartSquare className="h-5 w-5 text-blue-600" />
            WBS / ガントチャート
          </span>
        }
        description="WBS（左）とガントタイムライン（右）を行単位で同期表示します"
        help="左の WBS 表と右のタイムラインが同じ行で並びます。バーは開始日〜期限、塗りは進捗、親行は子の範囲をまとめた細いサマリーバーです。先行→後続の依存は矢印で結ばれます。"
        backHref={`/dashboard/projects/${projectId}/tasks`}
        backLabel="タスク管理に戻る"
        actions={
          <>
            <HowToPanel
              steps={[
                '左の WBS 表は親タスクの ▸ をクリックで折りたたみ・展開できます。',
                '右のタイムラインは横スクロールできます。バーは開始日〜期限、青い塗りが進捗です。',
                '親（サマリー）行は子タスクの最小開始〜最大期限を細いバーで表します。',
                '先行タスク（依存関係）が登録されていると、先行の終端から後続の始端へ矢印が引かれます。',
                '行またはバーをクリックすると、そのタスクの編集ダイアログが開きます。',
                '右上の「日 / 週」で目盛りの拡大率（pxPerDay）を切り替えられます。',
              ]}
            />
            <div className="flex items-center rounded-md border border-gray-300 bg-white p-0.5">
              <button
                type="button"
                onClick={() => setZoom('day')}
                className={`flex items-center gap-1 rounded px-2.5 py-1 text-sm transition-colors ${
                  zoom === 'day'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
                title="日表示（拡大）"
              >
                <ZoomIn className="h-3.5 w-3.5" />
                日
              </button>
              <button
                type="button"
                onClick={() => setZoom('week')}
                className={`flex items-center gap-1 rounded px-2.5 py-1 text-sm transition-colors ${
                  zoom === 'week'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
                title="週表示（縮小）"
              >
                <ZoomOut className="h-3.5 w-3.5" />
                週
              </button>
            </div>
          </>
        }
      />

      {tasks.length === 0 ? (
        <Card className="bg-white border-gray-200">
          <div className="flex flex-col items-center justify-center py-16">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
              <GanttChartSquare className="h-8 w-8 text-gray-400" />
            </div>
            <p className="mb-2 text-gray-500">タスクがありません</p>
            <p className="mb-4 text-sm text-gray-400">
              タスク管理画面で WBS を作成するとガントに反映されます
            </p>
            <Link href={`/dashboard/projects/${projectId}/tasks`}>
              <Button className="bg-blue-600 hover:bg-blue-700">
                タスク管理へ
              </Button>
            </Link>
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden border-gray-200 bg-white">
          <div className="flex">
            {/* ============ 左ペイン：WBS 表 ============ */}
            <div className="w-[460px] shrink-0 border-r border-gray-200">
              {/* ヘッダー */}
              <div
                className="flex items-center border-b border-gray-200 bg-gray-50 text-xs font-medium text-gray-500"
                style={{ height: HEADER_HEIGHT }}
              >
                <div className="w-[150px] shrink-0 px-2">WBS番号 / タイトル</div>
                <div className="flex-1 px-2">タイトル</div>
                <div className="w-[80px] shrink-0 px-2">担当</div>
                <div className="w-[64px] shrink-0 px-2 text-right">進捗</div>
                <div className="w-[64px] shrink-0 px-2">状態</div>
              </div>
              {/* 行 */}
              <div
                ref={leftBodyRef}
                onScroll={handleLeftScroll}
                className="max-h-[60vh] overflow-y-auto overflow-x-hidden"
              >
                <div style={{ height: bodyHeight }}>
                  {visibleNodes.map((node) => {
                    const status = taskStatusLabels[node.status];
                    const isParent = hasChildren.has(node.id);
                    const isCollapsed = collapsed.has(node.id);
                    const assignee =
                      node.assigneeName ||
                      (node.assigneeRoleId
                        ? roleNameById.get(node.assigneeRoleId)
                        : '') ||
                      '';
                    const row = rowByTaskId.get(node.id);
                    const period =
                      row && row.start && row.end
                        ? `${fmtMd(row.start)}–${fmtMd(row.end)}`
                        : '';
                    return (
                      <div
                        key={node.id}
                        onClick={() => openEdit(node)}
                        className="group flex cursor-pointer items-center border-b border-gray-100 hover:bg-blue-50/40"
                        style={{ height: ROW_HEIGHT }}
                        title="クリックして編集"
                      >
                        {/* WBS番号 + インデント + 開閉 */}
                        <div
                          className="flex w-[150px] shrink-0 items-center gap-1 px-2"
                          style={{ paddingLeft: 8 + node.depth * 14 }}
                        >
                          {isParent ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleCollapse(node.id);
                              }}
                              className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-gray-400 hover:bg-gray-200 hover:text-gray-600"
                              aria-label={isCollapsed ? '展開' : '折りたたむ'}
                            >
                              {isCollapsed ? (
                                <ChevronRight className="h-3.5 w-3.5" />
                              ) : (
                                <ChevronDown className="h-3.5 w-3.5" />
                              )}
                            </button>
                          ) : (
                            <span className="w-4 shrink-0" />
                          )}
                          <span className="font-mono text-[11px] tabular-nums text-gray-400">
                            {wbs.get(node.id)}
                          </span>
                        </div>
                        {/* タイトル */}
                        <div className="flex min-w-0 flex-1 items-center gap-1 px-2">
                          {node.milestone && (
                            <Flag className="h-3 w-3 shrink-0 text-amber-500" />
                          )}
                          <span
                            className={`truncate text-sm ${
                              isParent
                                ? 'font-semibold text-gray-900'
                                : 'text-gray-700'
                            }`}
                          >
                            {node.title}
                          </span>
                          {period && (
                            <span className="ml-auto shrink-0 font-mono text-[10px] tabular-nums text-gray-300">
                              {period}
                            </span>
                          )}
                        </div>
                        {/* 担当 */}
                        <div className="w-[80px] shrink-0 truncate px-2 text-xs text-gray-600">
                          {assignee || (
                            <span className="text-gray-300">未割当</span>
                          )}
                        </div>
                        {/* 進捗 */}
                        <div className="w-[64px] shrink-0 px-2 text-right text-[11px] tabular-nums text-gray-500">
                          {clampProgress(node.progress)}%
                        </div>
                        {/* 状態 */}
                        <div className="w-[64px] shrink-0 px-2">
                          <span
                            className={`inline-flex items-center gap-1 rounded border px-1 py-0.5 text-[10px] ${status.color}`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${status.dot}`}
                            />
                            {status.label}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* ============ 右ペイン：ガントタイムライン ============ */}
            <div className="min-w-0 flex-1">
              <div className="overflow-x-auto">
                <div style={{ width: layout.totalWidth }}>
                  {/* 日付軸ヘッダー */}
                  <div
                    className="relative border-b border-gray-200 bg-gray-50"
                    style={{ height: HEADER_HEIGHT, width: layout.totalWidth }}
                  >
                    {/* 週末の薄い網掛け（日表示のみ） */}
                    {zoom === 'day' &&
                      layout.ticks
                        .filter((t) => t.isWeekend)
                        .map((t) => (
                          <div
                            key={`wh-${t.x}`}
                            className="absolute top-0 bottom-0 bg-gray-100/70"
                            style={{ left: t.x, width: pxPerDay }}
                          />
                        ))}
                    {/* 目盛りラベル */}
                    {layout.ticks.map((t) => (
                      <div
                        key={`tk-${t.x}`}
                        className={`absolute top-0 flex h-full flex-col justify-center border-l text-[10px] leading-tight ${
                          t.isMonthStart
                            ? 'border-gray-300'
                            : 'border-gray-200/70'
                        }`}
                        style={{ left: t.x, width: pxPerDay }}
                      >
                        {zoom === 'day' ? (
                          <>
                            <span
                              className={`px-1 tabular-nums ${
                                t.isWeekend
                                  ? 'text-rose-400'
                                  : 'text-gray-500'
                              }`}
                            >
                              {t.date.getUTCDate()}
                            </span>
                            <span
                              className={`px-1 text-[9px] ${
                                t.isWeekend
                                  ? 'text-rose-300'
                                  : 'text-gray-300'
                              }`}
                            >
                              {WEEKDAY_JP[t.date.getUTCDay()]}
                            </span>
                          </>
                        ) : (
                          <span className="px-1 tabular-nums text-gray-500">
                            {t.date.getUTCMonth() + 1}/{t.date.getUTCDate()}
                          </span>
                        )}
                        {t.isMonthStart && zoom === 'day' && (
                          <span className="absolute -top-0 left-1 text-[9px] font-semibold text-gray-400">
                            {t.date.getUTCMonth() + 1}月
                          </span>
                        )}
                      </div>
                    ))}
                    {/* 今日ライン（ヘッダー部） */}
                    {todayX !== null && (
                      <div
                        className="absolute top-0 bottom-0 z-10 w-px bg-rose-400"
                        style={{ left: todayX }}
                      >
                        <span className="absolute -top-0 left-1 rounded bg-rose-400 px-1 text-[9px] text-white">
                          今日
                        </span>
                      </div>
                    )}
                  </div>

                  {/* 行本体 + バー + 依存線 */}
                  <div
                    ref={rightBodyRef}
                    onScroll={handleRightScroll}
                    className="relative max-h-[60vh] overflow-y-auto overflow-x-hidden"
                  >
                    <div
                      className="relative"
                      style={{ height: bodyHeight, width: layout.totalWidth }}
                    >
                      {/* 週末の縦帯（本体・日表示のみ） */}
                      {zoom === 'day' &&
                        layout.ticks
                          .filter((t) => t.isWeekend)
                          .map((t) => (
                            <div
                              key={`wb-${t.x}`}
                              className="absolute top-0 bottom-0 bg-gray-50"
                              style={{ left: t.x, width: pxPerDay }}
                            />
                          ))}
                      {/* 縦グリッド線 */}
                      {layout.ticks.map((t) => (
                        <div
                          key={`gl-${t.x}`}
                          className={`absolute top-0 bottom-0 border-l ${
                            t.isMonthStart
                              ? 'border-gray-200'
                              : 'border-gray-100'
                          }`}
                          style={{ left: t.x }}
                        />
                      ))}
                      {/* 今日ライン（本体） */}
                      {todayX !== null && (
                        <div
                          className="absolute top-0 bottom-0 z-10 w-px bg-rose-400/70"
                          style={{ left: todayX }}
                        />
                      )}

                      {/* 横の行罫線 */}
                      {visibleNodes.map((node, i) => (
                        <div
                          key={`rl-${node.id}`}
                          className="absolute left-0 right-0 border-b border-gray-100"
                          style={{ top: (i + 1) * ROW_HEIGHT - 1 }}
                        />
                      ))}

                      {/* 依存線（SVG） */}
                      {layout.dependencyLines.length > 0 && (
                        <svg
                          className="pointer-events-none absolute inset-0 z-20"
                          width={layout.totalWidth}
                          height={bodyHeight}
                        >
                          <defs>
                            <marker
                              id="gantt-arrow"
                              markerWidth="6"
                              markerHeight="6"
                              refX="5"
                              refY="3"
                              orient="auto"
                            >
                              <path d="M0,0 L6,3 L0,6 Z" fill="#94a3b8" />
                            </marker>
                          </defs>
                          {layout.dependencyLines.map((line) => {
                            const y1 =
                              line.fromRow * ROW_HEIGHT + ROW_HEIGHT / 2;
                            const y2 = line.toRow * ROW_HEIGHT + ROW_HEIGHT / 2;
                            const gap = 10;
                            const midX = line.fromX + gap;
                            // 先行終端 → 右に少し → 後続行の高さ → 後続始端
                            const d = `M ${line.fromX} ${y1} H ${midX} V ${y2} H ${line.toX}`;
                            return (
                              <path
                                key={line.dependencyId}
                                d={d}
                                fill="none"
                                stroke="#94a3b8"
                                strokeWidth={1.25}
                                markerEnd="url(#gantt-arrow)"
                              />
                            );
                          })}
                        </svg>
                      )}

                      {/* バー */}
                      {visibleNodes.map((node, i) => {
                        const row = rowByTaskId.get(node.id);
                        if (!row || !row.hasBar || row.x === null || row.width === null) {
                          return null;
                        }
                        const top = i * ROW_HEIGHT;
                        const priority = taskPriorityLabels[node.priority];

                        // マイルストーンは菱形
                        if (row.milestone) {
                          const size = 12;
                          return (
                            <div
                              key={`bar-${node.id}`}
                              onClick={() => openEdit(node)}
                              className="absolute z-10 cursor-pointer"
                              style={{
                                left: row.x - size / 2,
                                top: top + ROW_HEIGHT / 2 - size / 2,
                                width: size,
                                height: size,
                              }}
                              title={`${node.title}（マイルストーン）`}
                            >
                              <div
                                className="h-full w-full rotate-45 border border-amber-600 bg-amber-400"
                                style={{ borderRadius: 2 }}
                              />
                            </div>
                          );
                        }

                        // 親（サマリー）バー：細い span
                        if (row.isParent) {
                          return (
                            <div
                              key={`bar-${node.id}`}
                              onClick={() => openEdit(node)}
                              className="absolute z-10 cursor-pointer"
                              style={{
                                left: row.x,
                                width: row.width,
                                top: top + ROW_HEIGHT / 2 - SUMMARY_HEIGHT / 2,
                                height: SUMMARY_HEIGHT,
                              }}
                              title={node.title}
                            >
                              <div className="relative h-full w-full rounded-sm bg-slate-700">
                                {/* 両端のキャップ */}
                                <div className="absolute -left-px top-0 h-full w-1.5 -skew-x-12 bg-slate-700" />
                                <div className="absolute -right-px top-0 h-full w-1.5 skew-x-12 bg-slate-700" />
                              </div>
                            </div>
                          );
                        }

                        // 通常タスクバー（進捗塗り）
                        const fillPct = clampProgress(row.progress);
                        return (
                          <div
                            key={`bar-${node.id}`}
                            onClick={() => openEdit(node)}
                            className="group absolute z-10 cursor-pointer overflow-hidden rounded border border-blue-500/80 bg-blue-100"
                            style={{
                              left: row.x,
                              width: row.width,
                              top: top + ROW_HEIGHT / 2 - BAR_HEIGHT / 2,
                              height: BAR_HEIGHT,
                            }}
                            title={`${node.title}（進捗 ${fillPct}%・優先度 ${priority.label}）`}
                          >
                            <div
                              className="h-full bg-blue-600"
                              style={{ width: `${fillPct}%` }}
                            />
                            {row.width > 40 && (
                              <span className="pointer-events-none absolute inset-0 flex items-center truncate px-1.5 text-[10px] font-medium text-blue-900/80 group-hover:text-blue-900">
                                {node.title}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* 編集ダイアログ */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl border-gray-200 bg-white">
          <DialogHeader>
            <DialogTitle className="text-gray-900">タスクを編集</DialogTitle>
            <DialogDescription className="text-gray-500">
              期間・進捗・担当・状態を編集するとガントに即時反映されます
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <Field label="タイトル">
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="border-gray-300 bg-white"
              />
            </Field>

            <Field label="説明">
              <Textarea
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                className="min-h-[60px] border-gray-300 bg-white"
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="状態">
                <Select
                  value={form.status}
                  onValueChange={(v) =>
                    setForm({ ...form, status: v as TaskStatus })
                  }
                >
                  <SelectTrigger className="border-gray-300 bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white">
                    {TASK_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {taskStatusLabels[s].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="優先度">
                <Select
                  value={form.priority}
                  onValueChange={(v) =>
                    setForm({ ...form, priority: v as TaskPriority })
                  }
                >
                  <SelectTrigger className="border-gray-300 bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white">
                    {TASK_PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {taskPriorityLabels[p].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="開始日">
                <Input
                  type="date"
                  value={form.startDate}
                  onChange={(e) =>
                    setForm({ ...form, startDate: e.target.value })
                  }
                  className="border-gray-300 bg-white"
                />
              </Field>
              <Field label="期限">
                <Input
                  type="date"
                  value={form.dueDate}
                  onChange={(e) =>
                    setForm({ ...form, dueDate: e.target.value })
                  }
                  className="border-gray-300 bg-white"
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="担当（氏名）">
                <Input
                  value={form.assigneeName}
                  onChange={(e) =>
                    setForm({ ...form, assigneeName: e.target.value })
                  }
                  className="border-gray-300 bg-white"
                />
              </Field>
              <Field label="担当ロール">
                <Select
                  value={form.assigneeRoleId || NONE}
                  onValueChange={(v) =>
                    setForm({ ...form, assigneeRoleId: v === NONE ? '' : v })
                  }
                >
                  <SelectTrigger className="border-gray-300 bg-white">
                    <SelectValue placeholder="（未選択）" />
                  </SelectTrigger>
                  <SelectContent className="bg-white">
                    <SelectItem value={NONE}>（未選択）</SelectItem>
                    {roles.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Field label={`進捗（${clampProgress(form.progress)}%）`}>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={clampProgress(form.progress)}
                onChange={(e) =>
                  setForm({ ...form, progress: Number(e.target.value) })
                }
                className="w-full accent-blue-600"
              />
            </Field>

            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.milestone}
                onChange={(e) =>
                  setForm({ ...form, milestone: e.target.checked })
                }
                className="h-4 w-4 accent-amber-500"
              />
              <span className="flex items-center gap-1">
                <Flag className="h-3.5 w-3.5 text-amber-500" />
                マイルストーン
              </span>
            </label>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}
          </div>

          <DialogFooter>
            <Link
              href={`/dashboard/projects/${projectId}/tasks`}
              className="mr-auto"
            >
              <Button variant="ghost" className="text-gray-500">
                一覧で詳細編集
              </Button>
            </Link>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              キャンセル
            </Button>
            <Button
              onClick={handleSave}
              disabled={!form.title.trim() || saving}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  保存中...
                </>
              ) : (
                '更新'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

function clampProgress(n: number | null | undefined): number {
  if (n == null || Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function fmtMd(d: Date): string {
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

function Field({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Label className="text-gray-700">{label}</Label>
        {help && <HelpTooltip text={help} />}
      </div>
      {children}
    </div>
  );
}
