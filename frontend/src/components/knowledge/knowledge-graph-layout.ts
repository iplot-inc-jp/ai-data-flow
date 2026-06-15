// ナレッジグラフの「決定的クラスタ配置」純関数。
//
// 入力は既存 graph API の形 `{ nodes, edges, documents }`（KnowledgeGraphOutput と同形。
// エッジは `edges`、各エッジは fromNodeId/toNodeId を持つ）。
//
// 方針（spec §8.2「決定的クラスタ配置（タグ近傍に実体）＋手動ドラッグ位置永続」）:
//   - タグ(TAG)ノードを「アンカー」として円周上に決定的に配置する。
//   - 実体(ENTITY)ノードは、エッジ・mention（文書経由）で最も強く結びつくタグの周りを周回配置する。
//     どのタグにも結びつかない実体・タグ無しの実体は「無所属」クラスタにまとめる。
//   - 文書(documents)ノードは、その文書が言及するノードの重心付近へ寄せて決定的に配置する。
//   - positionX/Y が両方とも数値で入っているノード/文書は **そのまま尊重**（自動配置しない）。
//     位置の無いものだけを上記ルールで埋める。
//   - 最後に矩形の非重なりを保証する（決定的なスパイラル押し出し）。
//
// すべて決定的（同じ入力 → 同じ出力。乱数・時刻・Map反復順への依存なし。
// ノードは id 昇順に正規化してから処理する）。React 非依存・副作用なし。

// ---------------------------------------------------------------------------
// 入力型（既存 graph API の形に合わせる。必要フィールドのみを要求する緩い型）
// ---------------------------------------------------------------------------

/** レイアウト入力のノード（KnowledgeNodeOutput のサブセット）。 */
export interface LayoutInputNode {
  id: string;
  type: 'TAG' | 'ENTITY' | string;
  label?: string | null;
  positionX?: number | null;
  positionY?: number | null;
  mentionCount?: number | null;
}

/** レイアウト入力のエッジ（KnowledgeEdgeOutput のサブセット）。 */
export interface LayoutInputEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
}

/** レイアウト入力の文書（KnowledgeDocumentOutput のサブセット）。 */
export interface LayoutInputDocument {
  id: string;
  positionX?: number | null;
  positionY?: number | null;
}

/** レイアウト入力のグラフ（既存 graph API の形 `{ nodes, edges, documents }`）。 */
export interface LayoutInputGraph {
  nodes: LayoutInputNode[];
  edges: LayoutInputEdge[];
  documents: LayoutInputDocument[];
}

/** 文書 ↔ ノードの mention（任意。文書配置と実体↔タグの結びつき推定に使う）。 */
export interface LayoutMention {
  documentId: string;
  nodeId: string;
}

export interface KnowledgeGraphLayoutOptions {
  /** タグアンカー円の半径。 */
  tagRingRadius?: number;
  /** 実体が周回する半径（タグ中心からの距離）。 */
  entityOrbitRadius?: number;
  /** ノード矩形の幅（非重なり判定に使う）。 */
  nodeWidth?: number;
  /** ノード矩形の高さ。 */
  nodeHeight?: number;
  /** 非重なりで確保する最小マージン。 */
  minGap?: number;
  /** 文書↔ノードの mention（実体↔タグの結びつき・文書配置に利用）。 */
  mentions?: LayoutMention[];
}

/** 1ノード/文書のレイアウト結果（左上原点の x,y）。 */
export interface LayoutPosition {
  x: number;
  y: number;
}

/** レイアウト結果。id → 位置。 */
export interface KnowledgeGraphLayout {
  nodes: Record<string, LayoutPosition>;
  documents: Record<string, LayoutPosition>;
}

const DEFAULTS = {
  tagRingRadius: 360,
  entityOrbitRadius: 170,
  nodeWidth: 168,
  nodeHeight: 64,
  minGap: 24,
};

