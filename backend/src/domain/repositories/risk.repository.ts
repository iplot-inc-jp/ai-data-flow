import { Risk } from '../entities';

/**
 * Risk リポジトリインターフェース
 */
export interface IRiskRepository {
  /**
   * IDで検索
   */
  findById(id: string): Promise<Risk | null>;

  /**
   * プロジェクト内のリスク一覧（order昇順）
   */
  findByProjectId(projectId: string): Promise<Risk[]>;

  /**
   * 保存
   */
  save(risk: Risk): Promise<void>;

  /**
   * 削除
   */
  delete(id: string): Promise<void>;

  /**
   * IDの生成
   */
  generateId(): string;
}

export const RISK_REPOSITORY = Symbol('RISK_REPOSITORY');
