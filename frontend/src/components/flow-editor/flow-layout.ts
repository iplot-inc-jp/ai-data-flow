/**
 * flow-layout.ts — 業務フロー スイムレーンの決定論的レイアウトエンジン
 *
 * 設計原則:
 *   ノードの「真実」は (ロール = レーン, order = 時系列上の位置) という構造であり、
 *   ピクセル座標ではない。座標はこの純粋関数が構造から一意に算出する。
 *   背景レーン・ヘッダー・ノードは全て computeFlowLayout の返り値という
 *   「単一の座標源」から描かれるため、旧実装の「3つの非同期レンダラーが
 *   別々の座標系でズレる」バグが構造的に発生しない。
 *
 * 時間軸（タイムライン）は各ノードの `order`（昇順）で駆動される。
 * ユーザーがノードを時間軸方向にドラッグして order を変えると並びが追従する
 * （= ORDER ベースのタイムライン）。ロール = レーン。
 *
 * orientation:
 *   - horizontal: レーンは横帯を上→下に積層（ロール毎）。時間は左→右（order が増えると x が増える）。
 *   - vertical:   レーンは縦列を左→右に並置（ロール毎）。時間は上→下（order が増えると y が増える）。
 *
 * React / @xyflow に一切依存しない（単体テスト可能）。
 */

// ===========================================
// 型定義
// ===========================================

export type LayoutNodeType =
  | 'START'
  | 'END'
  | 'PROCESS'
  | 'DECISION'
  | 'SYSTEM_INTEGRATION'
  | 'MANUAL_OPERATION'
  | 'DATA_STORE';

export type FlowOrientation = 'horizontal' | 'vertical';

export interface LayoutInputNode {
  id: string;
  type?: string;
  /** 所属ロール（スイムレーン）。未指定なら「未割当」レーンへ。 */
  roleId?: string | null;
  /** 時系列上の位置。昇順でタイムライン軸が決まる。 */
  order?: number;
}

export interface LayoutInputEdge {
  id: string;
  source: string;
  target: string;
}

export interface LayoutRole {
  id: string;
  name: string;
  color?: string;
  /** ロールが希望する最小レーン厚（horizontal: 高さ / vertical: 幅）。過密時は自動拡張。 */
  laneHeight?: number;
}

export interface LayoutOptions {
  /** 描画の向き。horizontal=時間が左→右 / vertical=時間が上→下。 */
  orientation: FlowOrientation;
  /** 時間軸 1 ステップ分の長さ（horizontal: 列幅 / vertical: 行高） */
  columnWidth: number;
  /** ノードの描画幅 */
  nodeWidth: number;
  /** ノードの描画高さ */
  nodeHeight: number;
  /** 同一セル内でクロス軸方向に積む際のノード間ギャップ */
  verticalGap: number;
  /** 時間軸先頭マージン（最初のステップ中心までのオフセット） */
  marginX: number;
  /** レーン内のクロス軸方向パディング */
  lanePadding: number;
  /** レーンのデフォルト厚（ロールが laneHeight を持たない場合） */
  defaultLaneHeight: number;
  /** roleId が roles に無い／null のノードを集約する未割当レーンのID */
  unassignedLaneId: string;
  /** 未割当レーンの表示名 */
  unassignedLaneName: string;
}

export const DEFAULT_LAYOUT_OPTIONS: LayoutOptions = {
  orientation: 'horizontal',
  columnWidth: 210,
  nodeWidth: 156,
  nodeHeight: 52,
  verticalGap: 18,
  marginX: 70,
  lanePadding: 22,
  defaultLaneHeight: 120,
  unassignedLaneId: '__unassigned__',
  unassignedLaneName: '未割当',
};

export interface PositionedNode {
  id: string;
  /** ノード中心X */
  x: number;
  /** ノード中心Y */
  y: number;
  width: number;
  height: number;
  roleId: string;
  laneIndex: number;
  type: LayoutNodeType;
  /** 入力 order のエコー（タイムライン軸の値） */
  order: number;
}

