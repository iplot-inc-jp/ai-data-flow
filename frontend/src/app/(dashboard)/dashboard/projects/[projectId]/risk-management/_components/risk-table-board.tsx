'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Trash2, Plus, Pencil, X, Save, Wand2 } from 'lucide-react';
import {
  LEVELS,
  RISK_TYPES,
  CAUSE_CATEGORIES,
  NEEDS_MTG_OPTIONS,
  STATUS_OPTIONS,
  pickLevel,
  countByPriority,
  suggestPriority,
  listRisks,
  createRisk,
  updateRisk,
  deleteRisk,
  type Risk,
  type RiskInput,
} from '@/lib/risks';

// 編集モーダルに出す全フィールド（表示順・ラベル・入力種別）。
type FieldKind = 'text' | 'multiline' | 'type' | 'cause' | 'level' | 'mtg' | 'status';
const RISK_FIELDS: {
  key: keyof RiskInput;
  label: string;
  kind: FieldKind;
}[] = [
  { key: 'type', label: '種別', kind: 'type' },
  { key: 'event', label: '事象内容', kind: 'multiline' },
  { key: 'causeCategory', label: '原因区分', kind: 'cause' },
  { key: 'probability', label: '発生確率', kind: 'level' },
  { key: 'impact', label: '影響度', kind: 'level' },
  { key: 'priority', label: '優先度', kind: 'level' },
  { key: 'countermeasure', label: '対応策（予防・軽減）', kind: 'multiline' },
  { key: 'needsMtg', label: '対応MTG', kind: 'mtg' },
  { key: 'mtgDate', label: 'MTG設定日', kind: 'text' },
  { key: 'deadline', label: '期限', kind: 'text' },
  { key: 'owner', label: '担当', kind: 'text' },
  { key: 'status', label: 'ステータス', kind: 'status' },
  { key: 'note', label: '備考', kind: 'multiline' },
];

// テーブルに出す列（指定の列順）。
const TABLE_COLS: { key: keyof Risk; label: string }[] = [
  { key: 'type', label: '種別' },
  { key: 'event', label: '事象内容' },
  { key: 'causeCategory', label: '原因区分' },
  { key: 'probability', label: '発生確率' },
  { key: 'impact', label: '影響度' },
  { key: 'priority', label: '優先度' },
  { key: 'countermeasure', label: '対応策' },
  { key: 'needsMtg', label: '対応MTG' },
  { key: 'mtgDate', label: 'MTG設定日' },
  { key: 'deadline', label: '期限' },
  { key: 'owner', label: '担当' },
  { key: 'status', label: 'ステータス' },
  { key: 'note', label: '備考' },
];

/** 編集ドラフト（モーダル用、null許容を空文字に正規化して扱う）。 */
type Draft = Record<string, string>;

function riskToDraft(r: Risk | null): Draft {
  const d: Draft = {};
  for (const f of RISK_FIELDS) {
    const v = r ? (r[f.key as keyof Risk] as unknown) : '';
    d[f.key as string] = v == null ? '' : String(v);
  }
  return d;
}

function draftToInput(d: Draft): RiskInput {
  const input: Record<string, string | null> = {};
  for (const f of RISK_FIELDS) {
    const v = (d[f.key as string] ?? '').trim();
    input[f.key as string] = v === '' ? null : v;
  }
  return input as RiskInput;
}

/** 優先度→セルの色。 */
function levelClasses(level: string | null): string {
  switch (pickLevel(level)) {
    case '高':
      return 'border-red-200 bg-red-50 text-red-700';
    case '中':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    case '低':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    default:
      return 'border-gray-200 bg-gray-50 text-gray-500';
  }
}

