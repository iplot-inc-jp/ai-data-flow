import { describe, it, expect } from 'vitest';
import {
  computeGanttLayout,
  computeDateRange,
  parseDay,
  daysBetween,
  addDays,
} from './gantt';
import type { Task, TaskDependency } from './tasks';

// テスト用のタスク生成ヘルパー（必須項目だけ指定すれば良いように）
function makeTask(partial: Partial<Task> & { id: string }): Task {
  return {
    projectId: 'p1',
    parentId: null,
    title: partial.id,
    description: null,
    status: 'OPEN',
    priority: 'MEDIUM',
    assigneeName: null,
    assigneeRoleId: null,
    startDate: null,
    dueDate: null,
    progress: 0,
    estimatedHours: null,
    actualHours: null,
    milestone: false,
    category: null,
    order: 0,
    issueNodeId: null,
    ...partial,
  };
}

const PX = 20; // pxPerDay
const range = {
  rangeStart: parseDay('2026-01-01')!,
  rangeEnd: parseDay('2026-01-31')!,
};

describe('parseDay / daysBetween', () => {
  it("'YYYY-MM-DD' を UTC 0:00 に正規化する", () => {
    const d = parseDay('2026-01-05')!;
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(0);
    expect(d.getUTCDate()).toBe(5);
    expect(d.getUTCHours()).toBe(0);
  });

  it('ISO 文字列（時刻付き）でも先頭の日付を取る', () => {
    const d = parseDay('2026-01-05T12:34:56.000Z')!;
    expect(d.getUTCDate()).toBe(5);
    expect(d.getUTCHours()).toBe(0);
  });

  it('null / 不正値は null', () => {
    expect(parseDay(null)).toBeNull();
    expect(parseDay('')).toBeNull();
    expect(parseDay('not-a-date')).toBeNull();
  });

  it('daysBetween は日数差を返す', () => {
    expect(daysBetween(parseDay('2026-01-01')!, parseDay('2026-01-01')!)).toBe(0);
    expect(daysBetween(parseDay('2026-01-01')!, parseDay('2026-01-04')!)).toBe(3);
  });
});

describe('computeGanttLayout - 日付 -> x / width', () => {
  it('開始日を rangeStart からの日数 × pxPerDay で x にする', () => {
    const tasks = [
      makeTask({ id: 't', startDate: '2026-01-04', dueDate: '2026-01-06' }),
    ];
    const layout = computeGanttLayout(tasks, { ...range, pxPerDay: PX });
    const row = layout.rows[0];
    expect(row.hasBar).toBe(true);
    // 2026-01-04 は rangeStart(01-01) から 3 日
    expect(row.x).toBe(3 * PX);
    // 04..06 は終了日いっぱいを含めて 3 日分の幅
    expect(row.width).toBe(3 * PX);
  });

  it('開始日のみ・終了日のみのタスクは 1 日分の幅', () => {
    const tasks = [
      makeTask({ id: 'startOnly', startDate: '2026-01-10' }),
      makeTask({ id: 'dueOnly', dueDate: '2026-01-12' }),
    ];
    const layout = computeGanttLayout(tasks, { ...range, pxPerDay: PX });
    expect(layout.rows[0].hasBar).toBe(true);
    expect(layout.rows[0].x).toBe(9 * PX);
    expect(layout.rows[0].width).toBe(PX);
    expect(layout.rows[1].hasBar).toBe(true);
    expect(layout.rows[1].x).toBe(11 * PX);
    expect(layout.rows[1].width).toBe(PX);
  });

  it('開始 > 終了が逆転していても入れ替えて頑健に扱う', () => {
    const tasks = [
      makeTask({ id: 't', startDate: '2026-01-06', dueDate: '2026-01-04' }),
    ];
    const layout = computeGanttLayout(tasks, { ...range, pxPerDay: PX });
    expect(layout.rows[0].x).toBe(3 * PX);
    expect(layout.rows[0].width).toBe(3 * PX);
  });

  it('totalDays / totalWidth / ticks を算出する', () => {
    const layout = computeGanttLayout([], { ...range, pxPerDay: PX });
    // 01-01..01-31 は両端含めて 31 日
    expect(layout.totalDays).toBe(31);
    expect(layout.totalWidth).toBe(31 * PX);
    expect(layout.ticks).toHaveLength(31);
    expect(layout.ticks[0].x).toBe(0);
    expect(layout.ticks[1].x).toBe(PX);
  });

  it('tickStepDays で目盛り間隔を間引ける（週表示）', () => {
    const layout = computeGanttLayout([], {
      ...range,
      pxPerDay: PX,
      tickStepDays: 7,
    });
    // 31 日を 7 日刻み -> 0,7,14,21,28 の 5 本
    expect(layout.ticks).toHaveLength(5);
    expect(layout.ticks.map((t) => t.x)).toEqual([0, 7 * PX, 14 * PX, 21 * PX, 28 * PX]);
  });
});

