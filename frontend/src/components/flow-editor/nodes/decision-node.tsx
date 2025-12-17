'use client'

import { memo } from 'react'
import { Handle, Position, NodeProps } from '@xyflow/react'

interface DecisionNodeData {
  label: string
  condition?: string
}

export const DecisionNode = memo(({ data, selected }: NodeProps) => {
  const nodeData = data as unknown as DecisionNodeData

  return (
    <div
      className={`relative w-[120px] h-[120px] ${
        selected ? 'drop-shadow-lg' : ''
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="w-3 h-3 bg-slate-500 border-2 border-slate-800 z-10"
      />
      <div
        className={`absolute inset-0 bg-slate-800 border-2 rotate-45 ${
          selected ? 'border-yellow-500 shadow-lg shadow-yellow-500/20' : 'border-slate-600'
        }`}
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center">
          <span className="text-sm font-medium text-white">{nodeData.label}</span>
          {nodeData.condition && (
            <p className="text-xs text-slate-400 mt-1">{nodeData.condition}</p>
          )}
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="w-3 h-3 bg-slate-500 border-2 border-slate-800 z-10"
        id="yes"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="w-3 h-3 bg-slate-500 border-2 border-slate-800 z-10"
        id="no"
      />
    </div>
  )
})

DecisionNode.displayName = 'DecisionNode'