export function RiskTableBoard({ projectId }: { projectId: string }) {
  const { risks, loading, error, reload, setRisks } = useRiskData(projectId);

  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // 編集モーダル（編集 or 新規追加）。editId=null かつ open=true で新規。
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({});

  const byId = useMemo(() => new Map(risks.map((r) => [r.id, r])), [risks]);
  const counts = useMemo(() => countByPriority(risks), [risks]);

  const openEdit = (id: string) => {
    setEditId(id);
    setDraft(riskToDraft(byId.get(id) ?? null));
    setActionError(null);
    setModalOpen(true);
  };

  const openCreate = () => {
    setEditId(null);
    setDraft(riskToDraft(null));
    setActionError(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditId(null);
  };

  const setDraftField = (key: string, value: string) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  // 発生確率×影響度から優先度を自動入力する。
  const applySuggestedPriority = () => {
    const suggestion = suggestPriority(draft.probability, draft.impact);
    if (suggestion) setDraftField('priority', suggestion);
  };

  const handleSaveModal = async () => {
    const input = draftToInput(draft);
    setSaving(true);
    setActionError(null);
    try {
      if (editId) {
        await updateRisk(editId, input);
      } else {
        await createRisk(projectId, { ...input, order: risks.length });
      }
      await reload();
      closeModal();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('このリスクを削除しますか？')) return;
    setActionError(null);
    // 楽観削除（失敗時はreload）。
    setRisks((prev) => prev.filter((r) => r.id !== id));
    try {
      await deleteRisk(id);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : '削除に失敗しました');
      await reload();
    }
  };

  const suggested = suggestPriority(draft.probability, draft.impact);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[240px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 優先度別件数サマリ */}
      <div className="flex flex-wrap items-center gap-2">
        <SummaryChip
          label="合計"
          value={counts.high + counts.mid + counts.low + counts.other}
          tone="neutral"
        />
        <SummaryChip label="優先度 高" value={counts.high} tone="high" />
        <SummaryChip label="優先度 中" value={counts.mid} tone="mid" />
        <SummaryChip label="優先度 低" value={counts.low} tone="low" />
        {counts.other > 0 && (
          <SummaryChip label="未設定" value={counts.other} tone="neutral" />
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-500">
          リスク・ボトルネックを1行ずつ管理します。行をクリックすると全項目を編集できます。
        </p>
        <button
          type="button"
          onClick={openCreate}
          className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          行を追加
        </button>
      </div>

      {(error || actionError) && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error || actionError}
        </div>
      )}

      {/* 一覧テーブル */}
      <Card className="bg-white border-gray-200">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="w-10 px-2 py-2 text-left text-xs font-medium text-gray-400">
                    #
                  </th>
                  {TABLE_COLS.map((col) => (
                    <th
                      key={col.key as string}
                      className="min-w-[110px] whitespace-nowrap px-3 py-2 text-left text-xs font-semibold text-gray-600"
                    >
                      {col.label}
                    </th>
                  ))}
                  <th className="w-12 px-2 py-2" aria-label="操作" />
                </tr>
              </thead>
              <tbody>
                {risks.map((r, i) => (
                  <tr
                    key={r.id}
                    onClick={() => openEdit(r.id)}
                    className="cursor-pointer border-b border-gray-100 hover:bg-blue-50/40"
                    title="クリックして編集"
                  >
                    <td className="px-2 py-2 align-middle text-xs text-gray-400">
                      {i + 1}
                    </td>
                    {TABLE_COLS.map((col) => {
                      const raw = (r[col.key] as string | null) ?? '';
                      const isLevel =
                        col.key === 'probability' ||
                        col.key === 'impact' ||
                        col.key === 'priority';
                      return (
                        <td
                          key={col.key as string}
                          className="max-w-[260px] px-3 py-2 align-middle text-gray-900"
                        >
                          {raw ? (
                            isLevel ? (
                              <span
                                className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${levelClasses(
                                  raw,
                                )}`}
                              >
                                {raw}
                              </span>
                            ) : (
                              <span className="line-clamp-2 whitespace-pre-wrap break-words">
                                {raw}
                              </span>
                            )
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td
                      className="px-2 py-2 text-center align-middle"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => handleDelete(r.id)}
                        className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                        title="このリスクを削除"
                        aria-label="このリスクを削除"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {risks.length === 0 && (
                  <tr>
                    <td
                      colSpan={TABLE_COLS.length + 2}
                      className="px-4 py-10 text-center text-sm text-gray-400"
                    >
                      まだリスクがありません。「行を追加」から登録を始めましょう。
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* 編集／追加モーダル（全項目） */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={closeModal}
        >
          <div
            className="max-h-[85vh] w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
              <h3 className="text-sm font-semibold text-[#050f3e]">
                {editId ? 'リスクを編集' : 'リスクを追加'}
              </h3>
              <button
                type="button"
                onClick={closeModal}
                className="rounded p-1 text-gray-500 hover:bg-gray-100"
                aria-label="閉じる"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[60vh] space-y-3 overflow-auto px-5 py-4">
              {RISK_FIELDS.map((f) => {
                const value = draft[f.key as string] ?? '';
                const options =
                  f.kind === 'type'
                    ? RISK_TYPES
                    : f.kind === 'cause'
                      ? CAUSE_CATEGORIES
                      : f.kind === 'level'
                        ? LEVELS
                        : f.kind === 'mtg'
                          ? NEEDS_MTG_OPTIONS
                          : f.kind === 'status'
                            ? STATUS_OPTIONS
                            : null;

                return (
                  <div key={f.key as string} className="space-y-1">
                    <label className="flex items-center justify-between text-[11px] font-medium text-gray-500">
                      <span>{f.label}</span>
                      {f.key === 'priority' && suggested && (
                        <button
                          type="button"
                          onClick={applySuggestedPriority}
                          className="flex items-center gap-1 rounded text-[10px] font-medium text-blue-600 hover:underline"
                          title="発生確率×影響度から優先度を提案"
                        >
                          <Wand2 className="h-3 w-3" />
                          提案: {suggested}
                        </button>
                      )}
                    </label>
                    {options ? (
                      <select
                        value={value}
                        onChange={(e) =>
                          setDraftField(f.key as string, e.target.value)
                        }
                        className="w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        <option value="">（未設定）</option>
                        {options.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : f.kind === 'multiline' ? (
                      <textarea
                        value={value}
                        onChange={(e) =>
                          setDraftField(f.key as string, e.target.value)
                        }
                        rows={2}
                        placeholder={f.label}
                        className="w-full resize-y rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    ) : (
                      <input
                        type="text"
                        value={value}
                        onChange={(e) =>
                          setDraftField(f.key as string, e.target.value)
                        }
                        placeholder={f.label}
                        className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    )}
                  </div>
                );
              })}
              {actionError && (
                <p className="text-xs text-rose-600">{actionError}</p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-5 py-3">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleSaveModal}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-md bg-[#050f3e] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'high' | 'mid' | 'low' | 'neutral';
}) {
  const toneClass =
    tone === 'high'
      ? 'border-red-200 bg-red-50 text-red-700'
      : tone === 'mid'
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : tone === 'low'
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
          : 'border-gray-200 bg-gray-50 text-gray-600';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${toneClass}`}
    >
      {label}
      <span className="font-bold tabular-nums">{value}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// データ読み込みフック
// ---------------------------------------------------------------------------

function useRiskData(projectId: string) {
  const [risks, setRisks] = useState<Risk[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const list = await listRisks(projectId);
      setRisks(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : '読み込みに失敗しました');
    }
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await reload();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  return { risks, loading, error, reload, setRisks };
}
