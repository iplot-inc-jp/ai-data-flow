'use client'

import { useEffect, useState } from 'react'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5021'

/** 実効アクセスレベル。null は「権限なし（閲覧も不可 or 未掲載）」。 */
export type ProjectAccessLevel = 'EDIT' | 'VIEW' | null

export interface ProjectAccessState {
  /** 実効レベル。読み込み中は null。 */
  level: ProjectAccessLevel
  /** 編集可能か（level === 'EDIT'）。 */
  canEdit: boolean
  /** my-access の取得中か。 */
  loading: boolean
}

// ===== モジュール内キャッシュ（同一 projectId の多重 fetch を抑制） =====
type CacheEntry = {
  promise: Promise<ProjectAccessLevel>
  value?: ProjectAccessLevel
}
const cache = new Map<string, CacheEntry>()

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token =
    typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null
  if (token) headers['Authorization'] = `Bearer ${token}`
  return headers
}

/**
 * GET /api/projects/:projectId/my-access を1回だけ叩いて実効レベルを取得する。
 *
 * バックエンドのレスポンスは { accessLevel: "EDIT"|"VIEW"|null }。
 * GET でも ProjectAccessGuard が view 権限を要求するため、権限なし(null)のユーザーは
 * 403 で弾かれる。その場合・通信失敗時はいずれも「権限なし(null)」= 編集不可として扱う
 * （フェイルセーフで編集させない）。
 */
function fetchAccessLevel(projectId: string): Promise<ProjectAccessLevel> {
  const existing = cache.get(projectId)
  if (existing) return existing.promise

  const promise = (async (): Promise<ProjectAccessLevel> => {
    try {
      const res = await fetch(
        `${API_URL}/api/projects/${projectId}/my-access`,
        { headers: authHeaders() },
      )
      if (!res.ok) {
        // 403（権限なし）等はすべて null（編集不可）に倒す。
        return null
      }
      const data = (await res.json()) as { accessLevel?: ProjectAccessLevel }
      const level = data?.accessLevel
      return level === 'EDIT' || level === 'VIEW' ? level : null
    } catch {
      return null
    }
  })()

  const entry: CacheEntry = { promise }
  promise.then((value) => {
    entry.value = value
  })
  cache.set(projectId, entry)
  return promise
}

/** キャッシュを破棄する（権限変更後の再取得に使用）。 */
export function invalidateProjectAccess(projectId?: string) {
  if (projectId) cache.delete(projectId)
  else cache.clear()
}

/**
 * プロジェクトの実効アクセスレベルを取得するフック。
 * モジュール内キャッシュで多重 fetch を抑制する。
 */
export function useProjectAccess(
  projectId: string | null | undefined,
): ProjectAccessState {
  const [state, setState] = useState<ProjectAccessState>(() => {
    if (projectId) {
      const cached = cache.get(projectId)
      if (cached && cached.value !== undefined) {
        return {
          level: cached.value,
          canEdit: cached.value === 'EDIT',
          loading: false,
        }
      }
    }
    return { level: null, canEdit: false, loading: true }
  })

  useEffect(() => {
    if (!projectId) {
      setState({ level: null, canEdit: false, loading: false })
      return
    }

    let cancelled = false
    setState((prev) => ({ ...prev, loading: true }))

    fetchAccessLevel(projectId).then((level) => {
      if (cancelled) return
      setState({ level, canEdit: level === 'EDIT', loading: false })
    })

    return () => {
      cancelled = true
    }
  }, [projectId])

  return state
}
