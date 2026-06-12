'use client';

/**
 * ObjectMapCanvas — オブジェクト関係性マップ用の軽量SVGキャンバス。
 *
 * React Flow を使わず、viewBox 変換（translate+scale）だけで
 * ズーム（ホイール）/ パン（背景ドラッグ）/ ノードドラッグを実装する。
 *  - オブジェクト = 角丸カード（色帯＋名前＋テーブル数/DFDバッジ）。foreignObject で描画。
 *  - リレーション = 直線エッジ。両端に 1/N 表記、中央に 1:1/1:多/多:多 チップ＋ラベル。
 *    カーディナリティごとに線色を変える（1:1=青, 1:多=緑, 多:多=橙）。
 *  - エッジ追加 = 「2クリック接続」モード（ガントの依存編集と同じUX。ESCで中断）。
 *  - エッジクリック → その場に編集ポップ（カーディナリティ/ラベル/削除）。
 *  - ノードドラッグ終了 → onObjectMoved（親がデバウンスして SaveObjectPositions）。
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import {
  Plus,
  Import,
  Spline,
  Maximize2,
  ZoomIn,
  ZoomOut,
  Loader2,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  RELATION_CARDINALITY_OPTIONS,
  type DataObjectDto,
  type ObjectRelationDto,
  type RelationCardinality,
} from '@/lib/data-objects';
import {
  CARD_W,
  CARD_H,
  CARDINALITY_STYLES,
  objectColor,
} from './object-map-shared';

interface ViewTransform {
  x: number;
  y: number;
  k: number;
}

interface Point {
  x: number;
  y: number;
}

/** カード中心 (cx,cy) から (tx,ty) へ向かう直線とカード境界の交点（エッジの端点） */
function rectAnchor(cx: number, cy: number, tx: number, ty: number): Point {
  const dx = tx - cx;
  const dy = ty - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const sx = dx === 0 ? Number.POSITIVE_INFINITY : CARD_W / 2 / Math.abs(dx);
  const sy = dy === 0 ? Number.POSITIVE_INFINITY : CARD_H / 2 / Math.abs(dy);
  const s = Math.min(sx, sy);
  return { x: cx + dx * s, y: cy + dy * s };
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export interface ObjectMapCanvasProps {
  objects: DataObjectDto[];
  relations: ObjectRelationDto[];
  selectedObjectId: string | null;
  onSelectObject: (id: string | null) => void;
  /** ノードドラッグ終了時（親側で楽観更新＋デバウンス保存する） */
  onObjectMoved: (id: string, x: number, y: number) => void;
  onCreateRelation: (sourceObjectId: string, targetObjectId: string) => void | Promise<void>;
  onUpdateRelation: (
    id: string,
    patch: { cardinality?: RelationCardinality; label?: string | null },
  ) => void | Promise<void>;
  onDeleteRelation: (id: string) => void | Promise<void>;
  onAddObject: () => void;
  onImportFromDfd: () => void;
  importing: boolean;
}

export function ObjectMapCanvas({
  objects,
  relations,
  selectedObjectId,
  onSelectObject,
  onObjectMoved,
  onCreateRelation,
  onUpdateRelation,
  onDeleteRelation,
  onAddObject,
  onImportFromDfd,
  importing,
}: ObjectMapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const [view, setView] = useState<ViewTransform>({ x: 40, y: 40, k: 1 });
  const viewRef = useRef(view);
  viewRef.current = view;

  // ドラッグ中のノード位置の一時上書き（pointerup で onObjectMoved に確定）
  const [dragPos, setDragPos] = useState<Record<string, Point>>({});
  const dragRef = useRef<{ id: string; dx: number; dy: number; moved: boolean } | null>(null);
  // ドラッグ直後に発火する click で選択がトグルされるのを防ぐ
  const suppressClickRef = useRef(false);
  const panRef = useRef<{ sx: number; sy: number; vx: number; vy: number; moved: boolean } | null>(null);

  // 2クリック接続モード
  const [connectMode, setConnectMode] = useState(false);
  const [connectSourceId, setConnectSourceId] = useState<string | null>(null);
  const [cursorWorld, setCursorWorld] = useState<Point | null>(null);

  // エッジ編集ポップ（コンテナ相対のスクリーン座標）
  const [edgeEdit, setEdgeEdit] = useState<{ id: string; x: number; y: number } | null>(null);
  const [edgeLabelDraft, setEdgeLabelDraft] = useState('');

  const objectById = useMemo(() => new Map(objects.map((o) => [o.id, o] as const)), [objects]);
  const editingRelation = edgeEdit ? relations.find((r) => r.id === edgeEdit.id) ?? null : null;

  const posOf = useCallback(
    (o: DataObjectDto): Point => dragPos[o.id] ?? { x: o.positionX, y: o.positionY },
    [dragPos],
  );

  const screenToWorld = useCallback((clientX: number, clientY: number): Point => {
    const el = svgRef.current;
    const v = viewRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return { x: (clientX - rect.left - v.x) / v.k, y: (clientY - rect.top - v.y) / v.k };
  }, []);

  // ===== ズーム（ホイール。React の onWheel は passive のため native で登録） =====
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      setView((v) => {
        const k = clamp(v.k * Math.exp(-e.deltaY * 0.0015), 0.25, 2.5);
        const wx = (px - v.x) / v.k;
        const wy = (py - v.y) / v.k;
        return { k, x: px - wx * k, y: py - wy * k };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const zoomBy = useCallback((factor: number) => {
    const el = svgRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = rect.width / 2;
    const py = rect.height / 2;
    setView((v) => {
      const k = clamp(v.k * factor, 0.25, 2.5);
      const wx = (px - v.x) / v.k;
      const wy = (py - v.y) / v.k;
      return { k, x: px - wx * k, y: py - wy * k };
    });
  }, []);

  // ===== 全体表示（fit） =====
  const fitView = useCallback(() => {
    const el = svgRef.current;
    if (!el || objects.length === 0) return;
    const rect = el.getBoundingClientRect();
    const xs = objects.map((o) => o.positionX);
    const ys = objects.map((o) => o.positionY);
    const minX = Math.min(...xs) - 60;
    const minY = Math.min(...ys) - 60;
    const maxX = Math.max(...xs) + CARD_W + 60;
    const maxY = Math.max(...ys) + CARD_H + 60;
    const w = Math.max(maxX - minX, 1);
    const h = Math.max(maxY - minY, 1);
    const k = clamp(Math.min(rect.width / w, rect.height / h), 0.25, 1.25);
    setView({
      k,
      x: (rect.width - w * k) / 2 - minX * k,
      y: (rect.height - h * k) / 2 - minY * k,
    });
  }, [objects]);

  const didInitialFit = useRef(false);
  useEffect(() => {
    if (!didInitialFit.current && objects.length > 0) {
      didInitialFit.current = true;
      fitView();
    }
  }, [objects, fitView]);

  // ===== ESC で接続/編集を中断 =====
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setConnectSourceId(null);
      setConnectMode(false);
      setEdgeEdit(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ===== ノードドラッグ =====
  const handleNodePointerDown = useCallback(
    (e: ReactPointerEvent<SVGGElement>, obj: DataObjectDto) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      suppressClickRef.current = false;
      if (connectMode) return; // 接続モード中はドラッグせずクリック扱い
      const world = screenToWorld(e.clientX, e.clientY);
      const p = { x: obj.positionX, y: obj.positionY };
      dragRef.current = { id: obj.id, dx: world.x - p.x, dy: world.y - p.y, moved: false };

      const onMove = (ev: PointerEvent) => {
        const d = dragRef.current;
        if (!d) return;
        const w = screenToWorld(ev.clientX, ev.clientY);
        d.moved = true;
        setDragPos({ [d.id]: { x: Math.round(w.x - d.dx), y: Math.round(w.y - d.dy) } });
      };
      const onUp = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        const d = dragRef.current;
        dragRef.current = null;
        if (!d) return;
        if (d.moved) {
          suppressClickRef.current = true;
          const w = screenToWorld(ev.clientX, ev.clientY);
          onObjectMoved(d.id, Math.round(w.x - d.dx), Math.round(w.y - d.dy));
        }
        setDragPos({});
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [connectMode, screenToWorld, onObjectMoved],
  );

  const handleNodeClick = useCallback(
    (e: ReactMouseEvent<SVGGElement>, obj: DataObjectDto) => {
      e.stopPropagation();
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        return;
      }
      if (connectMode) {
        if (!connectSourceId) {
          setConnectSourceId(obj.id);
        } else if (connectSourceId === obj.id) {
          setConnectSourceId(null);
        } else {
          void onCreateRelation(connectSourceId, obj.id);
          setConnectSourceId(null);
        }
        return;
      }
      setEdgeEdit(null);
      onSelectObject(obj.id === selectedObjectId ? null : obj.id);
    },
    [connectMode, connectSourceId, onCreateRelation, onSelectObject, selectedObjectId],
  );

  // ===== 背景パン / 背景クリックで選択解除 =====
  const handleBackgroundPointerDown = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      if (e.button !== 0) return;
      const v = viewRef.current;
      panRef.current = { sx: e.clientX, sy: e.clientY, vx: v.x, vy: v.y, moved: false };

      const onMove = (ev: PointerEvent) => {
        const p = panRef.current;
        if (!p) return;
        const dx = ev.clientX - p.sx;
        const dy = ev.clientY - p.sy;
        if (Math.abs(dx) + Math.abs(dy) > 3) p.moved = true;
        setView((prev) => ({ ...prev, x: p.vx + dx, y: p.vy + dy }));
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        const p = panRef.current;
        panRef.current = null;
        if (p && !p.moved) {
          // クリック（パンなし）→ 選択解除・接続元解除・編集ポップを閉じる
          onSelectObject(null);
          setConnectSourceId(null);
          setEdgeEdit(null);
        }
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [onSelectObject],
  );

  // 接続モード中のプレビュー線用にカーソルのワールド座標を追跡
  const handleSvgPointerMove = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      if (!connectMode || !connectSourceId) return;
      setCursorWorld(screenToWorld(e.clientX, e.clientY));
    },
    [connectMode, connectSourceId, screenToWorld],
  );

  // ===== エッジクリック → 編集ポップ =====
  const handleEdgeClick = useCallback(
    (e: ReactMouseEvent<SVGPathElement>, rel: ObjectRelationDto) => {
      e.stopPropagation();
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const x = clamp(e.clientX - rect.left, 130, rect.width - 130);
      const y = clamp(e.clientY - rect.top, 10, rect.height - 170);
      setEdgeLabelDraft(rel.label ?? '');
      setEdgeEdit({ id: rel.id, x, y });
    },
    [],
  );

  const commitEdgeLabel = useCallback(() => {
    if (!editingRelation) return;
    const v = edgeLabelDraft.trim();
    if (v === (editingRelation.label ?? '')) return;
    void onUpdateRelation(editingRelation.id, { label: v === '' ? null : v });
  }, [editingRelation, edgeLabelDraft, onUpdateRelation]);

  // ===== エッジ描画情報（同一ペア間の複数線は垂直方向にオフセット） =====
  const edgeGeometries = useMemo(() => {
    const groups = new Map<string, ObjectRelationDto[]>();
    for (const r of relations) {
      const key = [r.sourceObjectId, r.targetObjectId].sort().join('|');
      const arr = groups.get(key);
      if (arr) arr.push(r);
      else groups.set(key, [r]);
    }
    const result: Array<{
      rel: ObjectRelationDto;
      a: Point;
      b: Point;
      mid: Point;
      dir: Point;
      perp: Point;
    }> = [];
    for (const group of Array.from(groups.values())) {
      group.forEach((rel, i) => {
        const src = objectById.get(rel.sourceObjectId);
        const tgt = objectById.get(rel.targetObjectId);
        if (!src || !tgt || src.id === tgt.id) return;
        const sp = posOf(src);
        const tp = posOf(tgt);
        let scx = sp.x + CARD_W / 2;
        let scy = sp.y + CARD_H / 2;
        let tcx = tp.x + CARD_W / 2;
        let tcy = tp.y + CARD_H / 2;
        const len = Math.hypot(tcx - scx, tcy - scy) || 1;
        const dir = { x: (tcx - scx) / len, y: (tcy - scy) / len };
        const perp = { x: -dir.y, y: dir.x };
        // 同一ペア間の複数エッジは中心線を垂直方向にずらす
        const offset = (i - (group.length - 1) / 2) * 22;
        scx += perp.x * offset;
        scy += perp.y * offset;
        tcx += perp.x * offset;
        tcy += perp.y * offset;
        const a = rectAnchor(sp.x + CARD_W / 2, sp.y + CARD_H / 2, tcx, tcy);
        const b = rectAnchor(tp.x + CARD_W / 2, tp.y + CARD_H / 2, scx, scy);
        result.push({
          rel,
          a,
          b,
          mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
          dir,
          perp,
        });
      });
    }
    return result;
  }, [relations, objectById, posOf]);

  const connectSource = connectSourceId ? objectById.get(connectSourceId) ?? null : null;

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-slate-50">
      {/* ===== SVG キャンバス ===== */}
      <svg
        ref={svgRef}
        className="h-full w-full touch-none select-none"
        style={{ cursor: connectMode ? 'crosshair' : panRef.current ? 'grabbing' : 'default' }}
        onPointerDown={handleBackgroundPointerDown}
        onPointerMove={handleSvgPointerMove}
      >
        {/* ドット方眼（ビュー変換に追随） */}
        <defs>
          <pattern
            id="object-map-dots"
            width={24 * view.k}
            height={24 * view.k}
            patternUnits="userSpaceOnUse"
            patternTransform={`translate(${view.x},${view.y})`}
          >
            <circle cx={1} cy={1} r={1} fill="#cbd5e1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#object-map-dots)" />

        <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
          {/* ===== エッジ ===== */}
          {edgeGeometries.map(({ rel, a, b, mid, dir, perp }) => {
            const style = CARDINALITY_STYLES[rel.cardinality];
            const editing = edgeEdit?.id === rel.id;
            // 端点表記の位置（端から線に沿って 18px、線の垂直方向に 11px 浮かせる）
            const srcMark = {
              x: a.x + dir.x * 18 + perp.x * 11,
              y: a.y + dir.y * 18 + perp.y * 11,
            };
            const tgtMark = {
              x: b.x - dir.x * 18 + perp.x * 11,
              y: b.y - dir.y * 18 + perp.y * 11,
            };
            // 矢じり（target 側）
            const arrowTip = b;
            const arrowL = {
              x: b.x - dir.x * 10 + perp.x * 5,
              y: b.y - dir.y * 10 + perp.y * 5,
            };
            const arrowR = {
              x: b.x - dir.x * 10 - perp.x * 5,
              y: b.y - dir.y * 10 - perp.y * 5,
            };
            return (
              <g key={rel.id}>
                {/* クリック判定用の太い透明パス */}
                <path
                  d={`M ${a.x} ${a.y} L ${b.x} ${b.y}`}
                  stroke="transparent"
                  strokeWidth={14}
                  fill="none"
                  style={{ cursor: 'pointer' }}
                  onClick={(e) => handleEdgeClick(e, rel)}
                  onPointerDown={(e) => e.stopPropagation()}
                />
                <path
                  d={`M ${a.x} ${a.y} L ${b.x} ${b.y}`}
                  stroke={style.color}
                  strokeWidth={editing ? 2.5 : 1.5}
                  fill="none"
                  pointerEvents="none"
                />
                <polygon
                  points={`${arrowTip.x},${arrowTip.y} ${arrowL.x},${arrowL.y} ${arrowR.x},${arrowR.y}`}
                  fill={style.color}
                  pointerEvents="none"
                />
                {/* 両端の 1/N 表記 */}
                <text
                  x={srcMark.x}
                  y={srcMark.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={12}
                  fontWeight={700}
                  fill={style.color}
                  stroke="#ffffff"
                  strokeWidth={4}
                  paintOrder="stroke"
                  pointerEvents="none"
                >
                  {style.sourceMark}
                </text>
                <text
                  x={tgtMark.x}
                  y={tgtMark.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={12}
                  fontWeight={700}
                  fill={style.color}
                  stroke="#ffffff"
                  strokeWidth={4}
                  paintOrder="stroke"
                  pointerEvents="none"
                >
                  {style.targetMark}
                </text>
                {/* 中央: ラベル（上）＋カーディナリティチップ（下） */}
                {rel.label && (
                  <text
                    x={mid.x}
                    y={mid.y - 14}
                    textAnchor="middle"
                    fontSize={11}
                    fill="#334155"
                    stroke="#ffffff"
                    strokeWidth={4}
                    paintOrder="stroke"
                    pointerEvents="none"
                  >
                    {rel.label}
                  </text>
                )}
                <text
                  x={mid.x}
                  y={mid.y + (rel.label ? 4 : -4)}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight={700}
                  fill={style.color}
                  stroke="#ffffff"
                  strokeWidth={4}
                  paintOrder="stroke"
                  pointerEvents="none"
                >
                  {style.short}
                </text>
              </g>
            );
          })}

          {/* 接続プレビュー線（接続元 → カーソル） */}
          {connectMode && connectSource && cursorWorld && (
            <line
              x1={posOf(connectSource).x + CARD_W / 2}
              y1={posOf(connectSource).y + CARD_H / 2}
              x2={cursorWorld.x}
              y2={cursorWorld.y}
              stroke="#2563eb"
              strokeWidth={1.5}
              strokeDasharray="6 4"
              pointerEvents="none"
            />
          )}

          {/* ===== オブジェクトカード ===== */}
          {objects.map((o) => {
            const p = posOf(o);
            const color = objectColor(o.color);
            const selected = o.id === selectedObjectId;
            const isConnectSource = o.id === connectSourceId;
            return (
              <g
                key={o.id}
                transform={`translate(${p.x},${p.y})`}
                onPointerDown={(e) => handleNodePointerDown(e, o)}
                onClick={(e) => handleNodeClick(e, o)}
                style={{ cursor: connectMode ? 'crosshair' : 'grab' }}
              >
                {/* 選択/接続元リング */}
                {(selected || isConnectSource) && (
                  <rect
                    x={-5}
                    y={-5}
                    width={CARD_W + 10}
                    height={CARD_H + 10}
                    rx={16}
                    fill="none"
                    stroke={isConnectSource ? '#2563eb' : '#3b82f6'}
                    strokeWidth={2}
                    strokeDasharray={isConnectSource ? '6 4' : undefined}
                  />
                )}
                <foreignObject width={CARD_W} height={CARD_H} pointerEvents="none">
                  <div
                    className="flex h-full flex-col justify-between rounded-xl border bg-white px-3 py-2 shadow-sm"
                    style={{
                      borderColor: selected ? '#3b82f6' : '#e2e8f0',
                      borderLeftColor: color,
                      borderLeftWidth: 5,
                    }}
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: color }}
                      />
                      <span className="truncate text-[13px] font-semibold text-slate-800">
                        {o.name}
                      </span>
                    </div>
                    {o.description ? (
                      <p className="truncate text-[10px] text-slate-400">{o.description}</p>
                    ) : (
                      <p className="text-[10px] text-slate-300">—</p>
                    )}
                    <div className="flex items-center gap-1">
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                        テーブル {o.tables.length}
                      </span>
                      {o.dfdNodes.length > 0 && (
                        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                          DFD {o.dfdNodes.length}
                        </span>
                      )}
                    </div>
                  </div>
                </foreignObject>
                {/* ヒット領域（foreignObject の上に透明 rect） */}
                <rect width={CARD_W} height={CARD_H} rx={12} fill="transparent" />
              </g>
            );
          })}
        </g>
      </svg>

      {/* ===== ツールバー（左上） ===== */}
      <div className="absolute left-3 top-3 flex items-center gap-1 rounded-lg border border-gray-200 bg-white/95 p-1 shadow-sm">
        <Button size="sm" variant="ghost" className="h-8 gap-1.5 px-2 text-xs" onClick={onAddObject}>
          <Plus className="h-4 w-4" />
          オブジェクト追加
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 gap-1.5 px-2 text-xs"
          onClick={onImportFromDfd}
          disabled={importing}
        >
          {importing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Import className="h-4 w-4" />
          )}
          DFDのデータストアから取り込み
        </Button>
        <div className="mx-0.5 h-5 w-px bg-gray-200" />
        <Button
          size="sm"
          variant={connectMode ? 'default' : 'ghost'}
          className="h-8 gap-1.5 px-2 text-xs"
          onClick={() => {
            setConnectMode((m) => !m);
            setConnectSourceId(null);
          }}
        >
          <Spline className="h-4 w-4" />
          関係線を追加
        </Button>
      </div>

      {/* ===== ズーム操作（右下） ===== */}
      <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-lg border border-gray-200 bg-white/95 p-1 shadow-sm">
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => zoomBy(1 / 1.25)} title="縮小">
          <ZoomOut className="h-4 w-4" />
        </Button>
        <span className="w-10 text-center text-[11px] tabular-nums text-gray-500">
          {Math.round(view.k * 100)}%
        </span>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => zoomBy(1.25)} title="拡大">
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={fitView} title="全体表示">
          <Maximize2 className="h-4 w-4" />
        </Button>
      </div>

      {/* ===== 凡例（左下） ===== */}
      <div className="absolute bottom-3 left-3 flex items-center gap-3 rounded-lg border border-gray-200 bg-white/95 px-2.5 py-1.5 shadow-sm">
        {RELATION_CARDINALITY_OPTIONS.map((opt) => {
          const s = CARDINALITY_STYLES[opt.value];
          return (
            <span key={opt.value} className="inline-flex items-center gap-1 text-[10px] text-gray-600">
              <span className="inline-block h-0.5 w-5 rounded" style={{ background: s.color }} />
              {s.short}（{opt.label}）
            </span>
          );
        })}
      </div>

      {/* ===== 接続モードのヒント ===== */}
      {connectMode && (
        <div className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs text-blue-700 shadow-sm">
          {connectSourceId
            ? '接続先のオブジェクトをクリック（ESC で中断）'
            : '接続元のオブジェクトをクリック（ESC で中断）'}
        </div>
      )}

      {/* ===== エッジ編集ポップ ===== */}
      {edgeEdit && editingRelation && (
        <div
          className="absolute z-10 w-64 rounded-lg border border-gray-200 bg-white p-3 shadow-lg"
          style={{ left: edgeEdit.x, top: edgeEdit.y, transform: 'translate(-50%, 8px)' }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="mb-2 flex items-center justify-between">
            <p className="truncate text-xs font-semibold text-gray-700">
              {objectById.get(editingRelation.sourceObjectId)?.name ?? '?'}
              {' → '}
              {objectById.get(editingRelation.targetObjectId)?.name ?? '?'}
            </p>
            <button
              type="button"
              className="text-gray-400 hover:text-gray-600"
              onClick={() => setEdgeEdit(null)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-2">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-gray-500">
                カーディナリティ
              </label>
              <select
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={editingRelation.cardinality}
                onChange={(e) =>
                  void onUpdateRelation(editingRelation.id, {
                    cardinality: e.target.value as RelationCardinality,
                  })
                }
              >
                {RELATION_CARDINALITY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}（{CARDINALITY_STYLES[opt.value].short}）
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-gray-500">ラベル</label>
              <Input
                className="h-8 text-sm"
                placeholder="例: 1つの注文は複数の明細を持つ"
                value={edgeLabelDraft}
                onChange={(e) => setEdgeLabelDraft(e.target.value)}
                onBlur={commitEdgeLabel}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    commitEdgeLabel();
                    setEdgeEdit(null);
                  }
                }}
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-8 w-full gap-1.5 text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
              onClick={() => {
                if (!window.confirm('この関係線を削除しますか？')) return;
                setEdgeEdit(null);
                void onDeleteRelation(editingRelation.id);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              関係線を削除
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
