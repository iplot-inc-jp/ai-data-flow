'use client';

/**
 * ScopeMembersPanel — オブジェクト関係性マップ内の「領域 → 内包オブジェクト」一覧サイドパネル。
 *
 * 領域（SubProject）ごとに、その領域に属する（DataObject.subProjectId 一致）オブジェクトを
 * ツリー表示する。行クリックでそのオブジェクトを選択＆キャンバス中央へフォーカスする。
 * 「未所属」グループ（subProjectId=null / 存在しない領域）も表示する。
 * データはローカル state（objects ＋ subProjects）から算出（追加 API 不要）。
 * 開閉できる（折りたたみ時は細いバー）。各領域グループも個別に折りたためる。
 */

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Layers, Boxes, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { subProjectPath } from '@/components/ui/sub-project-picker';
import type { SubProjectMaster } from '@/lib/masters';
import type { DataObjectDto } from '@/lib/data-objects';
import { objectColor } from './object-map-shared';

interface ScopeMembersPanelProps {
  objects: DataObjectDto[];
  subProjects: SubProjectMaster[];
  selectedObjectId: string | null;
  /** 行クリック時：オブジェクトを選択＆キャンバスをそのオブジェクトへフォーカス。 */
  onFocusObject: (objectId: string) => void;
}

export function ScopeMembersPanel({
  objects,
  subProjects,
  selectedObjectId,
  onFocusObject,
}: ScopeMembersPanelProps) {
  const [open, setOpen] = useState(true);
  // グループ折りたたみ状態（key 単位。未登録は開いている扱い）
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const groups = useMemo(() => {
    const sorted = [...subProjects].sort(
      (a, b) => a.order - b.order || a.name.localeCompare(b.name, 'ja'),
    );
    const ids = new Set(sorted.map((s) => s.id));
    const list: Array<{ key: string; name: string; members: DataObjectDto[] }> = sorted.map(
      (sp) => ({
        key: sp.id,
        name: subProjectPath(sp.id, subProjects) || sp.name,
        members: objects.filter((o) => o.subProjectId === sp.id),
      }),
    );
    const unassigned = objects.filter((o) => !o.subProjectId || !ids.has(o.subProjectId));
    list.push({ key: '__unassigned__', name: '未所属', members: unassigned });
    return list;
  }, [objects, subProjects]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="領域一覧を開く"
        className="flex w-8 shrink-0 flex-col items-center gap-2 rounded-lg border border-gray-200 bg-white py-2 text-gray-500 hover:bg-gray-50"
      >
        <PanelLeftOpen className="h-4 w-4" />
        <span className="[writing-mode:vertical-rl] text-[11px] font-medium tracking-wide text-gray-600">
          領域一覧
        </span>
      </button>
    );
  }

  return (
    <div className="flex w-56 shrink-0 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center justify-between gap-1 border-b border-gray-200 bg-gray-50 px-2 py-1.5">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-700">
          <Layers className="h-3.5 w-3.5 text-indigo-400" />
          領域 × 内包オブジェクト
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          title="閉じる"
          className="rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {groups.map((group) => {
          const isCollapsed = collapsed[group.key] ?? false;
          return (
            <div key={group.key} className="mb-1.5 overflow-hidden rounded-md border border-gray-200">
              <button
                type="button"
                onClick={() =>
                  setCollapsed((c) => ({ ...c, [group.key]: !(c[group.key] ?? false) }))
                }
                className="flex w-full items-center gap-1 border-b border-gray-100 bg-gray-50 px-1.5 py-1 text-left hover:bg-gray-100"
              >
                {isCollapsed ? (
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                )}
                {group.key === '__unassigned__' ? (
                  <Boxes className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                ) : (
                  <Layers className="h-3.5 w-3.5 shrink-0 text-indigo-400" />
                )}
                <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-gray-800">
                  {group.name}
                </span>
                <span className="shrink-0 rounded-full bg-gray-200 px-1.5 text-[10px] text-gray-600">
                  {group.members.length}
                </span>
              </button>
              {!isCollapsed &&
                (group.members.length > 0 ? (
                  <div className="divide-y divide-gray-50">
                    {group.members.map((obj) => {
                      const selected = obj.id === selectedObjectId;
                      return (
                        <button
                          key={obj.id}
                          type="button"
                          onClick={() => onFocusObject(obj.id)}
                          title={obj.name}
                          className={`flex w-full items-center gap-1.5 px-2 py-1 text-left text-[12px] hover:bg-indigo-50 ${
                            selected ? 'bg-indigo-100 font-medium text-indigo-900' : 'text-gray-700'
                          }`}
                        >
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ background: objectColor(obj.color) }}
                          />
                          <span className="min-w-0 flex-1 truncate">{obj.name}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="px-2 py-1.5 text-[11px] text-gray-400">なし</p>
                ))}
            </div>
          );
        })}
        {subProjects.length === 0 && (
          <p className="rounded-md bg-amber-50 px-2 py-1.5 text-[11px] text-amber-700">
            領域がまだありません。プロジェクト設定で領域を作成すると、ここに表示されます。
          </p>
        )}
      </div>
    </div>
  );
}