export interface Lane {
  roleId: string;
  name: string;
  color?: string;
  index: number;
  // --- horizontal レーン（横帯）ジオメトリ ---
  /** 横帯の上端Y（horizontal） */
  top: number;
  /** 横帯の高さ（horizontal） */
  height: number;
  /** 横帯の中心Y（horizontal） */
  centerY: number;
  // --- vertical レーン（縦列）ジオメトリ ---
  /** 縦列の左端X（vertical） */
  left: number;
  /** 縦列の幅（vertical） */
  width: number;
  /** 縦列の中心X（vertical） */
  centerX: number;
}

export interface FlowLayout {
  nodes: PositionedNode[];
  lanes: Lane[];
  width: number;
  height: number;
  orientation: FlowOrientation;
}

// ===========================================
// エッジDAGの最長経路（補助ユーティリティ）
// ===========================================

/**
 * エッジDAG上の「最長経路」を算出する補助関数。
 *
 * 注意: タイムライン軸はもはやこれでは決まらない（order 駆動になった）。
 * 自己ループ・端点欠落・重複の除去を含む堅牢なグラフ深さ計算として、
 * 補助/外部用途のために残している。循環があっても例外を投げない。
 */
export function computeLayers(
  nodeIds: string[],
  edges: LayoutInputEdge[],
): Map<string, number> {
  const idSet = new Set(nodeIds);
  const adjacency = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  for (const id of nodeIds) {
    adjacency.set(id, []);
    indegree.set(id, 0);
  }

  // 自己ループ・端点欠落・重複を除いた有効エッジ
  const seen = new Set<string>();
  const validEdges: LayoutInputEdge[] = [];
  for (const e of edges) {
    if (!idSet.has(e.source) || !idSet.has(e.target)) continue;
    if (e.source === e.target) continue;
    const key = `${e.source}->${e.target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    validEdges.push(e);
    adjacency.get(e.source)!.push(e.target);
    indegree.set(e.target, (indegree.get(e.target) ?? 0) + 1);
  }

  const layer = new Map<string, number>();
  for (const id of nodeIds) layer.set(id, 0);

  // Kahn のトポロジカル順で最長経路を緩和
  const remaining = new Map(indegree);
  const queue: string[] = nodeIds.filter((id) => (remaining.get(id) ?? 0) === 0);
  let processed = 0;
  while (queue.length > 0) {
    const u = queue.shift()!;
    processed++;
    const lu = layer.get(u)!;
    for (const v of adjacency.get(u)!) {
      if (layer.get(v)! < lu + 1) layer.set(v, lu + 1);
      const d = (remaining.get(v) ?? 0) - 1;
      remaining.set(v, d);
      if (d === 0) queue.push(v);
    }
  }

  // 循環で未処理のノード: 処理済み前任の最大layer+1、無ければ0
  if (processed < nodeIds.length) {
    const processedSet = new Set<string>();
    for (const id of nodeIds) {
      if ((remaining.get(id) ?? 0) === 0) processedSet.add(id);
    }
    const predsOf = new Map<string, string[]>();
    for (const e of validEdges) {
      if (!predsOf.has(e.target)) predsOf.set(e.target, []);
      predsOf.get(e.target)!.push(e.source);
    }
    for (const id of nodeIds) {
      if (processedSet.has(id)) continue;
      let best = 0;
      for (const p of predsOf.get(id) ?? []) {
        if (processedSet.has(p)) best = Math.max(best, layer.get(p)! + 1);
      }
      layer.set(id, best);
    }
  }

  return layer;
}

// ===========================================
// メイン: スイムレーン座標の算出
// ===========================================

function normalizeType(t?: string): LayoutNodeType {
  switch (t) {
    case 'START':
    case 'END':
    case 'PROCESS':
    case 'DECISION':
    case 'SYSTEM_INTEGRATION':
    case 'MANUAL_OPERATION':
    case 'DATA_STORE':
      return t;
    default:
      return 'PROCESS';
  }
}

/**
 * order 昇順のユニーク値 → タイムライン列インデックス（0始まり）への写像を作る。
 * order が無いノードは 0 として扱う。安定性のため同値は入力順を保つ。
 */
function buildTimelineIndex(inputNodes: LayoutInputNode[]): Map<number, number> {
  const uniqueOrders = Array.from(
    new Set(inputNodes.map((n) => n.order ?? 0)),
  ).sort((a, b) => a - b);
  const timelineIndexOf = new Map<number, number>();
  uniqueOrders.forEach((o, i) => timelineIndexOf.set(o, i));
  return timelineIndexOf;
}

/**
 * 構造（ロール × order）からスイムレーン図の全座標を算出する。
 *
 * - レーン = ロール（roles の並び順）。roleId 不明/未指定のノードは末尾の
 *   「未割当」レーンへ集約する。
 * - タイムライン軸 = ノードの order を昇順に並べた列/行インデックス。
 *   order が同値ならタイブレークは入力順。
 * - 同一 (order, ロール) セルに複数ノードがある場合はクロス軸方向に
 *   並べ、必要に応じてそのレーンの厚みを自動拡張する。
 * - lanes / nodes / width / height は全て同一の laneOffsets から導出され、
 *   描画側（背景・ヘッダー・ノード）が常に一致する。
 *
 * horizontal: 時間=x（左→右）, レーン=横帯（上→下に積層, centerY）。
 * vertical:   時間=y（上→下）, レーン=縦列（左→右に並置, centerX）。
 */
export function computeFlowLayout(
  inputNodes: LayoutInputNode[],
  _inputEdges: LayoutInputEdge[],
  inputRoles: LayoutRole[],
  options: Partial<LayoutOptions> = {},
): FlowLayout {
  const opt: LayoutOptions = { ...DEFAULT_LAYOUT_OPTIONS, ...options };
  const orientation: FlowOrientation = opt.orientation;
  const isHorizontal = orientation === 'horizontal';

  // --- レーン（ロール）の順序を確定 ---
  const roleOrder: LayoutRole[] = [...inputRoles];
  const knownRoleIds = new Set(roleOrder.map((r) => r.id));

  // 未割当ノードがあれば末尾に未割当レーンを足す
  const hasUnassigned = inputNodes.some(
    (n) => !n.roleId || !knownRoleIds.has(n.roleId),
  );
  if (hasUnassigned) {
    roleOrder.push({
      id: opt.unassignedLaneId,
      name: opt.unassignedLaneName,
      color: '#94a3b8',
      laneHeight: opt.defaultLaneHeight,
    });
    knownRoleIds.add(opt.unassignedLaneId);
  }

  const laneIndexOf = new Map<string, number>();
  roleOrder.forEach((r, i) => laneIndexOf.set(r.id, i));

  const resolveRoleId = (roleId?: string | null): string =>
    roleId && knownRoleIds.has(roleId) ? roleId : opt.unassignedLaneId;

  // --- タイムライン軸（order 昇順）を算出 ---
  const timelineIndexOf = buildTimelineIndex(inputNodes);

  // --- (timeline, レーン) セルへグルーピング ---
  type Cell = LayoutInputNode & {
    timeline: number;
    laneIndex: number;
    orderValue: number;
  };
  const cells = new Map<string, Cell[]>();
  const cellKey = (timeline: number, laneIndex: number) =>
    `${timeline}:${laneIndex}`;

  let maxTimeline = 0;
  inputNodes.forEach((n) => {
    const rid = resolveRoleId(n.roleId);
    const laneIndex = laneIndexOf.get(rid)!;
    const orderValue = n.order ?? 0;
    const timeline = timelineIndexOf.get(orderValue) ?? 0;
    maxTimeline = Math.max(maxTimeline, timeline);
    const key = cellKey(timeline, laneIndex);
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key)!.push({ ...n, timeline, laneIndex, orderValue });
  });

  // 各セルを order 昇順（同値は元順）で安定ソート
  const cellLists: Cell[][] = Array.from(cells.values());
  for (const list of cellLists) {
    const indexed = list.map((c: Cell, i: number) => ({ c, i }));
    indexed.sort((a, b) => {
      const oa = a.c.orderValue;
      const ob = b.c.orderValue;
      return oa !== ob ? oa - ob : a.i - b.i;
    });
    indexed.forEach((entry, i) => {
      list[i] = entry.c;
    });
  }

  // --- 各レーンの実効厚（過密セルに合わせ自動拡張） ---
  // クロス軸の 1 ノード分のスロット長。
  const crossSize = isHorizontal ? opt.nodeHeight : opt.nodeWidth;
  const slotSize = crossSize + opt.verticalGap;
  const effectiveSizes: number[] = roleOrder.map((_r, laneIndex) => {
    let maxCount = 0;
    for (let t = 0; t <= maxTimeline; t++) {
      const list = cells.get(cellKey(t, laneIndex));
      if (list) maxCount = Math.max(maxCount, list.length);
    }
    const required = maxCount * slotSize - opt.verticalGap + opt.lanePadding * 2;
    const desired = _r.laneHeight ?? opt.defaultLaneHeight;
    return Math.max(desired, required, opt.defaultLaneHeight);
  });

  // --- レーンオフセット（単一の座標源） ---
  const lanes: Lane[] = [];
  let crossStart = 0;
  roleOrder.forEach((r, i) => {
    const size = effectiveSizes[i];
    const center = crossStart + size / 2;
    lanes.push(
      isHorizontal
        ? {
            roleId: r.id,
            name: r.name,
            color: r.color,
            index: i,
            top: crossStart,
            height: size,
            centerY: center,
            // vertical 用フィールドは埋めるが非アクティブ
            left: 0,
            width: 0,
            centerX: 0,
          }
        : {
            roleId: r.id,
            name: r.name,
            color: r.color,
            index: i,
            // horizontal 用フィールドは埋めるが非アクティブ
            top: 0,
            height: 0,
            centerY: 0,
            left: crossStart,
            width: size,
            centerX: center,
          },
    );
    crossStart += size;
  });
  const crossTotal = crossStart;

  // 時間軸方向の中心座標（timeline 列/行 → ピクセル）
  const timeCenter = (timeline: number) =>
    opt.marginX + timeline * opt.columnWidth;

  // --- ノード座標の確定 ---
  const positioned: PositionedNode[] = [];
  for (const [key, list] of Array.from(cells.entries())) {
    const [timelineStr, laneStr] = key.split(':');
    const timeline = Number(timelineStr);
    const laneIndex = Number(laneStr);
    const lane = lanes[laneIndex];

    const along = timeCenter(timeline); // 時間軸方向の中心
    const laneCenter = isHorizontal ? lane.centerY : lane.centerX;

    const count = list.length;
    // セル内の積み上げ全体の長さを求め、レーン中心に対してクロス軸センタリング
    const stackSize = count * crossSize + (count - 1) * opt.verticalGap;
    const startCross = laneCenter - stackSize / 2 + crossSize / 2;

    list.forEach((c, i) => {
      const cross = startCross + i * slotSize;
      positioned.push({
        id: c.id,
        x: isHorizontal ? along : cross,
        y: isHorizontal ? cross : along,
        width: opt.nodeWidth,
        height: opt.nodeHeight,
        roleId: roleOrder[laneIndex].id,
        laneIndex,
        type: normalizeType(c.type),
        order: c.orderValue,
      });
    });
  }

  // 安定した出力順（入力ノード順）
  const orderIndex = new Map(inputNodes.map((n, i) => [n.id, i] as const));
  positioned.sort((a, b) => orderIndex.get(a.id)! - orderIndex.get(b.id)!);

  const timeExtent =
    opt.marginX * 2 + maxTimeline * opt.columnWidth + opt.nodeWidth;

  return {
    nodes: positioned,
    lanes,
    width: isHorizontal ? timeExtent : crossTotal,
    height: isHorizontal ? crossTotal : timeExtent,
    orientation,
  };
}
