'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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

export default function BusinessDefinitionPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const [rows, setRows] = useState<FlowDefinitionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

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

  const help =
    '全業務フローの業務定義を1行ずつ俯瞰します。目的・担当・INPUT・OUTPUT・頻度・システムはこの表で直接編集（フォーカスを外すと自動保存）でき、DO手順・関係者・例外処理などの詳細は各フローの「個別定義」タブで編集します。';

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
                'DO列は手順の要約を表示します。手順の追加・並べ替え・関係者・例外処理などの詳細は「編集」リンクから個別定義タブで行います。',
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
            <table className="w-full min-w-[960px] border-collapse text-sm">
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

                      {/* DO: 要約（読み取り専用）+ 編集リンク */}
                      <td className="px-3 py-2.5">
                        <div className="flex items-start gap-2">
                          <span className="min-w-[120px] flex-1 text-gray-700">
                            {view.doSummary || <span className="text-gray-400">—</span>}
                          </span>
                          <Link
                            href={flowHref}
                            className="inline-flex shrink-0 items-center gap-1 text-xs text-blue-600 hover:underline"
                          >
                            <Pencil className="h-3 w-3" />
                            編集
                          </Link>
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
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
