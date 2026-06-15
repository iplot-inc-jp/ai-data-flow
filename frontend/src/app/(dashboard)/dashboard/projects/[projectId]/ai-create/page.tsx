'use client';

/**
 * AI下書きページ（KPIのAI生成専用）。
 *
 * - タブ「業務KPI」: 業務フローの INPUT/OUTPUT・帳票から AI で業務KPI（category=BUSINESS）を下書き生成
 * - タブ「AI精度指標」: 対象システムに対する精度指標（category=AI_QUALITY）を AI で下書き生成
 *
 * 生成された下書き（status=DRAFT）は、種別に応じて
 *   業務KPI → /business-kpi、AI精度指標 → /ai-accuracy
 * の各ページに自動的に並ぶ。生成成功時はそのページへの導線をトーストで案内する。
 * このページ自体には KPI 一覧は表示しない（採用・編集は各ページで行う）。
 *
 * KPI の生成は @/lib/kpis の kpiApi.generateViaJob（AI_KPI ジョブ）経由。
 */

import { useCallback, useRef } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { BarChart3, Cpu } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { HowToPanel } from '@/components/ui/how-to-panel';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { useReadOnly } from '@/components/read-only-context';
import { FeatureSectionIo } from '@/components/io/FeatureSectionIo';
import type { KpiCategory, KpiDto } from '@/lib/kpis';
import { BusinessKpiTab } from './_components/business-kpi-tab';
import { AiQualityKpiTab } from './_components/ai-quality-kpi-tab';
import { useKpiMasters } from './_components/use-kpi-masters';
import { EditGate } from '@/components/edit-gate';
import {
  BackgroundJobsPanel,
  type BackgroundJobsPanelHandle,
} from '@/components/background-jobs-panel';

export default function AiCreatePage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const { canEdit } = useReadOnly();

  // 参照マスタ（フロー / システム / ロール / INPUT-OUTPUT）— 共有フックに集約
  const { flows, systems } = useKpiMasters(projectId);

  // バックグラウンド処理一覧（KPI生成ジョブ起票後に refresh する）
  const jobsPanelRef = useRef<BackgroundJobsPanelHandle | null>(null);
  const handleJobEnqueued = useCallback(() => {
    jobsPanelRef.current?.refresh();
  }, []);

  /** 生成成功トースト。種別に応じた確認・採用ページへの導線を出す。 */
  const notifyGenerated = useCallback(
    (created: KpiDto[], category: KpiCategory) => {
      const label = category === 'BUSINESS' ? '業務KPI' : 'AI精度指標';
      const href =
        category === 'BUSINESS'
          ? `/dashboard/projects/${projectId}/business-kpi`
          : `/dashboard/projects/${projectId}/ai-accuracy`;
      toast({
        title: `${created.length}件の下書きを生成しました`,
        description: `生成した下書きは「${label}」ページで確認・採用してください。`,
        action: (
          <ToastAction altText={`${label}ページを開く`} asChild>
            <Link href={href}>{label}を開く</Link>
          </ToastAction>
        ),
      });
    },
    [projectId],
  );

  const handleBusinessGenerated = useCallback(
    (created: KpiDto[]) => notifyGenerated(created, 'BUSINESS'),
    [notifyGenerated],
  );
  const handleAiQualityGenerated = useCallback(
    (created: KpiDto[]) => notifyGenerated(created, 'AI_QUALITY'),
    [notifyGenerated],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI下書き"
        description="業務フローの INPUT/OUTPUT やシステムから、業務KPI・AI精度指標 を AI で下書き生成します。"
        help="タブで「業務KPI」「AI精度指標」を切り替えて AI に下書きを生成させます。生成した下書きは各専用ページ（業務KPI / AI精度指標）で確認・採用してください。"
        backHref={`/dashboard/projects/${projectId}`}
        backLabel="プロジェクトへ戻る"
        actions={
          <>
            <HowToPanel
              steps={[
                '「業務KPI」タブで対象の業務フローを選ぶと、フロー上の INPUT/OUTPUT・帳票が種別ごと（帳票/データ/物体）に表示されます。',
                '測りたい INPUT/OUTPUT にチェックを入れ、追加指示を添えて「AIでKPIを作成」を押すと業務KPIの下書きが生成されます。',
                '「AI精度指標」タブでは対象システムを選び、追加指示を添えて精度指標（認識精度・自動化率など）の下書きをAIで生成します。',
                '生成された下書きは DRAFT として保存されます。確認・採用は「業務KPI」「AI精度指標」ページで行ってください。',
              ]}
            />
            <FeatureSectionIo
              projectId={projectId}
              sectionKey="kpis"
              label="KPI"
              canEdit={canEdit}
            />
          </>
        }
      />

      {/* タブ（業務KPI / AI精度指標）— AI生成入力UI */}
      <Card className="bg-white">
        <div className="p-4">
          <Tabs defaultValue="business">
            <TabsList>
              <TabsTrigger value="business" className="gap-1.5">
                <BarChart3 className="h-3.5 w-3.5" />
                業務KPI
              </TabsTrigger>
              <TabsTrigger value="ai-quality" className="gap-1.5">
                <Cpu className="h-3.5 w-3.5" />
                AI精度指標
              </TabsTrigger>
            </TabsList>
            <TabsContent value="business" className="mt-4">
              <EditGate dim={false}>
                <BusinessKpiTab
                  projectId={projectId}
                  flows={flows}
                  onGenerated={handleBusinessGenerated}
                  onJobEnqueued={handleJobEnqueued}
                />
              </EditGate>
            </TabsContent>
            <TabsContent value="ai-quality" className="mt-4">
              <EditGate dim={false}>
                <AiQualityKpiTab
                  projectId={projectId}
                  flows={flows}
                  systems={systems}
                  onGenerated={handleAiQualityGenerated}
                  onJobEnqueued={handleJobEnqueued}
                />
              </EditGate>
            </TabsContent>
          </Tabs>
        </div>
      </Card>

      {/* ===== バックグラウンド処理一覧（KPI生成などのAIジョブ） ===== */}
      <BackgroundJobsPanel ref={jobsPanelRef} projectId={projectId} />
    </div>
  );
}
