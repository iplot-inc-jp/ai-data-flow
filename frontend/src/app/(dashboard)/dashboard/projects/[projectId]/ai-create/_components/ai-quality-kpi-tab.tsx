'use client';

/**
 * タブ「AI精度指標」（AI下書きページ）。
 *
 * 対象システム（システムマスタ）を選び、「AIでKPIを作成」(category=AI_QUALITY) で
 * 精度指標（認識精度・自動化率など）の下書きKPIを生成する。
 * 任意で対象フロー・測定対象の INPUT/OUTPUT も選択できる。
 *
 * プリセット追加（AI不要のワンクリック追加）は「AI精度指標」ページ(/ai-accuracy)へ移設済み。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Server, GitBranch, Loader2, Sparkles, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { SystemMaster } from '@/lib/masters';
import { kpiApi, type IoSummaryItemDto, type KpiDto } from '@/lib/kpis';
import type { BusinessFlowItem } from './types';
import { FlowSelect } from './flow-select';
import { IoSummaryTable } from './io-summary-table';

export function AiQualityKpiTab({
  projectId,
  flows,
  systems,
  onGenerated,
  onJobEnqueued,
}: {
  projectId: string;
  flows: BusinessFlowItem[];
  systems: SystemMaster[];
  /** 生成された下書きKPI（親へ通知） */
  onGenerated: (created: KpiDto[]) => void;
  /** AIジョブ起票直後の通知（バックグラウンド処理一覧の更新トリガー用） */
  onJobEnqueued?: () => void;
}) {
  const [systemId, setSystemId] = useState('');
  const [flowId, setFlowId] = useState('');

  const [ioItems, setIoItems] = useState<IoSummaryItemDto[]>([]);
  const [ioLoading, setIoLoading] = useState(false);
  const [ioError, setIoError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [instructions, setInstructions] = useState('');
  const [count, setCount] = useState(5);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // 生成ポーリングの中断用。アンマウント時に abort して無限ポーリング/解放後 setState を防ぐ。
  const genAbortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    return () => genAbortRef.current?.abort();
  }, []);

  // 任意のフロー選択 → io-summary を取得（測定対象IOの候補）
  useEffect(() => {
    setSelectedIds(new Set());
    if (!flowId) {
      setIoItems([]);
      setIoError(null);
      return;
    }
    let cancelled = false;
    setIoLoading(true);
    setIoError(null);
    kpiApi
      .getFlowIoSummary(flowId)
      .then((items) => {
        if (!cancelled) setIoItems(items);
      })
      .catch((err) => {
        if (!cancelled) setIoError(err instanceof Error ? err.message : 'Unknown error');
      })
      .finally(() => {
        if (!cancelled) setIoLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [flowId]);

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!systemId) return;
    // 既存ポーリングがあれば中断してから新規開始。
    genAbortRef.current?.abort();
    const controller = new AbortController();
    genAbortRef.current = controller;
    setGenerating(true);
    setGenerateError(null);
    setSuccessMessage(null);
    try {
      const created = await kpiApi.generateViaJob(
        projectId,
        {
          category: 'AI_QUALITY',
          systemId,
          flowId: flowId || null,
          informationTypeIds: Array.from(selectedIds),
          instructions: instructions.trim() || undefined,
          count,
        },
        () => onJobEnqueued?.(),
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      onGenerated(created);
      setSuccessMessage(
        `${created.length}件の下書きを生成しました。「AI精度指標」ページで内容を確認し、採用してください。`,
      );
    } catch (err) {
      // アンマウント等で中断された場合は無視（解放後 setState を避ける）。
      if (controller.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
        return;
      }
      setGenerateError(err instanceof Error ? err.message : 'KPIのAI生成に失敗しました');
    } finally {
      if (!controller.signal.aborted) setGenerating(false);
    }
  }, [projectId, systemId, flowId, selectedIds, instructions, count, onGenerated, onJobEnqueued]);

  return (
    <div className="space-y-4">
      {/* 対象システム選択 */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
            <Server className="h-3.5 w-3.5 text-indigo-600" />
            対象システム
          </label>
          <select
            value={systemId}
            onChange={(e) => setSystemId(e.target.value)}
            className="w-64 rounded border border-gray-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
          >
            <option value="" disabled>
              システムを選択…
            </option>
            {systems.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.kind === 'TARGET' ? '（対象）' : '（周辺）'}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
            <GitBranch className="h-3.5 w-3.5 text-blue-600" />
            対象フロー（任意）
          </label>
          <FlowSelect
            flows={flows}
            value={flowId}
            onChange={setFlowId}
            allowEmpty
            emptyLabel="指定なし"
            className="w-64 rounded border border-gray-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>
      </div>
      {systems.length === 0 && (
        <p className="text-xs text-gray-400">
          システムがまだありません。先に「システム」ページでシステムマスタを登録してください。
        </p>
      )}

      {!systemId ? (
        <div className="rounded border border-dashed border-indigo-200 bg-indigo-50/50 px-4 py-8 text-center">
          <Server className="mx-auto mb-2 h-6 w-6 text-indigo-300" />
          <p className="text-sm font-medium text-gray-600">対象システムを選択してください</p>
          <p className="mt-1 text-xs text-gray-400">
            AI・システムの精度を測るKPI（認識精度・自動化率など）をAIで生成できます。
          </p>
        </div>
      ) : (
        <>
          {/* 任意の測定対象IO（フロー選択時のみ） */}
          {flowId && (
            <div className="space-y-1.5">
              <p className="text-xs text-gray-500">
                測定対象にしたい INPUT/OUTPUT があればチェックしてください（任意）。
              </p>
              {ioLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                </div>
              ) : ioError ? (
                <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {ioError}
                </p>
              ) : (
                <IoSummaryTable items={ioItems} selectedIds={selectedIds} onToggle={toggleSelected} />
              )}
            </div>
          )}

          {/* AI生成フォーム */}
          <div className="space-y-2 rounded border border-violet-100 bg-violet-50/40 p-3">
            <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
              <Sparkles className="h-3.5 w-3.5 text-violet-600" />
              追加指示（任意）
            </label>
            <Textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="例：OCRの読み取り精度と人手修正の負荷を測るKPIを提案してください"
              rows={2}
              className="bg-white text-sm"
            />
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs text-gray-600">
                生成件数
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={count}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isFinite(n)) setCount(Math.max(1, Math.min(20, Math.round(n))));
                  }}
                  className="w-16 rounded border border-gray-300 bg-white px-2 py-1 text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-violet-400"
                />
                件
              </label>
              {selectedIds.size > 0 && (
                <span className="text-xs text-gray-400">{selectedIds.size}件の INPUT/OUTPUT を選択中</span>
              )}
              <Button
                size="sm"
                onClick={() => void handleGenerate()}
                disabled={generating}
                className="ml-auto bg-violet-600 hover:bg-violet-700"
              >
                {generating ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-1 h-4 w-4" />
                )}
                AIでKPIを作成
              </Button>
            </div>
            {generateError && <p className="text-xs text-red-600">{generateError}</p>}
            {successMessage && (
              <p className="flex items-center gap-1.5 text-xs text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                {successMessage}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
