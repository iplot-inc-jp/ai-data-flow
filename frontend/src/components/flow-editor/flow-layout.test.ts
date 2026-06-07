import { describe, it, expect } from 'vitest';
import {
  computeLayers,
  computeFlowLayout,
  computeLaneBands,
  DEFAULT_LAYOUT_OPTIONS,
  DEFAULT_LANE_BANDS_OPTIONS,
  type LayoutInputNode,
  type LayoutInputEdge,
  type LayoutRole,
  type BandInputNode,
} from './flow-layout';

const roles: LayoutRole[] = [
  { id: 'r-customer', name: '顧客', color: '#3b82f6' },
  { id: 'r-approver', name: '承認者', color: '#f59e0b' },
  { id: 'r-system', name: 'システム', color: '#8b5cf6' },
];

// ===========================================
// computeLayers（補助ユーティリティ: 最長経路）
// ===========================================
describe('computeLayers', () => {
  it('線形チェーンはレイヤーが 0,1,2 と増える', () => {
    const ids = ['a', 'b', 'c'];
    const edges: LayoutInputEdge[] = [
      { id: 'e1', source: 'a', target: 'b' },
      { id: 'e2', source: 'b', target: 'c' },
    ];
    const layers = computeLayers(ids, edges);
    expect(layers.get('a')).toBe(0);
    expect(layers.get('b')).toBe(1);
    expect(layers.get('c')).toBe(2);
  });

  it('分岐は両ターゲットが同一レイヤーになる', () => {
    const ids = ['a', 'b', 'c'];
    const edges: LayoutInputEdge[] = [
      { id: 'e1', source: 'a', target: 'b' },
      { id: 'e2', source: 'a', target: 'c' },
    ];
    const layers = computeLayers(ids, edges);
    expect(layers.get('a')).toBe(0);
    expect(layers.get('b')).toBe(1);
    expect(layers.get('c')).toBe(1);
  });

  it('合流は最長経路を採用する', () => {
    // a->b->d (長さ2), a->d (長さ1) → d は layer 2
    const ids = ['a', 'b', 'd'];
    const edges: LayoutInputEdge[] = [
      { id: 'e1', source: 'a', target: 'b' },
      { id: 'e2', source: 'b', target: 'd' },
      { id: 'e3', source: 'a', target: 'd' },
    ];
    const layers = computeLayers(ids, edges);
    expect(layers.get('d')).toBe(2);
  });

  it('循環があっても例外を投げず全ノードにレイヤーを与える', () => {
    const ids = ['a', 'b', 'c'];
    const edges: LayoutInputEdge[] = [
      { id: 'e1', source: 'a', target: 'b' },
      { id: 'e2', source: 'b', target: 'c' },
      { id: 'e3', source: 'c', target: 'a' }, // バックエッジ
    ];
    const layers = computeLayers(ids, edges);
    expect(layers.size).toBe(3);
    for (const id of ids) expect(typeof layers.get(id)).toBe('number');
  });

  it('自己ループ・端点欠落エッジは無視する', () => {
    const ids = ['a', 'b'];
    const edges: LayoutInputEdge[] = [
      { id: 'e1', source: 'a', target: 'a' }, // 自己ループ
      { id: 'e2', source: 'a', target: 'b' },
      { id: 'e3', source: 'a', target: 'ghost' }, // 欠落端点
    ];
    const layers = computeLayers(ids, edges);
    expect(layers.get('a')).toBe(0);
    expect(layers.get('b')).toBe(1);
  });
});

