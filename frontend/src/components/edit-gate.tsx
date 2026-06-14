'use client'

import { useReadOnly } from '@/components/read-only-context'
import { cn } from '@/lib/utils'

/**
 * 編集操作のゲート用ラッパ。
 *
 * - 編集権限がある（canEdit=true）ときは children をそのまま描画する。
 * - 閲覧専用（canEdit=false）のときは <fieldset disabled> でラップし、
 *   配下の <button>/<input>/<select>/<textarea> をネイティブに無効化する。
 *   （<a> リンクは form control ではないため無効化されず、ナビゲーションは維持される）
 *
 * 主に「追加フォーム」「行内の編集・削除操作」など、編集系コントロールの集合を
 * まとめて閲覧専用化したいときに使う。primary な作成ボタンなどは
 * useReadOnly() の canEdit で条件レンダリングする方が望ましい。
 */
export function EditGate({
  children,
  className,
  /** 閲覧専用時にうっすら薄く表示する（既定 true）。 */
  dim = true,
}: {
  children: React.ReactNode
  className?: string
  dim?: boolean
}) {
  const { canEdit } = useReadOnly()

  if (canEdit) return <>{children}</>

  return (
    <fieldset
      disabled
      aria-disabled
      className={cn(
        'min-w-0 border-0 m-0 p-0',
        dim && 'opacity-60',
        className,
      )}
    >
      {children}
    </fieldset>
  )
}
