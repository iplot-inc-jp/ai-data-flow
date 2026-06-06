import { ProjectPhase, PhaseKind } from '../entities';

/**
 * プロジェクトフェーズリポジトリインターフェース
 */
export interface IProjectPhaseRepository {
  /**
   * IDで検索
   */
  findById(id: string): Promise<ProjectPhase | null>;

  /**
   * プロジェクト内のフェーズ一覧（order 昇順）
   */
  findByProjectId(projectId: string): Promise<ProjectPhase[]>;

  /**
   * プロジェクト内で種別から検索
   */
  findByProjectIdAndKind(
    projectId: string,
    kind: PhaseKind,
  ): Promise<ProjectPhase | null>;

  /**
   * 保存
   */
  save(phase: ProjectPhase): Promise<void>;

  /**
   * 削除
   */
  delete(id: string): Promise<void>;

  /**
   * IDの生成
   */
  generateId(): string;
}

export const PROJECT_PHASE_REPOSITORY = Symbol('PROJECT_PHASE_REPOSITORY');
