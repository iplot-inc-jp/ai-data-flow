'use client';

import { useMemo, useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { PageHeader } from '@/components/ui/page-header';
import { HowToPanel } from '@/components/ui/how-to-panel';
import { Card, CardContent } from '@/components/ui/card';
import { ShieldAlert, AlertTriangle } from 'lucide-react';
import { RECORD_TEMPLATES } from '@/lib/record-templates';
import { RecordSheetTable } from '@/components/records/record-sheet-table';

/**
 * リスクマネジメント ワークスペース。
 * 教材「プロジェクト管理」のリスク・ボトルネック登録簿（risk-register）を、
 * リスクマネジメントの専用ページとして独立させたもの。
 * ステークホルダーマネジメントの「リスク登録簿」タブと同じ templateKey
 * （'risk-register'）を使うため、既存データはそのまま引き継がれる。
 */
export default function RiskManagementPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const riskTemplate = useMemo(
    () => RECORD_TEMPLATES.find((t) => t.key === 'risk-register'),
    []
  );

  if (!riskTemplate) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="リスクマネジメント"
          backHref={`/dashboard/projects/${projectId}`}
          backLabel="プロジェクトへ戻る"
        />
        <Card className="bg-white border-gray-200">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <AlertTriangle className="h-8 w-8 text-amber-500 mb-3" />
            <p className="text-gray-700">テンプレが見つかりませんでした。</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-blue-600" />
            リスクマネジメント
          </span>
        }
        description="リスク・ボトルネックを発生確率×影響度×優先度で管理"
        help="リスク・ボトルネックを1行ずつ登録し、発生確率・影響度・優先度・対応策・期限・担当・ステータスを管理します。「行を追加」で行を増やし、入力後に「保存」を押してプロジェクトに記録します。"
        backHref={`/dashboard/projects/${projectId}`}
        backLabel="プロジェクトへ戻る"
        actions={
          <HowToPanel
            steps={[
              '「行を追加」でリスク・ボトルネックを1行ずつ登録します（横スクロール可）。',
              '発生確率（高/中/低）×影響度（高/中/低）から優先度を判断して記入します。',
              '対応策・対応MTGの要否・期限・担当・ステータスを埋めます。',
              '入力後「保存」を押してプロジェクトに記録します。',
            ]}
          />
        }
      />

      {/* 優先度ごとの件数サマリ */}
      <RiskSummary projectId={projectId} />

      <div className="space-y-2">
        <p className="text-sm text-gray-500">{riskTemplate.description}</p>
        <RecordSheetTable projectId={projectId} template={riskTemplate} />
      </div>
    </div>
  );
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5021';

/** 優先度ごとの件数を集計して小さなサマリとして表示する。 */
function RiskSummary({ projectId }: { projectId: string }) {
  const counts = useRiskPriorityCounts(projectId);

  if (!counts) return null;

  const total = counts.high + counts.mid + counts.low + counts.other;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <SummaryChip label="合計" value={total} tone="neutral" />
      <SummaryChip label="優先度 高" value={counts.high} tone="high" />
      <SummaryChip label="優先度 中" value={counts.mid} tone="mid" />
      <SummaryChip label="優先度 低" value={counts.low} tone="low" />
      {counts.other > 0 && (
        <SummaryChip label="未設定" value={counts.other} tone="neutral" />
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

type PriorityCounts = {
  high: number;
  mid: number;
  low: number;
  other: number;
};

/** risk-register の rows を取得し、優先度ごとに件数を集計する。 */
function useRiskPriorityCounts(projectId: string): PriorityCounts | null {
  const [counts, setCounts] = useState<PriorityCounts | null>(null);

  useEffect(() => {
    let cancelled = false;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const token =
      typeof window !== 'undefined'
        ? localStorage.getItem('accessToken')
        : null;
    if (token) headers['Authorization'] = `Bearer ${token}`;

    fetch(`${API_URL}/api/projects/${projectId}/record-sheets/risk-register`, {
      headers,
    })
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setCounts({ high: 0, mid: 0, low: 0, other: 0 });
          return;
        }
        const data = await res.json();
        const rows: unknown = data?.rows;
        const acc: PriorityCounts = { high: 0, mid: 0, low: 0, other: 0 };
        if (Array.isArray(rows)) {
          for (const row of rows) {
            const raw =
              row && typeof row === 'object'
                ? String((row as Record<string, unknown>).priority ?? '')
                : '';
            const p = raw.trim();
            if (/高|high|h/i.test(p)) acc.high += 1;
            else if (/中|mid|medium|m/i.test(p)) acc.mid += 1;
            else if (/低|low|l/i.test(p)) acc.low += 1;
            else acc.other += 1;
          }
        }
        if (!cancelled) setCounts(acc);
      })
      .catch(() => {
        if (!cancelled) setCounts({ high: 0, mid: 0, low: 0, other: 0 });
      });

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return counts;
}
