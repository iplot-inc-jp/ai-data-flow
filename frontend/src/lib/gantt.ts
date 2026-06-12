// ガントチャート描画のための純粋レイアウトユーティリティ。
//
// React や DOM に依存せず、フラットなタスク配列（WBS 表示順）と表示設定から
// 「各行のバー位置(x)・幅(width)」「日付軸の目盛り(ticks)」「全体幅」を計算します。
// 純粋関数なのでそのままテスト可能です（gantt.test.ts）。

import type { Task, TaskDependency } from './tasks';

// ---------------------------------------------------------------------------
// 日付ユーティリティ（UTC 基準・時刻成分を切り捨てて「日」単位で扱う）
// ---------------------------------------------------------------------------

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * 日付文字列（ISO / 'YYYY-MM-DD'）を UTC の 0:00 に正規化した Date にする。
 * 不正な値や null/undefined は null を返す。
 */
export function parseDay(value: string | null | undefined): Date | null {
  if (!value) return null;
  // 'YYYY-MM-DD' でも ISO でも、先頭10文字だけ取り UTC として解釈する
  // （タイムゾーンによる日付ズレを防ぐ）。
  const head = value.slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(head);
  if (!m) {
    const t = Date.parse(value);
    if (Number.isNaN(t)) return null;
    const d = new Date(t);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }
  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  const day = Number(m[3]);
  const d = new Date(Date.UTC(year, month, day));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 2つの「日」の差（whole days）。same day -> 0。 */
export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);
}

/** UTC で n 日加算した新しい Date を返す。 */
export function addDays(date: Date, n: number): Date {
  return new Date(date.getTime() + n * MS_PER_DAY);
}

/** UTC 0:00 に正規化（時刻成分を落とす）。 */
export function startOfDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
}

/** 土曜(6)・日曜(0)か（UTC 基準）。 */
export function isWeekend(date: Date): boolean {
  const wd = date.getUTCDay();
  return wd === 0 || wd === 6;
}

// ---------------------------------------------------------------------------
// 全体の日付レンジ算出
// ---------------------------------------------------------------------------

export interface DateRange {
  rangeStart: Date;
  rangeEnd: Date;
}

export interface ComputeRangeOptions {
  /** レンジの前後に付ける余白日数（デフォルト 3 日）。 */
  pad?: number;
  /** 範囲を必ず含めたい基準日（通常は「今日」）。 */
  today?: Date;
}

/**
 * タスク群の startDate / dueDate から全体の表示レンジを求める。
 * - 日付が1つも無ければ today（無ければ現在日）を中心に ±pad のレンジを返す。
 * - pad 日だけ前後に余白を付ける。
 * - today を渡すとレンジに必ず含める。
 */
export function computeDateRange(
  tasks: Task[],
  options: ComputeRangeOptions = {}
): DateRange {
  const pad = options.pad ?? 3;
  const today = options.today ? startOfDay(options.today) : null;

  let min: Date | null = null;
  let max: Date | null = null;

  const consider = (d: Date | null) => {
    if (!d) return;
    if (!min || d.getTime() < min.getTime()) min = d;
    if (!max || d.getTime() > max.getTime()) max = d;
  };

  for (const t of tasks) {
    consider(parseDay(t.startDate));
    consider(parseDay(t.dueDate));
  }

  if (today) {
    consider(today);
  }

  if (!min || !max) {
    // 日付が何も無い場合は today（または現在日）中心の窓を返す
    const center = today ?? startOfDay(new Date());
    return {
      rangeStart: addDays(center, -pad),
      rangeEnd: addDays(center, pad),
    };
  }

  return {
    rangeStart: addDays(min, -pad),
    rangeEnd: addDays(max, pad),
  };
}

// ---------------------------------------------------------------------------
// ガントレイアウト
// ---------------------------------------------------------------------------

