'use client'

// ナレッジグラフ（可視化）ページ。
//   GET /api/projects/:id/knowledge/graph → 決定的レイアウト → 自作 SVG キャンバスで描画。
//   フィルタ（タグ/種別/文書表示）＋ラベル検索（GET /knowledge/search）。
//   ノード/文書ドラッグ → PATCH 位置で永続化（楽観更新）。
//   ノード/文書クリック → 右パネル（NodeDetailPanel）。
//
// graph API の実体は `{ nodes, edges, documents }`（backend KnowledgeGraphOutput）。
// lib/knowledge.ts の KnowledgeGraph も `edges`（KnowledgeEdge）で揃えてあるが、
// このページは token 付き raw fetch の慣習に合わせて従来どおり直接 fetch する。

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { useReadOnly } from '@/components/read-only-context'
import {
  Brain,
  Loader2,
  RefreshCw,
  Search,
  FileStack,
  Tag as TagIcon,
  Box,
  FileText,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type {
  KnowledgeNode,
  KnowledgeRelation,
  KnowledgeDocument,
} from '@/lib/knowledge'
import {
  KnowledgeGraphCanvas,
  type CanvasMention,
} from '@/components/knowledge/KnowledgeGraphCanvas'
import { NodeDetailPanel } from '@/components/knowledge/NodeDetailPanel'
import { computeKnowledgeGraphLayout } from '@/components/knowledge/knowledge-graph-layout'
import {
  ENTITY_KIND_COLOR,
  ENTITY_KIND_LABEL,
  TAG_COLOR,
  presentEntityKinds,
} from '@/components/knowledge/knowledge-graph-colors'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5021'

// graph API の実体（edges）に合わせたレスポンス型。
interface GraphEdge {
  id: string
  projectId: string
  fromNodeId: string
  toNodeId: string
  label: string | null
  type: string | null
  confidence: number | null
  sourceDocumentId: string | null
}
interface GraphResponse {
  nodes: KnowledgeNode[]
  edges: GraphEdge[]
  documents: KnowledgeDocument[]
}

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  const t =
    typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null
  if (t) h['Authorization'] = `Bearer ${t}`
  return h
}