// ===========================================
// computeFlowLayout — 共通（向きに依存しない構造）
// ===========================================
describe('computeFlowLayout', () => {
  it('デフォルトは horizontal 向き', () => {
    const layout = computeFlowLayout([], [], roles);
    expect(layout.orientation).toBe('horizontal');
  });

  it('ロールごとに別レーンへ割り当てられる', () => {
    const nodes: LayoutInputNode[] = [
      { id: 'a', roleId: 'r-customer', order: 0 },
      { id: 'b', roleId: 'r-approver', order: 1 },
      { id: 'c', roleId: 'r-system', order: 2 },
    ];
    const layout = computeFlowLayout(nodes, [], roles);
    const byId = (id: string) => layout.nodes.find((n) => n.id === id)!;
    expect(byId('a').laneIndex).toBe(0);
    expect(byId('b').laneIndex).toBe(1);
    expect(byId('c').laneIndex).toBe(2);
    // ロールごとに roleId が引き継がれる
    expect(byId('a').roleId).toBe('r-customer');
    expect(byId('b').roleId).toBe('r-approver');
    expect(byId('c').roleId).toBe('r-system');
  });

  it('roleId 不明/未指定のノードは「未割当」レーンに集約される', () => {
    const nodes: LayoutInputNode[] = [
      { id: 'a', roleId: 'r-customer' },
      { id: 'x' }, // 未指定
      { id: 'y', roleId: 'nonexistent' }, // 不明
    ];
    const layout = computeFlowLayout(nodes, [], roles);
    const unassigned = layout.lanes.find(
      (l) => l.roleId === DEFAULT_LAYOUT_OPTIONS.unassignedLaneId,
    );
    expect(unassigned).toBeDefined();
    expect(layout.nodes.find((n) => n.id === 'x')!.roleId).toBe(
      DEFAULT_LAYOUT_OPTIONS.unassignedLaneId,
    );
    expect(layout.nodes.find((n) => n.id === 'y')!.roleId).toBe(
      DEFAULT_LAYOUT_OPTIONS.unassignedLaneId,
    );
  });

  it('PositionedNode は order をエコーする', () => {
    const nodes: LayoutInputNode[] = [
      { id: 'a', roleId: 'r-customer', order: 5 },
      { id: 'b', roleId: 'r-customer', order: 12 },
    ];
    const layout = computeFlowLayout(nodes, [], roles);
    expect(layout.nodes.find((n) => n.id === 'a')!.order).toBe(5);
    expect(layout.nodes.find((n) => n.id === 'b')!.order).toBe(12);
  });

  it('空入力でも壊れない', () => {
    const layout = computeFlowLayout([], [], roles);
    expect(layout.nodes).toHaveLength(0);
    expect(layout.lanes).toHaveLength(roles.length);
    expect(layout.width).toBeGreaterThan(0);
    expect(layout.height).toBeGreaterThan(0);
  });
});

