'use client'

/**
 * KnowledgeGraphCanvas — ナレッジグラフ用の自作 SVG キャンバス（object-map 流儀）。
 *
 * React Flow を使わず、viewBox 変換（translate+scale）で
 * ズーム（Ctrl/ピンチ wheel）/ パン（2本指 or 背景ドラッグ）/ ノードドラッグを実装する。
 *   - ノード = 楕円チップ。タグ(TAG)=単色、実体(ENTITY)=entityKind 別色（手動 color 優先）。
 *   - エッジ = KnowledgeRelation。ラベルを中央に表示、矢じり付き。
 *   - 文書ノード = 角丸矩形（表示トグル）。mention は文書↔ノードの細線で描く。
 *   - ノード/文書クリック → 親へ通知（右パネル）。
 *   - ドラッグ終了 → onNodeMoved / onDocumentMoved（親が PATCH 位置を永続化）。
 *
 * 位置は親が computeKnowledgeGraphLayout で算出した layout（id→{x,y} 左上原点）を渡す。
 * ドラッグ中はローカルで上書きし、pointerup で確定値を親に渡す。
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { Maximize2, ZoomIn, ZoomOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type {
  KnowledgeNode,
  KnowledgeRelation,
  KnowledgeDocument,
} from '@/lib/knowledge'
import { nodeColor } from './knowledge-graph-colors'
import type {
  KnowledgeGraphLayout,
  LayoutPosition,
} from './knowledge-graph-layout'

// ノード/文書の描画サイズ（レイアウトの nodeWidth/Height と一致させる）。
const NODE_W = 168
const NODE_H = 64
const DOC_W = 168
const DOC_H = 56

interface ViewTransform {
  x: number
  y: number
  k: number
}
interface Point {
  x: number
  y: number
}

/** 文書↔ノードの mention（細線描画用）。 */
export interface CanvasMention {
  documentId: string
  nodeId: string
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

/** 矩形 (x,y,w,h) 中心から (tx,ty) へ向かう線と矩形境界の交点。 */
function rectAnchor(
  x: number,
  y: number,
  w: number,
  h: number,
  tx: number,
  ty: number,
): Point {
  const cx = x + w / 2
  const cy = y + h / 2
  const dx = tx - cx
  const dy = ty - cy
  if (dx === 0 && dy === 0) return { x: cx, y: cy }
  const sx = dx === 0 ? Number.POSITIVE_INFINITY : w / 2 / Math.abs(dx)
  const sy = dy === 0 ? Number.POSITIVE_INFINITY : h / 2 / Math.abs(dy)
  const s = Math.min(sx, sy)
  return { x: cx + dx * s, y: cy + dy * s }
}

export interface KnowledgeGraphCanvasProps {
  nodes: KnowledgeNode[]
  relations: KnowledgeRelation[]
  documents: KnowledgeDocument[]
  /** 親が算出した決定的レイアウト（id→左上座標）。 */
  layout: KnowledgeGraphLayout
  /** 文書↔ノードの mention（細線描画用。空なら細線なし）。 */
  mentions?: CanvasMention[]
  /** 文書ノード＋ mention 細線を表示するか。 */
  showDocuments: boolean
  /** 強調表示するノード id 集合（検索ヒット等。空集合なら全ノード通常表示）。 */
  highlightNodeIds?: Set<string>
  /** 強調表示する文書 id 集合（検索ヒット。空集合なら全文書通常表示）。 */
  highlightDocumentIds?: Set<string>
  /** ノード id → 表示するか（フィルタ結果）。未指定は全表示。 */
  isNodeVisible?: (node: KnowledgeNode) => boolean
  selectedNodeId: string | null
  selectedDocumentId: string | null
  onSelectNode: (id: string | null) => void
  onSelectDocument: (id: string | null) => void
  /** ドラッグ確定（左上座標）。親が PATCH /knowledge-nodes/:id position。 */
  onNodeMoved: (id: string, x: number, y: number) => void
  /** ドラッグ確定（左上座標）。親が PATCH /knowledge-documents/:id/position。 */
  onDocumentMoved: (id: string, x: number, y: number) => void
  readOnly?: boolean
  /** fit を外部からも呼べるようにする（再レイアウト後など）。任意。 */
  fitSignal?: number
}

export function KnowledgeGraphCanvas({
  nodes,
  relations,
  documents,
  layout,
  mentions = [],
  showDocuments,
  highlightNodeIds,
  highlightDocumentIds,
  isNodeVisible,
  selectedNodeId,
  selectedDocumentId,
  onSelectNode,
  onSelectDocument,
  onNodeMoved,
  onDocumentMoved,
  readOnly = false,
  fitSignal,
}: KnowledgeGraphCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null)

