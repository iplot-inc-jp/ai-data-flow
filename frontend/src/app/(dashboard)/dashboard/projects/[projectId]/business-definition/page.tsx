'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { PageHeader } from '@/components/ui/page-header';
import { HowToPanel } from '@/components/ui/how-to-panel';
import { ManualButton } from '@/components/ui/manual-dialog';
import { Loader2, ClipboardList, GitBranch, Pencil, AlertCircle } from 'lucide-react';
import {
  flowDefinitionApi,
  definitionToRow,
  type FlowDefinitionRow,
  type FlowDefinition,
} from '@/lib/flow-definition';

// インライン編集できる単純列（DO は要約 + 個別定義への導線なので除く）
const EDITABLE_COLUMNS: { key: keyof FlowDefinition; label: string }[] = [
  { key: 'purpose', label: '目的' },
  { key: 'owner', label: '担当' },
  { key: 'input', label: 'INPUT' },
];
const EDITABLE_COLUMNS_TAIL: { key: keyof FlowDefinition; label: string }[] = [
  { key: 'output', label: 'OUTPUT' },
  { key: 'frequency', label: '頻度' },
  { key: 'system', label: 'システム' },
];

// モーダルで編集する単一行テキスト項目
const MODAL_TEXT_FIELDS: { key: keyof FlowDefinition; label: string }[] = [
  { key: 'purpose', label: '目的' },
  { key: 'owner', label: '担当' },
  { key: 'frequency', label: '頻度' },
  { key: 'system', label: 'システム' },
  { key: 'trigger', label: 'トリガー' },
  { key: 'input', label: 'INPUT' },
  { key: 'output', label: 'OUTPUT' },
  { key: 'nextProcess', label: '次工程' },
];

// モーダルで編集する複数行テキスト項目（textarea）
const MODAL_TEXTAREA_FIELDS: { key: keyof FlowDefinition; label: string }[] = [
  { key: 'stakeholders', label: '関係者' },
  { key: 'inputDetail', label: 'INPUT 詳細' },
  { key: 'exceptionHandling', label: '例外処理' },
  { key: 'tacitNotes', label: '暗黙知メモ' },
];

// モーダルのフォーム値（doSteps は改行区切りの文字列で扱う）
type EditableTextKey = Exclude<keyof FlowDefinition, 'flowId' | 'doSteps'>;
type ModalForm = Record<EditableTextKey, string> & { doSteps: string };

function definitionToForm(def: FlowDefinition): ModalForm {
  return {
    purpose: def.purpose ?? '',
    owner: def.owner ?? '',
    stakeholders: def.stakeholders ?? '',
    input: def.input ?? '',
    inputDetail: def.inputDetail ?? '',
    trigger: def.trigger ?? '',
    output: def.output ?? '',
    nextProcess: def.nextProcess ?? '',
    exceptionHandling: def.exceptionHandling ?? '',
    frequency: def.frequency ?? '',
    system: def.system ?? '',
    tacitNotes: def.tacitNotes ?? '',
    doSteps: (def.doSteps ?? []).join('\n'),
  };
}

function stepsToText(steps: string[]): string {
  return (steps ?? []).join('\n');
}

