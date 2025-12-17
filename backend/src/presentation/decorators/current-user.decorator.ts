import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * 現在のユーザー情報を取得するデコレータ
 */
export interface CurrentUserPayload {
  id: string;
  email: string;
}

export const CurrentUser = createParamDecorator(
  (data: keyof CurrentUserPayload | undefined, ctx: ExecutionContext): CurrentUserPayload | string => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as CurrentUserPayload;

    if (data) {
      return user[data];
    }
    return user;
  },
);

