import { GapItem, GapPriority, GapStatus } from '../entities';

/**
 * GAP一覧取得フィルタ
 */
export interface FindGapItemsFilters {
  phaseId?: string;
  priority?: GapPriority;
  status?: GapStatus;
}

/**
 * GapItem リポジトリインターフェース
 */
export interface IGapItemRepository {
  /**
   * IDで検索
   */
  findById(id: string): Promise<GapItem | null>;

  /**
   * プロジェクト内のGAP一覧（order昇順、フィルタ可能）
   */
  findByProjectId(
    projectId: string,
    filters?: FindGapItemsFilters,
  ): Promise<GapItem[]>;

  /**
   * 保存
   */
  save(gapItem: GapItem): Promise<void>;

  /**
   * 削除
   */
  delete(id: string): Promise<void>;

  /**
   * IDの生成
   */
  generateId(): string;
}

export const GAP_ITEM_REPOSITORY = Symbol('GAP_ITEM_REPOSITORY');
