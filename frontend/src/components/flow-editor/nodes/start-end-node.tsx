'use client'

import { memo } from 'react'
import { Handle, Position, NodeProps } from '@xyflow/react'
import { Play, Square } from 'lucide-react'

interface StartEndNodeData {
  label: string
  isStart?: boolean
}

export const StartEndNode = memo(({ data, selected }: NodeProps) => {
  const nodeData = data as unknown as StartEndNodeData
  const isStart = nodeData.isStart

  return (
    <div
      className={`px-4 py-3 rounded-full bg-slate-800 border-2 min-w-[100px] flex items-center justify-center gap-2 ${
        selected ? 'border-slate-400 shadow-lg shadow-slate-500/20' : 'border-slate-600'
      }`}
    >
      {!isStart && (
        <Handle
          type="target"
          position={Position.Top}
          className="w-3 h-3 bg-slate-500 border-2 border-slate-800"
        />
      )}
      {isStart ? (
        <Play className="h-4 w-4 text-green-400" />
      ) : (
        <Square className="h-4 w-4 text-red-400" />
      )}
      <span className="text-sm font-medium text-white">{nodeData.label}</span>
      {isStart && (
        <Handle
          type="source"
          position={Position.Bottom}
          className="w-3 h-3 bg-slate-500 border-2 border-slate-800"
        />
      )}
    </div>
  )
})

StartEndNode.displayName = 'StartEndNode'

