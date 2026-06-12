import { TobeVision } from '../entities';

/**
 * TobeVision リポジトリインターフェース
 */
export interface ITobeVisionRepository {
  /**
   * IDで検索
   */
  findById(id: string): Promise<TobeVision | null>;

  /**
   * プロジェクト内のTOBEビジョン一覧（order昇順）
   */
  findByProjectId(projectId: string): Promise<TobeVision[]>;

  /**
   * 保存
   */
  save(tobeVision: TobeVision): Promise<void>;

  /**
   * 削除
   */
  delete(id: string): Promise<void>;

  /**
   * IDの生成
   */
  generateId(): string;
}

export const TOBE_VISION_REPOSITORY = Symbol('TOBE_VISION_REPOSITORY');
