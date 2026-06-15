import { Inject, Injectable } from '@nestjs/common';
import { UserRepository, USER_REPOSITORY, ForbiddenError } from '../../../domain';
import { ProjectAccessService } from '../../../infrastructure/services/project-access.service';
import { LiveblocksTokenService } from '../../../infrastructure/services/liveblocks-token.service';
import { deterministicColor } from '../../../infrastructure/services/presence-colors';

export interface IssueLiveblocksTokenInput {
  userId: string;
  apiKeyId?: string;
  projectId: string;
}

/**
 * Liveblocks プレゼンス用トークン発行。
 * - API キー呼び出しは拒否（プレゼンスは対話的ブラウザ専用）。
 * - 既存 ProjectAccessService で RBAC ゲート（null=403）。
 * - 軽量に UserRepository.findById で name/avatarUrl を取得（GetCurrentUserUseCase の N+1 を避ける）。
 * - room id は backend が project:{projectId} を組み立てる（クライアントは任意スコープを送れない）。
 */
@Injectable()
export class IssueLiveblocksTokenUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    private readonly projectAccess: ProjectAccessService,
    private readonly liveblocks: LiveblocksTokenService,
  ) {}

  async execute(
    input: IssueLiveblocksTokenInput,
  ): Promise<{ body: string; status: number }> {
    if (input.apiKeyId) {
      throw new ForbiddenError('API キーではプレゼンスを利用できません');
    }
    const level = await this.projectAccess.resolveProjectAccess(
      input.projectId,
      input.userId,
    );
    if (!level) {
      throw new ForbiddenError('このプロジェクトへのアクセス権がありません');
    }
    const user = await this.userRepository.findById(input.userId);
    if (!user) {
      throw new ForbiddenError('ユーザーが見つかりません');
    }
    const email = user.email;
    const name = user.name ?? email.split('@')[0];
    return this.liveblocks.mintToken({
      userId: input.userId,
      userInfo: {
        name,
        email,
        avatarUrl: user.avatarUrl,
        color: deterministicColor(input.userId),
      },
      roomId: `project:${input.projectId}`,
      fullAccess: level === 'EDIT',
    });
  }
}
