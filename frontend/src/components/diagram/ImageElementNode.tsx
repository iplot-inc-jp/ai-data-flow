import { NodeResizer } from '@xyflow/react';

export type ImageElementNodeData = {
  url: string;
  onResizeEnd?: (id: string, size: { width: number; height: number }) => void;
};

export function ImageElementNode({ id, data, selected }: { id: string; data: ImageElementNodeData; selected?: boolean }) {
  return (
    <div className={`h-full w-full overflow-hidden rounded ${selected ? 'ring-2 ring-blue-500' : ''}`}>
      {data.onResizeEnd && (
        <NodeResizer
          minWidth={40} minHeight={40} isVisible={!!selected} keepAspectRatio={false}
          onResizeEnd={(_, p) => data.onResizeEnd?.(id, { width: Math.round(p.width), height: Math.round(p.height) })}
        />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={data.url} alt="" className="h-full w-full object-contain" draggable={false} />
    </div>
  );
}
