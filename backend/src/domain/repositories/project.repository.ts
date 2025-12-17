import { Project } from '../entities';

/**
 * プロジェクトリポジトリインターフェース
 */
export interface ProjectRepository {
  /**
   * IDで検索
   */
  findById(id: string): Promise<Project | null>;

  /**
   * 組織内のプロジェクト一覧
   */
  findByOrganizationId(organizationId: string): Promise<Project[]>;

  /**
   * 組織内でスラッグで検索
   */
  findByOrganizationIdAndSlug(organizationId: string, slug: string): Promise<Project | null>;

  /**
   * 組織内でスラッグの存在確認
   */
  existsByOrganizationIdAndSlug(organizationId: string, slug: string): Promise<boolean>;

  /**
   * 保存
   */
  save(project: Project): Promise<void>;

  /**
   * 削除
   */
  delete(id: string): Promise<void>;

  /**
   * IDの生成
   */
  generateId(): string;
}

export const PROJECT_REPOSITORY = Symbol('PROJECT_REPOSITORY');