function textToSteps(text: string): string[] {
  return text
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** フォームと元定義を比較し、変わったフィールドだけの patch を作る */
function buildPatch(def: FlowDefinition, form: ModalForm): Partial<FlowDefinition> {
  const patch: Partial<FlowDefinition> = {};

  for (const { key } of [...MODAL_TEXT_FIELDS, ...MODAL_TEXTAREA_FIELDS]) {
    const k = key as EditableTextKey;
    const original = (def[k] as string | null) ?? '';
    const next = form[k];
    if (next !== original) {
      // 空文字は null として保存（DB の null 表現に合わせる）
      (patch as Record<string, unknown>)[k] = next === '' ? null : next;
    }
  }

  const nextSteps = textToSteps(form.doSteps);
  if (stepsToText(nextSteps) !== stepsToText(def.doSteps ?? [])) {
    patch.doSteps = nextSteps;
  }

  return patch;
}

export default function BusinessDefinitionPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;

  const [rows, setRows] = useState<FlowDefinitionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // 編集モーダル state
  const [editingRow, setEditingRow] = useState<FlowDefinitionRow | null>(null);
  const [form, setForm] = useState<ModalForm | null>(null);
  const [modalSaving, setModalSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    flowDefinitionApi
      .listByProject(projectId)
      .then((data) => {
        if (!cancelled) setRows(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unknown error');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // セルの値をローカル state に反映（onChange）
  const setCell = useCallback((flowId: string, key: keyof FlowDefinition, value: string) => {
    setRows((prev) =>
      prev.map((r) =>
        r.flowId === flowId ? { ...r, definition: { ...r.definition, [key]: value } } : r
      )
    );
  }, []);

  // onBlur で該当キーのみ upsert
  const commitCell = useCallback(
    async (flowId: string, key: keyof FlowDefinition, value: string) => {
      const saveKey = `${flowId}:${key}`;
      setSavingKey(saveKey);
      setSaveError(null);
      try {
        await flowDefinitionApi.upsert(flowId, { [key]: value } as Partial<FlowDefinition>);
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : '保存に失敗しました');
      } finally {
        setSavingKey((cur) => (cur === saveKey ? null : cur));
      }
    },
    []
  );

  const openEdit = useCallback((row: FlowDefinitionRow) => {
    setEditingRow(row);
    setForm(definitionToForm(row.definition));
    setModalError(null);
  }, []);

  const closeEdit = useCallback(() => {
    setEditingRow(null);
    setForm(null);
    setModalError(null);
  }, []);

  const setFormField = useCallback((key: keyof ModalForm, value: string) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }, []);

  const saveModal = useCallback(async () => {
    if (!editingRow || !form) return;
    const patch = buildPatch(editingRow.definition, form);
    // 変更がなければ閉じるだけ
    if (Object.keys(patch).length === 0) {
      closeEdit();
      return;
    }
    setModalSaving(true);
    setModalError(null);
    try {
      const updated = await flowDefinitionApi.upsert(editingRow.flowId, patch);
      setRows((prev) =>
        prev.map((r) =>
          r.flowId === editingRow.flowId ? { ...r, definition: updated } : r
        )
      );
      closeEdit();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : '保存に失敗しました');
    } finally {
      setModalSaving(false);
    }
  }, [editingRow, form, closeEdit]);

  const help =
    '全業務フローの業務定義を1行ずつ俯瞰します。目的・担当・INPUT・OUTPUT・頻度・システムはこの表で直接編集（フォーカスを外すと自動保存）でき、「編集」ボタンからは全項目をモーダルでまとめて編集できます。DO手順など個別フローの編集は「業務フローへ」から行えます。';

  return (
    <div className="space-y-5">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-blue-600" />
            業務定義シート
          </span>
        }
        description="全業務フローの業務定義を一覧・編集"
        help={help}
        backHref={`/dashboard/projects/${projectId}`}
        backLabel="プロジェクトへ戻る"
        actions={
          <>
            <HowToPanel
              title="業務定義シートの使い方"
              steps={[
                '行は1つの業務フローです。業務フロー名をクリックすると、そのフローの「個別定義」タブを開きます。',
                '目的・担当・INPUT・OUTPUT・頻度・システムの各セルは直接入力でき、フォーカスを外すと自動保存されます。',
                '「編集」ボタンでは目的・関係者・DO手順・例外処理など全項目をモーダルでまとめて編集できます。',
                '「業務フローへ」ボタンで、そのフローの業務フローエディタへ移動できます。',
              ]}
            />
            <ManualButton feature="business-definition" />
          </>
        }
      />

      {saveError && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {saveError}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
        </div>
      ) : error ? (
        <Card className="bg-white border-red-200">
          <CardContent className="py-8 text-center">
            <p className="text-red-600">{error}</p>
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <Card className="bg-white border-gray-200">
          <CardContent className="space-y-3 py-12 text-center">
            <GitBranch className="mx-auto h-8 w-8 text-gray-300" />
            <p className="text-gray-500">業務フローがまだありません。</p>
            <Link href={`/dashboard/projects/${projectId}/flows`}>
              <Button variant="outline" className="text-gray-700">
                業務フローを作成する
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-white border-gray-200">
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full min-w-[1080px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold text-gray-500">
                  <th className="px-3 py-2.5">業務フロー名</th>
                  <th className="px-3 py-2.5">目的</th>
                  <th className="px-3 py-2.5">担当</th>
                  <th className="px-3 py-2.5">INPUT</th>
                  <th className="px-3 py-2.5">DO</th>
                  <th className="px-3 py-2.5">OUTPUT</th>
                  <th className="px-3 py-2.5">頻度</th>
                  <th className="px-3 py-2.5">システム</th>
                  <th className="px-3 py-2.5 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const view = definitionToRow(row.definition);
                  const flowHref = `/dashboard/projects/${projectId}/flows/${row.flowId}`;
                  return (
                    <tr key={row.flowId} className="border-b border-gray-100 align-top">
                      {/* 業務フロー名 + kind バッジ */}
                      <td className="px-3 py-2.5">
                        <Link href={flowHref} className="group inline-flex items-center gap-2">
                          <span
                            className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                              row.kind === 'ASIS'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-emerald-100 text-emerald-700'
                            }`}
                          >
                            {row.kind}
                          </span>
                          <span className="font-medium text-gray-900 group-hover:text-blue-600 group-hover:underline">
                            {row.flowName}
                          </span>
                        </Link>
                      </td>

                      {/* インライン編集セル（前半） */}
                      {EDITABLE_COLUMNS.map((c) => (
                        <td key={c.key} className="px-3 py-2.5">
                          <input
                            value={(row.definition[c.key] as string | null) ?? ''}
                            onChange={(e) => setCell(row.flowId, c.key, e.target.value)}
                            onBlur={(e) => commitCell(row.flowId, c.key, e.target.value)}
                            disabled={savingKey === `${row.flowId}:${c.key}`}
                            className="w-full min-w-[120px] rounded border border-transparent bg-transparent px-2 py-1 text-gray-900 hover:border-gray-200 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-300 disabled:opacity-50"
                            placeholder="—"
                          />
                        </td>
                      ))}

                      {/* DO: 要約（読み取り専用）+ 編集ボタン */}
                      <td className="px-3 py-2.5">
                        <div className="flex items-start gap-2">
                          <span className="min-w-[120px] flex-1 text-gray-700">
                            {view.doSummary || <span className="text-gray-400">—</span>}
                          </span>
                          <button
                            type="button"
                            onClick={() => openEdit(row)}
                            className="inline-flex shrink-0 items-center gap-1 text-xs text-blue-600 hover:underline"
                          >
                            <Pencil className="h-3 w-3" />
                            編集
                          </button>
                        </div>
                      </td>

                      {/* インライン編集セル（後半） */}
                      {EDITABLE_COLUMNS_TAIL.map((c) => (
                        <td key={c.key} className="px-3 py-2.5">
                          <input
                            value={(row.definition[c.key] as string | null) ?? ''}
                            onChange={(e) => setCell(row.flowId, c.key, e.target.value)}
                            onBlur={(e) => commitCell(row.flowId, c.key, e.target.value)}
                            disabled={savingKey === `${row.flowId}:${c.key}`}
                            className="w-full min-w-[100px] rounded border border-transparent bg-transparent px-2 py-1 text-gray-900 hover:border-gray-200 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-300 disabled:opacity-50"
                            placeholder="—"
                          />
                        </td>
                      ))}

                      {/* 操作: 編集モーダル / 業務フローへ遷移 */}
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => openEdit(row)}
                            className="h-7 gap-1 px-2 text-xs text-gray-700"
                          >
                            <Pencil className="h-3 w-3" />
                            編集
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => router.push(flowHref)}
                            className="h-7 gap-1 px-2 text-xs text-blue-600"
                          >
                            <GitBranch className="h-3 w-3" />
                            業務フローへ
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* 編集モーダル */}
      <Dialog open={editingRow !== null} onOpenChange={(open) => !open && closeEdit()}>
        <DialogContent className="max-w-2xl">
          {editingRow && form && (
            <>
              <DialogHeader>
                <DialogTitle>業務定義の編集</DialogTitle>
                <DialogDescription>
                  <span className="inline-flex items-center gap-2">
                    <span
                      className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                        editingRow.kind === 'ASIS'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {editingRow.kind}
                    </span>
                    {editingRow.flowName}
                  </span>
                </DialogDescription>
              </DialogHeader>

              {modalError && (
                <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {modalError}
                </div>
              )}

              <div className="space-y-4">
                {/* 単一行テキスト項目（2カラム） */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {MODAL_TEXT_FIELDS.map((f) => (
                    <div key={f.key} className="space-y-1">
                      <label className="text-xs font-semibold text-gray-600">{f.label}</label>
                      <input
                        value={form[f.key as EditableTextKey]}
                        onChange={(e) => setFormField(f.key as keyof ModalForm, e.target.value)}
                        disabled={modalSaving}
                        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-300 disabled:opacity-50"
                        placeholder="—"
                      />
                    </div>
                  ))}
                </div>

                {/* DO 手順（1行1手順） */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-600">DO手順（1行1手順）</label>
                  <Textarea
                    value={form.doSteps}
                    onChange={(e) => setFormField('doSteps', e.target.value)}
                    disabled={modalSaving}
                    rows={4}
                    placeholder={'1. 受注内容を確認する\n2. 在庫を引き当てる'}
                  />
                </div>

                {/* 複数行テキスト項目 */}
                {MODAL_TEXTAREA_FIELDS.map((f) => (
                  <div key={f.key} className="space-y-1">
                    <label className="text-xs font-semibold text-gray-600">{f.label}</label>
                    <Textarea
                      value={form[f.key as EditableTextKey]}
                      onChange={(e) => setFormField(f.key as keyof ModalForm, e.target.value)}
                      disabled={modalSaving}
                      rows={3}
                      placeholder="—"
                    />
                  </div>
                ))}
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeEdit}
                  disabled={modalSaving}
                  className="text-gray-700"
                >
                  キャンセル
                </Button>
                <Button type="button" onClick={saveModal} disabled={modalSaving}>
                  {modalSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  保存
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
