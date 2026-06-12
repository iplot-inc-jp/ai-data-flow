import { Stakeholder } from '../entities';

/**
 * Stakeholder リポジトリインターフェース
 */
export interface IStakeholderRepository {
  /**
   * IDで検索
   */
  findById(id: string): Promise<Stakeholder | null>;

  /**
   * プロジェクト内のステークホルダー一覧（order昇順）
   */
  findByProjectId(projectId: string): Promise<Stakeholder[]>;

  /**
   * 保存
   */
  save(stakeholder: Stakeholder): Promise<void>;

  /**
   * 削除
   */
  delete(id: string): Promise<void>;

  /**
   * IDの生成
   */
  generateId(): string;
}

export const STAKEHOLDER_REPOSITORY = Symbol('STAKEHOLDER_REPOSITORY');