// ---------------------------------------------------------------------------
// 決定的ハッシュ（id 文字列 → [0,1) の安定な擬似乱数）。
// 角度や微小ジッタを「決定的だが規則的すぎない」値にするために使う。
// ---------------------------------------------------------------------------

function hash01(seed: string): number {
  // FNV-1a 32bit → [0,1)
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // 符号なし化して 2^32 で割る
  return ((h >>> 0) % 1_000_000) / 1_000_000;
}

function hasPosition(n: { positionX?: number | null; positionY?: number | null }): boolean {
  return (
    typeof n.positionX === 'number' &&
    Number.isFinite(n.positionX) &&
    typeof n.positionY === 'number' &&
    Number.isFinite(n.positionY)
  );
}

// ---------------------------------------------------------------------------
// メイン
// ---------------------------------------------------------------------------

/**
 * グラフ全体の決定的クラスタ配置を計算する純関数。
 * 既存位置（positionX/Y）があるノード/文書は尊重し、無いものだけ自動配置。
 * 最後に矩形の非重なりを保証する。
 */
export function computeKnowledgeGraphLayout(
  graph: LayoutInputGraph,
  options: KnowledgeGraphLayoutOptions = {},
): KnowledgeGraphLayout {
  const o = { ...DEFAULTS, ...options };
  const mentions = options.mentions ?? [];

  // 決定性のため id 昇順に正規化（入力配列順・Map反復順に依存しない）。
  const nodes = [...graph.nodes].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const documents = [...graph.documents].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  const edges = [...graph.edges].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const nodeById = new Map(nodes.map((n) => [n.id, n] as const));
  const tags = nodes.filter((n) => n.type === 'TAG');
  const entities = nodes.filter((n) => n.type !== 'TAG');

  // ===== ノード間の隣接（無向。エッジ＋同一文書 mention の共起から「結びつき強度」を作る） =====
  // entity → tag の結びつきを推定して、その entity を最強タグの周りに置く。
  const linkWeight = new Map<string, Map<string, number>>(); // nodeId → (otherNodeId → weight)
  const addLink = (a: string, b: string, w: number) => {
    if (a === b) return;
    if (!linkWeight.has(a)) linkWeight.set(a, new Map());
    const m = linkWeight.get(a)!;
    m.set(b, (m.get(b) ?? 0) + w);
  };
  // エッジは強い結びつき（重み2）
  for (const e of edges) {
    if (!nodeById.has(e.fromNodeId) || !nodeById.has(e.toNodeId)) continue;
    addLink(e.fromNodeId, e.toNodeId, 2);
    addLink(e.toNodeId, e.fromNodeId, 2);
  }
  // 同一文書に共起する mention 同士は弱い結びつき（重み1）
  const byDoc = new Map<string, string[]>();
  for (const m of mentions) {
    if (!nodeById.has(m.nodeId)) continue;
    if (!byDoc.has(m.documentId)) byDoc.set(m.documentId, []);
    byDoc.get(m.documentId)!.push(m.nodeId);
  }
  for (const ids of Array.from(byDoc.values())) {
    const uniq = Array.from(new Set(ids)).sort();
    for (let i = 0; i < uniq.length; i++) {
      for (let j = i + 1; j < uniq.length; j++) {
        addLink(uniq[i], uniq[j], 1);
        addLink(uniq[j], uniq[i], 1);
      }
    }
  }

  /** 指定ノードに最も強く結びつくタグ id（決定的タイブレーク: 強度↓ → id 昇順）。無ければ null。 */
  const strongestTagFor = (nodeId: string): string | null => {
    const m = linkWeight.get(nodeId);
    if (!m) return null;
    let best: string | null = null;
    let bestW = 0;
    for (const [other, w] of Array.from(m.entries()).sort((a, b) =>
      a[0] < b[0] ? -1 : 1,
    )) {
      const on = nodeById.get(other);
      if (!on || on.type !== 'TAG') continue;
      if (w > bestW) {
        bestW = w;
        best = other;
      }
    }
    return best;
  };

  // ===== タグアンカーの中心座標（円周上に決定的配置） =====
  // 既存位置のあるタグはその中心を使い、無いタグだけリング上に並べる。
  const center = { x: 0, y: 0 };
  const tagCenter = new Map<string, LayoutPosition>(); // tagId → 中心(cx,cy)
  const result: KnowledgeGraphLayout = { nodes: {}, documents: {} };

  const halfW = o.nodeWidth / 2;
  const halfH = o.nodeHeight / 2;
  const toTopLeft = (cx: number, cy: number): LayoutPosition => ({
    x: cx - halfW,
    y: cy - halfH,
  });
  const centerOfTopLeft = (x: number, y: number) => ({ x: x + halfW, y: y + halfH });

  const autoTags = tags.filter((t) => !hasPosition(t));
  // リング半径はタグ数に応じて広げる（混み合い防止。最低でも既定半径）。
  const ringRadius = Math.max(
    o.tagRingRadius,
    (autoTags.length * (o.nodeWidth + o.minGap)) / (2 * Math.PI),
  );

  tags.forEach((t) => {
    if (hasPosition(t)) {
      const c = centerOfTopLeft(t.positionX as number, t.positionY as number);
      tagCenter.set(t.id, c);
      result.nodes[t.id] = { x: t.positionX as number, y: t.positionY as number };
    }
  });
  autoTags.forEach((t, i) => {
    const n = Math.max(autoTags.length, 1);
    // 等間隔角度＋id ハッシュの微小ジッタ（規則的すぎる重なりを避けるが決定的）。
    const angle = (2 * Math.PI * i) / n + hash01(t.id) * 0.0001;
    const cx = center.x + ringRadius * Math.cos(angle);
    const cy = center.y + ringRadius * Math.sin(angle);
    tagCenter.set(t.id, { x: cx, y: cy });
    result.nodes[t.id] = toTopLeft(cx, cy);
  });

  // ===== 実体ノードを所属タグの周りに周回配置 =====
  // 同じタグに属する実体を id 昇順でグルーピングし、その円周上に均等配置。
  const orbitGroups = new Map<string, string[]>(); // tagId | '__none__' → entityIds（位置無しのみ）
  const NONE = '__none__';
  for (const ent of entities) {
    if (hasPosition(ent)) {
      // 既存位置を尊重
      result.nodes[ent.id] = {
        x: ent.positionX as number,
        y: ent.positionY as number,
      };
      continue;
    }
    const tagId = strongestTagFor(ent.id);
    const key = tagId && tagCenter.has(tagId) ? tagId : NONE;
    if (!orbitGroups.has(key)) orbitGroups.set(key, []);
    orbitGroups.get(key)!.push(ent.id);
  }

  // 無所属クラスタの中心（リングの外側・決定的な位置）。
  const noneCenter = {
    x: center.x,
    y: center.y + ringRadius + o.entityOrbitRadius + o.nodeHeight + o.minGap * 2,
  };

  for (const [key, entIds] of Array.from(orbitGroups.entries()).sort((a, b) =>
    a[0] < b[0] ? -1 : 1,
  )) {
    const ids = [...entIds].sort();
    const cluster = key === NONE ? noneCenter : tagCenter.get(key)!;
    // クラスタ内が多いほど軌道半径を広げ、複数リングに分けて重なりを抑える。
    const perRing = Math.max(
      6,
      Math.floor((2 * Math.PI * o.entityOrbitRadius) / (o.nodeWidth + o.minGap)),
    );
    ids.forEach((id, idx) => {
      const ring = Math.floor(idx / perRing);
      const inRing = idx % perRing;
      const countInRing = Math.min(perRing, ids.length - ring * perRing);
      const radius = o.entityOrbitRadius + ring * (o.nodeHeight + o.minGap + 20);
      // クラスタごとに開始角をずらす（key ハッシュ）。
      const base = hash01(key) * 2 * Math.PI;
      const angle = base + (2 * Math.PI * inRing) / Math.max(countInRing, 1);
      const cx = cluster.x + radius * Math.cos(angle);
      const cy = cluster.y + radius * Math.sin(angle);
      result.nodes[id] = toTopLeft(cx, cy);
    });
  }

  // ===== 文書ノードを「言及ノードの重心付近」へ決定的に配置 =====
  const docMentions = new Map<string, string[]>();
  for (const m of mentions) {
    if (!docMentions.has(m.documentId)) docMentions.set(m.documentId, []);
    docMentions.get(m.documentId)!.push(m.nodeId);
  }
  documents.forEach((doc, i) => {
    if (hasPosition(doc)) {
      result.documents[doc.id] = {
        x: doc.positionX as number,
        y: doc.positionY as number,
      };
      return;
    }
    const mentionedCenters: LayoutPosition[] = [];
    for (const nid of docMentions.get(doc.id) ?? []) {
      const pos = result.nodes[nid];
      if (pos) mentionedCenters.push(centerOfTopLeft(pos.x, pos.y));
    }
    let cx: number;
    let cy: number;
    if (mentionedCenters.length > 0) {
      cx = mentionedCenters.reduce((s, p) => s + p.x, 0) / mentionedCenters.length;
      cy = mentionedCenters.reduce((s, p) => s + p.y, 0) / mentionedCenters.length;
      // 重心からハッシュ方向に少し離して文書同士の重なりを減らす。
      const a = hash01(doc.id) * 2 * Math.PI;
      cx += Math.cos(a) * (o.nodeHeight + o.minGap);
      cy += Math.sin(a) * (o.nodeHeight + o.minGap);
    } else {
      // 言及の無い孤立文書はリング下部に列で並べる。
      const cols = 6;
      cx =
        center.x -
        ((cols - 1) * (o.nodeWidth + o.minGap)) / 2 +
        (i % cols) * (o.nodeWidth + o.minGap);
      cy =
        noneCenter.y +
        o.entityOrbitRadius +
        o.nodeHeight * 2 +
        Math.floor(i / cols) * (o.nodeHeight + o.minGap);
    }
    result.documents[doc.id] = toTopLeft(cx, cy);
  });

  // ===== 矩形の非重なりを保証（決定的スパイラル押し出し） =====
  // 既存位置（positionX/Y 永続化済み）は「固定」として扱い動かさない。
  // 固定が大半のときは自動配置ぶんだけを対象にし、近傍判定はグリッドハッシュで O(N) 化する。
  const fixedKeys = new Set<string>();
  for (const n of nodes) if (hasPosition(n)) fixedKeys.add(`nodes ${n.id}`);
  for (const d of documents)
    if (hasPosition(d)) fixedKeys.add(`documents ${d.id}`);
  resolveOverlaps(result, o.nodeWidth, o.nodeHeight, o.minGap, fixedKeys);

  return result;
}

