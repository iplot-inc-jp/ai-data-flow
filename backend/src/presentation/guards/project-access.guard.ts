import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import {
  ProjectAccessService,
  RequiredAccess,
} from '../../infrastructure/services/project-access.service';

/**
 * プロジェクト単位アクセス制御ガード。
 *
 * 運用: @ProjectScopedAccess() を付けたコントローラに @UseGuards(ProjectAccessGuard)
 * をクラスで適用する。
 *
 * 振る舞い:
 *   - request.params.projectId から projectId を解決
 *     （ProjectController 詳細ルートだけ params.id を許可）。
 *   - projectId が取れないルートは true（素通り。既存チェックに委ねる）。
 *   - メソッド別の必要レベル: GET/HEAD → view、POST/PUT/PATCH/DELETE → edit。
 *   - request.user 不在（@Public / 認証不要 / JwtAuthGuard 未通過）なら素通り。
 *   - 不足なら ForbiddenException(403)。
 */
@Injectable()
export class ProjectAccessGuard implements CanActivate {
  constructor(private readonly projectAccess: ProjectAccessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // 認証情報が無いルート（@Public 等）には干渉しない。JwtAuthGuard に委ねる。
    const user = request.user as { id?: string } | undefined;
    if (!user || !user.id) {
      return true;
    }

    const projectId = this.resolveProjectId(context, request);
    if (!projectId) {
      // projectId 非依存ルートは素通り（既存チェックに委ねる）。
      return true;
    }

    const required = this.requiredLevel(request.method);
    const level = await this.projectAccess.resolveProjectAccess(
      projectId,
      user.id,
    );
    if (this.projectAccess.satisfies(level, required)) {
      return true;
    }

    throw new ForbiddenException(
      required === 'edit'
        ? 'You do not have edit access to this project'
        : 'You do not have access to this project',
    );
  }

  /**
   * params.projectId を最優先で解決。
   * ProjectByIdController（GET /projects/:id 詳細）だけ params.id を projectId とみなす。
   */
  private resolveProjectId(
    context: ExecutionContext,
    request: { params?: Record<string, string> },
  ): string | undefined {
    const params = request.params ?? {};
    if (params.projectId) {
      return params.projectId;
    }
    if (params.id && context.getClass().name === 'ProjectByIdController') {
      return params.id;
    }
    return undefined;
  }

  private requiredLevel(method: string): RequiredAccess {
    const m = (method ?? 'GET').toUpperCase();
    return m === 'GET' || m === 'HEAD' ? 'view' : 'edit';
  }
}
