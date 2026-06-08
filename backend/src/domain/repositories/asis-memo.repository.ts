import { AsisMemo } from '../entities';

/**
 * AsisMemo リポジトリインターフェース
 */
export interface IAsisMemoRepository {
  /**
   * IDで検索
   */
  findById(id: string): Promise<AsisMemo | null>;

  /**
   * プロジェクト内のASISメモ一覧（order昇順）
   */
  findByProjectId(projectId: string): Promise<AsisMemo[]>;

  /**
   * 保存
   */
  save(asisMemo: AsisMemo): Promise<void>;

  /**
   * 削除
   */
  delete(id: string): Promise<void>;

  /**
   * IDの生成
   */
  generateId(): string;
}

export const ASIS_MEMO_REPOSITORY = Symbol('ASIS_MEMO_REPOSITORY');
