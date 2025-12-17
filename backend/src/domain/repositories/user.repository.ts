import { User } from '../entities';

/**
 * ユーザーリポジトリインターフェース
 * データアクセスの抽象化
 */
export interface UserRepository {
  /**
   * IDで検索
   */
  findById(id: string): Promise<User | null>;

  /**
   * メールアドレスで検索
   */
  findByEmail(email: string): Promise<User | null>;

  /**
   * メールアドレスの存在確認
   */
  existsByEmail(email: string): Promise<boolean>;

  /**
   * 保存（新規作成・更新）
   */
  save(user: User): Promise<void>;

  /**
   * 削除
   */
  delete(id: string): Promise<void>;

  /**
   * IDの生成
   */
  generateId(): string;
}

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

