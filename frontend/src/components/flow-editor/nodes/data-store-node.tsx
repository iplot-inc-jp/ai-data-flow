'use client'

import { memo } from 'react'
import { Handle, Position, NodeProps } from '@xyflow/react'
import { Database } from 'lucide-react'

interface DataStoreNodeData {
  label: string
  tableName?: string
}

export const DataStoreNode = memo(({ data, selected }: NodeProps) => {
  const nodeData = data as DataStoreNodeData

  return (
    <div
      className={`px-4 py-3 rounded-lg bg-slate-800 border-2 min-w-[150px] ${
        selected ? 'border-green-500 shadow-lg shadow-green-500/20' : 'border-slate-600'
      }`}
      style={{
        borderRadius: '8px 8px 20px 20px',
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="w-3 h-3 bg-slate-500 border-2 border-slate-800"
      />
      <div className="flex items-center gap-2">
        <Database className="h-4 w-4 text-green-400" />
        <span className="text-sm font-medium text-white">{nodeData.label}</span>
      </div>
      {nodeData.tableName && (
        <code className="text-xs text-slate-400 mt-1 block">{nodeData.tableName}</code>
      )}
      <Handle
        type="source"
        position={Position.Bottom}
        className="w-3 h-3 bg-slate-500 border-2 border-slate-800"
      />
    </div>
  )
})

DataStoreNode.displayName = 'DataStoreNode'

