'use client';

/**
 * DfdCanvas — データフロー図（DFD）を SEC帳票風＋色付きで描画する React Flow キャンバス。
 *
 * SwimlaneCanvas.tsx をミラー（nodeTypes / useNodesState+onNodesChange / toPng / ドラッグ保存）。
 *   - nodeTypes: function=楕円(navy枠/番号+label), external=四角(slate), datastore=開いた四角「=」(emerald)。
 *   - edgeTypes: ラベル付き矢印（dataItem ＋ 情報種別チップ）。
 *   - 破線楕円のシステム境界（背景レイヤ）＋凡例パネル＋帳票ヘッダ/フッタ。
 *   - ノードドラッグ → onSavePositions（左上座標を positionX/Y で保存）。
 *   - onConnect → onAddFlow（dataItem は仮入力 → 後で編集）。
 *   - ツールバー: 外部実体追加 / データストア追加 / 再生成 / PNG出力(toPng)。
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
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  Panel,
  Handle,
  Position,
  MarkerType,
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  getBezierPath,
  getStraightPath,
  useReactFlow,
  useNodesState,
  ConnectionMode,
  type Node,
  type Edge,
  type EdgeProps,
  type Connection,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { createPortal } from 'react-dom';
import { toPng } from 'html-to-image';
import {
  Plus,
  Trash2,
  Download,
  RotateCw,
  Square,
  Database,
  Circle,
  FileText,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  assignFunctionNumbers,
  informationTypeApi,
  INFORMATION_CATEGORY_LABELS,
  type DfdDiagram,
  type DfdNode as DfdNodeModel,
  type DfdFlow as DfdFlowModel,
  type DfdNodeKind,
  type InformationType,
  type InformationTypeAttachment,
} from '@/lib/dfd';

// 色（navy / blue / emerald / slate）
const NAVY = '#050f3e';
const BLUE = '#2563eb';
const EMERALD = '#10b981';
const SLATE = '#475569';

// ノードの描画サイズ（自由配置のシード/保存と一致させる）
const NODE_W = 168;
const NODE_H = 76;

export interface DfdCanvasProps {
  diagram: DfdDiagram;
  /** ノード差分更新（ラベル/番号/位置/種別）。 */
  onUpdateNode?: (id: string, patch: Partial<DfdNodeModel>) => void | Promise<void>;
  /** ノード追加（外部実体/データストア）。 */
  onAddNode?: (body: Partial<DfdNodeModel> & { kind: DfdNodeKind; label: string }) => void | Promise<void>;
  onDeleteNode?: (id: string) => void | Promise<void>;
  /**
   * データフロー追加（接続）。
   * ドラッグで使ったハンドル側（'top'|'right'|'bottom'|'left'）を
   * sourceHandle/targetHandle として渡す。呼び出し側は create body に含める。
   */
  onAddFlow?: (body: {
    sourceNodeId: string;
    targetNodeId: string;
    dataItem: string;
    sourceHandle?: string | null;
    targetHandle?: string | null;
  }) => void | Promise<void>;
  onUpdateFlow?: (id: string, patch: Partial<DfdFlowModel>) => void | Promise<void>;
  /**
   * 既存データフローの端点をドラッグで付け替える（再ルーティング）。
   * React Flow v12 の onReconnect から呼ばれ、新しい source/target ノードとハンドル側を渡す。
   * 呼び出し側は PATCH /api/dfd-flows/:id で永続化する。
   */
  onReconnectFlow?: (
    flowId: string,
    next: {
      sourceNodeId: string;
      targetNodeId: string;
      sourceHandle?: string | null;
      targetHandle?: string | null;
    },
  ) => void | Promise<void>;
  onDeleteFlow?: (id: string) => void | Promise<void>;
  /** ノード位置の一括保存（ドラッグ完了で呼ぶ）。 */
  onSavePositions?: (positions: { id: string; positionX: number; positionY: number }[]) => void | Promise<void>;
  /** 再生成（第2: そのフローから／第1: プロジェクトから）。 */
  onRegenerate?: () => void | Promise<void>;
  /** FUNCTIONノードのドリルダウン（第1→第2）。refFlowId が無いノードでは出さない。 */
  onFunctionOpen?: (refFlowId: string) => void;
  /** プロジェクトの情報種別一覧（エッジの情報チップ名・セレクタに使用）。 */
  informationTypes?: InformationType[];
}

// ===========================================
// ノードの見た目（3種）
// ===========================================

type DfdNodeData = {
  kind: DfdNodeKind;
  label: string;
  number: string | null;
  hasRefFlow: boolean;
};

// 4辺の接続ハンドル定義。ConnectionMode.Loose 下では各ハンドルが source/target 両用。
// id は安定値（'top'|'right'|'bottom'|'left'）で、保存された接続側の復元に使う。
const HANDLE_SIDES: Array<{ id: string; position: Position }> = [
  { id: 'top', position: Position.Top },
  { id: 'right', position: Position.Right },
  { id: 'bottom', position: Position.Bottom },
  { id: 'left', position: Position.Left },
];

/**
 * 4辺の接続ハンドル（source/target 兼用）。
 * - source/target を同位置に重ね、見た目は source 側のドットのみ表示する。
 * - ノード本体のドラッグを邪魔しないよう nodrag を付与。
 * - 矢印を任意の辺へ付け替え／任意の辺から接続できるようにする。
 */
