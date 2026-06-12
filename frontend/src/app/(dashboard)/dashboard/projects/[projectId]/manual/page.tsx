import { redirect } from 'next/navigation'

/**
 * 旧マニュアル インデックス。
 * 全体マニュアルと操作マニュアルは /guide に一本化したため、ガイドへリダイレクトする。
 */
export default function ManualIndexPage({
  params,
}: {
  params: { projectId: string }
}) {
  redirect(`/dashboard/projects/${params.projectId}/guide`)
}
