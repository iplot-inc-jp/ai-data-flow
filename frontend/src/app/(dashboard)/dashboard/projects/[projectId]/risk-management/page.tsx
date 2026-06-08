'use client';

import { useParams } from 'next/navigation';
import { PageHeader } from '@/components/ui/page-header';
import { HowToPanel } from '@/components/ui/how-to-panel';
import { ManualButton } from '@/components/ui/manual-dialog';
import { ShieldAlert } from 'lucide-react';
import { RiskTableBoard } from './_components/risk-table-board';

/**
 * リスクマネジメント ワークスペース。
 *
 * 教材「プロジェクト管理」のリスク・ボトルネック登録簿を、専用テーブル Risk を
 * 直接 CRUD する形に置き換えたページ。
 * （旧来の RecordSheet 'risk-register'（{rows}）は廃止し、行クリックで全項目を
 * 編集できる Risk テーブルエディタに統一した。）
 * 優先度別件数サマリは Risk 一覧から集計して表示する。
 */
export default function RiskManagementPage() {
  const params = useParams();
  const projectId = params.projectId as string;

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
        help="リスク・ボトルネックを1行ずつ登録し、発生確率・影響度・優先度・対応策・期限・担当・ステータスを管理します。「行を追加」で行を増やし、各行をクリックして編集・保存します。"
        backHref={`/dashboard/projects/${projectId}`}
        backLabel="プロジェクトへ戻る"
        actions={
          <>
            <HowToPanel
              steps={[
                '「行を追加」でリスク・ボトルネックを1行ずつ登録します（横スクロール可）。',
                '発生確率（高/中/低）×影響度（高/中/低）から優先度を判断します（「提案」で自動入力も可能）。',
                '対応策・対応MTGの要否・期限・担当・ステータスを埋めて「保存」します。',
                '優先度別の件数は上部のサマリに自動で反映されます。',
              ]}
            />
            <ManualButton feature="risk-management" />
          </>
        }
      />

      <RiskTableBoard projectId={projectId} />
    </div>
  );
}
