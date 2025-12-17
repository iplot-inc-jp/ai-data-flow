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
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  ChevronLeft,
  Layers,
  Edit,
  Plus,
  Copy,
  Trash2,
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
    const baseStyle = `px-4 py-2 rounded-lg border-2 shadow-md min-w-[100px] text-center transition-all ${
      selected ? 'ring-2 ring-blue-500 ring-offset-2' : ''
    }`;

    switch (data.type) {
      case 'START':
        return `${baseStyle} bg-green-100 border-green-500 text-green-800 rounded-full`;
      case 'END':
        return `${baseStyle} bg-red-100 border-red-500 text-red-800 rounded-full`;
      case 'DECISION':
        return `${baseStyle} bg-amber-100 border-amber-500 text-amber-800`;
      case 'SYSTEM_INTEGRATION':
        return `${baseStyle} bg-purple-100 border-purple-500 text-purple-800`;
      case 'MANUAL_OPERATION':
        return `${baseStyle} bg-orange-100 border-orange-500 text-orange-800`;
      case 'DATA_STORE':
        return `${baseStyle} bg-cyan-100 border-cyan-500 text-cyan-800 rounded-b-3xl`;
      case 'BUSINESS_BLOCK':
        return `${baseStyle} bg-indigo-100 border-indigo-500 text-indigo-800`;
      default:
        return `${baseStyle} bg-blue-100 border-blue-500 text-blue-800`;
    }
  };

  // DECISION ノードはひし形にする
  if (data.type === 'DECISION') {
    return (
      <div className="relative" style={{ width: 100, height: 60 }}>
        <Handle type="target" position={Position.Left} style={{ left: -8, background: '#64748b' }} />
        <div
          className={`absolute inset-0 flex items-center justify-center ${selected ? 'ring-2 ring-blue-500 ring-offset-2' : ''}`}
          style={{
            backgroundColor: '#fef3c7',
            border: '2px solid #f59e0b',
            transform: 'rotate(45deg)',
            borderRadius: 8,
          }}
        >
          <div className="font-medium text-xs text-amber-800" style={{ transform: 'rotate(-45deg)' }}>
            {data.label}
          </div>
        </div>
        <Handle type="source" position={Position.Right} style={{ right: -8, background: '#64748b' }} />
        <Handle type="source" position={Position.Bottom} id="bottom" style={{ bottom: -8, background: '#64748b' }} />
      </div>
    );
  }

  return (
    <div className={getNodeStyle()}>
      <Handle type="target" position={Position.Left} style={{ background: '#64748b' }} />
      <div className="font-medium text-sm">{data.label}</div>
      {data.hasChildFlow && (
        <div className="text-xs mt-1 text-gray-500 flex items-center justify-center gap-1">
          <Layers className="w-3 h-3" />
          詳細あり
        </div>
      )}
      <Handle type="source" position={Position.Right} style={{ background: '#64748b' }} />
    </div>
  );
}