  const [view, setView] = useState<ViewTransform>({ x: 60, y: 60, k: 0.8 })
  const viewRef = useRef(view)
  viewRef.current = view

  // 描画前カリング（viewBox 外を間引く）に使う SVG の実寸。ResizeObserver で追従。
  const [viewport, setViewport] = useState<{ w: number; h: number }>({
    w: 0,
    h: 0,
  })
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const update = () => {
      const r = el.getBoundingClientRect()
      setViewport({ w: r.width, h: r.height })
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ドラッグ中の一時上書き（pointerup で親に確定）。id はノード/文書で一意。
  const [dragPos, setDragPos] = useState<Record<string, Point>>({})
  const dragRef = useRef<{
    id: string
    kind: 'node' | 'doc'
    dx: number
    dy: number
    moved: boolean
  } | null>(null)
  const suppressClickRef = useRef(false)
  const panRef = useRef<{
    sx: number
    sy: number
    vx: number
    vy: number
    moved: boolean
  } | null>(null)

  const nodeVisible = useCallback(
    (n: KnowledgeNode) => (isNodeVisible ? isNodeVisible(n) : true),
    [isNodeVisible],
  )

  const visibleNodes = useMemo(
    () => nodes.filter(nodeVisible),
    [nodes, nodeVisible],
  )
  const visibleNodeIds = useMemo(
    () => new Set(visibleNodes.map((n) => n.id)),
    [visibleNodes],
  )

  // 位置取得（ドラッグ中は上書き、無ければ layout、それも無ければ原点）。
  const nodePos = useCallback(
    (id: string): LayoutPosition =>
      dragPos[id] ?? layout.nodes[id] ?? { x: 0, y: 0 },
    [dragPos, layout],
  )
  const docPos = useCallback(
    (id: string): LayoutPosition =>
      dragPos[id] ?? layout.documents[id] ?? { x: 0, y: 0 },
    [dragPos, layout],
  )

  const screenToWorld = useCallback((clientX: number, clientY: number): Point => {
    const el = svgRef.current
    const v = viewRef.current
    if (!el) return { x: 0, y: 0 }
    const rect = el.getBoundingClientRect()
    return {
      x: (clientX - rect.left - v.x) / v.k,
      y: (clientY - rect.top - v.y) / v.k,
    }
  }, [])

  // ===== wheel: ズーム（Ctrl/ピンチ）/ パン（2本指） =====
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey) {
        const rect = el.getBoundingClientRect()
        const px = e.clientX - rect.left
        const py = e.clientY - rect.top
        setView((v) => {
          const k = clamp(v.k * Math.exp(-e.deltaY * 0.0015), 0.15, 2.5)
          const wx = (px - v.x) / v.k
          const wy = (py - v.y) / v.k
          return { k, x: px - wx * k, y: py - wy * k }
        })
      } else {
        setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }))
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const zoomBy = useCallback((factor: number) => {
    const el = svgRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const px = rect.width / 2
    const py = rect.height / 2
    setView((v) => {
      const k = clamp(v.k * factor, 0.15, 2.5)
      const wx = (px - v.x) / v.k
      const wy = (py - v.y) / v.k
      return { k, x: px - wx * k, y: py - wy * k }
    })
  }, [])

  // ===== fit（全体表示） =====
  const fitView = useCallback(() => {
    const el = svgRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const rects: { x: number; y: number; w: number; h: number }[] = []
    for (const n of visibleNodes) {
      const p = layout.nodes[n.id]
      if (p) rects.push({ x: p.x, y: p.y, w: NODE_W, h: NODE_H })
    }
    if (showDocuments) {
      for (const d of documents) {
        const p = layout.documents[d.id]
        if (p) rects.push({ x: p.x, y: p.y, w: DOC_W, h: DOC_H })
      }
    }
    if (rects.length === 0) {
      setView({ x: rect.width / 2, y: rect.height / 2, k: 0.8 })
      return
    }
    // spread（Math.min(...arr)）は大配列でスタック溢れの恐れがあるため reduce で集約。
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const r of rects) {
      if (r.x < minX) minX = r.x
      if (r.y < minY) minY = r.y
      if (r.x + r.w > maxX) maxX = r.x + r.w
      if (r.y + r.h > maxY) maxY = r.y + r.h
    }
    minX -= 60
    minY -= 60
    maxX += 60
    maxY += 60
    const w = Math.max(maxX - minX, 1)
    const h = Math.max(maxY - minY, 1)
    const k = clamp(Math.min(rect.width / w, rect.height / h), 0.15, 1.25)
    setView({
      k,
      x: (rect.width - w * k) / 2 - minX * k,
      y: (rect.height - h * k) / 2 - minY * k,
    })
  }, [visibleNodes, documents, layout, showDocuments])

  const didInitialFit = useRef(false)
  useEffect(() => {
    if (!didInitialFit.current && nodes.length + documents.length > 0) {
      didInitialFit.current = true
      // レイアウト確定後に fit（次フレーム）。
      const t = setTimeout(fitView, 0)
      return () => clearTimeout(t)
    }
  }, [nodes.length, documents.length, fitView])

  // 外部 fitSignal でも再フィット。
  useEffect(() => {
    if (fitSignal === undefined) return
    fitView()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitSignal])

  // ===== ドラッグ（ノード/文書共通） =====
  const startDrag = useCallback(
    (
      e: ReactPointerEvent<SVGGElement>,
      id: string,
      kind: 'node' | 'doc',
      base: LayoutPosition,
    ) => {
      if (e.button !== 0 || readOnly) return
      e.stopPropagation()
      suppressClickRef.current = false
      const world = screenToWorld(e.clientX, e.clientY)
      dragRef.current = {
        id,
        kind,
        dx: world.x - base.x,
        dy: world.y - base.y,
        moved: false,
      }
      const onMove = (ev: PointerEvent) => {
        const d = dragRef.current
        if (!d) return
        const w = screenToWorld(ev.clientX, ev.clientY)
        d.moved = true
        setDragPos({
          [d.id]: { x: Math.round(w.x - d.dx), y: Math.round(w.y - d.dy) },
        })
      }
      const onUp = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        const d = dragRef.current
        dragRef.current = null
        if (!d) return
        if (d.moved) {
          suppressClickRef.current = true
          const w = screenToWorld(ev.clientX, ev.clientY)
          const fx = Math.round(w.x - d.dx)
          const fy = Math.round(w.y - d.dy)
          if (d.kind === 'node') onNodeMoved(d.id, fx, fy)
          else onDocumentMoved(d.id, fx, fy)
        }
        setDragPos({})
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [readOnly, screenToWorld, onNodeMoved, onDocumentMoved],
  )

  // ===== 背景パン / 背景クリックで選択解除 =====
  const handleBackgroundPointerDown = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      if (e.button !== 0) return
      const v = viewRef.current
      panRef.current = { sx: e.clientX, sy: e.clientY, vx: v.x, vy: v.y, moved: false }
      const onMove = (ev: PointerEvent) => {
        const p = panRef.current
        if (!p) return
        const dx = ev.clientX - p.sx
        const dy = ev.clientY - p.sy
        if (Math.abs(dx) + Math.abs(dy) > 3) p.moved = true
        setView((prev) => ({ ...prev, x: p.vx + dx, y: p.vy + dy }))
      }
      const onUp = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        const p = panRef.current
        panRef.current = null
        if (p && !p.moved) {
          onSelectNode(null)
          onSelectDocument(null)
        }
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [onSelectNode, onSelectDocument],
  )

  const handleNodeClick = useCallback(
    (e: ReactMouseEvent<SVGGElement>, id: string) => {
      e.stopPropagation()
      if (suppressClickRef.current) {
        suppressClickRef.current = false
        return
      }
      onSelectDocument(null)
      onSelectNode(id === selectedNodeId ? null : id)
    },
    [onSelectNode, onSelectDocument, selectedNodeId],
  )

  const handleDocClick = useCallback(
    (e: ReactMouseEvent<SVGGElement>, id: string) => {
      e.stopPropagation()
      if (suppressClickRef.current) {
        suppressClickRef.current = false
        return
      }
      onSelectNode(null)
      onSelectDocument(id === selectedDocumentId ? null : id)
    },
    [onSelectNode, onSelectDocument, selectedDocumentId],
  )

  // ===== エッジ幾何（可視ノード間のみ） =====
  const edgeGeometries = useMemo(() => {
    const result: Array<{
      rel: KnowledgeRelation
      a: Point
      b: Point
      mid: Point
      arrowL: Point
      arrowR: Point
    }> = []
    for (const rel of relations) {
      if (!visibleNodeIds.has(rel.fromNodeId)) continue
      if (!visibleNodeIds.has(rel.toNodeId)) continue
      const sp = nodePos(rel.fromNodeId)
      const tp = nodePos(rel.toNodeId)
      const scx = sp.x + NODE_W / 2
      const scy = sp.y + NODE_H / 2
      const tcx = tp.x + NODE_W / 2
      const tcy = tp.y + NODE_H / 2
      const a = rectAnchor(sp.x, sp.y, NODE_W, NODE_H, tcx, tcy)
      const b = rectAnchor(tp.x, tp.y, NODE_W, NODE_H, scx, scy)
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
      const dir = { x: (b.x - a.x) / len, y: (b.y - a.y) / len }
      const perp = { x: -dir.y, y: dir.x }
      result.push({
        rel,
        a,
        b,
        mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        arrowL: {
          x: b.x - dir.x * 11 + perp.x * 5,
          y: b.y - dir.y * 11 + perp.y * 5,
        },
        arrowR: {
          x: b.x - dir.x * 11 - perp.x * 5,
          y: b.y - dir.y * 11 - perp.y * 5,
        },
      })
    }
    return result
  }, [relations, visibleNodeIds, nodePos])

  // ===== mention 細線（文書↔ノード。文書表示時のみ・可視ノードのみ） =====
  const mentionLines = useMemo(() => {
    if (!showDocuments) return []
    const lines: Array<{ key: string; a: Point; b: Point }> = []
    for (const m of mentions) {
      if (!visibleNodeIds.has(m.nodeId)) continue
      const dp = layout.documents[m.documentId]
      if (!dp) continue
      const np = nodePos(m.nodeId)
      const docCenter = {
        x: dp.x + DOC_W / 2,
        y: dp.y + DOC_H / 2,
      }
      const a = rectAnchor(dp.x, dp.y, DOC_W, DOC_H, np.x + NODE_W / 2, np.y + NODE_H / 2)
      const b = rectAnchor(np.x, np.y, NODE_W, NODE_H, docCenter.x, docCenter.y)
      lines.push({ key: `${m.documentId}-${m.nodeId}`, a, b })
    }
    return lines
  }, [showDocuments, mentions, visibleNodeIds, layout, nodePos])

  const hasHighlight = !!highlightNodeIds && highlightNodeIds.size > 0
  const hasDocHighlight =
    !!highlightDocumentIds && highlightDocumentIds.size > 0

  // ===== 描画前カリング（viewBox 外を間引く） =====
  // 現在の view から「見えているワールド矩形」を求め、外側のノード/文書/エッジを描画しない。
  // ノード半幅ぶんのマージンを足し、出入り際のチラつきを抑える。寸法未取得時はカリングしない。
  const worldViewport = useMemo(() => {
    if (viewport.w === 0 || viewport.h === 0) return null
    const margin = Math.max(NODE_W, NODE_H) + 80
    return {
      minX: -view.x / view.k - margin,
      minY: -view.y / view.k - margin,
      maxX: (viewport.w - view.x) / view.k + margin,
      maxY: (viewport.h - view.y) / view.k + margin,
    }
  }, [viewport, view])

  // ワールド点が見えている矩形内か（カリング不要時は常に true）。
  const inViewport = useCallback(
    (x: number, y: number): boolean => {
      const vp = worldViewport
      if (!vp) return true
      return x >= vp.minX && x <= vp.maxX && y >= vp.minY && y <= vp.maxY
    },
    [worldViewport],
  )

  // 矩形（左上 x,y / w,h）が viewport と交差するか。
  const rectInViewport = useCallback(
    (x: number, y: number, w: number, h: number): boolean => {
      const vp = worldViewport
      if (!vp) return true
      return x + w >= vp.minX && x <= vp.maxX && y + h >= vp.minY && y <= vp.maxY
    },
    [worldViewport],
  )

  // 描画対象のノード/文書（viewBox 外は間引く。ドラッグ中の位置は nodePos に反映済み）。
  const renderNodes = useMemo(
    () =>
      visibleNodes.filter((n) => {
        const p = nodePos(n.id)
        return rectInViewport(p.x, p.y, NODE_W, NODE_H)
      }),
    [visibleNodes, nodePos, rectInViewport],
  )
  const renderDocuments = useMemo(
    () =>
      showDocuments
        ? documents.filter((d) => {
            const p = docPos(d.id)
            return rectInViewport(p.x, p.y, DOC_W, DOC_H)
          })
        : [],
    [showDocuments, documents, docPos, rectInViewport],
  )
  const renderEdges = useMemo(
    () =>
      edgeGeometries.filter(
        ({ a, b }) =>
          inViewport(a.x, a.y) ||
          inViewport(b.x, b.y) ||
          // 両端が外でも線が画面を横切る場合は中点で拾う（近似）。
          inViewport((a.x + b.x) / 2, (a.y + b.y) / 2),
      ),
    [edgeGeometries, inViewport],
  )
  const renderMentionLines = useMemo(
    () =>
      mentionLines.filter(
        (l) =>
          inViewport(l.a.x, l.a.y) ||
          inViewport(l.b.x, l.b.y) ||
          inViewport((l.a.x + l.b.x) / 2, (l.a.y + l.b.y) / 2),
      ),
    [mentionLines, inViewport],
  )

  return (
    <div className="relative h-full w-full overflow-hidden bg-slate-50">
      {/* ツールバー（右上） */}
      <div className="absolute right-3 top-3 z-10 flex gap-1.5">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 bg-white"
          onClick={() => zoomBy(1.2)}
          title="拡大"
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 bg-white"
          onClick={() => zoomBy(1 / 1.2)}
          title="縮小"
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 bg-white"
          onClick={fitView}
          title="全体表示"
        >
          <Maximize2 className="h-4 w-4" />
        </Button>
      </div>

      <svg
        ref={svgRef}
        className="h-full w-full touch-none select-none"
        style={{ cursor: panRef.current ? 'grabbing' : 'default' }}
        onPointerDown={handleBackgroundPointerDown}
      >
        <defs>
          <pattern
            id="kg-dots"
            width={24 * view.k}
            height={24 * view.k}
            patternUnits="userSpaceOnUse"
            patternTransform={`translate(${view.x},${view.y})`}
          >
            <circle cx={1} cy={1} r={1} fill="#cbd5e1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#kg-dots)" />

        <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
          {/* mention 細線（最背面） */}
          {renderMentionLines.map((l) => (
            <line
              key={l.key}
              x1={l.a.x}
              y1={l.a.y}
              x2={l.b.x}
              y2={l.b.y}
              stroke="#cbd5e1"
              strokeWidth={0.75}
              strokeDasharray="3 3"
              pointerEvents="none"
            />
          ))}

          {/* エッジ（relation） */}
          {renderEdges.map(({ rel, a, b, mid, arrowL, arrowR }) => (
            <g key={rel.id}>
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="#94a3b8"
                strokeWidth={1.25}
                pointerEvents="none"
              />
              <polygon
                points={`${b.x},${b.y} ${arrowL.x},${arrowL.y} ${arrowR.x},${arrowR.y}`}
                fill="#94a3b8"
                pointerEvents="none"
              />
              {rel.label && (
                <text
                  x={mid.x}
                  y={mid.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={11}
                  fill="#475569"
                  stroke="#f8fafc"
                  strokeWidth={3}
                  paintOrder="stroke"
                  pointerEvents="none"
                >
                  {rel.label}
                </text>
              )}
            </g>
          ))}

          {/* 文書ノード（角丸矩形。表示トグル時のみ・viewBox 外は間引く） */}
          {showDocuments &&
            renderDocuments.map((doc) => {
              const p = docPos(doc.id)
              const selected = selectedDocumentId === doc.id
              const dimmed =
                hasDocHighlight && !highlightDocumentIds!.has(doc.id)
              return (
                <g
                  key={doc.id}
                  transform={`translate(${p.x},${p.y})`}
                  style={{
                    cursor: readOnly ? 'pointer' : 'grab',
                    opacity: dimmed ? 0.3 : 1,
                  }}
                  onPointerDown={(e) => startDrag(e, doc.id, 'doc', p)}
                  onClick={(e) => handleDocClick(e, doc.id)}
                >
                  <rect
                    width={DOC_W}
                    height={DOC_H}
                    rx={6}
                    fill="#ffffff"
                    stroke={selected ? '#0f172a' : '#cbd5e1'}
                    strokeWidth={selected ? 2 : 1}
                    strokeDasharray="4 3"
                  />
                  <rect width={4} height={DOC_H} rx={2} fill="#64748b" />
                  <text
                    x={12}
                    y={DOC_H / 2}
                    dominantBaseline="middle"
                    fontSize={11}
                    fill="#334155"
                    pointerEvents="none"
                  >
                    {truncate(doc.title, 18)}
                  </text>
                </g>
              )
            })}

          {/* ノード（タグ/実体。viewBox 外は間引く） */}
          {renderNodes.map((n) => {
            const p = nodePos(n.id)
            const color = nodeColor(n)
            const selected = selectedNodeId === n.id
            const dimmed = hasHighlight && !highlightNodeIds!.has(n.id)
            const isTag = n.type === 'TAG'
            return (
              <g
                key={n.id}
                transform={`translate(${p.x},${p.y})`}
                style={{ cursor: readOnly ? 'pointer' : 'grab', opacity: dimmed ? 0.3 : 1 }}
                onPointerDown={(e) => startDrag(e, n.id, 'node', p)}
                onClick={(e) => handleNodeClick(e, n.id)}
              >
                <rect
                  width={NODE_W}
                  height={NODE_H}
                  rx={isTag ? NODE_H / 2 : 10}
                  fill="#ffffff"
                  stroke={color}
                  strokeWidth={selected ? 3 : 1.5}
                />
                {/* 種別バンド（左帯） */}
                <rect
                  width={isTag ? 0 : 6}
                  height={NODE_H}
                  rx={3}
                  fill={color}
                />
                {/* タグは丸ドット、実体は色帯で区別 */}
                {isTag && <circle cx={16} cy={NODE_H / 2} r={5} fill={color} />}
                <text
                  x={isTag ? 30 : 16}
                  y={NODE_H / 2 - 6}
                  dominantBaseline="middle"
                  fontSize={13}
                  fontWeight={600}
                  fill="#0f172a"
                  pointerEvents="none"
                >
                  {truncate(n.label, isTag ? 16 : 17)}
                </text>
                <text
                  x={isTag ? 30 : 16}
                  y={NODE_H / 2 + 12}
                  dominantBaseline="middle"
                  fontSize={10}
                  fill="#94a3b8"
                  pointerEvents="none"
                >
                  {isTag ? 'タグ' : n.entityKind ?? 'OTHER'} · {n.mentionCount}
                </text>
              </g>
            )
          })}
        </g>
      </svg>
    </div>
  )
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s
  return s.slice(0, n - 1) + '…'
}
