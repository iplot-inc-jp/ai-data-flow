'use client';

/**
 * ObjectListTable — オブジェクト一覧テーブル（キャンバス下の一覧ビュー）。
 *
 * 名前/説明はインライン編集（blur/Enterで保存）、色はスウォッチクリックで保存。
 * 紐づくテーブル・DFDデータストアはチップ表示（title に名称一覧）。行クリックで選択。
 */

import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { DataObjectDto } from '@/lib/data-objects';
import { OBJECT_COLORS, objectColor } from './object-map-shared';

export interface ObjectListTableProps {
  objects: DataObjectDto[];
  selectedObjectId: string | null;
  onSelect: (id: string | null) => void;
  onUpdate: (
    id: string,
    patch: { name?: string; description?: string | null; color?: string | null },
  ) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
}

const cellInput =
  'h-8 w-full rounded-md border border-transparent bg-transparent px-2 text-sm text-gray-800 hover:border-gray-200 focus:border-blue-400 focus:bg-white focus:outline-none';

function ObjectRow({
  obj,
  selected,
  onSelect,
  onUpdate,
  onDelete,
}: {
  obj: DataObjectDto;
  selected: boolean;
  onSelect: (id: string | null) => void;
  onUpdate: ObjectListTableProps['onUpdate'];
  onDelete: ObjectListTableProps['onDelete'];
}) {
  const [name, setName] = useState(obj.name);
  const [description, setDescription] = useState(obj.description ?? '');

  useEffect(() => {
    setName(obj.name);
    setDescription(obj.description ?? '');
  }, [obj.name, obj.description]);

  const commitName = () => {
    const v = name.trim();
    if (v === '' || v === obj.name) {
      setName(obj.name);
      return;
    }
    void onUpdate(obj.id, { name: v });
  };

  const commitDescription = () => {
    const v = description.trim();
    if (v === (obj.description ?? '')) return;
    void onUpdate(obj.id, { description: v === '' ? null : v });
  };

  const color = objectColor(obj.color);
  const tableNames = obj.tables.map((t) => t.displayName ?? t.name).join('、');
  const dfdLabels = obj.dfdNodes.map((n) => n.label).join('、');

  return (
    <tr
      className={`border-b border-gray-100 last:border-0 ${
        selected ? 'bg-blue-50/60' : 'hover:bg-blue-50/30'
      }`}
      onClick={() => onSelect(obj.id)}
    >
      <td className="px-3 py-1.5">
        <input
          className={`${cellInput} font-medium`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          onClick={(e) => e.stopPropagation()}
        />
      </td>
      <td className="px-3 py-1.5">
        <input
          className={cellInput}
          placeholder="説明..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={commitDescription}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          onClick={(e) => e.stopPropagation()}
        />
      </td>
      <td className="px-3 py-1.5">
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {OBJECT_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className="rounded-full border-2"
              style={{
                background: c,
                width: 18,
                height: 18,
                borderColor: c === color ? '#0f172a' : 'transparent',
              }}
              title={c}
              onClick={() => void onUpdate(obj.id, { color: c })}
            />
          ))}
        </div>
      </td>
      <td className="px-3 py-1.5">
        <div className="flex flex-wrap items-center gap-1">
          <span
            className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600"
            title={tableNames || '紐づくテーブルなし'}
          >
            テーブル {obj.tables.length}
          </span>
          {obj.dfdNodes.length > 0 && (
            <span
              className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700"
              title={dfdLabels}
            >
              DFD {obj.dfdNodes.length}
            </span>
          )}
        </div>
      </td>
      <td className="px-3 py-1.5 text-right">
        <button
          type="button"
          className="rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-500"
          title="オブジェクトを削除"
          onClick={(e) => {
            e.stopPropagation();
            if (!window.confirm(`オブジェクト「${obj.name}」を削除しますか？`)) return;
            void onDelete(obj.id);
          }}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </td>
    </tr>
  );
}

export function ObjectListTable({
  objects,
  selectedObjectId,
  onSelect,
  onUpdate,
  onDelete,
}: ObjectListTableProps) {
  if (objects.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white py-10 text-center text-sm text-gray-400">
        オブジェクトがありません。
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold text-gray-600">
            <th className="w-48 px-3 py-2">名前</th>
            <th className="px-3 py-2">説明</th>
            <th className="w-48 px-3 py-2">色</th>
            <th className="w-44 px-3 py-2">紐づき</th>
            <th className="w-12 px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {objects.map((o) => (
            <ObjectRow
              key={o.id}
              obj={o}
              selected={o.id === selectedObjectId}
              onSelect={onSelect}
              onUpdate={onUpdate}
              onDelete={onDelete}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