// ---------------------------------------------------------------------------
// 非重なり解決
// ---------------------------------------------------------------------------

interface Placed {
  key: string;
  bucket: 'nodes' | 'documents';
  x: number;
  y: number;
}

/**
 * すべての矩形（ノード＋文書）を一意キー順に走査し、既配置と重なる場合は
 * 決定的なスパイラルで空き位置まで押し出す。同じ入力なら同じ結果になる。
 *
 * 性能（spec レビュー指摘の O(N^3) 回避）:
 *   - `fixedKeys`（positionX/Y 永続化済み）は動かさず、先に全部「占有」だけ登録する。
 *     ほぼ全ノードが固定されている既存プロジェクトでは、自動配置の走査がほぼゼロになり短絡する。
 *   - 近傍衝突判定は簡易グリッドハッシュ（セル = 矩形サイズ）で行い、隣接 3x3 セルのみ調べる。
 *     これにより 1 試行あたりの判定が「全件 O(N)」から「近傍 O(1)」になる。
 *   - 走査順（bucket → key 昇順）とスパイラルは従来どおりなので決定性は維持。
 */
function resolveOverlaps(
  layout: KnowledgeGraphLayout,
  w: number,
  h: number,
  gap: number,
  fixedKeys: Set<string> = new Set(),
): void {
  const items: Placed[] = [];
  for (const [key, p] of Object.entries(layout.nodes)) {
    items.push({ key, bucket: 'nodes', x: p.x, y: p.y });
  }
  for (const [key, p] of Object.entries(layout.documents)) {
    items.push({ key, bucket: 'documents', x: p.x, y: p.y });
  }
  // 決定的な走査順（bucket → key 昇順）。配置順がそのまま「先勝ち」になる。
  items.sort((a, b) => {
    if (a.bucket !== b.bucket) return a.bucket < b.bucket ? -1 : 1;
    return a.key < b.key ? -1 : 1;
  });

  const fullW = w + gap;
  const fullH = h + gap;
  const overlaps = (ax: number, ay: number, bx: number, by: number): boolean =>
    Math.abs(ax - bx) < fullW && Math.abs(ay - by) < fullH;

  // --- 簡易グリッドハッシュ（セル一辺 = 矩形サイズ＋gap）。隣接 3x3 セルのみ衝突判定する。 ---
  const cellW = fullW;
  const cellH = fullH;
  const grid = new Map<string, Placed[]>();
  const cellKey = (cx: number, cy: number) => `${cx}|${cy}`;
  const cellOf = (x: number, y: number) => ({
    cx: Math.floor(x / cellW),
    cy: Math.floor(y / cellH),
  });
  const addToGrid = (it: Placed) => {
    const { cx, cy } = cellOf(it.x, it.y);
    const k = cellKey(cx, cy);
    const arr = grid.get(k);
    if (arr) arr.push(it);
    else grid.set(k, [it]);
  };
  // (x,y) が既配置と重なるか。隣接 3x3 セルだけ調べれば、矩形 1 個ぶんの重なりは漏れない。
  const collides = (x: number, y: number): boolean => {
    const { cx, cy } = cellOf(x, y);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const arr = grid.get(cellKey(cx + dx, cy + dy));
        if (!arr) continue;
        for (const p of arr) {
          if (overlaps(x, y, p.x, p.y)) return true;
        }
      }
    }
    return false;
  };

  // 1) 固定（永続化済み）を先に占有登録。動かさない＝既存の手動配置を尊重する。
  const auto: Placed[] = [];
  for (const it of items) {
    if (fixedKeys.has(`${it.bucket} ${it.key}`)) {
      addToGrid(it);
      layout[it.bucket][it.key] = { x: it.x, y: it.y };
    } else {
      auto.push(it);
    }
  }

  // 2) 自動配置ぶんだけスパイラルで空き位置へ。固定が大半なら auto はごく少数で短絡する。
  const step = Math.max(fullW, fullH);
  for (const it of auto) {
    let { x, y } = it;
    let attempt = 0;
    const maxAttempts = items.length * 8 + 64;
    while (collides(x, y) && attempt < maxAttempts) {
      attempt++;
      // アルキメデス螺旋を決定的に辿る（半径・角度ともに attempt の関数）。
      const angle = attempt * 2.399963; // 黄金角（rad）でムラなく広げる
      const radius = step * 0.6 * Math.sqrt(attempt);
      x = it.x + Math.round(Math.cos(angle) * radius);
      y = it.y + Math.round(Math.sin(angle) * radius);
    }
    const finalItem = { ...it, x, y };
    addToGrid(finalItem);
    layout[it.bucket][it.key] = { x, y };
  }
}