export interface GanttRow {
  taskId: string;
  /** 親（サマリー）行か。親はバーが細くなり、子の範囲を span する。 */
  isParent: boolean;
  /** マイルストーンか（菱形描画などに利用）。 */
  milestone: boolean;
  /** バーが描けるか（自身または子に有効な開始〜終了がある）。 */
  hasBar: boolean;
  /** バー左端 px（rangeStart からのオフセット）。hasBar=false のとき null。 */
  x: number | null;
  /** バー幅 px（最低 1 日分）。hasBar=false のとき null。 */
  width: number | null;
  /** 進捗 0..100（塗りつぶし幅の計算に利用）。 */
  progress: number;
  /** このバーの開始日（正規化済み・UTC）。hasBar=false のとき null。 */
  start: Date | null;
  /** このバーの終了日（正規化済み・UTC）。hasBar=false のとき null。 */
  end: Date | null;
}

export interface GanttTick {
  date: Date;
  x: number;
  /** 週/月の境界などに使う補助フラグ（月初）。 */
  isMonthStart: boolean;
  isWeekend: boolean;
}

export interface GanttDependencyLine {
  dependencyId: string;
  predecessorId: string;
  successorId: string;
  /** 先行タスクのバー終端 x。 */
  fromX: number;
  /** 先行タスクの行インデックス。 */
  fromRow: number;
  /** 後続タスクのバー始端 x。 */
  toX: number;
  /** 後続タスクの行インデックス。 */
  toRow: number;
}

export interface GanttLayout {
  rows: GanttRow[];
  rangeStart: Date;
  rangeEnd: Date;
  /** 表示総日数（rangeStart..rangeEnd 含む両端）。 */
  totalDays: number;
  /** 全体の描画幅 px。 */
  totalWidth: number;
  pxPerDay: number;
  ticks: GanttTick[];
}

export interface ComputeGanttLayoutOptions {
  pxPerDay: number;
  rangeStart: Date;
  rangeEnd: Date;
  /** 依存関係（先行→後続の線を引く場合に渡す）。任意。 */
  dependencies?: TaskDependency[];
  /** 目盛りの間隔（日数）。デフォルト 1（毎日）。週表示では 7 を渡す。 */
  tickStepDays?: number;
}

/**
 * タスクの「開始/終了の実日」を求める。
 * - startDate と dueDate の両方があればその範囲。
 * - 片方だけの場合はその日 1 日分。
 * - 両方無ければ null（バー無し）。
 */
function taskOwnSpan(task: Task): { start: Date; end: Date } | null {
  const s = parseDay(task.startDate);
  const e = parseDay(task.dueDate);
  if (s && e) {
    // 逆転していたら入れ替えて頑健に
    return s.getTime() <= e.getTime()
      ? { start: s, end: e }
      : { start: e, end: s };
  }
  if (s) return { start: s, end: s };
  if (e) return { start: e, end: e };
  return null;
}

/**
 * フラットなタスク配列（WBS 表示順）からガントレイアウトを計算する純粋関数。
 *
 * - 各タスクのバー x/width は startDate/dueDate を rangeStart からの日数 × pxPerDay で算出。
 * - 親（子を持つ）行はサマリーバーとして子孫の最小開始〜最大終了を span する。
 *   （親自身に日付があってもよいが、子の範囲があればそれと合算する。）
 * - 開始/終了のどちらも無いタスクはバー無し（hasBar=false, x/width=null）。
 * - dependencies を渡すと、両端にバーがある依存のみ線情報を返す。
 *
 * @param flatTasks WBS 表示順に並んだフラットなタスク配列
 */