function SideHandles({ color }: { color: string }) {
  return (
    <>
      {HANDLE_SIDES.map((h) => (
        <Handle
          key={`s-${h.id}`}
          type="source"
          id={h.id}
          position={h.position}
          className="nodrag !w-2 !h-2 !min-w-0 !min-h-0 !border !border-white opacity-50 transition-opacity"
          style={{ backgroundColor: color }}
        />
      ))}
      {HANDLE_SIDES.map((h) => (
        <Handle
          key={`t-${h.id}`}
          type="target"
          id={h.id}
          position={h.position}
          className="nodrag !w-2 !h-2 !min-w-0 !min-h-0 !bg-transparent !border-0"
        />
      ))}
    </>
  );
}

/** FUNCTION = 楕円（navy枠 / 番号＋label）。 */
function FunctionNode({ data, selected }: { data: DfdNodeData; selected?: boolean }) {
  return (
    <div
      className="group/node w-full h-full flex flex-col items-center justify-center text-center px-3 transition-all"
      style={{
        borderRadius: '50%',
        border: `2.5px solid ${NAVY}`,
        backgroundColor: '#eff3ff',
        color: NAVY,
        boxShadow: selected ? `0 0 0 3px ${BLUE}55` : '0 1px 2px rgba(0,0,0,0.06)',
      }}
    >
      <SideHandles color="#94a3b8" />
      {data.number && (
        <div className="text-[11px] font-bold leading-none mb-0.5" style={{ color: BLUE }}>
          {data.number}
        </div>
      )}
      <div className="font-semibold text-[13px] leading-tight line-clamp-2">{data.label}</div>
    </div>
  );
}

/** EXTERNAL_ENTITY = 四角（slate）。 */
function ExternalNode({ data, selected }: { data: DfdNodeData; selected?: boolean }) {
  return (
    <div
      className="group/node w-full h-full flex items-center justify-center text-center px-3 rounded-sm transition-all"
      style={{
        border: `2.5px solid ${SLATE}`,
        backgroundColor: '#f1f5f9',
        color: '#1e293b',
        boxShadow: selected ? `0 0 0 3px ${BLUE}55` : '0 1px 2px rgba(0,0,0,0.06)',
      }}
    >
      <SideHandles color="#94a3b8" />
      <div className="font-medium text-[13px] leading-tight line-clamp-2">{data.label}</div>
    </div>
  );
}

/** DATA_STORE = 開いた四角「=」（上下に線, emerald）。 */
function DataStoreNode({ data, selected }: { data: DfdNodeData; selected?: boolean }) {
  return (
    <div
      className="group/node w-full h-full flex items-center justify-center text-center px-3 transition-all"
      style={{
        borderTop: `2.5px solid ${EMERALD}`,
        borderBottom: `2.5px solid ${EMERALD}`,
        backgroundColor: '#ecfdf5',
        color: '#065f46',
        boxShadow: selected ? `0 0 0 3px ${BLUE}55` : 'none',
      }}
    >
      <SideHandles color="#34d399" />
      <div className="font-medium text-[13px] leading-tight line-clamp-2">{data.label}</div>
    </div>
  );
}

/** システム境界（破線楕円, 背景レイヤ）。 */
function BoundaryNode({ data }: { data: { label: string } }) {
  return (
    <div
      className="w-full h-full pointer-events-none"
      style={{
        borderRadius: '50%',
        border: `2px dashed ${BLUE}66`,
        backgroundColor: `${BLUE}08`,
      }}
    >
      <div
        className="absolute left-1/2 top-2 -translate-x-1/2 text-[11px] font-semibold px-2 py-0.5 rounded"
        style={{ color: BLUE, backgroundColor: '#ffffffcc' }}
      >
        {data.label}
      </div>
    </div>
  );
}

const nodeTypes = {
  function: FunctionNode,
  external: ExternalNode,
  datastore: DataStoreNode,
  boundary: BoundaryNode,
};

// ===========================================
// エッジ（データフロー矢印 + dataItem + 帳票チップ）
// ===========================================

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

