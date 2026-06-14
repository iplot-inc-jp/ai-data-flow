'use client'

import { createContext, useContext } from 'react'
import { Lock } from 'lucide-react'
import type { ProjectAccessLevel } from '@/hooks/use-project-access'

export interface ReadOnlyContextValue {
  /** 編集可能か。true なら通常どおり編集できる。 */
  canEdit: boolean
  /** 実効アクセスレベル。 */
  level: ProjectAccessLevel
  /** my-access を取得中か。 */
  loading: boolean
}

const ReadOnlyContext = createContext<ReadOnlyContextValue>({
  canEdit: true, // プロバイダ外（プロジェクト配下以外）では編集可とみなす
  level: 'EDIT',
  loading: false,
})

export const ReadOnlyProvider = ReadOnlyContext.Provider

/**
 * プロジェクト配下の実効権限を参照するフック。
 * プロバイダ外では canEdit=true（既存挙動を壊さない）。
 */
export function useReadOnly(): ReadOnlyContextValue {
  return useContext(ReadOnlyContext)
}

/**
 * 閲覧専用バナー。canEdit=false のときページ上部に固定表示する。
 * loading 中・編集可のときは何も描画しない。
 */
export function ReadOnlyBanner() {
  const { canEdit, loading } = useReadOnly()
  if (loading || canEdit) return null
  return (
    <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
      <Lock className="h-4 w-4 flex-shrink-0" />
      <span>
        閲覧専用（このプロジェクトの編集権限がありません。管理者に編集権限を依頼してください）
      </span>
    </div>
  )
}
