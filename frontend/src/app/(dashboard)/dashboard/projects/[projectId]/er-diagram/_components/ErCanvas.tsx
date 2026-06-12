'use client';

/**
 * ErCanvas — ER図のSVGキャンバス。
 *
 * - テーブル＝ERエンティティカード（ヘッダ＋カラム行。PK/FK/UKバッジ、FK行は参照先を表示）
 * - オブジェクト＝点線の角丸囲み（メンバーテーブル群のバウンディングボックス＋余白、color反映）。
 *   テーブルをドラッグすると囲みも追従する。未分類テーブルは薄いグレー点線の「未分類」エリア。
 * - FKエッジ: カード間のベジェ＋FKカラム名ラベル（全カラム表示時はカラム行の高さに接続）
 * - オブジェクト関係線: 囲み同士を結ぶ点線＋カーディナリティ（1-1 / 1-N / N-N）
 * - ツールバー: 表示モード切替（全カラム / キーのみ / テーブル名のみ）・自動整列・ズーム
 * - ドラッグ移動 / ホイールズーム / 背景ドラッグでパン
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { KeyRound, LayoutGrid, Loader2, Maximize2, Minus, Plus, Table2 } from 'lucide-react';
import type { ErGraphDto, ErTableDto, RelationCardinality } from '@/lib/data-objects';
import {
  CARD_W,
  HEADER_H,
  ROW_H,
  GROUP_PAD,
  ER_DISPLAY_MODE_OPTIONS,
  cardHeight,
  clipText,
  cubicMidpoint,
  groupRect,
  objectColor,
  padRect,
  rectBoundaryPoint,
  rectCenter,
  unionRect,
  visibleColumns,
  type ErDisplayMode,
  type Point,
  type Rect,
} from './er-layout';

/** カーディナリティの短縮表記（関係線上に表示） */
const CARDINALITY_SHORT: Record<RelationCardinality, string> = {
  ONE_TO_ONE: '1-1',
  ONE_TO_MANY: '1-N',
  MANY_TO_MANY: 'N-N',
};

interface Transform {
  x: number;
  y: number;
  k: number;
}

interface ErCanvasProps {
  graph: ErGraphDto;
  /** テーブルID → ワールド座標（ページ側が保持・保存） */
  positions: Record<string, Point>;
  mode: ErDisplayMode;
  onModeChange: (mode: ErDisplayMode) => void;
  /** ドラッグ中の位置更新（ローカル反映のみ） */
  onMoveTable: (tableId: string, position: Point) => void;
  /** ドラッグ終了（デバウンス保存のトリガ） */
  onDragEnd: () => void;
  onAutoArrange: () => void;
  arranging: boolean;
  savingPositions: boolean;
}

/** 上だけ角丸の矩形パス（カードヘッダ用） */
function topRoundedRectPath(x: number, y: number, w: number, h: number, r: number): string {
  return `M ${x} ${y + h} V ${y + r} Q ${x} ${y} ${x + r} ${y} H ${x + w - r} Q ${x + w} ${y} ${x + w} ${y + r} V ${y + h} Z`;
}

