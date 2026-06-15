'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Loader2, RefreshCw, Inbox } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { cn } from '@/lib/utils'
import {
  ingestionApi,
  BATCH_STATUS_LABEL,
  BATCH_STATUS_STYLE,
  formatBatchDate,
  isBatchTerminal,
  type IngestionBatchWithProject,
} from '@/lib/knowledge'

/**
 * 取り込みバッチ 横断一覧（トップレベル・読み取り専用）。
 * 閲覧権限のある全プロジェクトの取り込みバッチを集約表示。行クリックで既存のプロジェクト別詳細へ。
 * 実行中バッチがある間だけ4秒ポーリング。
 */
export default function CrossProjectBatchesPage() {
  const [batches, setBatches] = useState<IngestionBatchWithProject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async () => {
    try {
      const list = await ingestionApi.listAllBatches()
      setBatches(list)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'バッチ一覧の取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const hasActive = batches.some((b) => !isBatchTerminal(b.status))
    if (!hasActive) {
      if (timer.current) { clearInterval(timer.current); timer.current = null }
      return
    }
    if (timer.current) return
    timer.current = setInterval(() => void load(), 4000)
    return () => {
      if (timer.current) { clearInterval(timer.current); timer.current = null }
    }
  }, [batches, load])

  return (
    <div className="space-y-4">
      <PageHeader
        title="取り込みバッチ（横断）"
        description="閲覧権限のある全プロジェクトのナレッジ取り込みバッチをまとめて表示します（読み取り専用・最新200件）。"
        actions={
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw className="h-4 w-4 mr-1.5" />
            更新
          </Button>
        }
      />

      {error && (
        <div className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          読み込み中…
        </div>
      ) : batches.length === 0 ? (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-2 text-center text-muted-foreground">
            <Inbox className="h-8 w-8" />
            <div>取り込みバッチがありません。</div>
            <div className="text-xs">各プロジェクトの「ナレッジ取り込み」画面から作成できます。</div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {batches.map((b) => (
            <Link
              key={b.id}
              href={`/dashboard/projects/${b.projectId}/knowledge/ingestion/${b.id}`}
              className="block"
            >
              <Card className="hover:border-primary/50 transition-colors">
                <CardContent className="py-3.5 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground whitespace-nowrap">
                        {b.projectName}
                      </span>
                      <span className="font-medium truncate">
                        {b.name || '（無題のバッチ）'}
                      </span>
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
                          BATCH_STATUS_STYLE[b.status],
                        )}
                      >
                        {!isBatchTerminal(b.status) && (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        )}
                        {BATCH_STATUS_LABEL[b.status]}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      作成: {formatBatchDate(b.createdAt)}
                    </div>
                  </div>
                  <div className="text-right text-xs text-muted-foreground whitespace-nowrap">
                    <div>
                      全 {b.totalFiles} 件 / 完了 {b.succeededFiles} / 失敗 {b.failedFiles}
                    </div>
                    <div className="mt-1 h-1.5 w-32 rounded-full bg-secondary overflow-hidden ml-auto">
                      <div
                        className="h-full bg-emerald-500"
                        style={{
                          width: `${
                            b.totalFiles > 0
                              ? Math.round((b.succeededFiles / b.totalFiles) * 100)
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