describe('computeGanttLayout - 親（サマリー）行の span', () => {
  it('親バーは子の最小開始〜最大終了に広がる', () => {
    const tasks = [
      makeTask({ id: 'parent' }), // 親自身は日付なし
      makeTask({ id: 'c1', parentId: 'parent', startDate: '2026-01-05', dueDate: '2026-01-08' }),
      makeTask({ id: 'c2', parentId: 'parent', startDate: '2026-01-10', dueDate: '2026-01-12' }),
    ];
    const layout = computeGanttLayout(tasks, { ...range, pxPerDay: PX });
    const parentRow = layout.rows.find((r) => r.taskId === 'parent')!;
    expect(parentRow.isParent).toBe(true);
    expect(parentRow.hasBar).toBe(true);
    // 最小開始 01-05 = 4 日, 最大終了 01-12 -> 4..12 を含め 8 日分
    expect(parentRow.x).toBe(4 * PX);
    expect(parentRow.width).toBe(8 * PX);
  });

  it('親自身の日付も子と合算される', () => {
    const tasks = [
      makeTask({ id: 'parent', startDate: '2026-01-02', dueDate: '2026-01-03' }),
      makeTask({ id: 'c1', parentId: 'parent', startDate: '2026-01-10', dueDate: '2026-01-11' }),
    ];
    const layout = computeGanttLayout(tasks, { ...range, pxPerDay: PX });
    const parentRow = layout.rows.find((r) => r.taskId === 'parent')!;
    // 01-02 = 1 日 .. 01-11 を含め 10 日分
    expect(parentRow.x).toBe(1 * PX);
    expect(parentRow.width).toBe(10 * PX);
  });

  it('多階層（孫）の span も集約される', () => {
    const tasks = [
      makeTask({ id: 'p' }),
      makeTask({ id: 'c', parentId: 'p' }),
      makeTask({ id: 'g1', parentId: 'c', startDate: '2026-01-06', dueDate: '2026-01-07' }),
      makeTask({ id: 'g2', parentId: 'c', startDate: '2026-01-14', dueDate: '2026-01-15' }),
    ];
    const layout = computeGanttLayout(tasks, { ...range, pxPerDay: PX });
    const pRow = layout.rows.find((r) => r.taskId === 'p')!;
    expect(pRow.isParent).toBe(true);
    // 01-06 = 5 日 .. 01-15 を含め 10 日分
    expect(pRow.x).toBe(5 * PX);
    expect(pRow.width).toBe(10 * PX);
  });
});

describe('computeGanttLayout - 日付なしタスク', () => {
  it('開始も終了も無いタスクはバー無し', () => {
    const tasks = [makeTask({ id: 'nodate' })];
    const layout = computeGanttLayout(tasks, { ...range, pxPerDay: PX });
    const row = layout.rows[0];
    expect(row.hasBar).toBe(false);
    expect(row.x).toBeNull();
    expect(row.width).toBeNull();
    expect(row.start).toBeNull();
    expect(row.end).toBeNull();
  });

  it('子が全て日付なしの親はバー無し', () => {
    const tasks = [
      makeTask({ id: 'p' }),
      makeTask({ id: 'c', parentId: 'p' }),
    ];
    const layout = computeGanttLayout(tasks, { ...range, pxPerDay: PX });
    const pRow = layout.rows.find((r) => r.taskId === 'p')!;
    expect(pRow.isParent).toBe(true);
    expect(pRow.hasBar).toBe(false);
    expect(pRow.x).toBeNull();
  });
});

describe('computeGanttLayout - 依存線', () => {
  it('両端にバーがある依存だけ線情報を返す', () => {
    const tasks = [
      makeTask({ id: 'a', startDate: '2026-01-03', dueDate: '2026-01-05' }),
      makeTask({ id: 'b', startDate: '2026-01-08', dueDate: '2026-01-10' }),
      makeTask({ id: 'c' }), // 日付なし
    ];
    const deps: TaskDependency[] = [
      { id: 'd1', predecessorId: 'a', successorId: 'b' },
      { id: 'd2', predecessorId: 'a', successorId: 'c' }, // c はバー無し -> 除外
    ];
    const layout = computeGanttLayout(tasks, {
      ...range,
      pxPerDay: PX,
      dependencies: deps,
    });
    expect(layout.dependencyLines).toHaveLength(1);
    const line = layout.dependencyLines[0];
    expect(line.dependencyId).toBe('d1');
    // a の終端 x = (2 日 * PX) + 幅(3 日 * PX) = 5*PX
    expect(line.fromX).toBe(5 * PX);
    expect(line.fromRow).toBe(0);
    // b の始端 x = 7 日 * PX
    expect(line.toX).toBe(7 * PX);
    expect(line.toRow).toBe(1);
  });

  it('dependencies 未指定なら空配列', () => {
    const layout = computeGanttLayout([makeTask({ id: 'a' })], {
      ...range,
      pxPerDay: PX,
    });
    expect(layout.dependencyLines).toEqual([]);
  });
});

describe('computeDateRange', () => {
  it('最小開始〜最大終了に pad 日の余白を付ける', () => {
    const tasks = [
      makeTask({ id: 'a', startDate: '2026-02-10', dueDate: '2026-02-12' }),
      makeTask({ id: 'b', startDate: '2026-02-20', dueDate: '2026-02-25' }),
    ];
    const { rangeStart, rangeEnd } = computeDateRange(tasks, { pad: 3 });
    expect(rangeStart.getTime()).toBe(addDays(parseDay('2026-02-10')!, -3).getTime());
    expect(rangeEnd.getTime()).toBe(addDays(parseDay('2026-02-25')!, 3).getTime());
  });

  it('today を渡すと必ずレンジに含める', () => {
    const tasks = [
      makeTask({ id: 'a', startDate: '2026-02-10', dueDate: '2026-02-12' }),
    ];
    const today = parseDay('2026-03-01')!;
    const { rangeEnd } = computeDateRange(tasks, { pad: 2, today });
    // today(03-01) + pad(2) まで広がる
    expect(rangeEnd.getTime()).toBe(addDays(today, 2).getTime());
  });

  it('日付が一つも無い場合は today（または現在日）中心の窓', () => {
    const today = parseDay('2026-04-15')!;
    const { rangeStart, rangeEnd } = computeDateRange([makeTask({ id: 'x' })], {
      pad: 3,
      today,
    });
    expect(rangeStart.getTime()).toBe(addDays(today, -3).getTime());
    expect(rangeEnd.getTime()).toBe(addDays(today, 3).getTime());
  });
});
