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
  ConnectionMode,
  Panel,
  useReactFlow,
  ReactFlowProvider,
  MarkerType,
  Handle,
  Position,
  NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ChevronLeft,
  Layers,
  Edit2,
  Check,
  X,
  Plus,
  Trash2,
  Copy,
  FolderPlus,
  type LucideIcon,
} from 'lucide-react';

// ノードタイプ
type FlowNodeData = {
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

// ロール情報
type Role = {
  id: string;
  name: string;
  color: string;
  type: string;
};

// API からのフローデータ
type FlowData = {
  id: string;
  name: string;
  description?: string;
  projectId?: string;
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

// コンテキストメニューの状態
type ContextMenu = {
  show: boolean;
  x: number;
  y: number;
  nodeId?: string;
  edgeId?: string;
  type: 'node' | 'canvas' | 'edge';
};

// エッジ編集ダイアログの状態
type EdgeEditState = {
  show: boolean;
  edgeId?: string;
  label: string;
};

// カスタムノードコンポーネント
function CustomNode({ data, selected }: NodeProps) {
  const nodeData = data as FlowNodeData;

  const getNodeStyle = () => {
    const baseStyle =
      'px-4 py-3 rounded-lg border-2 shadow-md min-w-[140px] text-center transition-all cursor-pointer';
    const selectedStyle = selected ? 'ring-2 ring-blue-400 ring-offset-2' : '';

    switch (nodeData.type) {
      case 'START':
        return `${baseStyle} ${selectedStyle} bg-emerald-50 border-emerald-500 text-emerald-800`;
      case 'END':
        return `${baseStyle} ${selectedStyle} bg-rose-50 border-rose-500 text-rose-800`;
      case 'DECISION':
        return `${baseStyle} ${selectedStyle} bg-amber-50 border-amber-500 text-amber-800`;
      case 'BUSINESS_BLOCK':
        return `${baseStyle} ${selectedStyle} bg-indigo-50 border-indigo-500 text-indigo-800 border-dashed`;
      case 'SYSTEM_INTEGRATION':
        return `${baseStyle} ${selectedStyle} bg-violet-50 border-violet-500 text-violet-800`;
      case 'MANUAL_OPERATION':
        return `${baseStyle} ${selectedStyle} bg-orange-50 border-orange-500 text-orange-800`;
      case 'DATA_STORE':
        return `${baseStyle} ${selectedStyle} bg-cyan-50 border-cyan-500 text-cyan-800`;
      default:
        return `${baseStyle} ${selectedStyle} bg-sky-50 border-sky-500 text-sky-800`;
    }
  };

  return (
    <div className={getNodeStyle()}>
      <Handle
        type="target"
        position={Position.Left}
        className="w-3 h-3 !bg-gray-400 border-2 border-white"
      />

      <div className="font-semibold text-sm">{nodeData.label}</div>

      {nodeData.roleName && (
        <div
          className="text-xs mt-1.5 px-2 py-0.5 rounded-full inline-block font-medium"
          style={{
            backgroundColor: `${nodeData.roleColor}25`,
            color: nodeData.roleColor,
            border: `1px solid ${nodeData.roleColor}40`,
          }}
        >
          {nodeData.roleName}
        </div>
      )}

      {nodeData.hasChildFlow && (
        <div className="text-xs mt-1.5 text-indigo-600 flex items-center justify-center gap-1 font-medium">
          <Layers className="w-3 h-3" />
          詳細フローあり
        </div>
      )}

      <Handle
        type="source"
        position={Position.Right}
        className="w-3 h-3 !bg-gray-400 border-2 border-white"
      />
    </div>
  );
}

const nodeTypes = {
  custom: CustomNode,
};

// スイムレーンコンポーネント
function SwimLanes({
  roles,
  nodes,
}: {
  roles: Role[];
  nodes: Node[];
}) {
  // ロールごとにノードをグループ化してY範囲を計算
  const roleLanes = useMemo(() => {
    const lanes: Record<string, { minY: number; maxY: number; count: number }> = {};

    nodes.forEach((node) => {
      const nodeData = node.data as FlowNodeData;
      const roleId = nodeData.roleId;
      if (!roleId) return;

      if (!lanes[roleId]) {
        lanes[roleId] = { minY: Infinity, maxY: -Infinity, count: 0 };
      }

      lanes[roleId].minY = Math.min(lanes[roleId].minY, node.position.y);
      lanes[roleId].maxY = Math.max(lanes[roleId].maxY, node.position.y + 80);
      lanes[roleId].count++;
    });

    return lanes;
  }, [nodes]);

  // 使用されているロールのみをY位置でソート
  const usedRoles = roles
    .filter((role) => roleLanes[role.id] && roleLanes[role.id].count > 0)
    .sort((a, b) => {
      const laneA = roleLanes[a.id];
      const laneB = roleLanes[b.id];
      return laneA.minY - laneB.minY;
    });

  if (usedRoles.length === 0) return null;

  return (
    <>
      {usedRoles.map((role) => {
        const lane = roleLanes[role.id];
        const padding = 30;
        const height = lane.maxY - lane.minY + padding * 2;

        return (
          <div
            key={role.id}
            className="absolute pointer-events-none"
            style={{
              left: -100,
              top: lane.minY - padding,
              width: 90,
              height,
              borderLeft: `4px solid ${role.color}`,
              backgroundColor: `${role.color}08`,
              borderRadius: '4px 0 0 4px',
            }}
          >
            <div
              className="absolute left-2 top-1/2 -translate-y-1/2 font-semibold text-sm whitespace-nowrap"
              style={{ color: role.color }}
            >
              {role.name}
            </div>
          </div>
        );
      })}
    </>
  );
}

// コンテキストメニューコンポーネント
function ContextMenuComponent({
  menu,
  onClose,
  onAction,
}: {
  menu: ContextMenu;
  onClose: () => void;
  onAction: (action: string, nodeId?: string) => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as globalThis.Node | null)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  if (!menu.show) return null;

  const nodeMenuItems: Array<{ action: string; label: string; icon: LucideIcon; danger?: boolean }> = [
    { action: 'edit', label: '編集', icon: Edit2 },
    { action: 'createChildFlow', label: '詳細フロー作成', icon: FolderPlus },
    { action: 'duplicate', label: '複製', icon: Copy },
    { action: 'delete', label: '削除', icon: Trash2, danger: true },
  ];

  const canvasMenuItems: Array<{ action: string; label: string; icon: LucideIcon; danger?: boolean }> = [
    { action: 'addProcess', label: '処理ノード追加', icon: Plus },
    { action: 'addDecision', label: '分岐ノード追加', icon: Plus },
    { action: 'addBusinessBlock', label: '業務ブロック追加', icon: FolderPlus },
  ];

  const edgeMenuItems: Array<{ action: string; label: string; icon: LucideIcon; danger?: boolean }> = [
    { action: 'editEdge', label: 'ラベルを編集', icon: Edit2 },
    { action: 'deleteEdge', label: '削除', icon: Trash2, danger: true },
  ];

  const items = menu.type === 'node' ? nodeMenuItems : menu.type === 'edge' ? edgeMenuItems : canvasMenuItems;

  return (
    <div
      ref={menuRef}
      className="fixed bg-white border border-gray-200 rounded-lg shadow-xl py-1 z-50 min-w-[180px]"
      style={{ left: menu.x, top: menu.y }}
    >
      {items.map((item) => (
        <button
          key={item.action}
          className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2 hover:bg-gray-100 transition-colors ${
            item.danger ? 'text-red-600 hover:bg-red-50' : 'text-gray-700'
          }`}
          onClick={() => {
            onAction(item.action, menu.nodeId);
            onClose();
          }}
        >
          <item.icon className="w-4 h-4" />
          {item.label}
        </button>
      ))}
    </div>
  );
}

// メインのフロービューアー（内部）
function FlowViewerInner({
  flowData,
  roles,
  onNodeDoubleClick,
  onBack,
  onUpdateFlow,
  onUpdateNode,
  onDeleteNode,
  onCreateChildFlow,
  onAddNode,
  onUpdateEdge,
  onDeleteEdge,
}: {
  flowData: FlowData;
  roles: Role[];
  onNodeDoubleClick?: (nodeId: string, childFlowId?: string) => void;
  onBack?: () => void;
  onUpdateFlow?: (flowId: string, data: { name?: string; description?: string }) => void;
  onUpdateNode?: (nodeId: string, data: Partial<FlowNodeData>) => void;
  onDeleteNode?: (nodeId: string) => void;
  onCreateChildFlow?: (nodeId: string) => void;
  onAddNode?: (type: string, position: { x: number; y: number }) => void;
  onUpdateEdge?: (edgeId: string, label: string) => void;
  onDeleteEdge?: (edgeId: string) => void;
}) {
  const { fitView, screenToFlowPosition } = useReactFlow();
  const [contextMenu, setContextMenu] = useState<ContextMenu>({
    show: false,
    x: 0,
    y: 0,
    type: 'canvas',
  });
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState(flowData.name);
  const [editedDescription, setEditedDescription] = useState(flowData.description || '');
  const [edgeEdit, setEdgeEdit] = useState<EdgeEditState>({
    show: false,
    label: '',
  });

  // ノードを変換
  const initialNodes: Node[] = useMemo(
    () =>
      flowData.nodes.map((node) => ({
        id: node.id,
        type: 'custom',
        position: { x: node.positionX, y: node.positionY },
        data: {
          label: node.label,
          description: node.description,
          type: node.type,
          roleId: node.roleId,
          roleName: node.role?.name,
          roleColor: node.role?.color || '#6B7280',
          hasChildFlow: node.hasChildFlow,
          childFlowId: node.childFlowId,
          childFlowName: node.childFlow?.name,
        } as FlowNodeData,
      })),
    [flowData.nodes]
  );

  // エッジを変換（矢印付き）
  const initialEdges: Edge[] = useMemo(
    () =>
      flowData.edges.map((edge) => ({
        id: edge.id,
        source: edge.sourceNodeId,
        target: edge.targetNodeId,
        label: edge.label || edge.condition,
        type: 'smoothstep',
        animated: false,
        style: { strokeWidth: 2, stroke: '#64748b' },
        labelStyle: { fill: '#475569', fontWeight: 600, fontSize: 12 },
        labelBgStyle: { fill: '#f8fafc', fillOpacity: 0.9 },
        labelBgPadding: [4, 8] as [number, number],
        labelBgBorderRadius: 4,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 20,
          height: 20,
          color: '#64748b',
        },
      })),
    [flowData.edges]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // 初期化時にフィット
  useEffect(() => {
    setTimeout(() => {
      fitView({ padding: 0.3 });
    }, 100);
  }, [fitView, flowData.id]);

  // ノード/エッジデータが変更されたら更新
  useEffect(() => {
    setNodes(initialNodes);
  }, [initialNodes, setNodes]);

  useEffect(() => {
    setEdges(initialEdges);
  }, [initialEdges, setEdges]);

  // ノードダブルクリック
  const handleNodeDoubleClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const nodeData = node.data as FlowNodeData;
      if (nodeData.hasChildFlow && nodeData.childFlowId && onNodeDoubleClick) {
        onNodeDoubleClick(node.id, nodeData.childFlowId);
      }
    },
    [onNodeDoubleClick]
  );

  // 右クリックメニュー（ノード）
  const handleNodeContextMenu = useCallback((e: React.MouseEvent, node: Node) => {
    e.preventDefault();
    setContextMenu({
      show: true,
      x: e.clientX,
      y: e.clientY,
      nodeId: node.id,
      type: 'node',
    });
  }, []);

  // 右クリックメニュー（キャンバス）
  const handlePaneContextMenu = useCallback((e: MouseEvent | React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({
      show: true,
      x: e.clientX,
      y: e.clientY,
      type: 'canvas',
    });
  }, []);

  // エッジクリック（ラベル編集）
  const handleEdgeClick = useCallback((e: React.MouseEvent, edge: Edge) => {
    setEdgeEdit({
      show: true,
      edgeId: edge.id,
      label: (edge.label as string) || '',
    });
  }, []);

  // エッジ右クリックメニュー
  const handleEdgeContextMenu = useCallback((e: React.MouseEvent, edge: Edge) => {
    e.preventDefault();
    setContextMenu({
      show: true,
      x: e.clientX,
      y: e.clientY,
      edgeId: edge.id,
      type: 'edge',
    });
  }, []);

  // エッジラベル保存
  const handleSaveEdgeLabel = useCallback(() => {
    if (edgeEdit.edgeId && onUpdateEdge) {
      onUpdateEdge(edgeEdit.edgeId, edgeEdit.label);
    }
    setEdgeEdit({ show: false, label: '' });
  }, [edgeEdit.edgeId, edgeEdit.label, onUpdateEdge]);

  // コンテキストメニューアクション
  const handleContextMenuAction = useCallback(
    (action: string, nodeId?: string) => {
      const position = screenToFlowPosition({ x: contextMenu.x, y: contextMenu.y });

      switch (action) {
        case 'edit':
          // TODO: ノード編集モーダルを開く
          console.log('Edit node:', nodeId);
          break;
        case 'createChildFlow':
          if (nodeId && onCreateChildFlow) {
            onCreateChildFlow(nodeId);
          }
          break;
        case 'duplicate':
          // TODO: ノード複製
          console.log('Duplicate node:', nodeId);
          break;
        case 'delete':
          if (nodeId && onDeleteNode) {
            onDeleteNode(nodeId);
          }
          break;
        case 'addProcess':
          if (onAddNode) {
            onAddNode('PROCESS', position);
          }
          break;
        case 'addDecision':
          if (onAddNode) {
            onAddNode('DECISION', position);
          }
          break;
        case 'addBusinessBlock':
          if (onAddNode) {
            onAddNode('BUSINESS_BLOCK', position);
          }
          break;
        case 'editEdge':
          if (contextMenu.edgeId) {
            const edge = edges.find((e) => e.id === contextMenu.edgeId);
            if (edge) {
              setEdgeEdit({
                show: true,
                edgeId: edge.id,
                label: (edge.label as string) || '',
              });
            }
          }
          break;
        case 'deleteEdge':
          if (contextMenu.edgeId && onDeleteEdge) {
            onDeleteEdge(contextMenu.edgeId);
          }
          break;
      }
    },
    [contextMenu.x, contextMenu.y, contextMenu.edgeId, screenToFlowPosition, onCreateChildFlow, onDeleteNode, onAddNode, onDeleteEdge, edges]
  );

  // タイトル保存
  const handleSaveTitle = useCallback(() => {
    if (onUpdateFlow) {
      onUpdateFlow(flowData.id, { name: editedTitle, description: editedDescription });
    }
    setIsEditingTitle(false);
  }, [flowData.id, editedTitle, editedDescription, onUpdateFlow]);

  // タイトルキャンセル
  const handleCancelTitle = useCallback(() => {
    setEditedTitle(flowData.name);
    setEditedDescription(flowData.description || '');
    setIsEditingTitle(false);
  }, [flowData.name, flowData.description]);

  return (
    <div className="relative w-full h-full bg-slate-50">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDoubleClick={handleNodeDoubleClick}
        onNodeContextMenu={handleNodeContextMenu}
        onPaneContextMenu={handlePaneContextMenu}
        onEdgeClick={handleEdgeClick}
        onEdgeContextMenu={handleEdgeContextMenu}
        nodeTypes={nodeTypes}
        connectionMode={ConnectionMode.Loose}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.1}
        maxZoom={2}
        defaultEdgeOptions={{
          type: 'smoothstep',
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 20,
            height: 20,
            color: '#64748b',
          },
        }}
      >
        <Background color="#cbd5e1" gap={24} size={1} />
        <Controls
          className="bg-white border border-gray-200 rounded-lg shadow-sm"
          showInteractive={false}
        />
        <MiniMap
          className="bg-white border border-gray-200 rounded-lg shadow-sm"
          nodeColor={(node) => {
            const data = node.data as FlowNodeData;
            if (data.roleColor) return data.roleColor;
            switch (data.type) {
              case 'START':
                return '#10b981';
              case 'END':
                return '#f43f5e';
              case 'DECISION':
                return '#f59e0b';
              case 'BUSINESS_BLOCK':
                return '#6366f1';
              default:
                return '#0ea5e9';
            }
          }}
          maskColor="rgba(0, 0, 0, 0.1)"
        />

        {/* スイムレーン */}
        <SwimLanes roles={roles} nodes={nodes} />

        {/* パンくずリスト & 戻るボタン */}
        <Panel position="top-left" className="bg-white border border-gray-200 rounded-lg shadow-sm p-2 m-2">
          <div className="flex items-center gap-2">
            {flowData.breadcrumbs && flowData.breadcrumbs.length > 1 && onBack && (
              <Button variant="ghost" size="sm" onClick={onBack} className="text-gray-600 h-8">
                <ChevronLeft className="w-4 h-4 mr-1" />
                戻る
              </Button>
            )}
            {flowData.breadcrumbs && (
              <div className="flex items-center gap-1 text-sm">
                {flowData.breadcrumbs.map((crumb, index) => (
                  <span key={crumb.id} className="flex items-center">
                    {index > 0 && <span className="text-gray-400 mx-1">/</span>}
                    <span
                      className={
                        index === flowData.breadcrumbs.length - 1
                          ? 'font-semibold text-gray-900'
                          : 'text-gray-500'
                      }
                    >
                      {crumb.name}
                    </span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </Panel>

        {/* フロー名（編集可能） */}
        <Panel position="top-center" className="m-2">
          {isEditingTitle ? (
            <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-4 min-w-[300px]">
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">フロー名</label>
                  <Input
                    value={editedTitle}
                    onChange={(e) => setEditedTitle(e.target.value)}
                    className="font-semibold"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">説明</label>
                  <Input
                    value={editedDescription}
                    onChange={(e) => setEditedDescription(e.target.value)}
                    placeholder="フローの説明を入力"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={handleCancelTitle}>
                    <X className="w-4 h-4 mr-1" />
                    キャンセル
                  </Button>
                  <Button size="sm" onClick={handleSaveTitle} className="bg-blue-600 hover:bg-blue-700">
                    <Check className="w-4 h-4 mr-1" />
                    保存
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div
              className="bg-white border border-gray-200 rounded-lg shadow-sm px-4 py-2 cursor-pointer hover:bg-gray-50 transition-colors group"
              onClick={() => setIsEditingTitle(true)}
            >
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-gray-900">{flowData.name}</h2>
                <Edit2 className="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              {flowData.description && (
                <p className="text-xs text-gray-500">{flowData.description}</p>
              )}
            </div>
          )}
        </Panel>

        {/* ロール凡例 */}
        {roles.length > 0 && (
          <Panel position="bottom-right" className="bg-white border border-gray-200 rounded-lg shadow-sm p-3 m-2">
            <div className="text-xs font-semibold text-gray-500 mb-2">ロール</div>
            <div className="space-y-1.5">
              {roles.map((role) => (
                <div key={role.id} className="flex items-center gap-2 text-sm">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: role.color }}
                  />
                  <span className="text-gray-700">{role.name}</span>
                </div>
              ))}
            </div>
          </Panel>
        )}
      </ReactFlow>

      {/* コンテキストメニュー */}
      <ContextMenuComponent
        menu={contextMenu}
        onClose={() => setContextMenu({ ...contextMenu, show: false })}
        onAction={handleContextMenuAction}
      />

      {/* ヒント */}
      <div className="absolute bottom-4 left-4 bg-white/95 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-600 shadow-sm">
        💡 ダブルクリックで詳細フローへ ｜ 矢印クリックでラベル編集 ｜ 右クリックでメニュー表示
      </div>

      {/* エッジ編集ダイアログ */}
      {edgeEdit.show && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-[400px] border border-gray-200">
            <h3 className="font-bold text-lg text-gray-900 mb-4">矢印のラベル編集</h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">ラベル</label>
                <Input
                  value={edgeEdit.label}
                  onChange={(e) => setEdgeEdit({ ...edgeEdit, label: e.target.value })}
                  placeholder="例: 承認の場合、エラー発生時"
                  autoFocus
                />
                <p className="text-xs text-gray-500 mt-1">
                  矢印の上に表示されるテキストです。条件分岐などを記述します。
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  onClick={() => setEdgeEdit({ show: false, label: '' })}
                >
                  <X className="w-4 h-4 mr-1" />
                  キャンセル
                </Button>
                <Button
                  onClick={handleSaveEdgeLabel}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Check className="w-4 h-4 mr-1" />
                  保存
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// エクスポート用のラッパー
export function FlowViewer(props: {
  flowData: FlowData;
  roles: Role[];
  onNodeDoubleClick?: (nodeId: string, childFlowId?: string) => void;
  onBack?: () => void;
  onUpdateFlow?: (flowId: string, data: { name?: string; description?: string }) => void;
  onUpdateNode?: (nodeId: string, data: Partial<FlowNodeData>) => void;
  onDeleteNode?: (nodeId: string) => void;
  onCreateChildFlow?: (nodeId: string) => void;
  onAddNode?: (type: string, position: { x: number; y: number }) => void;
  onUpdateEdge?: (edgeId: string, label: string) => void;
  onDeleteEdge?: (edgeId: string) => void;
}) {
  return (
    <ReactFlowProvider>
      <FlowViewerInner {...props} />
    </ReactFlowProvider>
  );
}

export type { FlowData, Role, FlowNodeData };
