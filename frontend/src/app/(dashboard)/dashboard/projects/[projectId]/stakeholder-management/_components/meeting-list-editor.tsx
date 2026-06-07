'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Trash2, Plus, Users } from 'lucide-react';
import type { RecordTemplate } from '@/lib/record-templates';
import { useSheetStore, useSheetRowsReadOnly, type SheetRow } from './sheet-store';
import { SaveBar } from './save-bar';

/** 報告粒度の追加列キー（meeting-list の rows に追記する／テンプレ列とは別管理）。 */
const STAKEHOLDERS_KEY = 'stakeholders'; // 対象ステークホルダー（氏名をカンマ連結）
const PURPOSE_KEY = 'purpose'; // 報告事項/目的

function splitNames(raw: string): string[] {
  return (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * 会議体一覧：既存の会議列に加えて「対象ステークホルダー（複数選択）」と
 * 「報告事項/目的」を持たせ、どの会議体が誰に何を報告するか（報告粒度）を可視化。
 * 選択肢は 'stakeholder-map' RecordSheet の氏名から動的に取得する。
 */
export function MeetingListEditor({
  projectId,
  template,
}: {
  projectId: string;
  template: RecordTemplate;
}) {
  const { rows, update, loading, saving, savedAt, save, error } = useSheetStore(
    projectId,
    template.key,
  );
  const stakeholderRows = useSheetRowsReadOnly(projectId, 'stakeholder-map');
  const [openPicker, setOpenPicker] = useState<number | null>(null);

  const stakeholderNames = useMemo(
    () =>
      Array.from(
        new Set(
          stakeholderRows
            .map((r) => (r.name ?? '').trim())
            .filter(Boolean),
        ),
      ),
    [stakeholderRows],
  );

  // 表に出す基本列（report-granularity 用キーは別 UI で扱うので除外して重複表示を防ぐ）
  const baseCols = template.columns.filter(
    (c) => c.key !== STAKEHOLDERS_KEY && c.key !== PURPOSE_KEY,
  );

  const emptyRow = (): SheetRow => {
    const r: SheetRow = {};
    for (const c of template.columns) r[c.key] = '';
    r[STAKEHOLDERS_KEY] = '';
    r[PURPOSE_KEY] = '';
    return r;
  };

  const addMeeting = () => update((prev) => [...prev, emptyRow()]);
  const deleteMeeting = (i: number) =>
    update((prev) => prev.filter((_, idx) => idx !== i));
  const setCell = (i: number, key: string, value: string) =>
    update((prev) =>
      prev.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)),
    );

  const toggleStakeholder = (rowIndex: number, name: string) => {
    update((prev) =>
      prev.map((r, idx) => {
        if (idx !== rowIndex) return r;
        const current = splitNames(r[STAKEHOLDERS_KEY] ?? '');
        const next = current.includes(name)
          ? current.filter((n) => n !== name)
          : [...current, name];
        return { ...r, [STAKEHOLDERS_KEY]: next.join(', ') };
      }),
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[240px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <SaveBar
        onAdd={addMeeting}
        addLabel="会議体を追加"
        onSave={() => save(rows)}
        saving={saving}
        savedAt={savedAt}
      />

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {stakeholderNames.length === 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
          「ステークホルダーマップ」タブに氏名を登録すると、各会議体の対象ステークホルダーとして選べるようになります。
        </div>
      )}

      <Card className="bg-white border-gray-200">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="w-10 px-2 py-2 text-left text-xs font-medium text-gray-400">
                    #
                  </th>
                  {baseCols.map((col) => (
                    <th
                      key={col.key}
                      className="min-w-[140px] whitespace-nowrap px-3 py-2 text-left text-xs font-semibold text-gray-600"
                    >
                      {col.label}
                    </th>
                  ))}
                  <th className="min-w-[220px] bg-blue-50 px-3 py-2 text-left text-xs font-semibold text-blue-700">
                    対象ステークホルダー
                  </th>
                  <th className="min-w-[200px] bg-blue-50 px-3 py-2 text-left text-xs font-semibold text-blue-700">
                    報告事項/目的
                  </th>
                  <th className="w-12 px-2 py-2" aria-label="操作" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const selected = splitNames(row[STAKEHOLDERS_KEY] ?? '');
                  return (
                    <tr
                      key={i}
                      className="border-b border-gray-100 align-top hover:bg-gray-50/50"
                    >
                      <td className="px-2 py-2 align-middle text-xs text-gray-400">
                        {i + 1}
                      </td>
                      {baseCols.map((col) => (
                        <td key={col.key} className="px-1.5 py-1.5 align-middle">
                          <input
                            type="text"
                            value={row[col.key] ?? ''}
                            onChange={(e) =>
                              setCell(i, col.key, e.target.value)
                            }
                            className="w-full min-w-[120px] rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm text-gray-900 hover:border-gray-200 focus:border-primary focus:bg-white focus:outline-none focus:ring-1 focus:ring-primary"
                            placeholder={col.label}
                          />
                        </td>
                      ))}

                      {/* 対象ステークホルダー（複数選択） */}
                      <td className="bg-blue-50/40 px-2 py-1.5">
                        <div className="flex flex-wrap gap-1">
                          {selected.map((name) => (
                            <span
                              key={name}
                              className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] text-blue-800"
                            >
                              {name}
                              <button
                                type="button"
                                onClick={() => toggleStakeholder(i, name)}
                                className="text-blue-500 hover:text-blue-800"
                                aria-label={`${name} を外す`}
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                        <div className="relative mt-1">
                          <button
                            type="button"
                            onClick={() =>
                              setOpenPicker(openPicker === i ? null : i)
                            }
                            disabled={stakeholderNames.length === 0}
                            className="flex items-center gap-1 rounded-md border border-blue-200 bg-white px-2 py-1 text-[11px] text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Users className="h-3 w-3" />
                            選択
                          </button>
                          {openPicker === i && stakeholderNames.length > 0 && (
                            <div className="absolute z-20 mt-1 max-h-48 w-48 overflow-y-auto rounded-md border border-gray-200 bg-white p-1 shadow-lg">
                              {stakeholderNames.map((name) => {
                                const checked = selected.includes(name);
                                return (
                                  <label
                                    key={name}
                                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-gray-50"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() =>
                                        toggleStakeholder(i, name)
                                      }
                                      className="h-3.5 w-3.5"
                                    />
                                    <span className="text-gray-800">{name}</span>
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* 報告事項/目的 */}
                      <td className="bg-blue-50/40 px-1.5 py-1.5">
                        <textarea
                          value={row[PURPOSE_KEY] ?? ''}
                          onChange={(e) =>
                            setCell(i, PURPOSE_KEY, e.target.value)
                          }
                          rows={2}
                          className="w-full resize-y rounded-md border border-transparent bg-white/70 px-2 py-1 text-sm text-gray-900 hover:border-gray-200 focus:border-primary focus:bg-white focus:outline-none focus:ring-1 focus:ring-primary"
                          placeholder="この会議体で何を報告するか"
                        />
                      </td>

                      <td className="px-2 py-1.5 text-center align-middle">
                        <button
                          type="button"
                          onClick={() => deleteMeeting(i)}
                          className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                          title="この会議体を削除"
                          aria-label="この会議体を削除"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={baseCols.length + 4}
                      className="px-4 py-10 text-center text-sm text-gray-400"
                    >
                      まだ会議体がありません。「会議体を追加」から始めましょう。
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-gray-100 px-3 py-2">
            <p className="text-xs text-gray-400">{rows.length} 会議体</p>
            <button
              type="button"
              onClick={addMeeting}
              className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
            >
              <Plus className="h-4 w-4" />
              会議体を追加
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
