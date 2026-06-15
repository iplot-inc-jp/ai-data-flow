// ナレッジグラフのノード配色・ラベルの共有定数（canvas / 詳細パネル / フィルタで共用）。
//   タグ(TAG) = 単色。実体(ENTITY) = entityKind 別色。
//   node.color（手動上書き）があればそれを最優先する。

import type { KnowledgeNode } from '@/lib/knowledge'

/** タグノードの単色。 */
export const TAG_COLOR = '#6366f1' // indigo

/** 実体ノードの entityKind 別色（spec の kind 候補を網羅。未知は OTHER）。 */
export const ENTITY_KIND_COLOR: Record<string, string> = {
  PERSON: '#2563eb', // blue
  SYSTEM: '#0891b2', // cyan
  ORG: '#7c3aed', // violet
  CONCEPT: '#059669', // emerald
  PRODUCT: '#d97706', // amber
  EVENT: '#db2777', // pink
  LOCATION: '#65a30d', // lime
  TERM: '#0d9488', // teal
  OTHER: '#64748b', // slate
}

/** entityKind の日本語ラベル。 */
export const ENTITY_KIND_LABEL: Record<string, string> = {
  PERSON: '人物',
  SYSTEM: 'システム',
  ORG: '組織',
  CONCEPT: '概念',
  PRODUCT: '製品',
  EVENT: 'イベント',
  LOCATION: '場所',
  TERM: '用語',
  OTHER: 'その他',
}

const DEFAULT_ENTITY_COLOR = ENTITY_KIND_COLOR.OTHER

/** entityKind → 色（未知/未設定は OTHER 色）。 */
export function entityKindColor(kind: string | null | undefined): string {
  if (!kind) return DEFAULT_ENTITY_COLOR
  return ENTITY_KIND_COLOR[kind] ?? DEFAULT_ENTITY_COLOR
}

/** ノードの表示色。手動 color > タグ単色 / entityKind 色。 */
export function nodeColor(node: {
  type: string
  entityKind?: string | null
  color?: string | null
}): string {
  if (node.color && node.color.trim() !== '') return node.color
  if (node.type === 'TAG') return TAG_COLOR
  return entityKindColor(node.entityKind)
}

/** 凡例に出す entityKind の順序（決定的）。 */
export const ENTITY_KIND_ORDER: readonly string[] = [
  'PERSON',
  'SYSTEM',
  'ORG',
  'CONCEPT',
  'PRODUCT',
  'EVENT',
  'LOCATION',
  'TERM',
  'OTHER',
] as const

/** グラフ内に実在する entityKind の集合（フィルタ UI 用）。 */
export function presentEntityKinds(nodes: KnowledgeNode[]): string[] {
  const set = new Set<string>()
  for (const n of nodes) {
    if (n.type !== 'TAG') set.add(n.entityKind ?? 'OTHER')
  }
  return ENTITY_KIND_ORDER.filter((k) => set.has(k))
}
