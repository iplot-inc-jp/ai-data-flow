'use client';

import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Node,
  Edge,
  Connection,
  addEdge,
  ConnectionMode,
  Panel,
  useReactFlow,
  ReactFlowProvider,
  NodeChange,
  EdgeChange,
  applyNodeChanges,
  applyEdgeChanges,
  MarkerType,
  EdgeLabelRenderer,
  BaseEdge,
  getSmoothStepPath,
  EdgeProps,
  Handle,
  Position,
  useViewport,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  ChevronLeft,
  Layers,
  Edit,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';

// 型定義
export type FlowNodeData = {
  label: string;
  description?: string;
  type: string;
  roleId?: string;
  roleName?: string;
  roleColor?: string;
  hasChildFlow?: boolean;
  childFlowId?: string;
  childFlowName?: string;
};

export type Role = {
  id: string;
  name: string;
  color: string;
  type: string;
  order?: number;
};

export type FlowData = {
  id: string;
  name: string;
  description?: string;
  parentId?: string;
  depth: number;
  nodes: Array<{
    id: string;
    type: string;
    label: string;
    description?: string;
    positionX: number;
    positionY: number;
    roleId?: string;
    role?: Role;
    hasChildFlow?: boolean;
    childFlowId?: string;
    childFlow?: { id: string; name: string };
  }>;
  edges: Array<{
    id: string;
    sourceNodeId: string;
    targetNodeId: string;
    label?: string;
    condition?: string;
  }>;
  breadcrumbs: Array<{ id: string; name: string }>;
};

// スイムレーンの高さ
const SWIMLANE_HEIGHT = 120;
const SWIMLANE_HEADER_WIDTH = 100;

// カスタムノードコンポーネント
function CustomNode({ data, selected }: { data: FlowNodeData; id: string; selected?: boolean }) {
  const getNodeStyle = () => {
    const baseClasses = 'px-3 py-2 rounded-lg border-2 shadow-sm min-w-[100px] text-center transition-all';
    const selectedClasses = selected ? 'ring-2 ring-blue-500 ring-offset-2' : '';

    switch (data.type) {
      case 'START':
        return `${baseClasses} ${selectedClasses} bg-emerald-50 border-emerald-400 text-emerald-700`;
      case 'END':
        return `${baseClasses} ${selectedClasses} bg-rose-50 border-rose-400 text-rose-700`;
      case 'DECISION':
        return `${baseClasses} ${selectedClasses} bg-amber-50 border-amber-400 text-amber-700 rotate-0`;
      case 'SYSTEM_INTEGRATION':
        return `${baseClasses} ${selectedClasses} bg-violet-50 border-violet-400 text-violet-700`;
      default:
        return `${baseClasses} ${selectedClasses} bg-sky-50 border-sky-400 text-sky-700`;
    }
  };

  return (
    <div className={getNodeStyle()}>
      <Handle
        type="target"
        position={Position.Left}
        className="w-2 h-2 !bg-gray-400"
      />
      <div className="font-medium text-sm">{data.label}</div>
      {data.hasChildFlow && (
        <div className="text-xs text-indigo-500 mt-1 flex items-center justify-center gap-1">
          <Layers className="w-3 h-3" />
          詳細あり
        </div>
      )}
      <Handle
        type="source"
        position={Position.Right}
        className="w-2 h-2 !bg-gray-400"
      />
    </div>
  );
}

