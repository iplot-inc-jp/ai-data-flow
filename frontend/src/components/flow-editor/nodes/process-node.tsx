'use client'

import { memo } from 'react'
import { Handle, Position, NodeProps } from '@xyflow/react'
import { Settings } from 'lucide-react'

interface ProcessNodeData {
  label: string
  description?: string
  roleId?: string
}

export const ProcessNode = memo(({ data, selected }: NodeProps) => {
  const nodeData = data as unknown as ProcessNodeData

  return (
    <div
      className={`px-4 py-3 rounded-lg bg-slate-800 border-2 min-w-[150px] ${
        selected ? 'border-blue-500 shadow-lg shadow-blue-500/20' : 'border-slate-600'
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="w-3 h-3 bg-slate-500 border-2 border-slate-800"
      />
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-blue-400" />
        <span className="text-sm font-medium text-white">{nodeData.label}</span>
      </div>
      {nodeData.description && (
        <p className="text-xs text-slate-400 mt-1">{nodeData.description}</p>
      )}
      <Handle
        type="source"
        position={Position.Bottom}
        className="w-3 h-3 bg-slate-500 border-2 border-slate-800"
      />
    </div>
  )
})

ProcessNode.displayName = 'ProcessNode'