// ===========================================
// computeFlowLayout — horizontal（時間=x, レーン=横帯）
// ===========================================
describe('computeFlowLayout (horizontal)', () => {
  const opt = { orientation: 'horizontal' as const };

  it('同一ロールの線形フローは同じレーン中心Yで order 昇順に右へ進む', () => {
    const nodes: LayoutInputNode[] = [
      { id: 'a', type: 'START', roleId: 'r-customer', order: 0 },
      { id: 'b', type: 'PROCESS', roleId: 'r-customer', order: 1 },
      { id: 'c', type: 'END', roleId: 'r-customer', order: 2 },
    ];
    const layout = computeFlowLayout(nodes, [], roles, opt);
    const [a, b, c] = ['a', 'b', 'c'].map(
      (id) => layout.nodes.find((n) => n.id === id)!,
    );
    // 同じレーン → 同じ中心Y
    expect(a.y).toBe(b.y);
    expect(b.y).toBe(c.y);
    // order 昇順で右へ進む（時間=x）
    expect(a.x).toBeLessThan(b.x);
    expect(b.x).toBeLessThan(c.x);
    // レーン中心Yに一致
    const customerLane = layout.lanes.find((l) => l.roleId === 'r-customer')!;
    expect(a.y).toBe(customerLane.centerY);
  });

  it('時間軸は order の昇順で駆動される（入力順や roleId に依らない）', () => {
    // 入力順は降順だが order が時間を決める
    const nodes: LayoutInputNode[] = [
      { id: 'c', roleId: 'r-system', order: 30 },
      { id: 'a', roleId: 'r-customer', order: 10 },
      { id: 'b', roleId: 'r-approver', order: 20 },
    ];
    const layout = computeFlowLayout(nodes, [], roles, opt);
    const byId = (id: string) => layout.nodes.find((n) => n.id === id)!;
    // order 昇順 = x 昇順
    expect(byId('a').x).toBeLessThan(byId('b').x);
    expect(byId('b').x).toBeLessThan(byId('c').x);
  });

  it('レーンは横帯で上→下に積層（top が増加, full-width geometry）', () => {
    const nodes: LayoutInputNode[] = [
      { id: 'a', roleId: 'r-customer', order: 0 },
      { id: 'b', roleId: 'r-approver', order: 1 },
      { id: 'c', roleId: 'r-system', order: 2 },
    ];
    const layout = computeFlowLayout(nodes, [], roles, opt);
    expect(layout.lanes[0].top).toBeLessThan(layout.lanes[1].top);
    expect(layout.lanes[1].top).toBeLessThan(layout.lanes[2].top);
    for (const lane of layout.lanes) {
      expect(lane.height).toBeGreaterThan(0);
      expect(lane.centerY).toBe(lane.top + lane.height / 2);
    }
  });

  it('同一 (order, ロール) セルに複数ノードがあると Y方向に積み、レーン高さが自動拡張される', () => {
    const nodes: LayoutInputNode[] = [
      { id: 'b1', roleId: 'r-approver', order: 0 },
      { id: 'b2', roleId: 'r-approver', order: 0 },
      { id: 'b3', roleId: 'r-approver', order: 0 },
    ];
    const layout = computeFlowLayout(nodes, [], roles, opt);
    const approverLane = layout.lanes.find((l) => l.roleId === 'r-approver')!;
    expect(approverLane.height).toBeGreaterThan(
      DEFAULT_LAYOUT_OPTIONS.defaultLaneHeight,
    );
    const ys = ['b1', 'b2', 'b3'].map(
      (id) => layout.nodes.find((n) => n.id === id)!.y,
    );
    expect(ys[0]).toBeLessThan(ys[1]);
    expect(ys[1]).toBeLessThan(ys[2]);
    // 同一 order → 同じX
    const xs = ['b1', 'b2', 'b3'].map(
      (id) => layout.nodes.find((n) => n.id === id)!.x,
    );
    expect(new Set(xs).size).toBe(1);
  });

  it('全体高さ = レーン高さの総和、各ノードは自レーン範囲内', () => {
    const nodes: LayoutInputNode[] = [
      { id: 'a', roleId: 'r-customer', order: 0 },
      { id: 'b', roleId: 'r-system', order: 1 },
    ];
    const layout = computeFlowLayout(nodes, [], roles, opt);
    const sum = layout.lanes.reduce((s, l) => s + l.height, 0);
    expect(layout.height).toBe(sum);
    for (const n of layout.nodes) {
      const lane = layout.lanes[n.laneIndex];
      expect(n.y).toBeGreaterThanOrEqual(lane.top);
      expect(n.y).toBeLessThanOrEqual(lane.top + lane.height);
    }
  });
});

