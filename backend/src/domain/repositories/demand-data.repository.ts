import { DemandData } from '../entities';

/**
 * DemandData リポジトリインターフェース
 */
export interface IDemandDataRepository {
  /**
   * IDで検索
   */
  findById(id: string): Promise<DemandData | null>;

  /**
   * プロジェクト内の需要データ一覧（order昇順）
   */
  findByProjectId(projectId: string): Promise<DemandData[]>;

  /**
   * 保存
   */
  save(demandData: DemandData): Promise<void>;

  /**
   * 削除
   */
  delete(id: string): Promise<void>;

  /**
   * IDの生成
   */
  generateId(): string;
}

export const DEMAND_DATA_REPOSITORY = Symbol('DEMAND_DATA_REPOSITORY');