// 編集可能なエッジコンポーネント
function EditableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  label,
  style,
  markerEnd,
  selected,
  data,
}: EdgeProps & { data?: { onLabelUpdate?: (id: string, label: string) => void } }) {
  const [isEditing, setIsEditing] = useState(false);
  const [labelValue, setLabelValue] = useState((label as string) || '');
  const inputRef = useRef<HTMLInputElement>(null);

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleBlur = () => {
    setIsEditing(false);
    if (data?.onLabelUpdate && labelValue !== label) {
      data.onLabelUpdate(id, labelValue);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleBlur();
    } else if (e.key === 'Escape') {
      setLabelValue((label as string) || '');
      setIsEditing(false);
    }
  };

  return (
    <>
      <BaseEdge 
        id={id} 
        path={edgePath} 
        style={{
          ...style,
          strokeWidth: selected ? 3 : 2,
          stroke: selected ? '#3b82f6' : '#64748b',
        }} 
        markerEnd={markerEnd} 
      />
      {(label || isEditing) && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
            className="nodrag nopan"
          >
            {isEditing ? (
              <Input
                ref={inputRef}
                value={labelValue}
                onChange={(e) => setLabelValue(e.target.value)}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                className="w-20 h-6 text-xs text-center bg-white border-gray-300"
              />
            ) : (
              <div
                onDoubleClick={handleDoubleClick}
                className={`px-2 py-0.5 text-xs bg-white border rounded shadow-sm cursor-pointer hover:bg-blue-50 ${
                  selected ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
                }`}
                title="ダブルクリックで編集"
              >
                {label}
              </div>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const nodeTypes = {
  custom: CustomNode,
};

const edgeTypes = {
  editable: EditableEdge,
};

// スイムレーンヘッダーコンポーネント（ズーム対応）
function SwimLaneHeaders({
  roles,
  viewport,
  onRoleReorder,
}: {
  roles: Role[];
  viewport: { x: number; y: number; zoom: number };
  onRoleReorder?: (roleId: string, direction: 'up' | 'down') => void;
}) {
  const scaledHeight = SWIMLANE_HEIGHT * viewport.zoom;
  const offsetY = viewport.y;

  return (
    <div 
      className="absolute top-0 left-0 pointer-events-auto overflow-hidden"
      style={{ 
        width: SWIMLANE_HEADER_WIDTH,
        height: '100%',
        backgroundColor: 'white',
        borderRight: '2px solid #e2e8f0',
        zIndex: 20,
      }}
    >
      {roles.map((role, index) => (
        <div
          key={role.id}
          className="absolute flex items-center justify-between font-medium text-xs border-b group"
          style={{
            height: scaledHeight,
            top: offsetY + index * scaledHeight,
            left: 0,
            width: SWIMLANE_HEADER_WIDTH,
            backgroundColor: `${role.color}15`,
            borderColor: '#e2e8f0',
            color: role.color,
            transition: 'top 0.1s ease-out, height 0.1s ease-out',
          }}
        >
          <span className="truncate px-2 flex-1">{role.name}</span>
          {onRoleReorder && (
            <div className="flex flex-col opacity-0 group-hover:opacity-100 transition-opacity pr-1">
              {index > 0 && (
                <button
                  onClick={() => onRoleReorder(role.id, 'up')}
                  className="p-0.5 hover:bg-white/50 rounded"
                  title="上に移動"
                >
                  <ChevronUp className="w-3 h-3" />
                </button>
              )}
              {index < roles.length - 1 && (
                <button
                  onClick={() => onRoleReorder(role.id, 'down')}
                  className="p-0.5 hover:bg-white/50 rounded"
                  title="下に移動"
                >
                  <ChevronDown className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// スイムレーン背景コンポーネント（React Flow内で使用）
function SwimLaneBackgrounds({ roles }: { roles: Role[] }) {
  return (
    <>
      {roles.map((role, index) => (
        <div
          key={role.id}
          className="absolute border-b pointer-events-none"
          style={{
            top: index * SWIMLANE_HEIGHT,
            left: 0,
            right: 0,
            height: SWIMLANE_HEIGHT,
            backgroundColor: `${role.color}05`,
            borderColor: `${role.color}20`,
          }}
        />
      ))}
    </>
  );
}

// メインのフロービューアー（内部）
function BPMNFlowViewerInner({
  flowData,
  roles,
  onNodeDoubleClick,
  onBack,
  onFlowUpdate,
  onEdgeLabelUpdate,
  onNodePositionUpdate,
  onNodeRoleUpdate,
  onEdgeCreate,
  onNodeCreate,
  onNodeDelete,
  onEdgeDelete,
  onChildFlowCreate,
  onRoleReorder,
}: {
  flowData: FlowData;
  roles: Role[];
  onNodeDoubleClick?: (nodeId: string, childFlowId?: string) => void;
  onBack?: () => void;
  onFlowUpdate?: (flowId: string, name: string, description?: string) => void;
  onEdgeLabelUpdate?: (edgeId: string, label: string) => void;
  onNodePositionUpdate?: (nodeId: string, position: { x: number; y: number }) => void;
  onNodeRoleUpdate?: (nodeId: string, roleId: string) => void;
  onEdgeCreate?: (sourceNodeId: string, targetNodeId: string) => void;
  onNodeCreate?: (type: string, x: number, y: number) => void;
  onNodeDelete?: (nodeId: string) => void;
  onEdgeDelete?: (edgeId: string) => void;
  onChildFlowCreate?: (nodeId: string, name?: string) => void;
  onRoleReorder?: (roleId: string, direction: 'up' | 'down') => void;
}) {
  const { fitView, screenToFlowPosition } = useReactFlow();
  const viewport = useViewport();
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedFlowName, setEditedFlowName] = useState(flowData.name);
  const [editedFlowDescription, setEditedFlowDescription] = useState(flowData.description || '');
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    nodeId?: string;
    edgeId?: string;
    isCanvas?: boolean;
    flowX?: number;
    flowY?: number;
  } | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ロールIDからY座標を計算
  const getRoleY = useCallback(
    (roleId?: string) => {
      if (!roleId || roles.length === 0) return SWIMLANE_HEIGHT / 2;
      const roleIndex = roles.findIndex((r) => r.id === roleId);
      if (roleIndex === -1) return SWIMLANE_HEIGHT / 2;
      return roleIndex * SWIMLANE_HEIGHT + SWIMLANE_HEIGHT / 2;
    },
    [roles]
  );

  // Y座標からロールIDを計算
  const getRoleIdFromY = useCallback(
    (y: number) => {
      if (roles.length === 0) return undefined;
      const roleIndex = Math.floor(y / SWIMLANE_HEIGHT);
      if (roleIndex < 0 || roleIndex >= roles.length) return undefined;
      return roles[roleIndex].id;
    },
    [roles]
  );

  // ノードとエッジを変換
  const initialNodes: Node<FlowNodeData>[] = useMemo(
    () =>
      flowData.nodes.map((node) => ({
        id: node.id,
        type: 'custom',
        position: {
          x: node.positionX + 20,
          y: getRoleY(node.roleId) - 30,
        },
        data: {
          label: node.label,
          description: node.description,
          type: node.type,
          roleId: node.roleId,
          roleName: node.role?.name,
          roleColor: node.role?.color,
          hasChildFlow: node.hasChildFlow,
          childFlowId: node.childFlowId,
          childFlowName: node.childFlow?.name,
        },
      })),
    [flowData.nodes, getRoleY]
  );

  const initialEdges: Edge[] = useMemo(
    () =>
      flowData.edges.map((edge) => ({
        id: edge.id,
        source: edge.sourceNodeId,
        target: edge.targetNodeId,
        label: edge.label,
        type: 'editable',
        animated: false,
        style: { strokeWidth: 2, stroke: '#64748b' },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#64748b', width: 20, height: 20 },
        data: { onLabelUpdate: onEdgeLabelUpdate },
      })),
    [flowData.edges, onEdgeLabelUpdate]
  );

  const [nodes, setNodes] = useNodesState(initialNodes);
  const [edges, setEdges] = useEdgesState(initialEdges);

  // 初期化時にフィット
  useEffect(() => {
    setTimeout(() => {
      fitView({ padding: 0.3 });
    }, 100);
  }, [fitView, flowData.id]);

  // ノードとエッジの更新
  useEffect(() => {
    setNodes(initialNodes);
  }, [initialNodes, setNodes]);

  useEffect(() => {
    setEdges(initialEdges);
  }, [initialEdges, setEdges]);

  // フロー名の同期
  useEffect(() => {
    setEditedFlowName(flowData.name);
    setEditedFlowDescription(flowData.description || '');
  }, [flowData.name, flowData.description]);

  // ノード変更ハンドラー
  const onNodesChange = useCallback(
    (changes: NodeChange<Node<FlowNodeData>>[]) => {
      setNodes((nds) => applyNodeChanges(changes, nds));

      changes.forEach((change) => {
        if (change.type === 'position' && change.dragging === false && change.position) {
          const nodeId = change.id;
          const newX = change.position.x;
          const newY = change.position.y;

          if (onNodePositionUpdate) {
            onNodePositionUpdate(nodeId, { x: newX, y: newY });
          }

          const newRoleId = getRoleIdFromY(newY + 30);
          const currentNode = flowData.nodes.find((n) => n.id === nodeId);
          if (newRoleId && currentNode && newRoleId !== currentNode.roleId) {
            if (onNodeRoleUpdate) {
              onNodeRoleUpdate(nodeId, newRoleId);
            }
          }
        }
      });
    },
    [setNodes, onNodePositionUpdate, onNodeRoleUpdate, getRoleIdFromY, flowData.nodes]
  );

  // エッジ変更ハンドラー
  const onEdgesChange = useCallback(
    (changes: EdgeChange<Edge>[]) => {
      setEdges((eds) => applyEdgeChanges(changes, eds));
    },
    [setEdges]
  );

  // 新しいエッジの接続
  const onConnect = useCallback(
    (connection: Connection) => {
      if (connection.source && connection.target) {
        const newEdge: Edge = {
          id: `temp-${Date.now()}`,
          source: connection.source,
          target: connection.target,
          type: 'editable',
          style: { strokeWidth: 2, stroke: '#64748b' },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#64748b', width: 20, height: 20 },
          data: { onLabelUpdate: onEdgeLabelUpdate },
        };
        setEdges((eds) => addEdge(newEdge, eds));

        if (onEdgeCreate) {
          onEdgeCreate(connection.source, connection.target);
        }
      }
    },
    [setEdges, onEdgeLabelUpdate, onEdgeCreate]
  );

  // ノードダブルクリック
  const handleNodeDoubleClick = useCallback(
    (_: React.MouseEvent, node: Node<FlowNodeData>) => {
      if (node.data.hasChildFlow && node.data.childFlowId && onNodeDoubleClick) {
        onNodeDoubleClick(node.id, node.data.childFlowId);
      }
    },
    [onNodeDoubleClick]
  );

  // タイトル保存
  const handleTitleSave = () => {
    if (onFlowUpdate) {
      onFlowUpdate(flowData.id, editedFlowName, editedFlowDescription);
    }
    setIsEditingTitle(false);
  };

  // コンテキストメニュー表示（ノード）
  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault();
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        nodeId: node.id,
      });
    },
    [setContextMenu]
  );

  // コンテキストメニュー表示（キャンバス）
  const onPaneContextMenu = useCallback(
    (event: MouseEvent | React.MouseEvent) => {
      event.preventDefault();
      const flowPosition = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        isCanvas: true,
        flowX: flowPosition.x,
        flowY: flowPosition.y,
      });
    },
    [setContextMenu, screenToFlowPosition]
  );

  // エッジクリック（選択）
  const onEdgeClick = useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      setSelectedEdgeId(edge.id);
    },
    []
  );

  // エッジ右クリック
  const onEdgeContextMenu = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      event.preventDefault();
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        edgeId: edge.id,
      });
    },
    [setContextMenu]
  );

  // キーボードイベント（Delete/Backspaceで選択したエッジを削除）
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedEdgeId && onEdgeDelete) {
        onEdgeDelete(selectedEdgeId);
        setSelectedEdgeId(null);
      }
    },
    [selectedEdgeId, onEdgeDelete]
  );

  // ペインクリック（選択解除）
  const onPaneClick = useCallback(() => {
    setContextMenu(null);
    setSelectedEdgeId(null);
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // 全体の高さを計算
  const totalHeight = Math.max(roles.length * SWIMLANE_HEIGHT, 400);

  return (
    <div 
      ref={containerRef} 
      className="relative w-full h-full bg-white"
      onKeyDown={onKeyDown}
      tabIndex={0}
    >
      {/* スイムレーンヘッダー（ズーム対応） */}
      <SwimLaneHeaders 
        roles={roles} 
        viewport={viewport}
        onRoleReorder={onRoleReorder}
      />

      <div style={{ marginLeft: SWIMLANE_HEADER_WIDTH, height: '100%' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges.map(edge => ({
            ...edge,
            selected: edge.id === selectedEdgeId,
          }))}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDoubleClick={handleNodeDoubleClick}
          onNodeContextMenu={onNodeContextMenu}
          onEdgeClick={onEdgeClick}
          onEdgeContextMenu={onEdgeContextMenu}
          onPaneContextMenu={onPaneContextMenu}
          onPaneClick={onPaneClick}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          connectionMode={ConnectionMode.Loose}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.3}
          maxZoom={2}
          snapToGrid
          snapGrid={[10, 10]}
          deleteKeyCode={['Delete', 'Backspace']}
          defaultEdgeOptions={{
            type: 'editable',
            style: { strokeWidth: 2, stroke: '#64748b' },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#64748b' },
          }}
          className="bg-gray-50"
          style={{ height: '100%' }}
        >
          {/* スイムレーン背景 */}
          <svg className="absolute inset-0 pointer-events-none" style={{ zIndex: -1 }}>
            {roles.map((role, index) => (
              <rect
                key={role.id}
                x={0}
                y={index * SWIMLANE_HEIGHT}
                width="100%"
                height={SWIMLANE_HEIGHT}
                fill={`${role.color}08`}
                stroke={`${role.color}20`}
                strokeWidth={1}
              />
            ))}
          </svg>

          <Background color="#cbd5e1" gap={20} />
          <Controls className="bg-white border border-gray-200 rounded-lg shadow-sm" />
          <MiniMap
            className="bg-white border border-gray-200 rounded-lg shadow-sm"
            nodeColor={(node) => {
              const data = node.data as FlowNodeData;
              switch (data.type) {
                case 'START':
                  return '#22c55e';
                case 'END':
                  return '#ef4444';
                case 'DECISION':
                  return '#f59e0b';
                default:
                  return '#3b82f6';
              }
            }}
          />

          {/* パンくずリスト & 戻るボタン */}
          <Panel position="top-left" className="bg-white border border-gray-200 rounded-lg shadow-sm p-2">
            <div className="flex items-center gap-2">
              {flowData.breadcrumbs.length > 1 && onBack && (
                <Button variant="ghost" size="sm" onClick={onBack} className="text-gray-600">
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  戻る
                </Button>
              )}
              <div className="flex items-center gap-1 text-sm">
                {flowData.breadcrumbs.map((crumb, index) => (
                  <span key={crumb.id} className="flex items-center">
                    {index > 0 && <span className="text-gray-400 mx-1">/</span>}
                    <span
                      className={
                        index === flowData.breadcrumbs.length - 1
                          ? 'font-medium text-gray-900'
                          : 'text-gray-500'
                      }
                    >
                      {crumb.name}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          </Panel>

          {/* フロー名・説明（編集可能） */}
          <Panel position="top-center" className="mt-2">
            {isEditingTitle ? (
              <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-4 min-w-[300px]">
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-gray-500">フロー名</label>
                    <Input
                      value={editedFlowName}
                      onChange={(e) => setEditedFlowName(e.target.value)}
                      className="mt-1"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500">説明</label>
                    <Textarea
                      value={editedFlowDescription}
                      onChange={(e) => setEditedFlowDescription(e.target.value)}
                      className="mt-1"
                      rows={2}
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditedFlowName(flowData.name);
                        setEditedFlowDescription(flowData.description || '');
                        setIsEditingTitle(false);
                      }}
                    >
                      キャンセル
                    </Button>
                    <Button size="sm" onClick={handleTitleSave}>
                      保存
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div
                onClick={() => setIsEditingTitle(true)}
                className="bg-white border border-gray-200 rounded-lg shadow-sm px-4 py-2 cursor-pointer hover:bg-gray-50 transition-colors group relative"
              >
                <h2 className="font-bold text-gray-900 text-center">
                  {flowData.name}
                </h2>
                {flowData.description && (
                  <p className="text-xs text-gray-500 text-center">{flowData.description}</p>
                )}
                <Edit className="w-3 h-3 absolute -right-4 top-1/2 -translate-y-1/2 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            )}
          </Panel>
        </ReactFlow>
      </div>

      {/* コンテキストメニュー */}
      {contextMenu && (
        <div
          className="fixed bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50 min-w-[160px]"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
          }}
        >
          {contextMenu.nodeId ? (
            <>
              <button
                className="w-full px-3 py-2 text-sm text-left hover:bg-gray-100 flex items-center gap-2"
                onClick={() => {
                  if (contextMenu.nodeId && onChildFlowCreate) {
                    onChildFlowCreate(contextMenu.nodeId);
                  }
                  closeContextMenu();
                }}
              >
                <Layers className="h-4 w-4 text-gray-500" />
                詳細フロー作成
              </button>
              <div className="border-t border-gray-200 my-1" />
              <button
                className="w-full px-3 py-2 text-sm text-left hover:bg-red-50 flex items-center gap-2 text-red-600"
                onClick={() => {
                  if (contextMenu.nodeId && onNodeDelete) {
                    onNodeDelete(contextMenu.nodeId);
                  }
                  closeContextMenu();
                }}
              >
                <Trash2 className="h-4 w-4" />
                ノードを削除
              </button>
            </>
          ) : contextMenu.edgeId ? (
            <>
              <button
                className="w-full px-3 py-2 text-sm text-left hover:bg-red-50 flex items-center gap-2 text-red-600"
                onClick={() => {
                  if (contextMenu.edgeId && onEdgeDelete) {
                    onEdgeDelete(contextMenu.edgeId);
                  }
                  closeContextMenu();
                }}
              >
                <Trash2 className="h-4 w-4" />
                矢印を削除
              </button>
            </>
          ) : (
            <>
              <button
                className="w-full px-3 py-2 text-sm text-left hover:bg-gray-100 flex items-center gap-2"
                onClick={() => {
                  if (onNodeCreate) {
                    const x = typeof contextMenu.flowX === 'number' ? contextMenu.flowX : 200;
                    const y = typeof contextMenu.flowY === 'number' ? contextMenu.flowY : 100;
                    onNodeCreate('PROCESS', x, y);
                  }
                  closeContextMenu();
                }}
              >
                <Plus className="h-4 w-4 text-blue-500" />
                処理ノード追加
              </button>
              <button
                className="w-full px-3 py-2 text-sm text-left hover:bg-gray-100 flex items-center gap-2"
                onClick={() => {
                  if (onNodeCreate) {
                    const x = typeof contextMenu.flowX === 'number' ? contextMenu.flowX : 200;
                    const y = typeof contextMenu.flowY === 'number' ? contextMenu.flowY : 150;
                    onNodeCreate('DECISION', x, y);
                  }
                  closeContextMenu();
                }}
              >
                <Plus className="h-4 w-4 text-amber-500" />
                分岐ノード追加
              </button>
              <button
                className="w-full px-3 py-2 text-sm text-left hover:bg-gray-100 flex items-center gap-2"
                onClick={() => {
                  if (onNodeCreate) {
                    const x = typeof contextMenu.flowX === 'number' ? contextMenu.flowX : 200;
                    const y = typeof contextMenu.flowY === 'number' ? contextMenu.flowY : 200;
                    onNodeCreate('SYSTEM_INTEGRATION', x, y);
                  }
                  closeContextMenu();
                }}
              >
                <Plus className="h-4 w-4 text-purple-500" />
                システム連携ノード追加
              </button>
            </>
          )}
        </div>
      )}

      {/* 選択中のエッジがある場合のヒント */}
      {selectedEdgeId && (
        <div className="absolute top-4 right-4 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-700 z-10">
          矢印を選択中 - Delete/Backspaceキーで削除
        </div>
      )}

      {/* ヒント */}
      <div className="absolute bottom-4 right-4 bg-white/90 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-500 z-10">
        💡 矢印クリックで選択→Delete削除 ｜ ラベルダブルクリックで編集 ｜ 右クリックでメニュー
      </div>
    </div>
  );
}

// エクスポート用のラッパー
export function BPMNFlowViewer(props: {
  flowData: FlowData;
  roles: Role[];
  onNodeDoubleClick?: (nodeId: string, childFlowId?: string) => void;
  onBack?: () => void;
  onFlowUpdate?: (flowId: string, name: string, description?: string) => void;
  onEdgeLabelUpdate?: (edgeId: string, label: string) => void;
  onNodePositionUpdate?: (nodeId: string, position: { x: number; y: number }) => void;
  onNodeRoleUpdate?: (nodeId: string, roleId: string) => void;
  onEdgeCreate?: (sourceNodeId: string, targetNodeId: string) => void;
  onNodeCreate?: (type: string, x: number, y: number) => void;
  onNodeDelete?: (nodeId: string) => void;
  onEdgeDelete?: (edgeId: string) => void;
  onChildFlowCreate?: (nodeId: string, name?: string) => void;
  onRoleReorder?: (roleId: string, direction: 'up' | 'down') => void;
}) {
  return (
    <ReactFlowProvider>
      <BPMNFlowViewerInner {...props} />
    </ReactFlowProvider>
  );
}
