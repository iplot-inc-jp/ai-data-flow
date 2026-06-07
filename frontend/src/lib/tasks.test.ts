import { describe, it, expect } from 'vitest';
import {
  buildTaskTree,
  computeWbsNumbers,
  collectDescendantIds,
  type Task,
} from './tasks';

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
    ...partial,
  };
}

describe('buildTaskTree', () => {
  it('parentId に従って入れ子にする', () => {
    const tasks = [
      makeTask({ id: 'a', order: 0 }),
      makeTask({ id: 'a1', parentId: 'a', order: 0 }),
      makeTask({ id: 'a2', parentId: 'a', order: 1 }),
      makeTask({ id: 'b', order: 1 }),
    ];
    const tree = buildTaskTree(tasks);
    expect(tree.map((n) => n.id)).toEqual(['a', 'b']);
    expect(tree[0].children.map((n) => n.id)).toEqual(['a1', 'a2']);
    expect(tree[1].children).toHaveLength(0);
  });

  it('order 昇順、同順位は title 昇順で安定的に並べ depth を付与する', () => {
    const tasks = [
      makeTask({ id: 'b', title: 'B', order: 1 }),
      makeTask({ id: 'a', title: 'A', order: 0 }),
      makeTask({ id: 'c', title: 'C', order: 0 }), // a と同 order → title で a < c
      makeTask({ id: 'a1', title: 'A-1', parentId: 'a', order: 0 }),
    ];
    const tree = buildTaskTree(tasks);
    expect(tree.map((n) => n.id)).toEqual(['a', 'c', 'b']);
    expect(tree.map((n) => n.depth)).toEqual([0, 0, 0]);
    expect(tree[0].children[0].id).toBe('a1');
    expect(tree[0].children[0].depth).toBe(1);
  });

  it('親が存在しない parentId はルート扱いにする', () => {
    const tasks = [
      makeTask({ id: 'orphan', parentId: 'missing', order: 0 }),
      makeTask({ id: 'root', order: 1 }),
    ];
    const tree = buildTaskTree(tasks);
    expect(tree.map((n) => n.id).sort()).toEqual(['orphan', 'root']);
  });

  it('循環参照があっても無限ループしない', () => {
    const tasks = [
      makeTask({ id: 'x', parentId: 'y', order: 0 }),
      makeTask({ id: 'y', parentId: 'x', order: 0 }),
    ];
    const tree = buildTaskTree(tasks);
    // どちらかはルートに昇格し、合計2件は失われない
    const all = (function count(nodes): number {
      return nodes.reduce((acc, n) => acc + 1 + count(n.children), 0);
    })(tree);
    expect(all).toBe(2);
  });
});

describe('computeWbsNumbers', () => {
  it('1 / 1.1 / 1.2 / 1.2.1 / 2 の形で採番する', () => {
    const tasks = [
      makeTask({ id: 'a', order: 0 }),
      makeTask({ id: 'a1', parentId: 'a', order: 0 }),
      makeTask({ id: 'a2', parentId: 'a', order: 1 }),
      makeTask({ id: 'a2x', parentId: 'a2', order: 0 }),
      makeTask({ id: 'b', order: 1 }),
    ];
    const wbs = computeWbsNumbers(buildTaskTree(tasks));
    expect(wbs.get('a')).toBe('1');
    expect(wbs.get('a1')).toBe('1.1');
    expect(wbs.get('a2')).toBe('1.2');
    expect(wbs.get('a2x')).toBe('1.2.1');
    expect(wbs.get('b')).toBe('2');
  });

  it('空ツリーは空マップ', () => {
    expect(computeWbsNumbers(buildTaskTree([])).size).toBe(0);
  });
});

describe('collectDescendantIds', () => {
  it('全子孫を集め、自分自身は含めない', () => {
    const tasks = [
      makeTask({ id: 'a' }),
      makeTask({ id: 'a1', parentId: 'a' }),
      makeTask({ id: 'a2', parentId: 'a' }),
      makeTask({ id: 'a1x', parentId: 'a1' }),
      makeTask({ id: 'b' }),
    ];
    const desc = collectDescendantIds(tasks, 'a');
    expect(Array.from(desc).sort()).toEqual(['a1', 'a1x', 'a2']);
    expect(desc.has('a')).toBe(false);
    expect(desc.has('b')).toBe(false);
  });

  it('葉ノードは空集合', () => {
    const tasks = [makeTask({ id: 'a' }), makeTask({ id: 'b' })];
    expect(collectDescendantIds(tasks, 'a').size).toBe(0);
  });
});
