import {
  Controller,
  Get,
  Put,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiProperty,
} from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { PrismaService } from '../../infrastructure/persistence/prisma/prisma.service';
import {
  ProjectAccessService,
  ProjectAccessLevelValue,
} from '../../infrastructure/services/project-access.service';
import { ForbiddenError, EntityNotFoundError, ValidationError } from '../../domain';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../decorators/current-user.decorator';
import { ProjectScopedAccess } from '../decorators/project-scoped-access.decorator';
import { ProjectAccessGuard } from '../guards/project-access.guard';

// ========== DTOs ==========

class SetMemberAccessDto {
  @ApiProperty({ description: 'アクセスレベル', enum: ['VIEW', 'EDIT'] })
  @IsIn(['VIEW', 'EDIT'])
  accessLevel: ProjectAccessLevelValue;
}

interface ProjectMemberRow {
  userId: string;
  email: string;
  name: string | null;
  orgRole: string;
  explicitLevel: ProjectAccessLevelValue | null;
  effectiveLevel: ProjectAccessLevelValue | null;
}

/**
 * プロジェクト単位メンバー管理。
 * 管理者ゲート = ProjectAccessService.isProjectAdmin（super-admin or org OWNER/ADMIN）。
 *
 * @ProjectScopedAccess + ProjectAccessGuard も付与（OWNER/ADMIN は EDIT 充足で通る）。
 * my-access は本人の権限取得なので管理者ゲート不要。
 */
@ApiTags('プロジェクトメンバー')
@ApiBearerAuth()
@ProjectScopedAccess()
@UseGuards(ProjectAccessGuard)
@Controller('projects/:projectId/members')
export class ProjectMemberController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectAccess: ProjectAccessService,
  ) {}

  /**
   * 管理者ゲート。super-admin or org OWNER/ADMIN でなければ ForbiddenError。
   */
  private async assertAdmin(projectId: string, userId: string): Promise<void> {
    const isAdmin = await this.projectAccess.isProjectAdmin(projectId, userId);
    if (!isAdmin) {
      throw new ForbiddenError('You are not allowed to manage project members');
    }
  }

  private async getProjectOrThrow(
    projectId: string,
  ): Promise<{ organizationId: string }> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { organizationId: true },
    });
    if (!project) {
      throw new EntityNotFoundError('Project', projectId);
    }
    return project;
  }

  @Get()
  @ApiOperation({
    summary: 'プロジェクトメンバー一覧（その org の全ユーザー＋実効権限）',
  })
  @ApiParam({ name: 'projectId', description: 'プロジェクトID' })
  @ApiResponse({ status: 403, description: '管理者権限がありません' })
  @ApiResponse({ status: 404, description: 'プロジェクトが見つかりません' })
  async list(
    @CurrentUser() user: CurrentUserPayload,
    @Param('projectId') projectId: string,
  ): Promise<ProjectMemberRow[]> {
    const project = await this.getProjectOrThrow(projectId);
    await this.assertAdmin(projectId, user.id);

    // その org の全ユーザー
    const orgMembers = await this.prisma.organizationMember.findMany({
      where: { organizationId: project.organizationId },
      include: { user: { select: { id: true, email: true, name: true } } },
    });

    // 明示権限（ProjectMember）
    const projectMembers = await this.prisma.projectMember.findMany({
      where: { projectId },
      select: { userId: true, accessLevel: true },
    });
    const explicitByUser = new Map<string, ProjectAccessLevelValue>(
      projectMembers.map((m) => [
        m.userId,
        m.accessLevel as ProjectAccessLevelValue,
      ]),
    );

    const rows: ProjectMemberRow[] = [];
    for (const m of orgMembers) {
      const effectiveLevel = await this.projectAccess.resolveProjectAccess(
        projectId,
        m.user.id,
      );
      rows.push({
        userId: m.user.id,
        email: m.user.email,
        name: m.user.name,
        orgRole: m.role,
        explicitLevel: explicitByUser.get(m.user.id) ?? null,
        effectiveLevel,
      });
    }
    return rows;
  }

  @Put(':userId')
  @ApiOperation({ summary: 'プロジェクトメンバーの明示アクセスレベルを設定（upsert）' })
  @ApiParam({ name: 'projectId', description: 'プロジェクトID' })
  @ApiParam({ name: 'userId', description: 'ユーザーID' })
  @ApiResponse({ status: 400, description: '対象ユーザーが org メンバーではありません' })
  @ApiResponse({ status: 403, description: '管理者権限がありません' })
  @ApiResponse({ status: 404, description: 'プロジェクトが見つかりません' })
  async setAccess(
    @CurrentUser() user: CurrentUserPayload,
    @Param('projectId') projectId: string,
    @Param('userId') targetUserId: string,
    @Body() dto: SetMemberAccessDto,
  ): Promise<{ userId: string; accessLevel: ProjectAccessLevelValue }> {
    const project = await this.getProjectOrThrow(projectId);
    await this.assertAdmin(projectId, user.id);

    // 対象 user が org メンバーであることを検証
    const orgMember = await this.prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: project.organizationId,
          userId: targetUserId,
        },
      },
      select: { id: true },
    });
    if (!orgMember) {
      throw new ValidationError(
        'Target user is not a member of this organization',
      );
    }

    await this.prisma.projectMember.upsert({
      where: { projectId_userId: { projectId, userId: targetUserId } },
      create: { projectId, userId: targetUserId, accessLevel: dto.accessLevel },
      update: { accessLevel: dto.accessLevel },
    });

    return { userId: targetUserId, accessLevel: dto.accessLevel };
  }

  @Delete(':userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'プロジェクトメンバーの明示権限を削除（既定に戻す）' })
  @ApiParam({ name: 'projectId', description: 'プロジェクトID' })
  @ApiParam({ name: 'userId', description: 'ユーザーID' })
  @ApiResponse({ status: 403, description: '管理者権限がありません' })
  @ApiResponse({ status: 404, description: 'プロジェクトが見つかりません' })
  async removeAccess(
    @CurrentUser() user: CurrentUserPayload,
    @Param('projectId') projectId: string,
    @Param('userId') targetUserId: string,
  ): Promise<{ success: boolean }> {
    await this.getProjectOrThrow(projectId);
    await this.assertAdmin(projectId, user.id);

    await this.prisma.projectMember.deleteMany({
      where: { projectId, userId: targetUserId },
    });

    return { success: true };
  }
}

/**
 * 自分の実効権限取得。本人の権限なので管理者ゲート不要。
 */
@ApiTags('プロジェクトメンバー')
@ApiBearerAuth()
@ProjectScopedAccess()
@UseGuards(ProjectAccessGuard)
@Controller('projects/:projectId/my-access')
export class ProjectMyAccessController {
  constructor(private readonly projectAccess: ProjectAccessService) {}

  @Get()
  @ApiOperation({ summary: '呼出ユーザーの実効アクセスレベル（EDIT/VIEW/null）' })
  @ApiParam({ name: 'projectId', description: 'プロジェクトID' })
  async myAccess(
    @CurrentUser() user: CurrentUserPayload,
    @Param('projectId') projectId: string,
  ): Promise<{ accessLevel: ProjectAccessLevelValue | null }> {
    const accessLevel = await this.projectAccess.resolveProjectAccess(
      projectId,
      user.id,
    );
    return { accessLevel };
  }
}
