'use client'

import { useCallback, useState, useMemo } from 'react'
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  BackgroundVariant,
  Panel,
  NodeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Button } from '@/components/ui/button'
import {
  Plus,
  Play,
  Square,
  Diamond,
  Database,
  Settings,
  Download,
  Users,
} from 'lucide-react'
import { ProcessNode } from './nodes/process-node'
import { StartEndNode } from './nodes/start-end-node'
import { DecisionNode } from './nodes/decision-node'
import { DataStoreNode } from './nodes/data-store-node'

const nodeTypes: NodeTypes = {
  process: ProcessNode,
  startEnd: StartEndNode,
  decision: DecisionNode,
  dataStore: DataStoreNode,
}

interface Role {
  id: string
  name: string
  color: string
}

interface FlowEditorProps {
  flowId?: string
  initialNodes?: Node[]
  initialEdges?: Edge[]
  roles?: Role[]
  onSave?: (nodes: Node[], edges: Edge[]) => void
  onExport?: () => void
}

const defaultRoles: Role[] = [
  { id: '1', name: 'ユーザー', color: '#3B82F6' },
  { id: '2', name: 'システム', color: '#10B981' },
  { id: '3', name: '管理者', color: '#8B5CF6' },
]

const initialNodesData: Node[] = [
  {
    id: 'start',
    type: 'startEnd',
    position: { x: 250, y: 50 },
    data: { label: '開始', isStart: true },
  },
]

export function FlowEditor({
  flowId,
  initialNodes = initialNodesData,
  initialEdges = [],
  roles = defaultRoles,
  onSave,
  onExport,
}: FlowEditorProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [selectedNodeType, setSelectedNodeType] = useState<string>('process')

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({
      ...params,
      type: 'smoothstep',
      animated: true,
      style: { stroke: '#64748b', strokeWidth: 2 },
    }, eds)),
    [setEdges]
  )

  const addNode = useCallback((type: string) => {
    const newNode: Node = {
      id: `node-${Date.now()}`,
      type,
      position: { x: 250, y: nodes.length * 100 + 100 },
      data: {
        label: type === 'process' ? '新規処理' :
               type === 'decision' ? '判断' :
               type === 'dataStore' ? 'データストア' :
               type === 'startEnd' ? '終了' : '処理',
        isStart: false,
      },
    }
    setNodes((nds) => [...nds, newNode])
  }, [nodes, setNodes])

  // スイムレーンの計算
  const swimlanes = useMemo(() => {
    const laneWidth = 300
    return roles.map((role, index) => ({
      ...role,
      x: index * laneWidth,
      width: laneWidth,
    }))
  }, [roles])

  return (
    <div className="h-full w-full bg-slate-900 rounded-lg overflow-hidden">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        className="bg-slate-900"
        defaultEdgeOptions={{
          type: 'smoothstep',
          animated: true,
          style: { stroke: '#64748b', strokeWidth: 2 },
        }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="#334155"
        />
        <Controls className="bg-slate-800 border-slate-700 [&>button]:bg-slate-800 [&>button]:border-slate-700 [&>button]:text-slate-300 [&>button:hover]:bg-slate-700" />
        <MiniMap
          className="bg-slate-800 border-slate-700"
          nodeColor={(node) => {
            switch (node.type) {
              case 'process':
                return '#3B82F6'
              case 'decision':
                return '#F59E0B'
              case 'dataStore':
                return '#10B981'
              case 'startEnd':
                return '#64748b'
              default:
                return '#64748b'
            }
          }}
        />

        {/* Swimlane Headers */}
        <Panel position="top-left" className="m-0 p-0">
          <div className="flex">
            {swimlanes.map((lane) => (
              <div
                key={lane.id}
                className="h-10 flex items-center justify-center text-sm font-medium border-r border-slate-700 bg-slate-800/80 backdrop-blur-sm"
                style={{ width: lane.width, borderLeftColor: lane.color, borderLeftWidth: 3 }}
              >
                <Users className="h-4 w-4 mr-2" style={{ color: lane.color }} />
                <span className="text-slate-300">{lane.name}</span>
              </div>
            ))}
          </div>
        </Panel>

        {/* Toolbar */}
        <Panel position="top-right" className="flex gap-2">
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-2 flex gap-1">
            <Button
              variant={selectedNodeType === 'process' ? 'secondary' : 'ghost'}
              size="icon"
              className="h-8 w-8"
              onClick={() => addNode('process')}
              title="処理ノード追加"
            >
              <Square className="h-4 w-4 text-blue-400" />
            </Button>
            <Button
              variant={selectedNodeType === 'decision' ? 'secondary' : 'ghost'}
              size="icon"
              className="h-8 w-8"
              onClick={() => addNode('decision')}
              title="分岐ノード追加"
            >
              <Diamond className="h-4 w-4 text-yellow-400" />
            </Button>
            <Button
              variant={selectedNodeType === 'dataStore' ? 'secondary' : 'ghost'}
              size="icon"
              className="h-8 w-8"
              onClick={() => addNode('dataStore')}
              title="データストアノード追加"
            >
              <Database className="h-4 w-4 text-green-400" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => addNode('startEnd')}
              title="終了ノード追加"
            >
              <Play className="h-4 w-4 text-slate-400 rotate-90" />
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="bg-slate-800 border-slate-700 text-slate-300"
            onClick={onExport}
          >
            <Download className="h-4 w-4 mr-2" />
            エクスポート
          </Button>
        </Panel>
      </ReactFlow>
    </div>
  )
}

