import { Injectable } from '@nestjs/common';
import { randomBytes, createHash } from 'crypto';

/**
 * 公開API / MCP 用のAPIキー生成・ハッシュ化サービス。
 * 平文キーは作成時に一度だけ返し、DBには sha256 ハッシュのみ保存する。
 */
@Injectable()
export class ApiKeyService {
  /** 新しいAPIキーを生成（key は平文・一度だけ返す） */
  generate(): { key: string; keyHash: string; keyPrefix: string } {
    const raw = randomBytes(24).toString('base64url');
    const key = `sk_${raw}`;
    return {
      key,
      keyHash: this.hash(key),
      keyPrefix: key.slice(0, 11),
    };
  }

  hash(key: string): string {
    return createHash('sha256').update(key).digest('hex');
  }

  /** リクエストから APIキーを取り出す（x-api-key または Authorization: Bearer sk_...） */
  static extract(headers: Record<string, unknown>): string | null {
    const x = headers['x-api-key'];
    if (typeof x === 'string' && x.startsWith('sk_')) return x;
    const auth = headers['authorization'];
    if (typeof auth === 'string' && auth.startsWith('Bearer sk_')) {
      return auth.substring(7);
    }
    return null;
  }
}
