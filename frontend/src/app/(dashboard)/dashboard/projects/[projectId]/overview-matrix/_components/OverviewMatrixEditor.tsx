'use client';

/**
 * 俯瞰思考（俯瞰マトリクス）エディタ本体。
 *
 * CRUOA マトリクス（CruoaMatrix）のツールバー / dirty 保存 / トグルチップ / 診断 UX を
 * 移植（直接共用はしない）。表のセル結合（rowSpan/colSpan）は純関数
 * `buildMatrixLayout(axes, cells)` のレンダープランに完全に従ってレンダーする
 * （span をインラインで再計算しない）。
 *
 * 状態:
 *   - axes: 編集可能な軸配列。各軸項目は crypto.randomUUID() の安定 id を持ち、
 *           セルはこの id で軸項目を参照する（ラベル改名で孤児化しない）。
 *   - cells: (rowItemId|colItemId|layerItemId) をキーにした Record。
 *           セルが未生成のときは初回編集で生成する。保存時は現在の軸項目グリッドに
 *           属する全セルを replace-all で送る。
 *
 * セルモード:
 *   - TEXT  : クリックでインラインのテキスト編集。
 *   - TAGS  : tagOptions のチップを複数トグル → "C/R/U" のスラッシュ連結で保存。
 *   - SYMBOL: tagOptions から単一値を選択（クリックで巡回）。
 *
 * グレーアウト（非該当）:
 *   - 各セルの ⊘ で isApplicable をトグル。false のとき灰背景＋「─」＋理由入力。
 *   - 行/列/第3軸 見出しの ⊘ はそのスライスの全セルへ isApplicable=false を展開保存する
 *     （クライアント側で各セルにフラグを書く）。
 */

import { useState, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useReadOnly } from '@/components/read-only-context';
import {
  Plus,
  Trash2,
  Save,
  Loader2,
  Check,
  Download,
  Printer,
  ChevronUp,
  ChevronDown,
  Ban,
  Columns3,
  Rows3,
  HelpCircle,
} from 'lucide-react';
import {
  overviewMatrixApi,
  type OverviewMatrixSnapshot,
  type OverviewMatrixCell,
  type CellMode,
  type AxisSide,
  type TagOption,
} from '@/lib/overview-matrix';
import {
  buildMatrixLayout,
  type HeaderCell,
} from '@/lib/overview-matrix-layout';

// ---------------------------------------------------------------------------
// 内部の編集用型
// ---------------------------------------------------------------------------

type EditAxisItem = {
  id: string;
  label: string;
  order: number;
  sourceType: string;
  sourceId: string | null;
};

type EditAxis = {
  axisIndex: number;
  name: string;
  side: AxisSide;
  items: EditAxisItem[];
};

// セルは (rowItemId|colItemId|layerItemId??'') をキーにした Record で保持する。
type CellKey = string;
type CellMap = Record<CellKey, OverviewMatrixCell>;

const cellKey = (
  rowItemId: string,
  colItemId: string,
  layerItemId: string | null | undefined,
): CellKey => `${rowItemId}|${colItemId}|${layerItemId ?? ''}`;

const CELL_MODES: { mode: CellMode; label: string }[] = [
  { mode: 'TEXT', label: '自由記述' },
  { mode: 'TAGS', label: 'タグ' },
  { mode: 'SYMBOL', label: '記号' },
];

// 既定のタグ凡例（TAGS/SYMBOL に切替えたとき tagOptions が空なら使う）。
const DEFAULT_TAG_OPTIONS: TagOption[] = [
  { key: '○', label: '対応', color: '#16a34a' },
  { key: '△', label: '一部', color: '#d97706' },
  { key: '×', label: '不可', color: '#dc2626' },
];

// ---------------------------------------------------------------------------
// 初期化ヘルパー
// ---------------------------------------------------------------------------

function snapshotToAxes(snapshot: OverviewMatrixSnapshot): EditAxis[] {
  const axes = [...snapshot.axes]
    .sort((a, b) => a.axisIndex - b.axisIndex)
    .map<EditAxis>((a) => ({
      axisIndex: a.axisIndex,
      name: a.name,
      side: a.side ?? 'COL',
      items: [...a.items]
        .sort((x, y) => (x.order ?? 0) - (y.order ?? 0))
        .map((it) => ({
          id: it.id,
          label: it.label,
          order: it.order ?? 0,
          sourceType: it.sourceType ?? 'FREE',
          sourceId: it.sourceId ?? null,
        })),
    }));
  // 行(0)・列(1)が無ければ空ひな形を補完（防御的）。
  if (!axes.some((a) => a.axisIndex === 0)) {
    axes.unshift({ axisIndex: 0, name: '行', side: 'COL', items: [] });
  }
  if (!axes.some((a) => a.axisIndex === 1)) {
    axes.push({ axisIndex: 1, name: '列', side: 'COL', items: [] });
  }
  return axes.sort((a, b) => a.axisIndex - b.axisIndex);
}