// 編集可能なエッジラベルコンポーネント
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
    borderRadius: 10,
  });

  const handleDoubleClick = () => {
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
      <BaseEdge id={id} path={edgePath} style={style} markerEnd={markerEnd} />
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
                className="px-2 py-0.5 text-xs bg-white border border-gray-300 rounded shadow-sm cursor-pointer hover:bg-blue-50 hover:border-blue-400"
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
}) {
  const { fitView } = useReactFlow();
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
  const containerRef = useRef<HTMLDivElement>(null);

  // ロールIDからY座標を計算
  const getRoleY = useCallback(
    (roleId?: string) => {
      if (!roleId || roles.length === 0) return 60;
      const roleIndex = roles.findIndex((r) => r.id === roleId);
      if (roleIndex === -1) return 60;
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
          x: node.positionX + SWIMLANE_HEADER_WIDTH + 20,
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
      fitView({ padding: 0.2 });
    }, 100);
  }, [fitView, flowData.id]);

  // ノードデータが変更されたら更新
  useEffect(() => {
    setNodes(initialNodes);
  }, [initialNodes, setNodes]);

  useEffect(() => {
    setEdges(initialEdges);
  }, [initialEdges, setEdges]);

  // フロー名と説明の同期
  useEffect(() => {
    setEditedFlowName(flowData.name);
    setEditedFlowDescription(flowData.description || '');
  }, [flowData.name, flowData.description]);

  // ノード変更ハンドラー
  const onNodesChange = useCallback(
    (changes: NodeChange<Node<FlowNodeData>>[]) => {
      setNodes((nds) => applyNodeChanges(changes, nds));

      // ドラッグ終了時に位置を保存し、ロールを更新
      changes.forEach((change) => {
        if (change.type === 'position' && change.dragging === false && change.position) {
          const nodeId = change.id;
          const newX = change.position.x - SWIMLANE_HEADER_WIDTH - 20;
          const newY = change.position.y;

          // 位置を保存
          if (onNodePositionUpdate) {
            onNodePositionUpdate(nodeId, { x: newX, y: newY });
          }

          // Y座標からロールを判定して更新
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
        // 一時的にUIに追加
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

        // バックエンドに保存
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

  // コンテキストメニュー表示
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

  const onPaneContextMenu = useCallback(
    (event: MouseEvent | React.MouseEvent) => {
      event.preventDefault();
      // フローキャンバス上の座標を計算（簡易版）
      const rect = containerRef.current?.getBoundingClientRect();
      const flowX = rect ? event.clientX - rect.left - SWIMLANE_HEADER_WIDTH : 200;
      const flowY = rect ? event.clientY - rect.top : 100;
      
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        isCanvas: true,
        flowX,
        flowY,
      });
    },
    [setContextMenu]
  );

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

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // 全体の高さを計算
  const totalHeight = Math.max(roles.length * SWIMLANE_HEIGHT, 400);

  return (
    <div ref={containerRef} className="relative w-full h-full bg-white">
      {/* BPMNスタイルのスイムレーン（固定位置） */}
      <div 
        className="absolute top-0 left-0 h-full pointer-events-none"
        style={{ 
          width: SWIMLANE_HEADER_WIDTH,
          zIndex: 10,
          backgroundColor: 'white',
          borderRight: '2px solid #e2e8f0',
        }}
      >
        {roles.map((role, index) => (
          <div
            key={role.id}
            className="flex items-center justify-center font-medium text-xs border-b"
            style={{
              height: SWIMLANE_HEIGHT,
              backgroundColor: `${role.color}15`,
              borderColor: '#e2e8f0',
              color: role.color,
              position: 'absolute',
              top: index * SWIMLANE_HEIGHT,
              left: 0,
              width: SWIMLANE_HEADER_WIDTH,
            }}
          >
            <span className="truncate px-2">{role.name}</span>
          </div>
        ))}
      </div>

      {/* スイムレーン背景（ReactFlow内で表示） */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: 0,
          left: SWIMLANE_HEADER_WIDTH,
          right: 0,
          height: totalHeight,
          zIndex: 0,
        }}
      >
        {roles.map((role, index) => (
          <div
            key={role.id}
            className="absolute w-full border-b"
            style={{
              top: index * SWIMLANE_HEIGHT,
              height: SWIMLANE_HEIGHT,
              backgroundColor: `${role.color}08`,
              borderColor: '#e2e8f0',
            }}
          />
        ))}
      </div>

      <div style={{ marginLeft: SWIMLANE_HEADER_WIDTH, height: '100%' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDoubleClick={handleNodeDoubleClick}
          onNodeContextMenu={onNodeContextMenu}
          onEdgeContextMenu={onEdgeContextMenu}
          onPaneContextMenu={onPaneContextMenu}
          onPaneClick={closeContextMenu}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          connectionMode={ConnectionMode.Loose}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.3}
          maxZoom={2}
          snapToGrid
          snapGrid={[10, 10]}
          defaultEdgeOptions={{
            type: 'editable',
            style: { strokeWidth: 2, stroke: '#64748b' },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#64748b' },
          }}
          className="bg-gray-50"
          style={{ height: '100%' }}
        >
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

          {/* フロー名 */}
          <Panel position="top-center" className="bg-white border border-gray-200 rounded-lg shadow-sm px-4 py-2">
            {isEditingTitle ? (
              <div className="flex flex-col gap-2">
                <div>
                  <Label htmlFor="flow-name" className="sr-only">
                    フロー名
                  </Label>
                  <Input
                    id="flow-name"
                    value={editedFlowName}
                    onChange={(e) => setEditedFlowName(e.target.value)}
                    className="text-lg font-bold text-gray-900"
                  />
                </div>
                <div>
                  <Label htmlFor="flow-description" className="sr-only">
                    説明
                  </Label>
                  <Textarea
                    id="flow-description"
                    value={editedFlowDescription}
                    onChange={(e) => setEditedFlowDescription(e.target.value)}
                    placeholder="フローの説明を入力"
                    className="text-xs text-gray-500"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setIsEditingTitle(false)}>
                    キャンセル
                  </Button>
                  <Button size="sm" onClick={handleTitleSave}>
                    保存
                  </Button>
                </div>
              </div>
            ) : (
              <div
                onClick={() => setIsEditingTitle(true)}
                className="cursor-pointer group relative"
              >
                <h2 className="font-bold text-gray-900 group-hover:text-blue-600 transition-colors">
                  {flowData.name}
                </h2>
                {flowData.description && (
                  <p className="text-xs text-gray-500">{flowData.description}</p>
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

      {/* ヒント */}
      <div className="absolute bottom-4 right-4 bg-white/90 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-500 z-10">
        💡 ノードからドラッグで矢印作成 ｜ ラベルをダブルクリックで編集 ｜ タイトルをクリックで編集
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
}) {
  return (
    <ReactFlowProvider>
      <BPMNFlowViewerInner {...props} />
    </ReactFlowProvider>
  );
}