// ===========================================
// computeFlowLayout — vertical（時間=y, レーン=縦列）
// ===========================================
describe('computeFlowLayout (vertical)', () => {
  const opt = { orientation: 'vertical' as const };

  it('同一ロールの線形フローは同じレーン中心Xで order 昇順に下へ進む', () => {
    const nodes: LayoutInputNode[] = [
      { id: 'a', type: 'START', roleId: 'r-customer', order: 0 },
      { id: 'b', type: 'PROCESS', roleId: 'r-customer', order: 1 },
      { id: 'c', type: 'END', roleId: 'r-customer', order: 2 },
    ];
    const layout = computeFlowLayout(nodes, [], roles, opt);
    const [a, b, c] = ['a', 'b', 'c'].map(
      (id) => layout.nodes.find((n) => n.id === id)!,
    );
    // 同じレーン → 同じ中心X
    expect(a.x).toBe(b.x);
    expect(b.x).toBe(c.x);
    // order 昇順で下へ進む（時間=y）
    expect(a.y).toBeLessThan(b.y);
    expect(b.y).toBeLessThan(c.y);
    // レーン中心Xに一致
    const customerLane = layout.lanes.find((l) => l.roleId === 'r-customer')!;
    expect(a.x).toBe(customerLane.centerX);
  });

  it('時間軸は order の昇順で駆動される（時間=y）', () => {
    const nodes: LayoutInputNode[] = [
      { id: 'c', roleId: 'r-system', order: 30 },
      { id: 'a', roleId: 'r-customer', order: 10 },
      { id: 'b', roleId: 'r-approver', order: 20 },
    ];
    const layout = computeFlowLayout(nodes, [], roles, opt);
    const byId = (id: string) => layout.nodes.find((n) => n.id === id)!;
    expect(byId('a').y).toBeLessThan(byId('b').y);
    expect(byId('b').y).toBeLessThan(byId('c').y);
  });

  it('レーンは縦列で左→右に並置（left が増加, full-height geometry）', () => {
    const nodes: LayoutInputNode[] = [
      { id: 'a', roleId: 'r-customer', order: 0 },
      { id: 'b', roleId: 'r-approver', order: 1 },
      { id: 'c', roleId: 'r-system', order: 2 },
    ];
    const layout = computeFlowLayout(nodes, [], roles, opt);
    expect(layout.lanes[0].left).toBeLessThan(layout.lanes[1].left);
    expect(layout.lanes[1].left).toBeLessThan(layout.lanes[2].left);
    for (const lane of layout.lanes) {
      expect(lane.width).toBeGreaterThan(0);
      expect(lane.centerX).toBe(lane.left + lane.width / 2);
    }
  });

  it('同一 (order, ロール) セルに複数ノードがあると X方向に積み、レーン幅が自動拡張される', () => {
    const nodes: LayoutInputNode[] = [
      { id: 'b1', roleId: 'r-approver', order: 0 },
      { id: 'b2', roleId: 'r-approver', order: 0 },
      { id: 'b3', roleId: 'r-approver', order: 0 },
    ];
    const layout = computeFlowLayout(nodes, [], roles, opt);
    const approverLane = layout.lanes.find((l) => l.roleId === 'r-approver')!;
    expect(approverLane.width).toBeGreaterThan(
      DEFAULT_LAYOUT_OPTIONS.defaultLaneHeight,
    );
    const xs = ['b1', 'b2', 'b3'].map(
      (id) => layout.nodes.find((n) => n.id === id)!.x,
    );
    expect(xs[0]).toBeLessThan(xs[1]);
    expect(xs[1]).toBeLessThan(xs[2]);
    // 同一 order → 同じY
    const ys = ['b1', 'b2', 'b3'].map(
      (id) => layout.nodes.find((n) => n.id === id)!.y,
    );
    expect(new Set(ys).size).toBe(1);
  });

  it('全体幅 = レーン幅の総和、各ノードは自レーン範囲内', () => {
    const nodes: LayoutInputNode[] = [
      { id: 'a', roleId: 'r-customer', order: 0 },
      { id: 'b', roleId: 'r-system', order: 1 },
    ];
    const layout = computeFlowLayout(nodes, [], roles, opt);
    const sum = layout.lanes.reduce((s, l) => s + l.width, 0);
    expect(layout.width).toBe(sum);
    for (const n of layout.nodes) {
      const lane = layout.lanes[n.laneIndex];
      expect(n.x).toBeGreaterThanOrEqual(lane.left);
      expect(n.x).toBeLessThanOrEqual(lane.left + lane.width);
    }
  });
});

