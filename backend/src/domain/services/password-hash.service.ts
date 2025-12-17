/**
 * パスワードハッシュサービスインターフェース
 * インフラ層で実装
 */
export interface PasswordHashService {
  /**
   * パスワードをハッシュ化
   */
  hash(password: string): Promise<string>;

  /**
   * パスワードを検証
   */
  compare(password: string, hash: string): Promise<boolean>;
}

export const PASSWORD_HASH_SERVICE = Symbol('PASSWORD_HASH_SERVICE');