function DataFlowEdge({
  id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, label, markerEnd, selected, data,
}: EdgeProps & {
  data?: {
    informationName?: string | null;
    informationCategoryLabel?: string | null;
    informationAttachmentCount?: number;
    onLabelUpdate?: (id: string, label: string) => void;
    /** ラベル/チップなど線以外の部分をクリックしても矢印を選択できるようにする。 */
    onSelect?: (edgeId: string) => void;
    /** 線の形状（smoothstep|bezier|straight）。 */
    pathStyle?: string | null;
    /** データ項目ラベル・情報チップのパス上位置（0〜1）。 */
    labelT?: number | null;
    infoT?: number | null;
    /** ラベル/チップをパスに沿って移動した時に割合 t を保存する。 */
    onMoveLabel?: (edgeId: string, t: number) => void;
    onMoveInfo?: (edgeId: string, t: number) => void;
    /** 矢印の先端（終点）をドラッグして別ノードへ付け替える。ドロップ先ノードIDを渡す。 */
    onReconnectTarget?: (edgeId: string, newTargetNodeId: string) => void;
    /** 先端をノードから離れた場所にドロップした時、矢印自体を削除する。 */
    onDeleteSelf?: (edgeId: string) => void;
  };
}) {
  const rf = useReactFlow();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState((label as string) || '');
  // 先端ドラッグ（付け替え/削除）用: 開始点(screen)とカーソル位置を保持してゴースト線を描く。
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  // ラベル/チップをパスに沿って移動中の live な割合（props 反映まで保つ）。
  const [liveLabelT, setLiveLabelT] = useState<number | null>(null);
  const [liveInfoT, setLiveInfoT] = useState<number | null>(null);
  // クリックとドラッグを区別（移動したら直後の click 選択を抑止）。
  const movedRef = useRef(false);

  const onReconnectTarget = data?.onReconnectTarget;
  const onDeleteSelf = data?.onDeleteSelf;
  const onMoveLabel = data?.onMoveLabel;
  const onMoveInfo = data?.onMoveInfo;

  // 形状に応じてパスを生成（既定は角ばった smoothstep）。
  const pathParams = { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition };
  let edgePath: string;
  let labelX: number;
  let labelY: number;
  if (data?.pathStyle === 'bezier') {
    [edgePath, labelX, labelY] = getBezierPath(pathParams);
  } else if (data?.pathStyle === 'straight') {
    [edgePath, labelX, labelY] = getStraightPath({ sourceX, sourceY, targetX, targetY });
  } else {
    [edgePath, labelX, labelY] = getSmoothStepPath(pathParams);
  }

  // パス上の任意割合 t の座標を出す（detached path の getPointAtLength）。
  const measure = useMemo(() => {
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', edgePath);
    let len = 0;
    try { len = p.getTotalLength(); } catch { len = 0; }
    return { p, len };
  }, [edgePath]);
  const pointAt = useCallback(
    (t: number) => {
      try {
        const pt = measure.p.getPointAtLength(clamp01(t) * measure.len);
        return { x: pt.x, y: pt.y };
      } catch {
        return { x: labelX, y: labelY };
      }
    },
    [measure, labelX, labelY],
  );
  const nearestT = useCallback(
    (fx: number, fy: number) => {
      if (!measure.len) return 0.5;
      let best = 0.5;
      let bd = Infinity;
      for (let i = 0; i <= 48; i++) {
        const t = i / 48;
        let pt: DOMPoint;
        try { pt = measure.p.getPointAtLength(t * measure.len); } catch { continue; }
        const d = (pt.x - fx) ** 2 + (pt.y - fy) ** 2;
        if (d < bd) { bd = d; best = t; }
      }
      return best;
    },
    [measure],
  );

  // ラベル/チップをパスに沿ってドラッグ。移動したら割合 t を計算して保存。
  const startAlongDrag = useCallback(
    (
      e: ReactPointerEvent,
      setLive: (t: number) => void,
      persist?: (edgeId: string, t: number) => void,
    ) => {
      if (!persist) return;
      e.stopPropagation();
      const sx = e.clientX;
      const sy = e.clientY;
      movedRef.current = false;
      const move = (ev: PointerEvent) => {
        if (!movedRef.current && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
        movedRef.current = true;
        const flow = rf.screenToFlowPosition({ x: ev.clientX, y: ev.clientY });
        setLive(clamp01(nearestT(flow.x, flow.y)));
      };
      const up = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        if (movedRef.current) {
          const flow = rf.screenToFlowPosition({ x: ev.clientX, y: ev.clientY });
          const t = clamp01(nearestT(flow.x, flow.y));
          setLive(t);
          persist(id, t);
        }
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    },
    [rf, nearestT, id],
  );

  // 先端アンカーのドラッグ: ノードにドロップ=付け替え / 何もない所=削除。
  const onTargetAnchorDown = useCallback(
    (e: ReactPointerEvent) => {
      if (!onReconnectTarget && !onDeleteSelf) return;
      e.stopPropagation();
      e.preventDefault();
      const sx = e.clientX;
      const sy = e.clientY;
      let moved = false;
      dragStartRef.current = { x: sx, y: sy };
      setDragPos({ x: sx, y: sy });
      const move = (ev: PointerEvent) => {
        if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) >= 6) moved = true;
        setDragPos({ x: ev.clientX, y: ev.clientY });
      };
      const up = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        setDragPos(null);
        dragStartRef.current = null;
        if (!moved) return; // ただのクリックは無視（誤削除/誤付け替え防止）
        const el = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
        const nodeEl = el?.closest('.react-flow__node') as HTMLElement | null;
        const newId = nodeEl?.getAttribute('data-id');
        if (newId && onReconnectTarget) onReconnectTarget(id, newId);
        else if (onDeleteSelf) onDeleteSelf(id);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    },
    [onReconnectTarget, onDeleteSelf, id],
  );

  const dragging = dragPos !== null;
  const commit = () => {
    setEditing(false);
    if (data?.onLabelUpdate && value !== label) data.onLabelUpdate(id, value);
  };
  const handleSelectClick = (e: ReactMouseEvent) => {
    e.stopPropagation();
    if (movedRef.current) { movedRef.current = false; return; } // 直前がドラッグなら選択しない
    data?.onSelect?.(id);
  };

  const labelPt = pointAt(liveLabelT ?? data?.labelT ?? 0.5);
  const infoPt = pointAt(liveInfoT ?? data?.infoT ?? 0.5);

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        // 線が細くても掴みやすいよう、クリック判定の帯を広く取る（どこを押しても選択可能に）。
        interactionWidth={34}
        style={{ strokeWidth: selected ? 3 : 2, stroke: selected ? BLUE : SLATE }}
      />
      <EdgeLabelRenderer>
        {/* 運ぶ情報種別のチップ: パス上 infoT の位置。ドラッグでパスに沿って移動、クリックで選択。 */}
        {data?.informationName && (
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%,-50%) translate(${infoPt.x}px,${infoPt.y - 26}px)`,
              pointerEvents: 'all',
            }}
            className={`nodrag nopan ${onMoveInfo ? 'cursor-move' : 'cursor-pointer'}`}
            onPointerDown={(e) => startAlongDrag(e, (t) => setLiveInfoT(t), onMoveInfo)}
            onClick={handleSelectClick}
            title="ドラッグで矢印に沿って移動 / クリックで選択"
          >
            <span
              className={`inline-flex items-center gap-0.5 text-[10px] text-emerald-700 bg-emerald-50 border rounded px-1 shadow-sm ${
                selected ? 'border-emerald-400' : 'border-emerald-200'
              }`}
            >
              <FileText className="w-2.5 h-2.5" />
              {data.informationCategoryLabel && (
                <span className="text-emerald-600/80">[{data.informationCategoryLabel}]</span>
              )}
              <span className="max-w-[80px] truncate">{data.informationName}</span>
              {(data.informationAttachmentCount ?? 0) > 0 && <span>📎{data.informationAttachmentCount}</span>}
            </span>
          </div>
        )}
        {/* データ項目ラベル: パス上 labelT の位置。ドラッグでパスに沿って移動、クリックで選択、Wクリックで編集。 */}
        <div
          style={{ position: 'absolute', transform: `translate(-50%,-50%) translate(${labelPt.x}px,${labelPt.y}px)`, pointerEvents: 'all' }}
          className={`nodrag nopan ${onMoveLabel ? 'cursor-move' : ''}`}
          onPointerDown={(e) => { if (!editing) startAlongDrag(e, (t) => setLiveLabelT(t), onMoveLabel); }}
        >
          {editing ? (
            <input
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit();
                if (e.key === 'Escape') { setValue((label as string) || ''); setEditing(false); }
              }}
              className="w-28 h-6 text-xs text-center border border-gray-300 rounded bg-white"
            />
          ) : (
            <div
              onClick={handleSelectClick}
              onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}
              className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-white border rounded shadow-sm hover:bg-blue-50 ${
                selected ? 'border-blue-500' : 'border-gray-300'
              }`}
              title="ドラッグで移動 / クリックで選択 / ダブルクリックでデータ項目を編集"
            >
              <span className="max-w-[140px] truncate text-gray-800">{(label as string) || '（データ項目）'}</span>
            </div>
          )}
        </div>
        {/* 矢印の先端（終点）をドラッグ: ノードへドロップ=付け替え / 何もない所=削除。
            選択中の矢印だけに出す（未選択ノードの接続ハンドルを塞がないため）。 */}
        {(onReconnectTarget || onDeleteSelf) && (selected || dragging) && (
          <div
            className={`nodrag nopan flex items-center justify-center ${
              dragging ? 'cursor-grabbing' : 'cursor-grab'
            }`}
            title="ドラッグ: ノードへ=付け替え / 何もない所へ=削除"
            onPointerDown={onTargetAnchorDown}
            style={{
              position: 'absolute',
              transform: `translate(-50%,-50%) translate(${targetX}px,${targetY}px)`,
              pointerEvents: 'all',
              width: 22,
              height: 22,
            }}
          >
            <span
              className={`block rounded-full ring-2 transition-all ${
                dragging
                  ? 'h-3.5 w-3.5 bg-blue-500 ring-blue-300'
                  : 'h-3 w-3 bg-blue-500/80 ring-blue-200'
              }`}
            />
          </div>
        )}
      </EdgeLabelRenderer>
      {/* ドラッグ中のゴースト線（接続先選択の視覚フィードバック）。最前面・イベント透過。 */}
      {dragging &&
        dragStartRef.current &&
        dragPos &&
        createPortal(
          <svg
            style={{
              position: 'fixed',
              inset: 0,
              width: '100vw',
              height: '100vh',
              pointerEvents: 'none',
              zIndex: 9999,
            }}
          >
            <line
              x1={dragStartRef.current.x}
              y1={dragStartRef.current.y}
              x2={dragPos.x}
              y2={dragPos.y}
              stroke={BLUE}
              strokeWidth={2}
              strokeDasharray="5 4"
            />
            <circle cx={dragPos.x} cy={dragPos.y} r={5} fill={BLUE} />
          </svg>,
          document.body,
        )}
    </>
  );
}

