import { Injectable, Logger } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * AES-256-GCM による文字列の暗号化/復号。
 *
 * GitHub PAT 等の秘匿トークンを DB に保存する＝漏洩したら影響大なので、
 * 必ず暗号化して暗号文のみ DB に置く（復号は使用の瞬間だけ）。
 *
 * 鍵は process.env.TOKEN_ENC_KEY（64桁の16進＝32バイト）から取得。
 * 未設定の場合は throw せず、定数から安定した32バイトのdev鍵を導出して warn する（実装優先）。
 */
const ALGO = 'aes-256-gcm';

@Injectable()
export class CryptoService {
  private readonly logger = new Logger(CryptoService.name);
  private cachedKey?: Buffer;

  private key(): Buffer {
    if (this.cachedKey) return this.cachedKey;

    const hex = process.env.TOKEN_ENC_KEY;
    if (hex) {
      const k = Buffer.from(hex, 'hex');
      if (k.length === 32) {
        this.cachedKey = k;
        return k;
      }
      this.logger.warn(
        'TOKEN_ENC_KEY is set but is not 32 bytes (64 hex chars); falling back to a derived dev key.',
      );
    } else {
      this.logger.warn(
        'TOKEN_ENC_KEY is not set; deriving a stable dev key. DO NOT use this in production.',
      );
    }

    // 開発用の安定鍵を定数から導出（プロセス間でも同一になるため復号可能）。
    this.cachedKey = createHash('sha256')
      .update('ai-data-flow:token-enc:dev-fallback-key:v1')
      .digest();
    return this.cachedKey;
  }

  /** 平文を AES-256-GCM で暗号化し、iv(12)+tag(16)+cipher を連結して base64 で返す。 */
  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGO, this.key(), iv);
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, enc]).toString('base64');
  }

  /** encrypt の逆。改ざん・鍵違いは GCM 認証で例外になる。 */
  decrypt(blob: string): string {
    const raw = Buffer.from(blob, 'base64');
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const enc = raw.subarray(28);
    const decipher = createDecipheriv(ALGO, this.key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  }
}