// ===========================================
// horizontal vs vertical: 時間/レーン軸の入れ替え整合
// ===========================================
describe('computeFlowLayout (orientation swap)', () => {
  const nodes: LayoutInputNode[] = [
    { id: 'a', roleId: 'r-customer', order: 0 },
    { id: 'b', roleId: 'r-customer', order: 1 },
    { id: 'p', roleId: 'r-approver', order: 0 },
    { id: 'q', roleId: 'r-approver', order: 1 },
  ];

  it('horizontal と vertical で時間/レーン軸が入れ替わる', () => {
    const h = computeFlowLayout(nodes, [], roles, { orientation: 'horizontal' });
    const v = computeFlowLayout(nodes, [], roles, { orientation: 'vertical' });

    const hById = (id: string) => h.nodes.find((n) => n.id === id)!;
    const vById = (id: string) => v.nodes.find((n) => n.id === id)!;

    // horizontal: 時間=x（order で進む）、レーン=y（ロールで分離）
    expect(hById('a').x).toBeLessThan(hById('b').x); // 時間 = x
    expect(hById('a').y).not.toBe(hById('p').y); // ロール = y で分離
    expect(hById('a').y).toBe(hById('b').y); // 同ロール = 同 y

    // vertical: 時間=y（order で進む）、レーン=x（ロールで分離）
    expect(vById('a').y).toBeLessThan(vById('b').y); // 時間 = y
    expect(vById('a').x).not.toBe(vById('p').x); // ロール = x で分離
    expect(vById('a').x).toBe(vById('b').x); // 同ロール = 同 x
  });

  it('どちらの向きでも lanes/nodes 数とサイズは正で整合する', () => {
    const h = computeFlowLayout(nodes, [], roles, { orientation: 'horizontal' });
    const v = computeFlowLayout(nodes, [], roles, { orientation: 'vertical' });

    expect(h.nodes).toHaveLength(nodes.length);
    expect(v.nodes).toHaveLength(nodes.length);
    expect(h.lanes).toHaveLength(roles.length);
    expect(v.lanes).toHaveLength(roles.length);

    // horizontal: 高さ = レーン高さ総和
    expect(h.height).toBe(h.lanes.reduce((s, l) => s + l.height, 0));
    // vertical: 幅 = レーン幅総和
    expect(v.width).toBe(v.lanes.reduce((s, l) => s + l.width, 0));

    expect(h.width).toBeGreaterThan(0);
    expect(h.height).toBeGreaterThan(0);
    expect(v.width).toBeGreaterThan(0);
    expect(v.height).toBeGreaterThan(0);
  });
});