const edgeTypes = { dataflow: DataFlowEdge };

// ===========================================
// メイン
// ===========================================

const KIND_TO_TYPE: Record<DfdNodeKind, string> = {
  FUNCTION: 'function',
  EXTERNAL_ENTITY: 'external',
  DATA_STORE: 'datastore',
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

function DfdCanvasInner(props: DfdCanvasProps) {
  const { diagram } = props;
  const { fitView } = useReactFlow();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  // 全画面トグル（fixed inset-0 z-50 オーバーレイ）。Esc で解除。
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Esc で全画面解除。
  useEffect(() => {
    if (!isFullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isFullscreen]);

  // 全画面切替の前後でビューを合わせ直す（拡大/縮小どちらでも fitView）。
  useEffect(() => {
    const t = setTimeout(() => fitView({ padding: 0.25, duration: 300 }), 120);
    return () => clearTimeout(t);
  }, [isFullscreen, fitView]);

  // FUNCTION の採番を反映（既存 number は保持）
  const numberedNodes = useMemo(() => assignFunctionNumbers(diagram.nodes, 1), [diagram.nodes]);

  const informationTypeById = useMemo(
    () => new Map((props.informationTypes ?? []).map((it) => [it.id, it] as const)),
    [props.informationTypes],
  );

  // システム境界（FUNCTION/DATA_STORE を囲む破線楕円, 背景）
  const boundaryNode = useMemo<Node | null>(() => {
    const inside = numberedNodes.filter((n) => n.kind === 'FUNCTION' || n.kind === 'DATA_STORE');
    if (inside.length === 0) return null;
    const minX = Math.min(...inside.map((n) => n.positionX));
    const minY = Math.min(...inside.map((n) => n.positionY));
    const maxX = Math.max(...inside.map((n) => n.positionX + NODE_W));
    const maxY = Math.max(...inside.map((n) => n.positionY + NODE_H));
    const pad = 60;
    return {
      id: 'dfd-boundary',
      type: 'boundary',
      position: { x: minX - pad, y: minY - pad },
      data: { label: 'システム境界' },
      draggable: false,
      selectable: false,
      connectable: false,
      zIndex: 0,
      width: maxX - minX + pad * 2,
      height: maxY - minY + pad * 2,
      // 背景レイヤ（システム境界）はクリックを奪わない（下層のエッジ線を選択できるように）。
      // SwimlaneCanvas のレーン背景バグ修正（commit ca040e4）と同じ対処。
      style: { width: maxX - minX + pad * 2, height: maxY - minY + pad * 2, pointerEvents: 'none' },
    } as Node;
  }, [numberedNodes]);

  // React Flow ノード
  const rfNodes: Node[] = useMemo(() => {
    const content: Node[] = numberedNodes.map((n) => ({
      id: n.id,
      type: KIND_TO_TYPE[n.kind],
      position: { x: n.positionX, y: n.positionY },
      data: {
        kind: n.kind,
        label: n.label,
        number: n.number,
        hasRefFlow: !!n.refFlowId,
      } as DfdNodeData,
      width: NODE_W,
      height: NODE_H,
      style: { width: NODE_W, height: NODE_H },
      draggable: true,
      zIndex: 1,
    } as Node));
    return boundaryNode ? [boundaryNode, ...content] : content;
  }, [numberedNodes, boundaryNode]);

  const [dragNodes, setDragNodes, onNodesChange] = useNodesState(rfNodes);
  useEffect(() => {
    setDragNodes(rfNodes);
  }, [rfNodes, setDragNodes]);

  const rfEdges: Edge[] = useMemo(
    () =>
      diagram.flows.map((f) => {
        const it = f.informationTypeId ? informationTypeById.get(f.informationTypeId) : undefined;
        return {
          id: f.id,
          source: f.sourceNodeId,
          target: f.targetNodeId,
          // 保存された接続側（辺）を描画に反映する。未保存(null/undefined)なら
          // React Flow が向き既定（Loose）でハンドルを自動選択する。
          sourceHandle: f.sourceHandle ?? undefined,
          targetHandle: f.targetHandle ?? undefined,
          label: f.dataItem,
          type: 'dataflow',
          selected: f.id === selectedEdgeId,
          // 端点ドラッグで付け替え可能にする（onReconnect が発火する）。
          reconnectable: !!props.onReconnectFlow,
          markerEnd: { type: MarkerType.ArrowClosed, color: f.id === selectedEdgeId ? BLUE : SLATE, width: 18, height: 18 },
          data: {
            informationName: f.informationTypeId ? (it?.name ?? '情報') : null,
            informationCategoryLabel: it ? INFORMATION_CATEGORY_LABELS[it.category] : null,
            informationAttachmentCount: it?.attachmentCount ?? 0,
            onLabelUpdate: (id: string, label: string) => props.onUpdateFlow?.(id, { dataItem: label }),
            // 線以外（ラベル/チップ）をクリックしても選択できるように。
            onSelect: (eid: string) => { setSelectedEdgeId(eid); setSelectedNodeId(null); },
            // 線の形状・ラベル/チップのパス上位置。
            pathStyle: f.pathStyle ?? null,
            labelT: f.labelT ?? null,
            infoT: f.infoT ?? null,
            // ラベル/チップをパスに沿って移動 → 割合 t を保存。
            onMoveLabel: props.onUpdateFlow
              ? (flowId: string, t: number) => props.onUpdateFlow?.(flowId, { labelT: t })
              : undefined,
            onMoveInfo: props.onUpdateFlow
              ? (flowId: string, t: number) => props.onUpdateFlow?.(flowId, { infoT: t })
              : undefined,
            // 先端ドラッグでの付け替え（ドロップ先ノードへ target を変更）。
            onReconnectTarget: props.onReconnectFlow
              ? (flowId: string, newTargetNodeId: string) => {
                  const cur = diagram.flows.find((x) => x.id === flowId);
                  if (!cur || newTargetNodeId === cur.sourceNodeId) return;
                  void props.onReconnectFlow?.(flowId, {
                    sourceNodeId: cur.sourceNodeId,
                    targetNodeId: newTargetNodeId,
                    sourceHandle: cur.sourceHandle ?? null,
                    targetHandle: cur.targetHandle ?? null,
                  });
                }
              : undefined,
            // 先端を何もない所へドロップ → 矢印を削除。
            onDeleteSelf: props.onDeleteFlow
              ? (flowId: string) => {
                  void props.onDeleteFlow?.(flowId);
                  if (selectedEdgeId === flowId) setSelectedEdgeId(null);
                }
              : undefined,
          },
        };
      }),
    [diagram.flows, selectedEdgeId, informationTypeById, props],
  );

  useEffect(() => {
    const t = setTimeout(() => fitView({ padding: 0.25, duration: 300 }), 60);
    return () => clearTimeout(t);
  }, [fitView, diagram.id]);

  const onConnect = useCallback(
    (c: Connection) => {
      if (c.source && c.target && c.source !== c.target) {
        // ドラッグで使った辺（ハンドル）を保存する。
        void props.onAddFlow?.({
          sourceNodeId: c.source,
          targetNodeId: c.target,
          dataItem: '情報',
          sourceHandle: c.sourceHandle ?? null,
          targetHandle: c.targetHandle ?? null,
        });
      }
    },
    [props],
  );

  // --- エッジ端点ドラッグで付け替え（再ルーティング） ---
  // React Flow v12 の onReconnect(oldEdge, newConnection)。
  // 新しい source/target ノードとハンドル側を PATCH で永続化する（呼び出し側に委譲）。
  const onReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      if (!newConnection.source || !newConnection.target) return;
      if (newConnection.source === newConnection.target) return;
      void props.onReconnectFlow?.(oldEdge.id, {
        sourceNodeId: newConnection.source,
        targetNodeId: newConnection.target,
        sourceHandle: newConnection.sourceHandle ?? null,
        targetHandle: newConnection.targetHandle ?? null,
      });
    },
    [props],
  );

  // ドラッグ停止 → 左上座標を保存
  const handleNodeDragStop = useCallback(
    (_evt: unknown, node: Node) => {
      if (node.type === 'boundary') return;
      void props.onSavePositions?.([
        { id: node.id, positionX: node.position.x, positionY: node.position.y },
      ]);
    },
    [props],
  );

  // PNG 出力（帳票全体を画像化）
  const handleExportPng = useCallback(() => {
    const root = wrapperRef.current;
    if (!root) return;
    toPng(root, {
      backgroundColor: '#ffffff',
      cacheBust: true,
      pixelRatio: 2,
      filter: (el) => {
        if (!(el instanceof HTMLElement)) return true;
        return !(
          el.classList?.contains('react-flow__minimap') ||
          el.classList?.contains('react-flow__controls')
        );
      },
    })
      .then((dataUrl) => {
        const a = document.createElement('a');
        a.download = (diagram.title || 'dfd') + '.png';
        a.href = dataUrl;
        a.click();
      })
      .catch(() => {
        /* 画像化失敗は致命ではない */
      });
  }, [diagram.title]);

  const handleAddExternal = useCallback(() => {
    void props.onAddNode?.({ kind: 'EXTERNAL_ENTITY', label: '外部実体', positionX: 40, positionY: 40 });
  }, [props]);

  const handleAddDataStore = useCallback(() => {
    void props.onAddNode?.({ kind: 'DATA_STORE', label: 'データストア', positionX: 40, positionY: 160 });
  }, [props]);

  const selectedNode = useMemo(
    () => numberedNodes.find((n) => n.id === selectedNodeId) ?? null,
    [numberedNodes, selectedNodeId],
  );

  const selectedFlow = useMemo(
    () => diagram.flows.find((f) => f.id === selectedEdgeId) ?? null,
    [diagram.flows, selectedEdgeId],
  );

  // 選択中エッジの情報種別に紐づく具体帳票（クリックでDL）
  const [edgeAttachments, setEdgeAttachments] = useState<InformationTypeAttachment[]>([]);
  useEffect(() => {
    const itId = selectedFlow?.informationTypeId;
    if (!itId) {
      setEdgeAttachments([]);
      return;
    }
    let cancelled = false;
    void informationTypeApi
      .listAttachments(itId)
      .then((list) => {
        if (!cancelled) setEdgeAttachments(list);
      })
      .catch(() => {
        if (!cancelled) setEdgeAttachments([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedFlow?.informationTypeId]);

  return (
    <div
      ref={wrapperRef}
      className={`relative bg-white ${isFullscreen ? 'fixed inset-0 z-50 w-screen h-screen' : 'w-full h-full'}`}
    >
      {/* 帳票ヘッダ */}
      <div className="border-b-2 px-4 py-2 flex items-center justify-between gap-4" style={{ borderColor: NAVY }}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[11px] font-bold tracking-widest px-1.5 py-0.5 rounded" style={{ backgroundColor: NAVY, color: '#fff' }}>
            DFD
          </span>
          <h2 className="text-sm font-bold truncate" style={{ color: NAVY }}>
            {diagram.title || 'データフロー図'}
          </h2>
        </div>
        <dl className="hidden md:grid grid-cols-5 gap-x-3 gap-y-0.5 text-[10px] text-gray-600 shrink-0">
          <div className="flex flex-col"><dt className="text-gray-400">文書番号</dt><dd className="font-medium">{diagram.docId || '—'}</dd></div>
          <div className="flex flex-col"><dt className="text-gray-400">作成日付</dt><dd className="font-medium">{fmtDate(diagram.updatedAt)}</dd></div>
          <div className="flex flex-col"><dt className="text-gray-400">更新日付</dt><dd className="font-medium">{fmtDate(diagram.updatedAt)}</dd></div>
          <div className="flex flex-col"><dt className="text-gray-400">作成者</dt><dd className="font-medium">{diagram.authorName || '—'}</dd></div>
          <div className="flex flex-col"><dt className="text-gray-400">承認者</dt><dd className="font-medium">{diagram.approverName || '—'}</dd></div>
        </dl>
      </div>

      {/* キャンバス */}
      <div className="relative w-full" style={{ height: 'calc(100% - 76px)' }}>
        <ReactFlow
          nodes={dragNodes}
          edges={rfEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onConnect={onConnect}
          onReconnect={onReconnect}
          onNodesChange={onNodesChange}
          nodesDraggable
          nodesConnectable
          elementsSelectable
          connectionMode={ConnectionMode.Loose}
          minZoom={0.2}
          maxZoom={2}
          fitView
          fitViewOptions={{ padding: 0.25 }}
          // 2本指スクロール=パン（移動）。ズームはピンチ（zoomOnPinch 既定true）と +/- コントロールで。
          panOnScroll
          zoomOnScroll={false}
          proOptions={{ hideAttribution: true }}
          onNodeDragStop={handleNodeDragStop}
          onPaneClick={() => { setSelectedEdgeId(null); setSelectedNodeId(null); }}
          onEdgeClick={(_, edge) => { setSelectedEdgeId(edge.id); setSelectedNodeId(null); }}
          onNodeClick={(_, node) => { if (node.type !== 'boundary') { setSelectedNodeId(node.id); setSelectedEdgeId(null); } }}
          onNodeDoubleClick={(_, node) => {
            const src = numberedNodes.find((n) => n.id === node.id);
            if (src?.kind === 'FUNCTION' && src.refFlowId && props.onFunctionOpen) {
              props.onFunctionOpen(src.refFlowId);
            }
          }}
          className="bg-gray-50"
        >
          <Background color="#e2e8f0" gap={22} />
          <Controls className="bg-white border border-gray-200 rounded-lg shadow-sm" />
          <MiniMap
            className="bg-white border border-gray-200 rounded-lg shadow-sm"
            nodeColor={(n) => {
              if (n.type === 'function') return '#93c5fd';
              if (n.type === 'datastore') return '#6ee7b7';
              if (n.type === 'external') return '#cbd5e1';
              return 'transparent';
            }}
            maskColor="rgba(0,0,0,0.04)"
          />

          {/* ツールバー（右上） */}
          <Panel position="top-right" className="bg-white border border-gray-200 rounded-lg shadow-sm p-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <Button variant="outline" size="sm" onClick={handleAddExternal} disabled={!props.onAddNode} className="text-gray-700" title="外部実体（四角）を追加">
                <Square className="w-4 h-4 mr-1" />外部実体
              </Button>
              <Button variant="outline" size="sm" onClick={handleAddDataStore} disabled={!props.onAddNode} className="text-gray-700" title="データストア（開いた四角）を追加">
                <Database className="w-4 h-4 mr-1" />データストア
              </Button>
              <Button variant="outline" size="sm" onClick={() => props.onRegenerate?.()} disabled={!props.onRegenerate} className="text-gray-700" title="業務フローからFUNCTIONを再生成（手動追加・位置は保持）">
                <RotateCw className="w-4 h-4 mr-1" />再生成
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportPng} className="text-gray-700" title="この図をPNG画像で保存">
                <Download className="w-4 h-4 mr-1" />PNG出力
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsFullscreen((v) => !v)}
                className="text-gray-700"
                title={isFullscreen ? '全画面を終了（Esc）' : '全画面表示'}
              >
                {isFullscreen ? <Minimize2 className="w-4 h-4 mr-1" /> : <Maximize2 className="w-4 h-4 mr-1" />}
                {isFullscreen ? '縮小' : '全画面'}
              </Button>
            </div>
          </Panel>

          {/* 凡例（左下） */}
          <Panel position="bottom-left" className="bg-white/95 border border-gray-200 rounded-lg shadow-sm p-2">
            <div className="flex flex-col gap-1 text-[11px] text-gray-600">
              <div className="flex items-center gap-1.5">
                <Circle className="w-3.5 h-3.5" style={{ color: NAVY }} />
                <span>処理（プロセス）</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Square className="w-3.5 h-3.5" style={{ color: SLATE }} />
                <span>外部実体（源泉/吸収）</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5" style={{ color: EMERALD }} />
                <span>データストア</span>
              </div>
            </div>
          </Panel>
        </ReactFlow>

        {/* 選択ノードの簡易編集 + 削除 */}
        {selectedNode && (
          <div className="absolute top-3 left-3 z-20 bg-white border border-gray-200 rounded-lg shadow-md p-3 w-64 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-gray-500">
                {selectedNode.kind === 'FUNCTION' ? '処理' : selectedNode.kind === 'EXTERNAL_ENTITY' ? '外部実体' : 'データストア'}
              </span>
              <button
                type="button"
                onClick={() => { void props.onDeleteNode?.(selectedNode.id); setSelectedNodeId(null); }}
                disabled={!props.onDeleteNode}
                className="inline-flex items-center gap-1 text-[11px] text-red-600 hover:text-red-700 disabled:opacity-40"
                title="このノードを削除"
              >
                <Trash2 className="w-3.5 h-3.5" />削除
              </button>
            </div>
            <input
              defaultValue={selectedNode.label}
              key={selectedNode.id + selectedNode.label}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== selectedNode.label) void props.onUpdateNode?.(selectedNode.id, { label: v });
              }}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
            {selectedNode.kind === 'FUNCTION' && selectedNode.refFlowId && props.onFunctionOpen && (
              <button
                type="button"
                onClick={() => props.onFunctionOpen?.(selectedNode.refFlowId!)}
                className="w-full text-[11px] text-blue-600 hover:underline text-left"
              >
                このフローを開く（ドリルダウン）
              </button>
            )}
          </div>
        )}

        {/* 選択エッジの編集（情報種別の参照 + 削除） */}
        {selectedFlow && (
          <div className="absolute top-3 left-3 z-20 bg-white border border-gray-200 rounded-lg shadow-md p-3 w-64 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-gray-500">データフロー</span>
              <button
                type="button"
                onClick={() => { void props.onDeleteFlow?.(selectedFlow.id); setSelectedEdgeId(null); }}
                disabled={!props.onDeleteFlow}
                className="inline-flex items-center gap-1 text-[11px] text-red-600 hover:text-red-700 disabled:opacity-40"
              >
                <Trash2 className="w-3.5 h-3.5" />削除
              </button>
            </div>
            <div className="text-[12px] text-gray-700 truncate" title={selectedFlow.dataItem}>
              {selectedFlow.dataItem || '（データ項目）'}
            </div>
            <div>
              <label className="block text-[10px] text-gray-400 mb-0.5">線の形</label>
              <div className="inline-flex rounded border border-gray-300 overflow-hidden">
                {([
                  { value: 'smoothstep', label: '角ばり' },
                  { value: 'bezier', label: '曲線' },
                  { value: 'straight', label: '直線' },
                ] as const).map((opt, i) => {
                  const cur = selectedFlow.pathStyle ?? 'smoothstep';
                  const active = cur === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      disabled={!props.onUpdateFlow}
                      onClick={() => void props.onUpdateFlow?.(selectedFlow.id, { pathStyle: opt.value })}
                      className={`px-2.5 py-1 text-[11px] ${i > 0 ? 'border-l border-gray-300' : ''} ${
                        active ? 'bg-blue-500 text-white' : 'bg-white text-gray-600 hover:bg-blue-50'
                      } disabled:opacity-50`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="block text-[10px] text-gray-400 mb-0.5">情報種別</label>
              <select
                value={selectedFlow.informationTypeId ?? ''}
                onChange={(e) => {
                  const v = e.target.value || null;
                  void props.onUpdateFlow?.(selectedFlow.id, { informationTypeId: v });
                }}
                disabled={!props.onUpdateFlow}
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-50"
              >
                <option value="">（なし）</option>
                {(props.informationTypes ?? []).map((it) => (
                  <option key={it.id} value={it.id}>
                    [{INFORMATION_CATEGORY_LABELS[it.category]}] {it.name}
                  </option>
                ))}
              </select>
            </div>
            {selectedFlow.informationTypeId && (
              edgeAttachments.length > 0 ? (
                <ul className="space-y-1">
                  {edgeAttachments.map((a) => (
                    <li key={a.id} className="flex items-center gap-1.5 text-[11px]">
                      <FileText className="w-3 h-3 shrink-0 text-emerald-600" />
                      <span className="flex-1 truncate text-gray-700" title={a.filename}>{a.filename}</span>
                      <a
                        href={informationTypeApi.fileUrl(a.id)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center text-blue-600 hover:underline"
                        title="ダウンロード / 表示"
                      >
                        <Download className="w-3 h-3" />
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[11px] text-gray-400">具体帳票はありません。</p>
              )
            )}
          </div>
        )}
      </div>

      {/* 帳票フッタ */}
      <div className="border-t-2 px-4 py-1 flex items-center justify-between text-[10px] text-gray-400" style={{ borderColor: NAVY }}>
        <span>処理 {numberedNodes.filter((n) => n.kind === 'FUNCTION').length} ／ 外部実体 {numberedNodes.filter((n) => n.kind === 'EXTERNAL_ENTITY').length} ／ データストア {numberedNodes.filter((n) => n.kind === 'DATA_STORE').length} ／ データフロー {diagram.flows.length}</span>
        <span>ノードはドラッグで配置（位置は保存されます）｜ 4辺のハンドルから接続でデータフロー追加 ｜ 矢印の端点をドラッグでノードへ付け替え／何もない所で削除 ｜ ラベル・情報チップはドラッグで矢印に沿って移動 ｜ 矢印をWクリックでデータ項目編集</span>
      </div>
    </div>
  );
}

export function DfdCanvas(props: DfdCanvasProps) {
  return (
    <ReactFlowProvider>
      <DfdCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
