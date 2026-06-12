/**
 * er-layout — ER図キャンバスの純粋なジオメトリ計算。
 *
 * - 表示モード（全カラム / キーのみ / テーブル名のみ）ごとのカードサイズ
 * - オブジェクト点線囲み（メンバーテーブル群のバウンディングボックス＋余白）
 * - FKエッジ・オブジェクト関係線のアンカー計算
 * - 「自動整列」のグリッド配置（オブジェクト横並び、未分類は右端）
 *
 * React に依存しない純関数のみ（SwimlaneCanvas / flow-layout のパターンを踏襲）。
 */

import type { DataObjectDto, ErColumnDto, ErTableDto } from '@/lib/data-objects';

// ========== 表示モード ==========

/** カードの表示粒度。カード高さ＝モード依存（エッジはこの高さに追従する） */
export type ErDisplayMode = 'all' | 'keys' | 'title';

export const ER_DISPLAY_MODE_OPTIONS: ReadonlyArray<{ value: ErDisplayMode; label: string }> = [
  { value: 'all', label: '全カラム' },
  { value: 'keys', label: 'キーのみ' },
  { value: 'title', label: 'テーブル名のみ' },
];

// ========== カード寸法 ==========

export const CARD_W = 232;
export const HEADER_H = 32;
export const ROW_H = 21;
/** カラム行がある場合の下余白 */
export const CARD_FOOT = 5;

/** 表示モードで見えるカラム行（order どおり）。title モードは 0 行。 */
export function visibleColumns(table: ErTableDto, mode: ErDisplayMode): ErColumnDto[] {
  if (mode === 'title') return [];
  if (mode === 'keys') return table.columns.filter((c) => c.isPrimaryKey || c.isForeignKey);
  return table.columns;
}

/** カード高さ（モードで行数が変わる → エッジ・囲みもこの高さに追従） */
export function cardHeight(table: ErTableDto, mode: ErDisplayMode): number {
  const rows = visibleColumns(table, mode).length;
  return HEADER_H + rows * ROW_H + (rows > 0 ? CARD_FOOT : 0);
}

// ========== 矩形 ==========

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

