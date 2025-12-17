import { SetMetadata } from '@nestjs/common';
import { IS_PUBLIC_KEY } from '../guards/jwt-auth.guard';

/**
 * 認証不要エンドポイントを指定するデコレータ
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

