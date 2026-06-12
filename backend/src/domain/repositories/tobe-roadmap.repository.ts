import { TobeRoadmap } from '../entities';

/**
 * TobeRoadmap リポジトリインターフェース
 */
export interface ITobeRoadmapRepository {
  /**
   * IDで検索
   */
  findById(id: string): Promise<TobeRoadmap | null>;

  /**
   * プロジェクト内のTOBEロードマップ一覧（order昇順）
   */
  findByProjectId(projectId: string): Promise<TobeRoadmap[]>;

  /**
   * 保存
   */
  save(tobeRoadmap: TobeRoadmap): Promise<void>;

  /**
   * 削除
   */
  delete(id: string): Promise<void>;

  /**
   * IDの生成
   */
  generateId(): string;
}

export const TOBE_ROADMAP_REPOSITORY = Symbol('TOBE_ROADMAP_REPOSITORY');
