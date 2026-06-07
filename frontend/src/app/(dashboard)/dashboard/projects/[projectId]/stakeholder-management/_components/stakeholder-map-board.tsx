'use client';

import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Trash2, Plus, UserPlus } from 'lucide-react';
import type { RecordTemplate } from '@/lib/record-templates';
import { useSheetStore, type SheetRow } from './sheet-store';
import { SaveBar } from './save-bar';

const INFLUENCE_LEVELS = ['高', '中', '低'] as const;
const SUPPORT_LEVELS = ['支持', '中立', '反対'] as const;
type Influence = (typeof INFLUENCE_LEVELS)[number];
type Support = (typeof SUPPORT_LEVELS)[number];

/** セル値（「影響度(高/中/低)」等の冗長表記）から区分語を1つ取り出す。 */
function pickLevel<T extends string>(raw: string, levels: readonly T[]): T | '' {
  for (const lv of levels) {
    if (raw.includes(lv)) return lv;
  }
  return '';
}

/** 支持度→カードの色。 */
function supportClasses(support: Support | ''): string {
  switch (support) {
    case '支持':
      return 'border-emerald-300 bg-emerald-50 text-emerald-900';
    case '反対':
      return 'border-rose-300 bg-rose-50 text-rose-900';
    case '中立':
      return 'border-gray-300 bg-gray-50 text-gray-800';
    default:
      return 'border-gray-200 bg-white text-gray-700';
  }
}

