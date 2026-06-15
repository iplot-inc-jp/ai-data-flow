import { describe, it, expect } from 'vitest';
import {
  computeKnowledgeGraphLayout,
  type LayoutInputGraph,
  type KnowledgeGraphLayout,
} from './knowledge-graph-layout';

const NODE_W = 168;
const NODE_H = 64;
const GAP = 24;

function tag(id: string, extra: Partial<LayoutInputGraph['nodes'][number]> = {}) {
  return { id, type: 'TAG' as const, label: id, ...extra };
}
function entity(id: string, extra: Partial<LayoutInputGraph['nodes'][number]> = {}) {
  return { id, type: 'ENTITY' as const, label: id, ...extra };
}
function edge(id: string, from: string, to: string) {
  return { id, fromNodeId: from, toNodeId: to };
}

/** すべての矩形（ノード＋文書）の左上座標を集めて返す。 */
function allRects(layout: KnowledgeGraphLayout): { x: number; y: number }[] {
  return [
    ...Object.values(layout.nodes),
    ...Object.values(layout.documents),
  ];
}

/** 2矩形（同サイズ）がマージン込みで重なるか。 */
function overlaps(
  a: { x: number; y: number },
  b: { x: number; y: number },
): boolean {
  // 非重なり条件: 中心間距離が幅/高さ＋gap 以上。等しい（境界接触）は OK とする。
  return Math.abs(a.x - b.x) < NODE_W + GAP && Math.abs(a.y - b.y) < NODE_H + GAP;
}

function assertNoOverlap(layout: KnowledgeGraphLayout) {
  const rects = allRects(layout);
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      expect(
        overlaps(rects[i], rects[j]),
        `rect ${i} ${JSON.stringify(rects[i])} overlaps rect ${j} ${JSON.stringify(rects[j])}`,
      ).toBe(false);
    }
  }
}

describe('computeKnowledgeGraphLayout', () => {
  it('決定的: 同じ入力（順序が違っても）で同じ出力', () => {
    const graph: LayoutInputGraph = {
      nodes: [
        tag('t-2'),
        tag('t-1'),
        entity('e-3'),
        entity('e-1'),
        entity('e-2'),
      ],
      edges: [edge('r-1', 'e-1', 't-1'), edge('r-2', 'e-2', 't-2'), edge('r-3', 'e-3', 't-1')],
      documents: [{ id: 'd-2' }, { id: 'd-1' }],
    };
    // 入力配列の順序をシャッフルした別グラフ
    const shuffled: LayoutInputGraph = {
      nodes: [...graph.nodes].reverse(),
      edges: [...graph.edges].reverse(),
      documents: [...graph.documents].reverse(),
    };
    const mentions = [
      { documentId: 'd-1', nodeId: 'e-1' },
      { documentId: 'd-1', nodeId: 't-1' },
      { documentId: 'd-2', nodeId: 'e-2' },
    ];
    const a = computeKnowledgeGraphLayout(graph, { mentions });
    const b = computeKnowledgeGraphLayout(shuffled, { mentions });
    expect(a).toEqual(b);
  });

  it('同関数を2回呼んでも完全一致（副作用なし）', () => {
    const graph: LayoutInputGraph = {
      nodes: [tag('t-1'), tag('t-2'), entity('e-1'), entity('e-2')],
      edges: [edge('r-1', 'e-1', 't-1'), edge('r-2', 'e-2', 't-2')],
      documents: [{ id: 'd-1' }],
    };
    const a = computeKnowledgeGraphLayout(graph);
    const b = computeKnowledgeGraphLayout(graph);
    expect(a).toEqual(b);
    // 入力を破壊していないこと
    expect(graph.nodes[0].id).toBe('t-1');
  });

  it('矩形が重ならない（タグ多数＋実体多数＋文書）', () => {
    const nodes = [
      ...Array.from({ length: 8 }, (_, i) => tag(`t-${i}`)),
      ...Array.from({ length: 40 }, (_, i) => entity(`e-${i}`)),
    ];
    const edges = Array.from({ length: 40 }, (_, i) =>
      edge(`r-${i}`, `e-${i}`, `t-${i % 8}`),
    );
    const documents = Array.from({ length: 12 }, (_, i) => ({ id: `d-${i}` }));
    const mentions = documents.flatMap((d, i) => [
      { documentId: d.id, nodeId: `e-${i}` },
      { documentId: d.id, nodeId: `t-${i % 8}` },
    ]);
    const layout = computeKnowledgeGraphLayout(
      { nodes, edges, documents },
      { mentions },
    );
    assertNoOverlap(layout);
  });

  it('positionX/Y がある既存ノードは尊重（自動配置しない）', () => {
    const graph: LayoutInputGraph = {
      nodes: [
        tag('t-1', { positionX: 1000, positionY: 2000 }),
        entity('e-1', { positionX: -500, positionY: -300 }),
        entity('e-2'), // 位置なし → 自動
      ],
      edges: [edge('r-1', 'e-2', 't-1')],
      documents: [{ id: 'd-1', positionX: 50, positionY: 60 }, { id: 'd-2' }],
    };
    const layout = computeKnowledgeGraphLayout(graph);
    expect(layout.nodes['t-1']).toEqual({ x: 1000, y: 2000 });
    expect(layout.nodes['e-1']).toEqual({ x: -500, y: -300 });
    expect(layout.documents['d-1']).toEqual({ x: 50, y: 60 });
    // 自動配置されたものも結果に含まれる
    expect(layout.nodes['e-2']).toBeDefined();
    expect(layout.documents['d-2']).toBeDefined();
  });

  it('全ノード・全文書が結果に含まれる（落とさない）', () => {
    const graph: LayoutInputGraph = {
      nodes: [tag('t-1'), entity('e-1'), entity('e-2')],
      edges: [],
      documents: [{ id: 'd-1' }],
    };
    const layout = computeKnowledgeGraphLayout(graph);
    expect(Object.keys(layout.nodes).sort()).toEqual(['e-1', 'e-2', 't-1']);
    expect(Object.keys(layout.documents)).toEqual(['d-1']);
  });

  it('空グラフでも壊れない', () => {
    const layout = computeKnowledgeGraphLayout({
      nodes: [],
      edges: [],
      documents: [],
    });
    expect(layout).toEqual({ nodes: {}, documents: {} });
  });
});