function snapshotToCells(snapshot: OverviewMatrixSnapshot): CellMap {
  const map: CellMap = {};
  for (const c of snapshot.cells) {
    map[cellKey(c.rowItemId, c.colItemId, c.layerItemId)] = {
      rowItemId: c.rowItemId,
      colItemId: c.colItemId,
      layerItemId: c.layerItemId ?? null,
      value: c.value ?? null,
      note: c.note ?? null,
      isApplicable: c.isApplicable ?? true,
      reason: c.reason ?? null,
    };
  }
  return map;
}

function makeBlankCell(
  rowItemId: string,
  colItemId: string,
  layerItemId: string | null,
): OverviewMatrixCell {
  return {
    rowItemId,
    colItemId,
    layerItemId,
    value: null,
    note: null,
    isApplicable: true,
    reason: null,
  };
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// ---------------------------------------------------------------------------
// エディタ本体
// ---------------------------------------------------------------------------

export function OverviewMatrixEditor({
  matrixId,
  snapshot,
}: {
  matrixId: string;
  snapshot: OverviewMatrixSnapshot;
}) {
  const { canEdit } = useReadOnly();

  const [name, setName] = useState(snapshot.matrix.name);
  const [purpose, setPurpose] = useState(snapshot.matrix.purpose ?? '');
  const [cellMode, setCellMode] = useState<CellMode>(snapshot.matrix.cellMode);
  const [tagOptions, setTagOptions] = useState<TagOption[]>(
    snapshot.matrix.tagOptions ?? [],
  );
  const [axes, setAxes] = useState<EditAxis[]>(() => snapshotToAxes(snapshot));
  const [cells, setCells] = useState<CellMap>(() => snapshotToCells(snapshot));

  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // インライン編集中のセル（TEXT モード）。
  const [editingCell, setEditingCell] = useState<CellKey | null>(null);

  const markDirty = useCallback(() => {
    setDirty(true);
    setSavedAt(null);
  }, []);

  // ---- レンダープラン（セル結合はここで決まり切る） ----
  const layout = useMemo(
    () =>
      buildMatrixLayout(
        // buildMatrixLayout は OverviewMatrixAxis 型を期待するが、編集用 EditAxis は
        // 必要なフィールド（axisIndex/name/side/items{id,label,order}）を満たす上位互換。
        axes.map((a) => ({
          id: `axis-${a.axisIndex}`,
          axisIndex: a.axisIndex,
          name: a.name,
          side: a.side,
          items: a.items,
        })),
        Object.values(cells),
      ),
    [axes, cells],
  );

  const rowAxis = axes.find((a) => a.axisIndex === 0);
  const colAxis = axes.find((a) => a.axisIndex === 1);
  const layerAxis = axes.find((a) => a.axisIndex === 2);

  // ---- 軸操作 -----------------------------------------------------------

  const updateAxisName = (axisIndex: number, value: string) => {
    setAxes((prev) =>
      prev.map((a) => (a.axisIndex === axisIndex ? { ...a, name: value } : a)),
    );
    markDirty();
  };

  const updateAxisSide = (axisIndex: number, side: AxisSide) => {
    setAxes((prev) =>
      prev.map((a) => (a.axisIndex === axisIndex ? { ...a, side } : a)),
    );
    markDirty();
  };

  const addItem = (axisIndex: number) => {
    setAxes((prev) =>
      prev.map((a) =>
        a.axisIndex === axisIndex
          ? {
              ...a,
              items: [
                ...a.items,
                {
                  id: crypto.randomUUID(),
                  label: '',
                  order: a.items.length,
                  sourceType: 'FREE',
                  sourceId: null,
                },
              ],
            }
          : a,
      ),
    );
    markDirty();
  };

  const updateItemLabel = (axisIndex: number, itemId: string, label: string) => {
    setAxes((prev) =>
      prev.map((a) =>
        a.axisIndex === axisIndex
          ? {
              ...a,
              items: a.items.map((it) =>
                it.id === itemId ? { ...it, label } : it,
              ),
            }
          : a,
      ),
    );
    markDirty();
  };

  const deleteItem = (axisIndex: number, itemId: string) => {
    setAxes((prev) =>
      prev.map((a) =>
        a.axisIndex === axisIndex
          ? {
              ...a,
              items: a.items
                .filter((it) => it.id !== itemId)
                .map((it, i) => ({ ...it, order: i })),
            }
          : a,
      ),
    );
    // この項目を参照するセルを掃除。
    setCells((prev) => {
      const next: CellMap = {};
      for (const [k, c] of Object.entries(prev)) {
        if (
          c.rowItemId === itemId ||
          c.colItemId === itemId ||
          c.layerItemId === itemId
        ) {
          continue;
        }
        next[k] = c;
      }
      return next;
    });
    markDirty();
  };

  const moveItem = (axisIndex: number, itemId: string, dir: -1 | 1) => {
    setAxes((prev) =>
      prev.map((a) => {
        if (a.axisIndex !== axisIndex) return a;
        const idx = a.items.findIndex((it) => it.id === itemId);
        const target = idx + dir;
        if (idx < 0 || target < 0 || target >= a.items.length) return a;
        const items = [...a.items];
        [items[idx], items[target]] = [items[target], items[idx]];
        return { ...a, items: items.map((it, i) => ({ ...it, order: i })) };
      }),
    );
    markDirty();
  };

  // 第3軸の追加 / 削除（v1 は 2 or 3 軸）。
  const addThirdAxis = (side: AxisSide) => {
    if (layerAxis) return;
    setAxes((prev) => [
      ...prev,
      { axisIndex: 2, name: '第3軸', side, items: [] },
    ]);
    markDirty();
  };

  const removeThirdAxis = () => {
    if (!layerAxis) return;
    const layerItemIds = new Set(layerAxis.items.map((it) => it.id));
    setAxes((prev) => prev.filter((a) => a.axisIndex !== 2));
    // 第3軸項目を参照するセルを掃除（layerItemId 付きセル）。
    setCells((prev) => {
      const next: CellMap = {};
      for (const [k, c] of Object.entries(prev)) {
        if (c.layerItemId && layerItemIds.has(c.layerItemId)) continue;
        next[k] = c;
      }
      return next;
    });
    markDirty();
  };

  // ---- セル操作 ---------------------------------------------------------

  // 指定座標のセルを取得（無ければ undefined）。
  const getCell = useCallback(
    (rowItemId: string, colItemId: string, layerItemId: string | null) =>
      cells[cellKey(rowItemId, colItemId, layerItemId)],
    [cells],
  );

  // セルを更新（無ければ生成）するヘルパー。
  const patchCell = useCallback(
    (
      rowItemId: string,
      colItemId: string,
      layerItemId: string | null,
      patch: Partial<OverviewMatrixCell>,
    ) => {
      setCells((prev) => {
        const key = cellKey(rowItemId, colItemId, layerItemId);
        const base =
          prev[key] ?? makeBlankCell(rowItemId, colItemId, layerItemId);
        return { ...prev, [key]: { ...base, ...patch } };
      });
      markDirty();
    },
    [markDirty],
  );

  const setCellValue = (
    rowItemId: string,
    colItemId: string,
    layerItemId: string | null,
    value: string,
  ) => {
    patchCell(rowItemId, colItemId, layerItemId, {
      value: value === '' ? null : value,
    });
  };

  // TAGS: tagOptions のキーをスラッシュ連結でトグル。
  const toggleTag = (
    rowItemId: string,
    colItemId: string,
    layerItemId: string | null,
    key: string,
  ) => {
    const cur = getCell(rowItemId, colItemId, layerItemId);
    const tags = (cur?.value ?? '')
      .split('/')
      .map((s) => s.trim())
      .filter(Boolean);
    const next = tags.includes(key)
      ? tags.filter((t) => t !== key)
      : [...tags, key];
    // tagOptions の並び順に正規化。
    const ordered = tagOptions
      .map((o) => o.key)
      .filter((k) => next.includes(k));
    setCellValue(rowItemId, colItemId, layerItemId, ordered.join('/'));
  };

  // SYMBOL: 単一値（クリックで巡回 → 空に戻る）。
  const cycleSymbol = (
    rowItemId: string,
    colItemId: string,
    layerItemId: string | null,
  ) => {
    const cur = getCell(rowItemId, colItemId, layerItemId)?.value ?? '';
    const keys = tagOptions.map((o) => o.key);
    const idx = keys.indexOf(cur);
    // 空 → 最初 → ... → 最後 → 空
    const nextVal = idx < 0 ? keys[0] ?? '' : keys[idx + 1] ?? '';
    setCellValue(rowItemId, colItemId, layerItemId, nextVal);
  };

  // セル単体のグレーアウトトグル。
  const toggleCellApplicable = (
    rowItemId: string,
    colItemId: string,
    layerItemId: string | null,
  ) => {
    const cur = getCell(rowItemId, colItemId, layerItemId);
    patchCell(rowItemId, colItemId, layerItemId, {
      isApplicable: !(cur?.isApplicable ?? true),
    });
  };

  // 見出し（行/列/第3軸）の一括グレーアウト。スライス内の全セルに isApplicable=false を展開保存。
  const grayOutSlice = (kind: 'row' | 'col' | 'layer', itemId: string) => {
    if (!canEdit) return;
    const rowItems = rowAxis?.items ?? [];
    const colItems = colAxis?.items ?? [];
    const layerItems = layerAxis?.items ?? [];
    const triples: { r: string; c: string; l: string | null }[] = [];
    const layerSpan: (string | null)[] =
      layerItems.length > 0 ? layerItems.map((it) => it.id) : [null];

    if (kind === 'row') {
      for (const c of colItems)
        for (const l of layerSpan) triples.push({ r: itemId, c: c.id, l });
    } else if (kind === 'col') {
      for (const r of rowItems)
        for (const l of layerSpan) triples.push({ r: r.id, c: itemId, l });
    } else {
      for (const r of rowItems)
        for (const c of colItems) triples.push({ r: r.id, c: c.id, l: itemId });
    }
    // このスライスが既に全て非該当なら、トグルで戻す（再該当）。
    const allOff = triples.every(
      (t) => getCell(t.r, t.c, t.l)?.isApplicable === false,
    );
    setCells((prev) => {
      const next = { ...prev };
      for (const t of triples) {
        const key = cellKey(t.r, t.c, t.l);
        const base = next[key] ?? makeBlankCell(t.r, t.c, t.l);
        next[key] = { ...base, isApplicable: allOff };
      }
      return next;
    });
    markDirty();
  };

  // ---- tagOptions（凡例）編集 ------------------------------------------

  const ensureTagOptions = () => {
    if (tagOptions.length === 0) setTagOptions(DEFAULT_TAG_OPTIONS);
  };

  const addTagOption = () => {
    setTagOptions((prev) => [...prev, { key: '', label: '', color: '#64748b' }]);
    markDirty();
  };

  const updateTagOption = (
    idx: number,
    patch: Partial<TagOption>,
  ) => {
    setTagOptions((prev) =>
      prev.map((o, i) => (i === idx ? { ...o, ...patch } : o)),
    );
    markDirty();
  };

  const deleteTagOption = (idx: number) => {
    setTagOptions((prev) => prev.filter((_, i) => i !== idx));
    markDirty();
  };

  const changeCellMode = (mode: CellMode) => {
    setCellMode(mode);
    if ((mode === 'TAGS' || mode === 'SYMBOL') && tagOptions.length === 0) {
      setTagOptions(DEFAULT_TAG_OPTIONS);
    }
    markDirty();
  };

  // ---- 保存（replace-all） ---------------------------------------------

  // 現在の軸項目グリッドに属する全セルを列挙（未生成は空セルとして送る）。
  const collectAllCells = useCallback((): OverviewMatrixCell[] => {
    const rowItems = rowAxis?.items ?? [];
    const colItems = colAxis?.items ?? [];
    const layerItems = layerAxis?.items ?? [];
    const layerSpan: (string | null)[] =
      layerItems.length > 0 ? layerItems.map((it) => it.id) : [null];
    const out: OverviewMatrixCell[] = [];
    for (const r of rowItems) {
      for (const c of colItems) {
        for (const l of layerSpan) {
          const existing = cells[cellKey(r.id, c.id, l)];
          out.push(existing ?? makeBlankCell(r.id, c.id, l));
        }
      }
    }
    return out;
  }, [rowAxis, colAxis, layerAxis, cells]);

  const handleSave = async () => {
    if (!canEdit) return;
    setSaving(true);
    setError(null);
    try {
      const allCells = collectAllCells();
      const updated = await overviewMatrixApi.replace(matrixId, {
        name: name.trim(),
        purpose: purpose.trim() || null,
        cellMode,
        tagOptions:
          cellMode === 'TEXT'
            ? tagOptions.length > 0
              ? tagOptions
              : null
            : tagOptions,
        axes: axes.map((a) => ({
          axisIndex: a.axisIndex,
          name: a.name,
          side: a.side,
          items: a.items.map((it, i) => ({
            id: it.id,
            label: it.label,
            order: i,
            sourceType: it.sourceType,
            sourceId: it.sourceId,
          })),
        })),
        cells: allCells.map((c) => ({
          rowItemId: c.rowItemId,
          colItemId: c.colItemId,
          layerItemId: c.layerItemId,
          value: c.value,
          note: c.note,
          isApplicable: c.isApplicable,
          reason: c.reason,
        })),
      });
      // 保存後の正規化済みスナップショットで状態を更新（孤児掃除等を反映）。
      setAxes(snapshotToAxes(updated));
      setCells(snapshotToCells(updated));
      setName(updated.matrix.name);
      setPurpose(updated.matrix.purpose ?? '');
      setCellMode(updated.matrix.cellMode);
      setTagOptions(updated.matrix.tagOptions ?? []);
      setDirty(false);
      setSavedAt(Date.now());
    } catch (err) {
      console.error('Failed to save overview matrix:', err);
      setError('保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  // ---- CSV エクスポート -------------------------------------------------

  const handleCsvDownload = () => {
    const lines: string[] = [];
    // ヘッダー行（レンダープランの headerCells を colSpan ぶん展開）。
    for (const hrow of layout.headerCells) {
      const cellsOut: string[] = [];
      for (const h of hrow) {
        cellsOut.push(csvEscape(h.label));
        for (let i = 1; i < h.colSpan; i++) cellsOut.push('');
      }
      lines.push(cellsOut.join(','));
    }
    // ボディ行。
    for (const brow of layout.bodyRows) {
      const cellsOut: string[] = [];
      if (brow.rowSpanForRowHeader > 0) cellsOut.push(csvEscape(brow.rowLabel));
      else cellsOut.push('');
      if (brow.layerHeader) cellsOut.push(csvEscape(brow.layerHeader.label));
      for (const ref of brow.cells) {
        const cell = layout.cellAt(ref.rowItemId, ref.colItemId, ref.layerItemId);
        if (cell && cell.isApplicable === false) cellsOut.push('─');
        else cellsOut.push(csvEscape(cell?.value ?? ''));
      }
      lines.push(cellsOut.join(','));
    }
    const csv = '﻿' + lines.join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${(name || 'overview-matrix').replace(/[\\/:*?"<>|]/g, '_')}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  // ---- 監査（未定 / 非該当） -------------------------------------------

  const audit = useMemo(() => {
    const all = collectAllCells();
    let undefinedCount = 0;
    let inapplicableCount = 0;
    for (const c of all) {
      if (c.isApplicable === false) inapplicableCount++;
      else if (!c.value || c.value.trim() === '') undefinedCount++;
    }
    return { total: all.length, undefinedCount, inapplicableCount };
  }, [collectAllCells]);

  // ---- レンダリングヘルパー（セル本体） --------------------------------

  const renderCellBody = (
    rowItemId: string,
    colItemId: string,
    layerItemId: string | null,
  ) => {
    const key = cellKey(rowItemId, colItemId, layerItemId);
    const cell = cells[key];
    const applicable = cell?.isApplicable ?? true;
    const value = cell?.value ?? '';

    if (!applicable) {
      return (
        <div className="space-y-1">
          <div className="text-center text-gray-400 select-none">─</div>
          {canEdit && (
            <Input
              value={cell?.reason ?? ''}
              onChange={(e) =>
                patchCell(rowItemId, colItemId, layerItemId, {
                  reason: e.target.value || null,
                })
              }
              placeholder="非該当の理由"
              className="h-6 border-transparent bg-transparent text-[11px] text-gray-500 hover:border-gray-200 focus:bg-white"
            />
          )}
          {!canEdit && cell?.reason && (
            <div className="text-[11px] text-gray-400">{cell.reason}</div>
          )}
        </div>
      );
    }

    if (cellMode === 'TEXT') {
      const isEditing = editingCell === key;
      if (isEditing && canEdit) {
        return (
          <textarea
            autoFocus
            value={value}
            onChange={(e) =>
              setCellValue(rowItemId, colItemId, layerItemId, e.target.value)
            }
            onBlur={() => setEditingCell(null)}
            rows={2}
            className="w-full resize-y rounded border border-blue-300 bg-white p-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        );
      }
      return (
        <button
          type="button"
          onClick={() => canEdit && setEditingCell(key)}
          className="min-h-[28px] w-full whitespace-pre-wrap break-words rounded px-1 py-0.5 text-left text-xs hover:bg-blue-50/60"
        >
          {value ? (
            <span className="text-gray-800">{value}</span>
          ) : (
            <span className="text-gray-300">?</span>
          )}
        </button>
      );
    }

    if (cellMode === 'TAGS') {
      const selected = value
        .split('/')
        .map((s) => s.trim())
        .filter(Boolean);
      return (
        <div className="flex flex-wrap items-center justify-center gap-0.5">
          {tagOptions.length === 0 ? (
            <span className="text-[11px] text-gray-300">凡例なし</span>
          ) : (
            tagOptions.map((o) => {
              const on = selected.includes(o.key);
              return (
                <button
                  key={o.key || o.label}
                  type="button"
                  disabled={!canEdit}
                  onClick={() => toggleTag(rowItemId, colItemId, layerItemId, o.key)}
                  title={o.label}
                  className="inline-flex h-6 min-w-6 items-center justify-center rounded border px-1 text-[11px] font-bold transition-colors disabled:cursor-default"
                  style={
                    on
                      ? {
                          backgroundColor: (o.color ?? '#64748b') + '22',
                          borderColor: o.color ?? '#64748b',
                          color: o.color ?? '#334155',
                        }
                      : { borderColor: '#e5e7eb', color: '#cbd5e1' }
                  }
                >
                  {o.key || '?'}
                </button>
              );
            })
          )}
          {selected.length === 0 && tagOptions.length > 0 && (
            <span className="ml-0.5 text-[11px] text-gray-300">?</span>
          )}
        </div>
      );
    }

    // SYMBOL
    const opt = tagOptions.find((o) => o.key === value);
    return (
      <button
        type="button"
        disabled={!canEdit}
        onClick={() => cycleSymbol(rowItemId, colItemId, layerItemId)}
        title={opt ? opt.label : 'クリックで選択'}
        className="inline-flex h-7 w-full items-center justify-center rounded text-base font-bold hover:bg-blue-50/60 disabled:cursor-default"
        style={opt?.color ? { color: opt.color } : undefined}
      >
        {value ? value : <span className="text-gray-300 text-xs">?</span>}
      </button>
    );
  };

  // 見出しセル（th）の ⊘ ボタン（kind に応じてスライス一括）。
  const headerGrayButton = (h: HeaderCell) => {
    if (!canEdit) return null;
    if (h.kind === 'col' && h.colItemId) {
      return (
        <button
          type="button"
          onClick={() => grayOutSlice('col', h.colItemId!)}
          title="この列を一括で非該当/該当に切替"
          className="ml-1 rounded p-0.5 text-gray-300 hover:bg-gray-200 hover:text-gray-600"
        >
          <Ban className="h-3 w-3" />
        </button>
      );
    }
    if (h.kind === 'layer' && h.layerItemId) {
      return (
        <button
          type="button"
          onClick={() => grayOutSlice('layer', h.layerItemId!)}
          title="この第3軸スライスを一括で非該当/該当に切替"
          className="ml-1 rounded p-0.5 text-gray-300 hover:bg-gray-200 hover:text-gray-600"
        >
          <Ban className="h-3 w-3" />
        </button>
      );
    }
    return null;
  };

  const hasGrid =
    (rowAxis?.items.length ?? 0) > 0 && (colAxis?.items.length ?? 0) > 0;

  // ---- JSX --------------------------------------------------------------

  return (
    <div className="space-y-4">
      {/* ===== ツールバー ===== */}
      <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-3">
        {/* 表名・目的 */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <div className="sm:flex-1">
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                markDirty();
              }}
              disabled={!canEdit}
              placeholder="俯瞰マトリクス名"
              className="h-9 text-base font-semibold"
            />
            <Input
              value={purpose}
              onChange={(e) => {
                setPurpose(e.target.value);
                markDirty();
              }}
              disabled={!canEdit}
              placeholder="目的（任意）"
              className="mt-1.5 h-8 border-transparent bg-transparent text-sm text-gray-500 hover:border-gray-200 focus:bg-white"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCsvDownload}
              className="gap-1.5"
            >
              <Download className="h-4 w-4" />
              CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.print()}
              className="gap-1.5"
            >
              <Printer className="h-4 w-4" />
              印刷
            </Button>
            {canEdit && (
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving}
                className="gap-1.5 bg-blue-600 hover:bg-blue-700"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : savedAt && !dirty ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {saving
                  ? '保存中...'
                  : dirty
                    ? '保存（未保存の変更）'
                    : savedAt
                      ? '保存しました'
                      : '保存'}
              </Button>
            )}
          </div>
        </div>

        {/* モード切替 + 軸の追加/削除 */}
        {canEdit && (
          <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-2">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-gray-500">セル:</span>
              <div className="inline-flex rounded-lg border border-gray-200 p-0.5 text-xs">
                {CELL_MODES.map(({ mode, label }) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => changeCellMode(mode)}
                    className={`rounded-md px-2.5 py-1 transition-colors ${
                      cellMode === mode
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-gray-500">第3軸:</span>
              {layerAxis ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={removeThirdAxis}
                  className="h-7 gap-1 text-xs"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  軸を削除
                </Button>
              ) : (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => addThirdAxis('COL')}
                    className="h-7 gap-1 text-xs"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    軸を追加（列）
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => addThirdAxis('ROW')}
                    className="h-7 gap-1 text-xs"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    軸を追加（行）
                  </Button>
                </>
              )}
            </div>
          </div>
        )}

        {/* 凡例（tagOptions）エディタ */}
        {(cellMode === 'TAGS' || cellMode === 'SYMBOL') && (
          <div className="space-y-1.5 border-t border-gray-100 pt-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-500">凡例:</span>
              {canEdit && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    ensureTagOptions();
                    addTagOption();
                  }}
                  className="h-6 gap-1 px-1.5 text-xs text-blue-600"
                >
                  <Plus className="h-3 w-3" />
                  選択肢を追加
                </Button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {tagOptions.map((o, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-1 rounded border border-gray-200 bg-gray-50 px-1.5 py-1"
                >
                  <input
                    type="color"
                    value={o.color ?? '#64748b'}
                    disabled={!canEdit}
                    onChange={(e) => updateTagOption(idx, { color: e.target.value })}
                    className="h-5 w-5 cursor-pointer rounded border-0 bg-transparent p-0"
                    title="色"
                  />
                  <input
                    type="text"
                    value={o.key}
                    disabled={!canEdit}
                    onChange={(e) => updateTagOption(idx, { key: e.target.value })}
                    placeholder="記号"
                    className="w-12 rounded border border-gray-200 px-1 py-0.5 text-xs"
                  />
                  <input
                    type="text"
                    value={o.label}
                    disabled={!canEdit}
                    onChange={(e) => updateTagOption(idx, { label: e.target.value })}
                    placeholder="意味"
                    className="w-20 rounded border border-gray-200 px-1 py-0.5 text-xs"
                  />
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => deleteTagOption(idx)}
                      className="rounded p-0.5 text-gray-300 hover:text-red-600"
                      title="削除"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
              {tagOptions.length === 0 && (
                <span className="text-xs text-gray-300">
                  選択肢がありません。「選択肢を追加」で凡例を定義してください。
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ===== 軸定義パネル ===== */}
      <div className="grid gap-3 lg:grid-cols-3 print:hidden">
        {axes.map((axis) => (
          <Card key={axis.axisIndex} className="bg-white border-gray-200">
            <CardContent className="space-y-2 p-3">
              <div className="flex items-center gap-2">
                <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-semibold text-gray-500">
                  {axis.axisIndex === 0
                    ? '行軸'
                    : axis.axisIndex === 1
                      ? '列軸'
                      : '第3軸'}
                </span>
                <Input
                  value={axis.name}
                  onChange={(e) => updateAxisName(axis.axisIndex, e.target.value)}
                  disabled={!canEdit}
                  placeholder="軸名"
                  className="h-7 text-sm font-medium"
                />
              </div>

              {/* 第3軸の結合方向 */}
              {axis.axisIndex === 2 && canEdit && (
                <div className="flex items-center gap-1 text-xs">
                  <span className="text-gray-500">結合:</span>
                  <button
                    type="button"
                    onClick={() => updateAxisSide(2, 'COL')}
                    className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 ${
                      axis.side === 'COL'
                        ? 'border-blue-400 bg-blue-50 text-blue-700'
                        : 'border-gray-200 text-gray-500'
                    }`}
                  >
                    <Columns3 className="h-3 w-3" />列
                  </button>
                  <button
                    type="button"
                    onClick={() => updateAxisSide(2, 'ROW')}
                    className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 ${
                      axis.side === 'ROW'
                        ? 'border-blue-400 bg-blue-50 text-blue-700'
                        : 'border-gray-200 text-gray-500'
                    }`}
                  >
                    <Rows3 className="h-3 w-3" />行
                  </button>
                </div>
              )}

              {/* 項目リスト */}
              <div className="space-y-1">
                {axis.items.map((it, i) => (
                  <div key={it.id} className="flex items-center gap-1">
                    <Input
                      value={it.label}
                      onChange={(e) =>
                        updateItemLabel(axis.axisIndex, it.id, e.target.value)
                      }
                      disabled={!canEdit}
                      placeholder="項目名"
                      className="h-7 text-xs"
                    />
                    {canEdit && (
                      <div className="flex shrink-0 items-center">
                        <button
                          type="button"
                          onClick={() => moveItem(axis.axisIndex, it.id, -1)}
                          disabled={i === 0}
                          className="rounded p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-30"
                          title="上へ"
                        >
                          <ChevronUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveItem(axis.axisIndex, it.id, 1)}
                          disabled={i === axis.items.length - 1}
                          className="rounded p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-30"
                          title="下へ"
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteItem(axis.axisIndex, it.id)}
                          className="rounded p-0.5 text-gray-300 hover:text-red-600"
                          title="削除"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {canEdit && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => addItem(axis.axisIndex)}
                  className="h-7 w-full gap-1 text-xs text-blue-600"
                >
                  <Plus className="h-3.5 w-3.5" />
                  項目を追加
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ===== マトリクス表 ===== */}
      <Card className="bg-white border-gray-200 overflow-hidden">
        <CardContent className="p-0">
          {!hasGrid ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <HelpCircle className="mb-2 h-8 w-8 text-gray-300" />
              <p className="text-sm text-gray-500">
                行軸・列軸の項目を追加するとマトリクスが表示されます
              </p>
              <p className="mt-1 text-xs text-gray-400">
                上の軸定義パネルの「項目を追加」から始めましょう
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="border-collapse text-sm">
                <thead>
                  {layout.headerCells.map((hrow, ri) => (
                    <tr key={ri} className="bg-gray-50">
                      {hrow.map((h, ci) => (
                        <th
                          key={ci}
                          colSpan={h.colSpan}
                          rowSpan={h.rowSpan}
                          className={`border border-gray-200 px-2 py-2 text-xs font-semibold text-gray-700 ${
                            h.kind === 'corner' || h.kind === 'rowAxisName'
                              ? 'sticky left-0 z-10 bg-gray-100 text-left'
                              : 'text-center'
                          }`}
                        >
                          <span className="inline-flex items-center">
                            {h.label || (
                              <span className="text-gray-300">（無名）</span>
                            )}
                            {headerGrayButton(h)}
                          </span>
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {layout.bodyRows.map((brow, ri) => (
                    <tr key={`${brow.rowItemId}-${ri}`} className="hover:bg-gray-50/40">
                      {/* 行見出し（rowSpanForRowHeader===0 のときは描かない） */}
                      {brow.rowSpanForRowHeader > 0 && (
                        <th
                          rowSpan={brow.rowSpanForRowHeader}
                          className="sticky left-0 z-10 border border-gray-200 bg-gray-50 px-2 py-1.5 text-left align-top text-xs font-semibold text-gray-700"
                        >
                          <span className="inline-flex items-center">
                            {brow.rowLabel || (
                              <span className="text-gray-300">（無名）</span>
                            )}
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => grayOutSlice('row', brow.rowItemId)}
                                title="この行を一括で非該当/該当に切替"
                                className="ml-1 rounded p-0.5 text-gray-300 hover:bg-gray-200 hover:text-gray-600"
                              >
                                <Ban className="h-3 w-3" />
                              </button>
                            )}
                          </span>
                        </th>
                      )}
                      {/* 3-axis-row の第3軸見出し（2 列目） */}
                      {brow.layerHeader && (
                        <th className="border border-gray-200 bg-gray-50/70 px-2 py-1.5 text-left text-xs font-medium text-gray-600">
                          <span className="inline-flex items-center">
                            {brow.layerHeader.label || (
                              <span className="text-gray-300">（無名）</span>
                            )}
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() =>
                                  grayOutSlice('layer', brow.layerHeader!.layerItemId)
                                }
                                title="この第3軸スライスを一括で非該当/該当に切替"
                                className="ml-1 rounded p-0.5 text-gray-300 hover:bg-gray-200 hover:text-gray-600"
                              >
                                <Ban className="h-3 w-3" />
                              </button>
                            )}
                          </span>
                        </th>
                      )}
                      {/* セル */}
                      {brow.cells.map((ref, ci) => {
                        const cell = cells[
                          cellKey(ref.rowItemId, ref.colItemId, ref.layerItemId)
                        ];
                        const applicable = cell?.isApplicable ?? true;
                        return (
                          <td
                            key={ci}
                            className={`relative border border-gray-200 px-1.5 py-1 align-top ${
                              applicable ? '' : 'bg-gray-100'
                            }`}
                            style={{ minWidth: 120 }}
                          >
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() =>
                                  toggleCellApplicable(
                                    ref.rowItemId,
                                    ref.colItemId,
                                    ref.layerItemId,
                                  )
                                }
                                title={
                                  applicable
                                    ? 'このセルを非該当（グレーアウト）にする'
                                    : 'このセルを該当に戻す'
                                }
                                className={`absolute right-0.5 top-0.5 z-[1] rounded p-0.5 ${
                                  applicable
                                    ? 'text-gray-200 hover:text-gray-500'
                                    : 'text-gray-400 hover:text-gray-700'
                                }`}
                              >
                                <Ban className="h-3 w-3" />
                              </button>
                            )}
                            {renderCellBody(
                              ref.rowItemId,
                              ref.colItemId,
                              ref.layerItemId,
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ===== 監査パネル ===== */}
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm">
        <span className="font-medium text-gray-600">空白セル監査</span>
        <span className="inline-flex items-center gap-1.5 text-amber-700">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-400" />
          未定 <strong>{audit.undefinedCount}</strong>
        </span>
        <span className="inline-flex items-center gap-1.5 text-gray-500">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-gray-300" />
          非該当 <strong>{audit.inapplicableCount}</strong>
        </span>
        <span className="text-xs text-gray-400">/ 全 {audit.total} セル</span>
      </div>
    </div>
  );
}
