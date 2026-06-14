import { Controller, Get, Param, Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { PrismaService } from '../../infrastructure/persistence/prisma/prisma.service';
import { EntityNotFoundError, ForbiddenError } from '../../domain';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../decorators/current-user.decorator';
import { ProjectScopedAccess } from '../decorators/project-scoped-access.decorator';
import { ProjectAccessGuard } from '../guards/project-access.guard';

const DEFAULT_LIMIT = 100;
const MIN_LIMIT = 1;
const MAX_LIMIT = 300;

@ApiTags('変更履歴')
@ApiBearerAuth()
@ProjectScopedAccess()
@UseGuards(ProjectAccessGuard)
@Controller('projects/:projectId/change-logs')
export class ChangeLogController {
  constructor(private readonly prisma: PrismaService) {}

  // 操作履歴（監査ログ）の閲覧は管理者限定:
  // 全体管理者(super-admin) または 会社管理者(OrganizationMember.role OWNER/ADMIN) のみ。
  // 一般メンバー(MEMBER/VIEWER)は閲覧不可。
  private async assertHistoryAdmin(
    projectId: string,
    userId: string,
  ): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { organizationId: true },
    });
    if (!project) {
      throw new EntityNotFoundError('Project', projectId);
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isSuperAdmin: true },
    });
    if (user?.isSuperAdmin) return;

    const member = await this.prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: project.organizationId,
          userId,
        },
      },
      select: { role: true },
    });
    if (!member || (member.role !== 'OWNER' && member.role !== 'ADMIN')) {
      throw new ForbiddenError(
        '操作履歴の閲覧は会社管理者・全体管理者のみ可能です',
      );
    }
  }

  @Get()
  @ApiOperation({ summary: 'プロジェクトの変更履歴一覧取得（新しい順）' })
  @ApiParam({ name: 'projectId', description: 'プロジェクトID' })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: `取得件数（${MIN_LIMIT}〜${MAX_LIMIT}、既定 ${DEFAULT_LIMIT}）`,
  })
  @ApiResponse({ status: 403, description: '権限がありません' })
  @ApiResponse({ status: 404, description: 'プロジェクトが見つかりません' })
  async list(
    @CurrentUser() user: CurrentUserPayload,
    @Param('projectId') projectId: string,
    @Query('limit') limit?: string,
  ) {
    await this.assertHistoryAdmin(projectId, user.id);

    const parsed = Number.parseInt(limit ?? '', 10);
    const take = Number.isNaN(parsed)
      ? DEFAULT_LIMIT
      : Math.min(Math.max(parsed, MIN_LIMIT), MAX_LIMIT);

    return this.prisma.changeLog.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }
}