export function ErCanvas({
  graph,
  positions,
  mode,
  onModeChange,
  onMoveTable,
  onDragEnd,
  onAutoArrange,
  arranging,
  savingPositions,
}: ErCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, k: 1 });
  const transformRef = useRef(transform);
  transformRef.current = transform;

  // ドラッグ・パンの一時状態（再レンダリング不要なものは ref）
  const dragRef = useRef<{ tableId: string; startClientX: number; startClientY: number; origin: Point } | null>(null);
  const panRef = useRef<{ startClientX: number; startClientY: number; originX: number; originY: number } | null>(null);

  // ===== ジオメトリ計算 =====

  const tableRects = useMemo(() => {
    const map = new Map<string, Rect>();
    for (const t of graph.tables) {
      const p = positions[t.id] ?? { x: t.erPositionX, y: t.erPositionY };
      map.set(t.id, { x: p.x, y: p.y, w: CARD_W, h: cardHeight(t, mode) });
    }
    return map;
  }, [graph.tables, positions, mode]);

  // オブジェクト囲み（メンバーのバウンディングボックス＋余白。ドラッグに追従）
  const objectHulls = useMemo(() => {
    return graph.objects.map((obj, index) => {
      const members = graph.tables.filter((t) => t.dataObjectId === obj.id);
      const memberRects = members
        .map((t) => tableRects.get(t.id))
        .filter((r): r is Rect => Boolean(r));
      const { rect, empty } = groupRect(memberRects, { x: obj.positionX, y: obj.positionY });
      return { obj, rect, empty, color: objectColor(obj, index), memberCount: members.length };
    });
  }, [graph.objects, graph.tables, tableRects]);

  const hullByObjectId = useMemo(() => {
    const map = new Map<string, Rect>();
    for (const h of objectHulls) map.set(h.obj.id, h.rect);
    return map;
  }, [objectHulls]);

  // 未分類エリア（どのオブジェクトにも属さないテーブル群）
  const unassignedHull = useMemo(() => {
    const objectIds = new Set(graph.objects.map((o) => o.id));
    const rects = graph.tables
      .filter((t) => !t.dataObjectId || !objectIds.has(t.dataObjectId))
      .map((t) => tableRects.get(t.id))
      .filter((r): r is Rect => Boolean(r));
    const union = unionRect(rects);
    return union ? padRect(union, GROUP_PAD, 20) : null;
  }, [graph.objects, graph.tables, tableRects]);

  // ===== 座標変換 =====

  const screenToWorld = useCallback((clientX: number, clientY: number): Point => {
    const el = containerRef.current;
    const t = transformRef.current;
    if (!el) return { x: clientX, y: clientY };
    const bounds = el.getBoundingClientRect();
    return {
      x: (clientX - bounds.left - t.x) / t.k,
      y: (clientY - bounds.top - t.y) / t.k,
    };
  }, []);

  const zoomAt = useCallback((clientX: number, clientY: number, factor: number) => {
    const el = containerRef.current;
    if (!el) return;
    const bounds = el.getBoundingClientRect();
    setTransform((prev) => {
      const k = Math.min(2.5, Math.max(0.15, prev.k * factor));
      const px = clientX - bounds.left;
      const py = clientY - bounds.top;
      // カーソル位置のワールド座標を固定したままスケール
      const wx = (px - prev.x) / prev.k;
      const wy = (py - prev.y) / prev.k;
      return { x: px - wx * k, y: py - wy * k, k };
    });
  }, []);

  const fitView = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const rects: Rect[] = [
      ...objectHulls.map((h) => h.rect),
      ...(unassignedHull ? [unassignedHull] : []),
      ...Array.from(tableRects.values()),
    ];
    const bbox = unionRect(rects);
    if (!bbox) return;
    const bounds = el.getBoundingClientRect();
    const pad = 40;
    const k = Math.min(
      1.25,
      Math.max(0.15, Math.min((bounds.width - pad * 2) / Math.max(bbox.w, 1), (bounds.height - pad * 2) / Math.max(bbox.h, 1))),
    );
    setTransform({
      x: (bounds.width - bbox.w * k) / 2 - bbox.x * k,
      y: (bounds.height - bbox.h * k) / 2 - bbox.y * k,
      k,
    });
  }, [objectHulls, unassignedHull, tableRects]);

  // 初回のみ全体フィット
  const didFitRef = useRef(false);
  useEffect(() => {
    if (didFitRef.current || graph.tables.length === 0) return;
    didFitRef.current = true;
    fitView();
  }, [fitView, graph.tables.length]);

  // ホイールズーム（preventDefault が必要なので non-passive で登録）
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  // ===== ドラッグ（テーブル） / パン（背景） =====

  const handleTablePointerDown = useCallback(
    (e: ReactPointerEvent<SVGGElement>, tableId: string) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      const pos = positions[tableId];
      if (!pos) return;
      dragRef.current = { tableId, startClientX: e.clientX, startClientY: e.clientY, origin: pos };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [positions],
  );

  const handleTablePointerMove = useCallback(
    (e: ReactPointerEvent<SVGGElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      const k = transformRef.current.k;
      onMoveTable(drag.tableId, {
        x: Math.round(drag.origin.x + (e.clientX - drag.startClientX) / k),
        y: Math.round(drag.origin.y + (e.clientY - drag.startClientY) / k),
      });
    },
    [onMoveTable],
  );

  const handleTablePointerUp = useCallback(
    (e: ReactPointerEvent<SVGGElement>) => {
      if (!dragRef.current) return;
      dragRef.current = null;
      e.currentTarget.releasePointerCapture(e.pointerId);
      onDragEnd();
    },
    [onDragEnd],
  );

  const handleBackgroundPointerDown = useCallback((e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const t = transformRef.current;
    panRef.current = { startClientX: e.clientX, startClientY: e.clientY, originX: t.x, originY: t.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const handleBackgroundPointerMove = useCallback((e: ReactPointerEvent<SVGSVGElement>) => {
    const pan = panRef.current;
    if (!pan) return;
    setTransform((prev) => ({
      ...prev,
      x: pan.originX + (e.clientX - pan.startClientX),
      y: pan.originY + (e.clientY - pan.startClientY),
    }));
  }, []);

  const handleBackgroundPointerUp = useCallback((e: ReactPointerEvent<SVGSVGElement>) => {
    if (!panRef.current) return;
    panRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  }, []);

  // ===== FKエッジのアンカー =====

  const tableById = useMemo(() => {
    const map = new Map<string, ErTableDto>();
    for (const t of graph.tables) map.set(t.id, t);
    return map;
  }, [graph.tables]);

  /** カラム行のY座標（カラム行が見えるモードではその行に接続。それ以外はカード辺の中央） */
  const rowAnchorY = useCallback(
    (table: ErTableDto, rect: Rect, columnId: string | null, columnName: string | null): number => {
      if (mode === 'all' || mode === 'keys') {
        const cols = visibleColumns(table, mode);
        const idx = cols.findIndex((c) => (columnId ? c.id === columnId : columnName ? c.name === columnName : false));
        if (idx >= 0) return rect.y + HEADER_H + idx * ROW_H + ROW_H / 2;
        // 行が見つからない場合: キーのみモードは非表示カラムの可能性 → カード中央、全カラムはヘッダ中央
        return mode === 'keys' ? rect.y + rect.h / 2 : rect.y + HEADER_H / 2;
      }
      return rect.y + rect.h / 2;
    },
    [mode],
  );

  // ===== 描画 =====

  return (
    <div ref={containerRef} className="relative h-full w-full select-none overflow-hidden bg-gray-50">
      <svg
        className="h-full w-full cursor-grab touch-none active:cursor-grabbing"
        onPointerDown={handleBackgroundPointerDown}
        onPointerMove={handleBackgroundPointerMove}
        onPointerUp={handleBackgroundPointerUp}
      >
        <defs>
          <marker id="er-fk-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
          </marker>
          <pattern id="er-grid" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="#e2e8f0" />
          </pattern>
        </defs>

        {/* ドット背景（パン/ズームに追従） */}
        <g transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
          <rect x={-5000} y={-5000} width={10000} height={10000} fill="url(#er-grid)" pointerEvents="none" />

          {/* ── 1. オブジェクトの点線囲み（最背面） ── */}
          {unassignedHull && (
            <g pointerEvents="none">
              <rect
                x={unassignedHull.x}
                y={unassignedHull.y}
                width={unassignedHull.w}
                height={unassignedHull.h}
                rx={14}
                fill="#9ca3af"
                fillOpacity={0.05}
                stroke="#cbd5e1"
                strokeWidth={1.5}
                strokeDasharray="6 5"
              />
              <text x={unassignedHull.x + 12} y={unassignedHull.y + 17} fontSize={11} fontWeight={600} fill="#94a3b8">
                未分類
              </text>
            </g>
          )}
          {objectHulls.map(({ obj, rect, empty, color }) => (
            <g key={obj.id} pointerEvents="none">
              <rect
                x={rect.x}
                y={rect.y}
                width={rect.w}
                height={rect.h}
                rx={14}
                fill={color}
                fillOpacity={0.045}
                stroke={color}
                strokeWidth={1.5}
                strokeDasharray="7 5"
              />
              <circle cx={rect.x + 14} cy={rect.y + 13} r={4} fill={color} />
              <text x={rect.x + 23} y={rect.y + 17} fontSize={11.5} fontWeight={700} fill={color}>
                {clipText(obj.name, Math.max(8, Math.floor((rect.w - 30) / 6)))}
              </text>
              {empty && (
                <text x={rect.x + 14} y={rect.y + 42} fontSize={10} fill="#9ca3af">
                  テーブル未割当
                </text>
              )}
            </g>
          ))}

          {/* ── 2. オブジェクト関係線（囲み同士の点線＋カーディナリティ） ── */}
          {graph.relations.map((rel) => {
            const src = hullByObjectId.get(rel.sourceObjectId);
            const tgt = hullByObjectId.get(rel.targetObjectId);
            if (!src || !tgt) return null;
            const a = rectBoundaryPoint(src, rectCenter(tgt));
            const b = rectBoundaryPoint(tgt, rectCenter(src));
            const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
            const srcIndex = graph.objects.findIndex((o) => o.id === rel.sourceObjectId);
            const srcObj = graph.objects[srcIndex];
            const color = srcObj ? objectColor(srcObj, srcIndex) : '#94a3b8';
            return (
              <g key={rel.id} pointerEvents="none">
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={1.6} strokeDasharray="4 4" strokeOpacity={0.75} />
                <text
                  x={mid.x}
                  y={mid.y - 4}
                  fontSize={11}
                  fontWeight={700}
                  fill={color}
                  textAnchor="middle"
                  stroke="#f9fafb"
                  strokeWidth={3.5}
                  paintOrder="stroke"
                >
                  {CARDINALITY_SHORT[rel.cardinality]}
                </text>
                {rel.label && (
                  <text
                    x={mid.x}
                    y={mid.y + 11}
                    fontSize={9.5}
                    fill="#64748b"
                    textAnchor="middle"
                    stroke="#f9fafb"
                    strokeWidth={3}
                    paintOrder="stroke"
                  >
                    {clipText(rel.label, 20)}
                  </text>
                )}
              </g>
            );
          })}

          {/* ── 3. FKエッジ（カード間。全カラム表示時はカラム行の高さに接続） ── */}
          {graph.fkEdges.map((edge, i) => {
            const srcTable = tableById.get(edge.sourceTableId);
            const tgtTable = tableById.get(edge.targetTableId);
            const srcRect = tableRects.get(edge.sourceTableId);
            const tgtRect = tableRects.get(edge.targetTableId);
            if (!srcTable || !tgtTable || !srcRect || !tgtRect) return null;
            const srcColumn = srcTable.columns.find((c) => c.id === edge.sourceColumnId) ?? null;
            const sy = rowAnchorY(srcTable, srcRect, edge.sourceColumnId, null);
            const ty = rowAnchorY(tgtTable, tgtRect, null, edge.targetColumnName);

            let d: string;
            let labelPos: Point;
            if (edge.sourceTableId === edge.targetTableId) {
              // 自己参照: 右側にループ
              const x = srcRect.x + srcRect.w;
              const p0 = { x, y: sy };
              const p1 = { x, y: ty === sy ? ty + ROW_H : ty };
              const c1 = { x: x + 56, y: p0.y };
              const c2 = { x: x + 56, y: p1.y };
              d = `M ${p0.x} ${p0.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p1.x} ${p1.y}`;
              labelPos = cubicMidpoint(p0, c1, c2, p1);
            } else {
              const srcCx = srcRect.x + srcRect.w / 2;
              const tgtCx = tgtRect.x + tgtRect.w / 2;
              const sx = tgtCx >= srcCx ? srcRect.x + srcRect.w : srcRect.x;
              const tx = tgtCx >= srcCx ? tgtRect.x : tgtRect.x + tgtRect.w;
              const bend = Math.max(36, Math.min(110, Math.abs(tx - sx) / 2));
              const sDir = tgtCx >= srcCx ? 1 : -1;
              const p0 = { x: sx, y: sy };
              const p1 = { x: tx, y: ty };
              const c1 = { x: sx + sDir * bend, y: sy };
              const c2 = { x: tx - sDir * bend, y: ty };
              d = `M ${p0.x} ${p0.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p1.x} ${p1.y}`;
              labelPos = cubicMidpoint(p0, c1, c2, p1);
            }
            return (
              <g key={`${edge.sourceColumnId}-${i}`} pointerEvents="none">
                <path d={d} fill="none" stroke="#94a3b8" strokeWidth={1.4} markerEnd="url(#er-fk-arrow)" />
                {srcColumn && (
                  <text
                    x={labelPos.x}
                    y={labelPos.y - 4}
                    fontSize={8.5}
                    fill="#64748b"
                    textAnchor="middle"
                    stroke="#f9fafb"
                    strokeWidth={3}
                    paintOrder="stroke"
                  >
                    {clipText(srcColumn.name, 24)}
                  </text>
                )}
              </g>
            );
          })}

          {/* ── 4. テーブルカード（最前面） ── */}
          {graph.tables.map((table) => {
            const rect = tableRects.get(table.id);
            if (!rect) return null;
            const cols = visibleColumns(table, mode);
            const hasPk = table.columns.some((c) => c.isPrimaryKey);
            const ownerIndex = graph.objects.findIndex((o) => o.id === table.dataObjectId);
            const headerColor = ownerIndex >= 0 ? objectColor(graph.objects[ownerIndex], ownerIndex) : '#64748b';
            return (
              <g
                key={table.id}
                className="cursor-move"
                onPointerDown={(e) => handleTablePointerDown(e, table.id)}
                onPointerMove={handleTablePointerMove}
                onPointerUp={handleTablePointerUp}
              >
                {/* カード本体 */}
                <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} rx={8} fill="#ffffff" stroke="#d1d5db" strokeWidth={1.2} />
                {/* ヘッダ（所属オブジェクト色を薄く反映） */}
                <path d={topRoundedRectPath(rect.x, rect.y, rect.w, HEADER_H, 8)} fill={headerColor} fillOpacity={0.12} />
                <line x1={rect.x} y1={rect.y + HEADER_H} x2={rect.x + rect.w} y2={rect.y + HEADER_H} stroke="#e5e7eb" strokeWidth={1} />
                <Table2 x={rect.x + 9} y={rect.y + 9} width={13} height={13} className="text-gray-500" strokeWidth={2} />
                <text x={rect.x + 28} y={rect.y + 20.5} fontSize={11.5} fontWeight={700} fill="#1f2937">
                  {clipText(table.displayName || table.name, hasPk ? 28 : 32)}
                </text>
                {hasPk && (
                  <KeyRound x={rect.x + rect.w - 21} y={rect.y + 10} width={11} height={11} className="text-amber-500" strokeWidth={2.4} />
                )}

                {/* カラム行 */}
                {cols.map((col, idx) => {
                  const rowY = rect.y + HEADER_H + idx * ROW_H;
                  const badges: Array<{ label: string; fill: string; text: string }> = [];
                  if (col.isPrimaryKey) badges.push({ label: 'PK', fill: '#fef3c7', text: '#b45309' });
                  if (col.isForeignKey) badges.push({ label: 'FK', fill: '#e0e7ff', text: '#4338ca' });
                  if (col.isUnique && !col.isPrimaryKey) badges.push({ label: 'UK', fill: '#e0f2fe', text: '#0369a1' });
                  const badgeZone = badges.length * 21;
                  const rightText =
                    col.isForeignKey && col.foreignKeyTable ? `→ ${col.foreignKeyTable}` : col.dataType;
                  return (
                    <g key={col.id}>
                      {idx % 2 === 1 && (
                        <rect x={rect.x + 1} y={rowY} width={rect.w - 2} height={ROW_H} fill="#f8fafc" />
                      )}
                      {badges.map((b, bi) => (
                        <g key={b.label}>
                          <rect x={rect.x + 7 + bi * 21} y={rowY + 4.5} width={18} height={12} rx={3} fill={b.fill} />
                          <text x={rect.x + 7 + bi * 21 + 9} y={rowY + 13.5} fontSize={7.5} fontWeight={700} fill={b.text} textAnchor="middle">
                            {b.label}
                          </text>
                        </g>
                      ))}
                      <text
                        x={rect.x + 9 + badgeZone}
                        y={rowY + 14.5}
                        fontSize={10}
                        fill={col.isPrimaryKey ? '#92400e' : '#374151'}
                        fontWeight={col.isPrimaryKey ? 600 : 400}
                      >
                        {clipText(col.name, Math.max(6, Math.floor((rect.w - 110 - badgeZone) / 5.5)))}
                      </text>
                      <text
                        x={rect.x + rect.w - 9}
                        y={rowY + 14.5}
                        fontSize={8.5}
                        fill={col.isForeignKey && col.foreignKeyTable ? '#4f46e5' : '#9ca3af'}
                        textAnchor="end"
                      >
                        {clipText(rightText, 17)}
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          })}
        </g>
      </svg>

      {/* ── ツールバー ── */}
      <div className="absolute left-2 top-2 flex flex-wrap items-center gap-1.5 rounded-lg border border-gray-200 bg-white/90 p-1.5 shadow-sm backdrop-blur">
        {/* 表示モード切替（カード高さが変わってもエッジ・囲みは追従する） */}
        <div className="flex items-center overflow-hidden rounded-md border border-gray-200">
          {ER_DISPLAY_MODE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onModeChange(opt.value)}
              className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                mode === opt.value ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="h-5 w-px bg-gray-200" />
        <button
          type="button"
          onClick={onAutoArrange}
          disabled={arranging}
          className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
          title="オブジェクトごとにテーブルをグリッド配置（未分類は右端）"
        >
          {arranging ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LayoutGrid className="h-3.5 w-3.5" />}
          自動整列
        </button>
        <div className="h-5 w-px bg-gray-200" />
        <button
          type="button"
          onClick={() => {
            const el = containerRef.current;
            if (!el) return;
            const b = el.getBoundingClientRect();
            zoomAt(b.left + b.width / 2, b.top + b.height / 2, 1.2);
          }}
          className="rounded-md border border-gray-200 p-1 text-gray-600 hover:bg-gray-50"
          title="ズームイン"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => {
            const el = containerRef.current;
            if (!el) return;
            const b = el.getBoundingClientRect();
            zoomAt(b.left + b.width / 2, b.top + b.height / 2, 1 / 1.2);
          }}
          className="rounded-md border border-gray-200 p-1 text-gray-600 hover:bg-gray-50"
          title="ズームアウト"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={fitView}
          className="rounded-md border border-gray-200 p-1 text-gray-600 hover:bg-gray-50"
          title="全体表示"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* 凡例＋保存状態 */}
      <div className="pointer-events-none absolute bottom-2 left-2 flex items-center gap-3 rounded-md border border-gray-200 bg-white/90 px-2.5 py-1.5 text-[11px] text-gray-500 backdrop-blur">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-3 w-5 rounded border border-dashed border-indigo-400" />
          オブジェクト
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-px w-5 bg-slate-400" />
          FK参照
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-px w-5 border-t border-dashed border-indigo-400" />
          オブジェクト関係（1-1 / 1-N / N-N）
        </span>
      </div>
      {savingPositions && (
        <div className="absolute bottom-2 right-2 inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white/90 px-2.5 py-1.5 text-[11px] text-gray-500 backdrop-blur">
          <Loader2 className="h-3 w-3 animate-spin" />
          位置を保存中...
        </div>
      )}
    </div>
  );
}
