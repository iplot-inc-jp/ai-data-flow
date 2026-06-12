import { redirect } from 'next/navigation'

/**
 * 旧プロジェクト憲章ページ。
 * 背景・目的・成功基準は /background（背景・目的）へ一本化したためリダイレクトする。
 * （スコープ外はGAP一覧の「スコープ外」トグルで管理する。）
 */
export default function CharterRedirectPage({
  params,
}: {
  params: { projectId: string }
}) {
  redirect(`/dashboard/projects/${params.projectId}/background`)
}
