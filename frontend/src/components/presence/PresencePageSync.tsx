'use client'
import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { useErrorListener, useUpdateMyPresence } from '@/lib/liveblocks.config'

/**
 * presence セッションの裏方コンポーネント（描画なし）:
 * - ルート変更のたびに presence.page を更新する（カーソルの同一ページ判定に使う）。
 * - 接続/認証エラー（秘密鍵未設定・401・ネットワーク断など）を**静かに飲み込む**。
 *   プレゼンスはベストエフォートなので、失敗してもページ表示やコンソールを汚さない。
 */
export function PresencePageSync() {
  const pathname = usePathname()
  const updateMyPresence = useUpdateMyPresence()

  useErrorListener((error) => {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.debug('[presence] connection error (ignored):', (error as { message?: string })?.message ?? error)
    }
  })

  useEffect(() => {
    updateMyPresence({ page: pathname })
  }, [pathname, updateMyPresence])
  return null
}
