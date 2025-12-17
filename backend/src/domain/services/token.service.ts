/**
 * JWTペイロード
 */
export interface TokenPayload {
  sub: string; // ユーザーID
  email: string;
}

/**
 * トークンサービスインターフェース
 * インフラ層で実装
 */
export interface TokenService {
  /**
   * アクセストークン生成
   */
  generateAccessToken(payload: TokenPayload): string;

  /**
   * トークン検証
   */
  verifyToken(token: string): TokenPayload | null;
}

export const TOKEN_SERVICE = Symbol('TOKEN_SERVICE');