// ===========================================
// computeLaneBands — 自由配置ノードに追従する背景レーン帯
// ===========================================
describe('computeLaneBands', () => {
  // 各ロールに 1 ノードずつ自由配置（中心座標 + サイズ）
  const freeNodes: BandInputNode[] = [
    { id: 'a', roleId: 'r-customer', x: 100, y: 60, width: 156, height: 52 },
    { id: 'b', roleId: 'r-approver', x: 320, y: 220, width: 156, height: 52 },
    { id: 'c', roleId: 'r-system', x: 540, y: 380, width: 156, height: 52 },
  ];

  it('ロールごとに 1 レーンを roles の並び順で返す', () => {
    const res = computeLaneBands(freeNodes, roles, 'horizontal');
    expect(res.lanes).toHaveLength(roles.length);
    expect(res.lanes.map((l) => l.roleId)).toEqual([
      'r-customer',
      'r-approver',
      'r-system',
    ]);
    expect(res.orientation).toBe('horizontal');
  });

  it('roleId 不明/未指定のノードは末尾の未割当レーンに集約される', () => {
    const withUnassigned: BandInputNode[] = [
      ...freeNodes,
      { id: 'x', x: 700, y: 500, width: 156, height: 52 }, // 未指定
      { id: 'y', roleId: 'ghost', x: 720, y: 520, width: 156, height: 52 }, // 不明
    ];
    const res = computeLaneBands(withUnassigned, roles, 'horizontal');
    expect(res.lanes).toHaveLength(roles.length + 1);
    const last = res.lanes[res.lanes.length - 1];
    expect(last.roleId).toBe(DEFAULT_LANE_BANDS_OPTIONS.unassignedLaneId);
  });

  it('horizontal: レーン帯は上→下に並び、重ならず、各帯はそのノードを内包する', () => {
    const res = computeLaneBands(freeNodes, roles, 'horizontal');
    expect(res.lanes[0].top).toBeLessThan(res.lanes[1].top);
    expect(res.lanes[1].top).toBeLessThan(res.lanes[2].top);
    for (const lane of res.lanes) {
      expect(lane.height).toBeGreaterThan(0);
      expect(lane.centerY).toBe(lane.top + lane.height / 2);
    }
    // 前レーンの下端 <= 次レーンの上端（重ならない・順序を保つ）
    expect(res.lanes[0].top + res.lanes[0].height).toBeLessThanOrEqual(
      res.lanes[1].top,
    );
    expect(res.lanes[1].top + res.lanes[1].height).toBeLessThanOrEqual(
      res.lanes[2].top,
    );
    // 各帯はそのロールのノード中心を内包する（自由配置に追従）
    for (const n of freeNodes) {
      const lane = res.lanes.find((l) => l.roleId === n.roleId)!;
      expect(n.y).toBeGreaterThanOrEqual(lane.top);
      expect(n.y).toBeLessThanOrEqual(lane.top + lane.height);
    }
  });

  it('horizontal: 縦に広がったノード群を持つレーンは厚く、1点だけのレーンは minLaneHeight', () => {
    // r-approver に縦に大きく広がったノードを 2 つ、r-system は無し
    const nodes: BandInputNode[] = [
      { id: 'a', roleId: 'r-customer', x: 100, y: 60, width: 156, height: 52 },
      { id: 'b1', roleId: 'r-approver', x: 300, y: 60, width: 156, height: 52 },
      { id: 'b2', roleId: 'r-approver', x: 500, y: 460, width: 156, height: 52 },
    ];
    const res = computeLaneBands(nodes, roles, 'horizontal');
    const customer = res.lanes.find((l) => l.roleId === 'r-customer')!;
    const approver = res.lanes.find((l) => l.roleId === 'r-approver')!;
    const system = res.lanes.find((l) => l.roleId === 'r-system')!;
    // 縦に広がったレーンは 1 点だけのレーンより厚い（minLaneHeight を超える）
    expect(approver.height).toBeGreaterThan(customer.height);
    expect(approver.height).toBeGreaterThan(
      DEFAULT_LANE_BANDS_OPTIONS.minLaneHeight,
    );
    // ノードを持たないレーンは最小厚
    expect(system.height).toBe(DEFAULT_LANE_BANDS_OPTIONS.minLaneHeight);
    // approver 帯は最も下のノード（y=460）まで伸びる（自由配置の下方向に追従）
    expect(approver.top + approver.height).toBeGreaterThanOrEqual(460);
  });

  it('horizontal: 横に並んだノード（side by side）は 1 つの行（最小厚）に収まる', () => {
    // 同じレーンに横並び（Y は同じ、X だけ違う）
    const nodes: BandInputNode[] = [
      { id: 'a', roleId: 'r-customer', x: 100, y: 80, width: 156, height: 52 },
      { id: 'b', roleId: 'r-customer', x: 320, y: 80, width: 156, height: 52 },
      { id: 'c', roleId: 'r-customer', x: 540, y: 80, width: 156, height: 52 },
    ];
    const res = computeLaneBands(nodes, roles, 'horizontal');
    const customer = res.lanes.find((l) => l.roleId === 'r-customer')!;
    // 縦の広がりが無い → 最小厚のまま
    expect(customer.height).toBe(DEFAULT_LANE_BANDS_OPTIONS.minLaneHeight);
    // 帯の幅（時間軸）は一番右のノードを含む
    expect(res.width).toBeGreaterThanOrEqual(540 + 156 / 2);
  });

  it('vertical: 軸が入れ替わり、レーン列は左→右に並び、重ならず、各列はそのノードを内包する', () => {
    const res = computeLaneBands(freeNodes, roles, 'vertical');
    expect(res.orientation).toBe('vertical');
    expect(res.lanes[0].left).toBeLessThan(res.lanes[1].left);
    expect(res.lanes[1].left).toBeLessThan(res.lanes[2].left);
    for (const lane of res.lanes) {
      expect(lane.width).toBeGreaterThan(0);
      expect(lane.centerX).toBe(lane.left + lane.width / 2);
    }
    // 重ならない（前列の右端 <= 次列の左端）
    expect(res.lanes[0].left + res.lanes[0].width).toBeLessThanOrEqual(
      res.lanes[1].left,
    );
    // 各列はそのロールのノード中心を内包する
    for (const n of freeNodes) {
      const lane = res.lanes.find((l) => l.roleId === n.roleId)!;
      expect(n.x).toBeGreaterThanOrEqual(lane.left);
      expect(n.x).toBeLessThanOrEqual(lane.left + lane.width);
    }
  });

  it('vertical: 横に広がったノード群を持つレーンは幅が広がる', () => {
    const nodes: BandInputNode[] = [
      { id: 'a', roleId: 'r-customer', x: 60, y: 100, width: 156, height: 52 },
      { id: 'b1', roleId: 'r-approver', x: 60, y: 300, width: 156, height: 52 },
      { id: 'b2', roleId: 'r-approver', x: 460, y: 500, width: 156, height: 52 },
    ];
    const res = computeLaneBands(nodes, roles, 'vertical');
    const customer = res.lanes.find((l) => l.roleId === 'r-customer')!;
    const approver = res.lanes.find((l) => l.roleId === 'r-approver')!;
    expect(approver.width).toBeGreaterThan(customer.width);
  });

  it('ノードが空でも壊れず、minLaneHeight 厚のレーンを返す', () => {
    const res = computeLaneBands([], roles, 'horizontal');
    expect(res.lanes).toHaveLength(roles.length);
    for (const lane of res.lanes) {
      expect(lane.height).toBe(DEFAULT_LANE_BANDS_OPTIONS.minLaneHeight);
    }
    expect(res.width).toBeGreaterThan(0);
    expect(res.height).toBeGreaterThan(0);
  });

  // -----------------------------------------------------------------
  // laneHeightOverrides — 手動リサイズの永続化（per-role 厚オーバーライド）
  // -----------------------------------------------------------------
  describe('laneHeightOverrides', () => {
    it('horizontal: オーバーライドのあるレーンはその厚みになり、無いレーンは自動のまま', () => {
      // r-customer に手動で厚み 300 を指定（自動なら minLaneHeight）
      const res = computeLaneBands(freeNodes, roles, 'horizontal', {
        laneHeightOverrides: { 'r-customer': 300 },
      });
      const customer = res.lanes.find((l) => l.roleId === 'r-customer')!;
      const approver = res.lanes.find((l) => l.roleId === 'r-approver')!;
      // オーバーライド適用
      expect(customer.height).toBe(300);
      // 指定の無いレーンは従来どおり最小厚（自動）
      expect(approver.height).toBe(DEFAULT_LANE_BANDS_OPTIONS.minLaneHeight);
      // レーンは重ならず順序を保つ（オーバーライドで広げても後続が押し下がる）
      expect(customer.top + customer.height).toBeLessThanOrEqual(approver.top);
    });

    it('vertical: オーバーライドはレーン幅に適用される', () => {
      const res = computeLaneBands(freeNodes, roles, 'vertical', {
        laneHeightOverrides: { 'r-approver': 280 },
      });
      const approver = res.lanes.find((l) => l.roleId === 'r-approver')!;
      expect(approver.width).toBe(280);
    });

    it('内容の自動厚がオーバーライドより大きい場合は内容を優先（max を採用）', () => {
      // r-approver は縦に大きく広がる（y=60 と y=460）→ 自動厚は大きい
      const nodes: BandInputNode[] = [
        { id: 'b1', roleId: 'r-approver', x: 300, y: 60, width: 156, height: 52 },
        { id: 'b2', roleId: 'r-approver', x: 500, y: 460, width: 156, height: 52 },
      ];
      // 自動厚（≈ 460-60 + パディング + ノード高）より小さい override=120 を渡す
      const auto = computeLaneBands(nodes, roles, 'horizontal');
      const overridden = computeLaneBands(nodes, roles, 'horizontal', {
        laneHeightOverrides: { 'r-approver': 120 },
      });
      const autoApprover = auto.lanes.find((l) => l.roleId === 'r-approver')!;
      const ovApprover = overridden.lanes.find((l) => l.roleId === 'r-approver')!;
      // override が自動厚より小さいので、内容に追従する自動厚が勝つ（縮まない）
      expect(ovApprover.height).toBe(autoApprover.height);
      expect(ovApprover.height).toBeGreaterThan(120);
    });

    it('オーバーライド未指定（デフォルト空）は従来挙動と完全一致する', () => {
      const withDefault = computeLaneBands(freeNodes, roles, 'horizontal');
      const withEmpty = computeLaneBands(freeNodes, roles, 'horizontal', {
        laneHeightOverrides: {},
      });
      expect(withEmpty.lanes.map((l) => l.height)).toEqual(
        withDefault.lanes.map((l) => l.height),
      );
    });
  });
});
