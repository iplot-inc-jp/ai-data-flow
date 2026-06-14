import { SetMetadata } from '@nestjs/common';

/**
 * ProjectAccessGuard を有効化するマーカーデコレータ。
 *
 * 運用: :projectId を含むコントローラに
 *   @ProjectScopedAccess()
 *   @UseGuards(ProjectAccessGuard)
 * をクラスへ付与する。projectId を解決できないルートでは guard が素通りする。
 */
export const PROJECT_SCOPED_ACCESS_KEY = 'projectScopedAccess';

export const ProjectScopedAccess = () =>
  SetMetadata(PROJECT_SCOPED_ACCESS_KEY, true);
