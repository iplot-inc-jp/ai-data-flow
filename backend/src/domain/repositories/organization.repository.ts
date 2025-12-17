import { Organization } from '../entities';

/**
 * 組織メンバー情報
 */
export interface OrganizationMember {
  userId: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';
}

/**
 * 組織リポジトリインターフェース
 */
export interface OrganizationRepository {
  /**
   * IDで検索
   */
  findById(id: string): Promise<Organization | null>;

  /**
   * スラッグで検索
   */
  findBySlug(slug: string): Promise<Organization | null>;

  /**
   * ユーザーが所属する組織一覧を取得
   */
  findByUserId(userId: string): Promise<Organization[]>;

  /**
   * スラッグの存在確認
   */
  existsBySlug(slug: string): Promise<boolean>;

  /**
   * 保存
   */
  save(organization: Organization): Promise<void>;

  /**
   * 削除
   */
  delete(id: string): Promise<void>;

  /**
   * メンバー追加
   */
  addMember(organizationId: string, member: OrganizationMember): Promise<void>;

  /**
   * メンバー削除
   */
  removeMember(organizationId: string, userId: string): Promise<void>;

  /**
   * メンバーのロール取得
   */
  getMemberRole(organizationId: string, userId: string): Promise<OrganizationMember['role'] | null>;

  /**
   * ユーザーがメンバーかどうか
   */
  isMember(organizationId: string, userId: string): Promise<boolean>;

  /**
   * IDの生成
   */
  generateId(): string;
}

export const ORGANIZATION_REPOSITORY = Symbol('ORGANIZATION_REPOSITORY');

