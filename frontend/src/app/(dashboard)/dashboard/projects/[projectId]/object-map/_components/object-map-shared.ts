import type { RelationCardinality } from '@/lib/data-objects';

/** キャンバス上のオブジェクトカードの描画サイズ（ドラッグ・エッジ計算と共有） */
export const CARD_W = 200;
export const CARD_H = 92;

/** オブジェクトの色パレット（カード左帯・一覧の色選択で共用） */
export const OBJECT_COLORS = [
  '#2563eb', // blue
  '#050f3e', // navy
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#64748b', // slate
] as const;

export const DEFAULT_OBJECT_COLOR = '#2563eb';

/** オブジェクトの色（null の場合はデフォルト色）を返す */
export function objectColor(color: string | null | undefined): string {
  return color && color.trim() !== '' ? color : DEFAULT_OBJECT_COLOR;
}

/**
 * カーディナリティ別の見た目。
 * 線色＋両端の 1/N 表記で 1:1 / 1:多 / 多:多 を区別する。
 */
export interface CardinalityStyle {
  /** エッジ線・端点表記の色 */
  color: string;
  /** source 側の端点表記 */
  sourceMark: '1' | 'N';
  /** target 側の端点表記 */
  targetMark: '1' | 'N';
  /** 中央チップの短縮表記 */
  short: string;
}

export const CARDINALITY_STYLES: Record<RelationCardinality, CardinalityStyle> = {
  ONE_TO_ONE: { color: '#2563eb', sourceMark: '1', targetMark: '1', short: '1:1' },
  ONE_TO_MANY: { color: '#10b981', sourceMark: '1', targetMark: 'N', short: '1:多' },
  MANY_TO_MANY: { color: '#f59e0b', sourceMark: 'N', targetMark: 'N', short: '多:多' },
};