async function fetchGraph(projectId: string): Promise<GraphResponse> {
  const res = await fetch(`${API_URL}/api/projects/${projectId}/knowledge/graph`, {
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error('ナレッジグラフの取得に失敗しました')
  return res.json() as Promise<GraphResponse>
}

async function searchKnowledge(
  projectId: string,
  q: string,
): Promise<{ nodes: KnowledgeNode[]; documents: KnowledgeDocument[] }> {
  const params = new URLSearchParams({ q })
  const res = await fetch(
    `${API_URL}/api/projects/${projectId}/knowledge/search?${params.toString()}`,
    { headers: authHeaders() },
  )
  if (!res.ok) throw new Error('ナレッジ検索に失敗しました')
  return res.json()
}

async function patchNodePosition(
  id: string,
  positionX: number,
  positionY: number,
): Promise<void> {
  const res = await fetch(`${API_URL}/api/knowledge-nodes/${id}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ positionX, positionY }),
  })
  if (!res.ok) throw new Error('ノード位置の保存に失敗しました')
}

async function patchDocumentPosition(
  id: string,
  positionX: number,
  positionY: number,
): Promise<void> {
  const res = await fetch(`${API_URL}/api/knowledge-documents/${id}/position`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ positionX, positionY }),
  })
  if (!res.ok) throw new Error('文書位置の保存に失敗しました')
}

/** GraphEdge → canvas が受ける KnowledgeRelation 形（createdAt を補完）。 */
function toRelation(e: GraphEdge): KnowledgeRelation {
  return { ...e, createdAt: '' }
}

export default function KnowledgeGraphPage() {
  const params = useParams()
  const projectId = params.projectId as string
  const { canEdit } = useReadOnly()

  const [nodes, setNodes] = useState<KnowledgeNode[]>([])
  const [relations, setRelations] = useState<KnowledgeRelation[]>([])
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 選択（ノード or 文書のどちらか）。
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null)

  // 表示トグル・フィルタ。
  const [showTags, setShowTags] = useState(true)
  const [showEntities, setShowEntities] = useState(true)
  const [showDocuments, setShowDocuments] = useState(false)
  // 除外する entityKind（クリックで OFF）。
  const [excludedKinds, setExcludedKinds] = useState<Set<string>>(new Set())

  // 検索。
  const [searchInput, setSearchInput] = useState('')
  const [highlightIds, setHighlightIds] = useState<Set<string>>(new Set())
  // 検索ヒットの文書 id（showDocuments 時の強調/減光・件数表示に使う）。
  const [highlightDocIds, setHighlightDocIds] = useState<Set<string>>(new Set())
  const [searching, setSearching] = useState(false)

  const [fitSignal, setFitSignal] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const g = await fetchGraph(projectId)
      setNodes(g.nodes)
      setRelations(g.edges.map(toRelation))
      setDocuments(g.documents)
      // 再取得のたびに全体表示し直す（初回 fit は canvas 内、以降はこのシグナルで）。
      setFitSignal((s) => s + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ナレッジグラフの取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    load()
  }, [load])

  const nodeById = useMemo(
    () => new Map(nodes.map((n) => [n.id, n] as const)),
    [nodes],
  )

  const kinds = useMemo(() => presentEntityKinds(nodes), [nodes])

  // ノードの可視判定（タグ/実体トグル＋ kind 除外）。
  const isNodeVisible = useCallback(
    (n: KnowledgeNode): boolean => {
      if (n.type === 'TAG') return showTags
      if (!showEntities) return false
      const kind = n.entityKind ?? 'OTHER'
      return !excludedKinds.has(kind)
    },
    [showTags, showEntities, excludedKinds],
  )

  // mention（文書↔ノード）は graph API に含まれないため、ここでは空（細線なし）。
  // 将来 graph レスポンスに mentions が含まれたらここで供給する。
  const mentions: CanvasMention[] = useMemo(() => [], [])

  // レイアウト（決定的。positionX/Y があるものは尊重）。
  const layout = useMemo(
    () =>
      computeKnowledgeGraphLayout(
        {
          nodes: nodes.map((n) => ({
            id: n.id,
            type: n.type,
            label: n.label,
            positionX: n.positionX,
            positionY: n.positionY,
            mentionCount: n.mentionCount,
          })),
          edges: relations.map((r) => ({
            id: r.id,
            fromNodeId: r.fromNodeId,
            toNodeId: r.toNodeId,
          })),
          documents: documents.map((d) => ({
            id: d.id,
            positionX: d.positionX,
            positionY: d.positionY,
          })),
        },
        { mentions },
      ),
    [nodes, relations, documents, mentions],
  )

  const toggleKind = (kind: string) => {
    setExcludedKinds((prev) => {
      const next = new Set(prev)
      if (next.has(kind)) next.delete(kind)
      else next.add(kind)
      return next
    })
  }

  // 検索（デバウンス）。
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    const q = searchInput.trim()
    if (q === '') {
      setHighlightIds(new Set())
      setHighlightDocIds(new Set())
      setSearching(false)
      return
    }
    setSearching(true)
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await searchKnowledge(projectId, q)
        setHighlightIds(new Set(res.nodes.map((n) => n.id)))
        setHighlightDocIds(new Set(res.documents.map((d) => d.id)))
      } catch {
        setHighlightIds(new Set())
        setHighlightDocIds(new Set())
      } finally {
        setSearching(false)
      }
    }, 350)
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current)
    }
  }, [searchInput, projectId])

  // ===== ドラッグ確定 → 楽観更新＋PATCH（失敗時はロールバック＋エラー表示） =====
  const handleNodeMoved = useCallback(
    (id: string, x: number, y: number) => {
      // ロールバック用に直前位置を控える。
      let prevPos: { x: number | null; y: number | null } | null = null
      setNodes((prev) =>
        prev.map((n) => {
          if (n.id !== id) return n
          prevPos = { x: n.positionX, y: n.positionY }
          return { ...n, positionX: x, positionY: y }
        }),
      )
      void patchNodePosition(id, x, y).catch((e) => {
        // 楽観更新を巻き戻し、ユーザーにエラーを表示（黙殺しない）。
        setNodes((prev) =>
          prev.map((n) =>
            n.id === id && prevPos
              ? { ...n, positionX: prevPos.x, positionY: prevPos.y }
              : n,
          ),
        )
        setError(e instanceof Error ? e.message : 'ノード位置の保存に失敗しました')
      })
    },
    [],
  )

  const handleDocumentMoved = useCallback(
    (id: string, x: number, y: number) => {
      let prevPos: { x: number | null; y: number | null } | null = null
      setDocuments((prev) =>
        prev.map((d) => {
          if (d.id !== id) return d
          prevPos = { x: d.positionX, y: d.positionY }
          return { ...d, positionX: x, positionY: y }
        }),
      )
      void patchDocumentPosition(id, x, y).catch((e) => {
        setDocuments((prev) =>
          prev.map((d) =>
            d.id === id && prevPos
              ? { ...d, positionX: prevPos.x, positionY: prevPos.y }
              : d,
          ),
        )
        setError(e instanceof Error ? e.message : '文書位置の保存に失敗しました')
      })
    },
    [],
  )

  const selectedNode = selectedNodeId ? nodeById.get(selectedNodeId) ?? null : null
  const selectedDocument = selectedDocumentId
    ? documents.find((d) => d.id === selectedDocumentId) ?? null
    : null

  const isEmpty = !loading && nodes.length === 0 && documents.length === 0

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col gap-3">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            ナレッジグラフ
          </span>
        }
        description="取り込んだ文書から抽出したタグ・実体・関係をグラフで可視化します。"
        help="ノード/文書クリックで詳細。ドラッグで配置を保存。Ctrl+ホイールでズーム、背景ドラッグでパン。"
        actions={
          <Button variant="outline" size="sm" onClick={load}>
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

      {/* ツールバー: 検索＋フィルタ */}
      {!isEmpty && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="ラベル検索…"
              className="h-9 w-52 pl-8"
            />
            {searching && (
              <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
            {searchInput && !searching && (
              <button
                onClick={() => setSearchInput('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="検索クリア"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* 検索ヒット件数（ノード＋文書）。文書は showDocuments で初めて図に出る。 */}
          {searchInput.trim() !== '' && !searching && (
            <span className="text-xs text-muted-foreground">
              ノード {highlightIds.size} 件
              {highlightDocIds.size > 0 && (
                <>
                  {' / '}
                  文書 {highlightDocIds.size} 件
                  {!showDocuments && (
                    <button
                      onClick={() => setShowDocuments(true)}
                      className="ml-1 text-primary hover:underline"
                    >
                      （文書を表示）
                    </button>
                  )}
                </>
              )}
            </span>
          )}

          <FilterChip
            active={showTags}
            onClick={() => setShowTags((v) => !v)}
            color={TAG_COLOR}
            icon={<TagIcon className="h-3.5 w-3.5" />}
            label="タグ"
          />
          <FilterChip
            active={showEntities}
            onClick={() => setShowEntities((v) => !v)}
            color="#334155"
            icon={<Box className="h-3.5 w-3.5" />}
            label="実体"
          />
          <FilterChip
            active={showDocuments}
            onClick={() => setShowDocuments((v) => !v)}
            color="#64748b"
            icon={<FileText className="h-3.5 w-3.5" />}
            label="文書"
          />

          {/* 種別フィルタ（実体表示時のみ） */}
          {showEntities && kinds.length > 0 && (
            <>
              <span className="mx-0.5 h-5 w-px bg-border" />
              {kinds.map((kind) => (
                <FilterChip
                  key={kind}
                  active={!excludedKinds.has(kind)}
                  onClick={() => toggleKind(kind)}
                  color={ENTITY_KIND_COLOR[kind] ?? '#64748b'}
                  label={ENTITY_KIND_LABEL[kind] ?? kind}
                />
              ))}
            </>
          )}
        </div>
      )}

      {/* キャンバス領域 */}
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg border">
        {loading ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            読み込み中…
          </div>
        ) : isEmpty ? (
          <div className="flex h-full items-center justify-center">
            <Card className="border-0 shadow-none">
              <CardContent className="space-y-3 py-12 text-center">
                <Brain className="mx-auto h-10 w-10 text-muted-foreground/50" />
                <div className="text-sm text-muted-foreground">
                  まだナレッジがありません。まずは取り込みで文書を読み込んでください。
                </div>
                <Link
                  href={`/dashboard/projects/${projectId}/knowledge/ingestion`}
                  className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                >
                  <FileStack className="h-4 w-4" />
                  取り込みダッシュボードへ
                </Link>
              </CardContent>
            </Card>
          </div>
        ) : (
          <>
            <KnowledgeGraphCanvas
              nodes={nodes}
              relations={relations}
              documents={documents}
              layout={layout}
              mentions={mentions}
              showDocuments={showDocuments}
              highlightNodeIds={highlightIds}
              highlightDocumentIds={highlightDocIds}
              isNodeVisible={isNodeVisible}
              selectedNodeId={selectedNodeId}
              selectedDocumentId={selectedDocumentId}
              onSelectNode={setSelectedNodeId}
              onSelectDocument={setSelectedDocumentId}
              onNodeMoved={handleNodeMoved}
              onDocumentMoved={handleDocumentMoved}
              readOnly={!canEdit}
              fitSignal={fitSignal}
            />

            {(selectedNode || selectedDocument) && (
              <NodeDetailPanel
                selectedNode={selectedNode}
                selectedDocument={selectedDocument}
                nodeById={nodeById}
                onSelectNode={(id) => {
                  setSelectedDocumentId(null)
                  setSelectedNodeId(id)
                }}
                onSelectDocument={(id) => {
                  setSelectedNodeId(null)
                  setShowDocuments(true)
                  setSelectedDocumentId(id)
                }}
                onClose={() => {
                  setSelectedNodeId(null)
                  setSelectedDocumentId(null)
                }}
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  color,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  color: string
  icon?: React.ReactNode
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
        active
          ? 'border-transparent text-white'
          : 'border-border bg-white text-muted-foreground hover:bg-secondary',
      )}
      style={active ? { background: color } : undefined}
    >
      {icon}
      {!icon && (
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ background: active ? '#ffffff' : color }}
        />
      )}
      {label}
    </button>
  )
}
