import { redirect } from 'next/navigation'

/**
 * 旧マニュアル インデックス。
 * 全体マニュアルと操作マニュアルはトップレベルのガイド（/dashboard/guide）に
 * 一本化したため、ガイドへリダイレクトする。
 */
export default function ManualIndexPage() {
  redirect('/dashboard/guide')
}
