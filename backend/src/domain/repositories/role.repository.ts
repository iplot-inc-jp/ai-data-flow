import { Role } from '../entities';

/**
 * ロールリポジトリインターフェース
 */
export interface RoleRepository {
  /**
   * IDで検索
   */
  findById(id: string): Promise<Role | null>;

  /**
   * プロジェクト内のロール一覧
   */
  findByProjectId(projectId: string): Promise<Role[]>;

  /**
   * プロジェクト内で名前で検索
   */
  findByProjectIdAndName(projectId: string, name: string): Promise<Role | null>;

  /**
   * プロジェクト内で名前の存在確認
   */
  existsByProjectIdAndName(projectId: string, name: string): Promise<boolean>;

  /**
   * 保存
   */
  save(role: Role): Promise<void>;

  /**
   * 削除
   */
  delete(id: string): Promise<void>;

  /**
   * IDの生成
   */
  generateId(): string;
}

export const ROLE_REPOSITORY = Symbol('ROLE_REPOSITORY');