export function unionRect(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function padRect(r: Rect, pad: number, padTopExtra = 0): Rect {
  return { x: r.x - pad, y: r.y - pad - padTopExtra, w: r.w + pad * 2, h: r.h + pad * 2 + padTopExtra };
}

export function rectCenter(r: Rect): Point {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

/**
 * 矩形中心 → toward 方向の半直線と矩形境界の交点。
 * オブジェクト関係線（囲み同士を結ぶ点線）のアンカーに使う。
 */
export function rectBoundaryPoint(rect: Rect, toward: Point): Point {
  const c = rectCenter(rect);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  if (dx === 0 && dy === 0) return c;
  const hw = rect.w / 2;
  const hh = rect.h / 2;
  // 境界に達する倍率（x方向 / y方向の小さい方）
  const tx = dx !== 0 ? hw / Math.abs(dx) : Infinity;
  const ty = dy !== 0 ? hh / Math.abs(dy) : Infinity;
  const t = Math.min(tx, ty);
  return { x: c.x + dx * t, y: c.y + dy * t };
}

// ========== オブジェクト囲み ==========

/** 囲みの内側余白（テーブル群のバウンディングボックスに足す） */
export const GROUP_PAD = 26;
/** ラベル分の上側追加余白 */
export const GROUP_LABEL_PAD = 20;
/** メンバー0件オブジェクトのプレースホルダ囲みサイズ */
export const EMPTY_GROUP_W = 190;
export const EMPTY_GROUP_H = 72;

/** オブジェクト色が未設定のときのパレット（index 順に循環） */
export const OBJECT_COLOR_PALETTE = [
  '#6366f1', // indigo
  '#0ea5e9', // sky
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ec4899', // pink
  '#8b5cf6', // violet
  '#14b8a6', // teal
  '#f97316', // orange
] as const;

export function objectColor(obj: DataObjectDto, index: number): string {
  return obj.color || OBJECT_COLOR_PALETTE[index % OBJECT_COLOR_PALETTE.length];
}

/**
 * オブジェクト囲みの矩形。
 * - メンバーあり: テーブル群のバウンディングボックス＋余白（ドラッグに追従）
 * - メンバーなし: オブジェクト自身の position にプレースホルダ
 */
export function groupRect(
  memberRects: Rect[],
  fallbackPosition: Point,
): { rect: Rect; empty: boolean } {
  const union = unionRect(memberRects);
  if (!union) {
    return {
      rect: { x: fallbackPosition.x, y: fallbackPosition.y, w: EMPTY_GROUP_W, h: EMPTY_GROUP_H },
      empty: true,
    };
  }
  return { rect: padRect(union, GROUP_PAD, GROUP_LABEL_PAD), empty: false };
}

// ========== 自動整列 ==========

const ARRANGE_GAP_X = 56; // 同一オブジェクト内のカード間（横）
const ARRANGE_GAP_Y = 44; // 同一オブジェクト内のカード間（縦）
const ARRANGE_GROUP_GAP = 110; // オブジェクト囲み同士の間隔
const ARRANGE_ORIGIN_X = 60;
const ARRANGE_ORIGIN_Y = 80;

/**
 * 自動整列: オブジェクトごとにテーブルをグリッド配置。
 * オブジェクトは order 順に横並び、どのオブジェクトにも属さないテーブル（未分類）は右端。
 * 高さは「全カラム」モード基準で計算する（最も背が高いモードでも重ならない位置を保存するため）。
 */
export function computeAutoArrange(
  objects: DataObjectDto[],
  tables: ErTableDto[],
): Map<string, Point> {
  const sortedObjects = [...objects].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'ja'));
  const byObject = new Map<string, ErTableDto[]>();
  const unassigned: ErTableDto[] = [];
  for (const t of [...tables].sort((a, b) => a.name.localeCompare(b.name, 'ja'))) {
    if (t.dataObjectId && sortedObjects.some((o) => o.id === t.dataObjectId)) {
      const list = byObject.get(t.dataObjectId) ?? [];
      list.push(t);
      byObject.set(t.dataObjectId, list);
    } else {
      unassigned.push(t);
    }
  }

  const result = new Map<string, Point>();
  let cursorX = ARRANGE_ORIGIN_X;

  const placeGroup = (members: ErTableDto[]) => {
    if (members.length === 0) return;
    const cols = Math.max(1, Math.ceil(Math.sqrt(members.length)));
    let y = ARRANGE_ORIGIN_Y;
    let groupW = 0;
    for (let row = 0; row * cols < members.length; row++) {
      const rowMembers = members.slice(row * cols, (row + 1) * cols);
      let rowH = 0;
      rowMembers.forEach((t, i) => {
        result.set(t.id, { x: cursorX + i * (CARD_W + ARRANGE_GAP_X), y });
        rowH = Math.max(rowH, cardHeight(t, 'all'));
      });
      groupW = Math.max(groupW, rowMembers.length * (CARD_W + ARRANGE_GAP_X) - ARRANGE_GAP_X);
      y += rowH + ARRANGE_GAP_Y;
    }
    cursorX += groupW + ARRANGE_GROUP_GAP;
  };

  for (const obj of sortedObjects) {
    placeGroup(byObject.get(obj.id) ?? []);
  }
  // 未分類は右端
  placeGroup(unassigned);

  return result;
}

// ========== テキスト省略 ==========

/**
 * 全角=2・半角=1 換算で maxUnits を超えたら「…」で切る（SVG text 用の簡易クリップ）。
 */
export function clipText(s: string, maxUnits: number): string {
  let units = 0;
  let out = '';
  for (const ch of s) {
    const w = /[ -~｡-ﾟ]/.test(ch) ? 1 : 2;
    if (units + w > maxUnits) return `${out}…`;
    units += w;
    out += ch;
  }
  return s;
}

// ========== ベジェ補助 ==========

/** 3次ベジェの中点（FKエッジのラベル位置に使う） */
export function cubicMidpoint(p0: Point, c1: Point, c2: Point, p1: Point): Point {
  // t = 0.5 を代入した標準式
  return {
    x: (p0.x + 3 * c1.x + 3 * c2.x + p1.x) / 8,
    y: (p0.y + 3 * c1.y + 3 * c2.y + p1.y) / 8,
  };
}
