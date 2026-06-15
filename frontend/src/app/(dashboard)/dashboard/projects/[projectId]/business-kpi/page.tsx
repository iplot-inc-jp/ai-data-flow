'use client';

/**
 * 業務KPIページ。
 *
 * 業務フローのゴール指標（category=BUSINESS）の一覧・手動作成・編集・採用を行う。
 * AI生成は「AI下書き」(/ai-create) に集約しているため、本ページに生成タブは無い。
 *
 * KPI の取得・作成・更新・削除はすべて @/lib/kpis の kpiApi 経由。
 * 参照マスタは共有フック useKpiMasters に集約。
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { HowToPanel } from '@/components/ui/how-to-panel';
import { useReadOnly } from '@/components/read-only-context';
import { FeatureSectionIo } from '@/components/io/FeatureSectionIo';
import { EditGate } from '@/components/edit-gate';
import { kpiApi, type KpiDto } from '@/lib/kpis';
import { useKpiMasters } from '../ai-create/_components/use-kpi-masters';
import { KpiList } from '../ai-create/_components/kpi-list';
import { KpiEditModal } from '../ai-create/_components/kpi-edit-modal';

export default function BusinessKpiPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const { canEdit } = useReadOnly();

  // 参照マスタ（フロー / システム / ロール / INPUT-OUTPUT）
  const { flows, systems, roles, informationTypes } = useKpiMasters(projectId);

  // 業務KPI一覧（category=BUSINESS のみ）
  const [kpis, setKpis] = useState<KpiDto[]>([]);
  const [kpisLoading, setKpisLoading] = useState(true);
  const [kpisError, setKpisError] = useState<string | null>(null);

  // 手動作成モーダルの開閉
  const [creating, setCreating] = useState(false);

  const loadKpis = useCallback(async () => {
    setKpisError(null);
    try {
      setKpis(await kpiApi.list(projectId, { category: 'BUSINESS' }));
    } catch (err) {
      setKpisError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setKpisLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadKpis();
  }, [loadKpis]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="業務KPI"
        description="業務フローのゴール指標（欠品率・リードタイムなど）を作成・採用します。"
        help="「＋手動で追加」で業務KPIを作成し、各カードをクリックすると全項目を編集できます。下書きは「採用」で運用中になります。AIで下書きを作るには「AI下書き」ページを使ってください。"
        backHref={`/dashboard/projects/${projectId}`}
        backLabel="プロジェクトへ戻る"
        actions={
          <>
            <HowToPanel
              steps={[
                '「＋手動で追加」で業務KPIを新規作成します（区分は業務KPIに固定）。',
                '各カードをクリックすると、SMART採点・対象フロー/IO紐づけを含め全項目を編集できます。',
                '下書きは「採用」で運用中（ACTIVE）にできます。',
                'AIで下書きを作りたいときは「AI下書き」ページの「業務KPI」タブから生成してください。',
              ]}
            />
            <FeatureSectionIo
              projectId={projectId}
              sectionKey="kpis"
              label="KPI"
              canEdit={canEdit}
              onDone={() => void loadKpis()}
            />
          </>
        }
      />

      {/* AI生成への導線 */}
      <p className="flex items-center gap-1.5 text-xs text-gray-500">
        <Sparkles className="h-3.5 w-3.5 text-violet-500" />
        AIで業務KPIの下書きを作りたいときは
        <Link
          href={`/dashboard/projects/${projectId}/ai-create`}
          className="font-medium text-violet-600 hover:underline"
        >
          AI下書き
        </Link>
        ページをご利用ください。
      </p>

      {/* 業務KPI一覧（category 固定） */}
      <EditGate dim={false}>
        <KpiList
          kpis={kpis}
          loading={kpisLoading}
          error={kpisError}
          highlightIds={new Set()}
          flows={flows}
          systems={systems}
          roles={roles}
          informationTypes={informationTypes}
          onChanged={loadKpis}
          lockedCategory="BUSINESS"
          onCreateNew={() => setCreating(true)}
        />
      </EditGate>

      {/* 手動作成モーダル（新規作成・区分は業務KPIに固定） */}
      {creating && (
        <KpiEditModal
          kpi={null}
          projectId={projectId}
          flows={flows}
          systems={systems}
          roles={roles}
          informationTypes={informationTypes}
          lockedCategory="BUSINESS"
          onClose={() => setCreating(false)}
          onSaved={loadKpis}
        />
      )}
    </div>
  );
}