export function computeGanttLayout(
  flatTasks: Task[],
  options: ComputeGanttLayoutOptions
): GanttLayout & { dependencyLines: GanttDependencyLine[] } {
  const { pxPerDay } = options;
  const rangeStart = startOfDay(options.rangeStart);
  const rangeEnd = startOfDay(options.rangeEnd);
  const tickStep = Math.max(1, Math.floor(options.tickStepDays ?? 1));

  const totalDays = Math.max(1, daysBetween(rangeStart, rangeEnd) + 1);
  const totalWidth = totalDays * pxPerDay;

  // 親判定：誰かの parentId として参照されているタスクは親（サマリー）。
  const childParentIds = new Set<string>();
  for (const t of flatTasks) {
    if (t.parentId) childParentIds.add(t.parentId);
  }

  // 子孫の span 集約のため、parentId -> 子配列を作る。
  const childrenByParent = new Map<string, Task[]>();
  for (const t of flatTasks) {
    if (!t.parentId) continue;
    const arr = childrenByParent.get(t.parentId) ?? [];
    arr.push(t);
    childrenByParent.set(t.parentId, arr);
  }
  const taskById = new Map<string, Task>();
  for (const t of flatTasks) taskById.set(t.id, t);

  // あるタスク（とその全子孫）の合算 span をメモ化付きで求める。
  const spanCache = new Map<string, { start: Date; end: Date } | null>();
  const visiting = new Set<string>();

  function aggregatedSpan(taskId: string): { start: Date; end: Date } | null {
    if (spanCache.has(taskId)) return spanCache.get(taskId)!;
    if (visiting.has(taskId)) return null; // 循環ガード
    visiting.add(taskId);

    const task = taskById.get(taskId);
    let span: { start: Date; end: Date } | null = task
      ? taskOwnSpan(task)
      : null;

    for (const child of childrenByParent.get(taskId) ?? []) {
      const childSpan = aggregatedSpan(child.id);
      if (childSpan) {
        if (!span) {
          span = { start: childSpan.start, end: childSpan.end };
        } else {
          span = {
            start:
              childSpan.start.getTime() < span.start.getTime()
                ? childSpan.start
                : span.start,
            end:
              childSpan.end.getTime() > span.end.getTime()
                ? childSpan.end
                : span.end,
          };
        }
      }
    }

    visiting.delete(taskId);
    spanCache.set(taskId, span);
    return span;
  }

  const rowIndexByTask = new Map<string, number>();
  flatTasks.forEach((t, i) => rowIndexByTask.set(t.id, i));

  const rows: GanttRow[] = flatTasks.map((task) => {
    const isParent = childParentIds.has(task.id);
    const span = isParent ? aggregatedSpan(task.id) : taskOwnSpan(task);

    if (!span) {
      return {
        taskId: task.id,
        isParent,
        milestone: task.milestone,
        hasBar: false,
        x: null,
        width: null,
        progress: clampProgress(task.progress),
        start: null,
        end: null,
      };
    }

    const x = daysBetween(rangeStart, span.start) * pxPerDay;
    // 終了日も「その日いっぱい」を表すため +1 日分の幅を与える。
    const days = daysBetween(span.start, span.end) + 1;
    const width = Math.max(pxPerDay, days * pxPerDay);

    return {
      taskId: task.id,
      isParent,
      milestone: task.milestone,
      hasBar: true,
      x,
      width,
      progress: clampProgress(task.progress),
      start: span.start,
      end: span.end,
    };
  });

  // 目盛り
  const ticks: GanttTick[] = [];
  for (let d = 0; d < totalDays; d += tickStep) {
    const date = addDays(rangeStart, d);
    ticks.push({
      date,
      x: d * pxPerDay,
      isMonthStart: date.getUTCDate() === 1,
      isWeekend: isWeekend(date),
    });
  }

  // 依存線（両端にバーがあるものだけ）
  const rowByTaskId = new Map<string, GanttRow>();
  rows.forEach((r) => rowByTaskId.set(r.taskId, r));

  const dependencyLines: GanttDependencyLine[] = [];
  for (const dep of options.dependencies ?? []) {
    const pred = rowByTaskId.get(dep.predecessorId);
    const succ = rowByTaskId.get(dep.successorId);
    const predIdx = rowIndexByTask.get(dep.predecessorId);
    const succIdx = rowIndexByTask.get(dep.successorId);
    if (
      !pred ||
      !succ ||
      predIdx === undefined ||
      succIdx === undefined ||
      pred.x === null ||
      pred.width === null ||
      succ.x === null
    ) {
      continue;
    }
    dependencyLines.push({
      dependencyId: dep.id,
      predecessorId: dep.predecessorId,
      successorId: dep.successorId,
      fromX: pred.x + pred.width,
      fromRow: predIdx,
      toX: succ.x,
      toRow: succIdx,
    });
  }

  return {
    rows,
    rangeStart,
    rangeEnd,
    totalDays,
    totalWidth,
    pxPerDay,
    ticks,
    dependencyLines,
  };
}

function clampProgress(n: number | null | undefined): number {
  if (n == null || Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}