export function StakeholderMapBoard({
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

  // 影響度×支持度 → そのセルに属する行のインデックス一覧
  const grid = useMemo(() => {
    const map = new Map<string, number[]>();
    rows.forEach((row, i) => {
      const inf = pickLevel(row.influence ?? '', INFLUENCE_LEVELS);
      const sup = pickLevel(row.support ?? '', SUPPORT_LEVELS);
      if (!inf || !sup) return;
      const key = `${inf}__${sup}`;
      const arr = map.get(key) ?? [];
      arr.push(i);
      map.set(key, arr);
    });
    return map;
  }, [rows]);

  const unplaced = useMemo(
    () =>
      rows
        .map((row, i) => ({ row, i }))
        .filter(
          ({ row }) =>
            !pickLevel(row.influence ?? '', INFLUENCE_LEVELS) ||
            !pickLevel(row.support ?? '', SUPPORT_LEVELS),
        ),
    [rows],
  );

  const setCell = (rowIndex: number, key: string, value: string) =>
    update((prev) =>
      prev.map((r, i) => (i === rowIndex ? { ...r, [key]: value } : r)),
    );

  const emptyRow = (): SheetRow => {
    const r: SheetRow = {};
    for (const c of template.columns) r[c.key] = '';
    return r;
  };

  const addStakeholder = (inf?: Influence, sup?: Support) =>
    update((prev) => {
      const r = emptyRow();
      r.no = String(prev.length + 1);
      if (inf) r.influence = inf;
      if (sup) r.support = sup;
      return [...prev, r];
    });

  const moveTo = (rowIndex: number, inf: Influence, sup: Support) =>
    update((prev) =>
      prev.map((r, i) =>
        i === rowIndex ? { ...r, influence: inf, support: sup } : r,
      ),
    );

  const deleteRow = (rowIndex: number) =>
    update((prev) => prev.filter((_, i) => i !== rowIndex));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[240px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SaveBar
        onAdd={() => addStakeholder()}
        addLabel="ステークホルダーを追加"
        onSave={() => save(rows)}
        saving={saving}
        savedAt={savedAt}
      />

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* 影響度 × 支持度 マトリクス */}
      <Card className="bg-white border-gray-200">
        <CardContent className="overflow-x-auto p-4">
          <div className="min-w-[680px]">
            {/* 列ヘッダー（支持度） */}
            <div className="grid grid-cols-[80px_repeat(3,1fr)] gap-2">
              <div className="flex items-end justify-center pb-1 text-[11px] font-semibold text-gray-400">
                影響度 \ 支持度
              </div>
              {SUPPORT_LEVELS.map((sup) => (
                <div
                  key={sup}
                  className="pb-1 text-center text-xs font-semibold text-gray-600"
                >
                  {sup}
                </div>
              ))}
            </div>

            {/* 行（影響度） */}
            {INFLUENCE_LEVELS.map((inf) => {
              const isHigh = inf === '高';
              return (
                <div
                  key={inf}
                  className="grid grid-cols-[80px_repeat(3,1fr)] gap-2 mt-2"
                >
                  <div
                    className={`flex items-center justify-center rounded-md text-sm font-semibold ${
                      isHigh
                        ? 'bg-[#050f3e] text-white'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {inf}
                  </div>
                  {SUPPORT_LEVELS.map((sup) => {
                    const idxs = grid.get(`${inf}__${sup}`) ?? [];
                    return (
                      <div
                        key={sup}
                        className={`min-h-[110px] rounded-md border p-2 space-y-1.5 ${
                          isHigh
                            ? 'border-blue-200 bg-blue-50/40'
                            : 'border-gray-200 bg-gray-50/40'
                        }`}
                      >
                        {idxs.map((rowIndex) => {
                          const row = rows[rowIndex];
                          return (
                            <div
                              key={rowIndex}
                              className={`group rounded-md border px-2 py-1.5 text-xs shadow-sm ${supportClasses(
                                sup,
                              )}`}
                            >
                              <div className="flex items-start justify-between gap-1">
                                <span className="font-semibold leading-tight">
                                  {row.name || '（無名）'}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => deleteRow(rowIndex)}
                                  className="shrink-0 rounded p-0.5 text-gray-400 opacity-0 transition-opacity hover:bg-white/60 hover:text-rose-600 group-hover:opacity-100"
                                  title="削除"
                                  aria-label="このステークホルダーを削除"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                              {row.affiliation && (
                                <div className="mt-0.5 text-[11px] text-gray-500">
                                  {row.affiliation}
                                </div>
                              )}
                              {/* セル移動 */}
                              <div className="mt-1 flex gap-1">
                                <select
                                  value={inf}
                                  onChange={(e) =>
                                    moveTo(
                                      rowIndex,
                                      e.target.value as Influence,
                                      sup,
                                    )
                                  }
                                  className="w-full rounded border border-gray-200 bg-white/80 px-1 py-0.5 text-[10px] text-gray-700"
                                  aria-label="影響度"
                                >
                                  {INFLUENCE_LEVELS.map((lv) => (
                                    <option key={lv} value={lv}>
                                      影響{lv}
                                    </option>
                                  ))}
                                </select>
                                <select
                                  value={sup}
                                  onChange={(e) =>
                                    moveTo(
                                      rowIndex,
                                      inf,
                                      e.target.value as Support,
                                    )
                                  }
                                  className="w-full rounded border border-gray-200 bg-white/80 px-1 py-0.5 text-[10px] text-gray-700"
                                  aria-label="支持度"
                                >
                                  {SUPPORT_LEVELS.map((lv) => (
                                    <option key={lv} value={lv}>
                                      {lv}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          );
                        })}

                        <button
                          type="button"
                          onClick={() => addStakeholder(inf, sup)}
                          className="flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-gray-300 py-1 text-[11px] text-gray-400 transition-colors hover:border-blue-400 hover:text-blue-600"
                        >
                          <Plus className="h-3 w-3" />
                          追加
                        </button>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* 未配置（影響度・支持度が未設定）の関係者 */}
          {unplaced.length > 0 && (
            <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3">
              <p className="mb-2 text-xs font-semibold text-amber-700">
                未配置（影響度・支持度が未設定）{unplaced.length} 件
              </p>
              <div className="flex flex-wrap gap-2">
                {unplaced.map(({ row, i }) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 rounded-md border border-amber-200 bg-white px-2 py-1 text-xs"
                  >
                    <span className="font-medium text-gray-800">
                      {row.name || '（無名）'}
                    </span>
                    <select
                      value={pickLevel(row.influence ?? '', INFLUENCE_LEVELS)}
                      onChange={(e) => setCell(i, 'influence', e.target.value)}
                      className="rounded border border-gray-200 px-1 py-0.5 text-[10px]"
                      aria-label="影響度"
                    >
                      <option value="">影響度</option>
                      {INFLUENCE_LEVELS.map((lv) => (
                        <option key={lv} value={lv}>
                          影響{lv}
                        </option>
                      ))}
                    </select>
                    <select
                      value={pickLevel(row.support ?? '', SUPPORT_LEVELS)}
                      onChange={(e) => setCell(i, 'support', e.target.value)}
                      className="rounded border border-gray-200 px-1 py-0.5 text-[10px]"
                      aria-label="支持度"
                    >
                      <option value="">支持度</option>
                      {SUPPORT_LEVELS.map((lv) => (
                        <option key={lv} value={lv}>
                          {lv}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 詳細テーブル（全列を編集） */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#050f3e]">
            ステークホルダー詳細（全項目）
          </h3>
          <button
            type="button"
            onClick={() => addStakeholder()}
            className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
          >
            <UserPlus className="h-4 w-4" />
            追加
          </button>
        </div>
        <Card className="bg-white border-gray-200">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="w-10 px-2 py-2 text-left text-xs font-medium text-gray-400">
                      #
                    </th>
                    {template.columns.map((col) => (
                      <th
                        key={col.key}
                        className="min-w-[140px] whitespace-nowrap px-3 py-2 text-left text-xs font-semibold text-gray-600"
                      >
                        {col.label}
                      </th>
                    ))}
                    <th className="w-12 px-2 py-2" aria-label="操作" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, rowIndex) => (
                    <tr
                      key={rowIndex}
                      className="border-b border-gray-100 hover:bg-gray-50/50"
                    >
                      <td className="px-2 py-1 align-middle text-xs text-gray-400">
                        {rowIndex + 1}
                      </td>
                      {template.columns.map((col) => (
                        <td key={col.key} className="px-1.5 py-1 align-middle">
                          <input
                            type="text"
                            value={row[col.key] ?? ''}
                            onChange={(e) =>
                              setCell(rowIndex, col.key, e.target.value)
                            }
                            className="w-full min-w-[120px] rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm text-gray-900 hover:border-gray-200 focus:border-primary focus:bg-white focus:outline-none focus:ring-1 focus:ring-primary"
                            placeholder={col.label}
                          />
                        </td>
                      ))}
                      <td className="px-2 py-1 text-center align-middle">
                        <button
                          type="button"
                          onClick={() => deleteRow(rowIndex)}
                          className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                          title="この行を削除"
                          aria-label="この行を削除"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td
                        colSpan={template.columns.length + 2}
                        className="px-4 py-10 text-center text-sm text-gray-400"
                      >
                        まだステークホルダーがいません。「追加」から始めましょう。
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
