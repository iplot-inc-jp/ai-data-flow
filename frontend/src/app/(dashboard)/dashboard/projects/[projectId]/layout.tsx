'use client'

import { useParams } from 'next/navigation'
import { useProjectAccess } from '@/hooks/use-project-access'
import { ReadOnlyProvider, ReadOnlyBanner } from '@/components/read-only-context'

/**
 * プロジェクト配下（/dashboard/projects/[projectId]/...）共通レイアウト。
 *
 * - my-access から実効権限を取得し ReadOnlyContext で配下に供給する。
 * - canEdit=false のとき、各ページ上部に「閲覧専用」バナーを固定表示する。
 * - ナビゲーション・表示はそのまま（閲覧は可能）。編集操作のみ各ページで不可化する。
 */
export default function ProjectScopedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const params = useParams()
  const projectId = (params?.projectId as string) ?? null
  const { level, canEdit, loading } = useProjectAccess(projectId)

  return (
    <ReadOnlyProvider value={{ canEdit, level, loading }}>
      <ReadOnlyBanner />
      {children}
    </ReadOnlyProvider>
  )
}
