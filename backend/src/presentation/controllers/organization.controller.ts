import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsOptional, IsIn } from 'class-validator';
import {
  CreateOrganizationUseCase,
  GetOrganizationsUseCase,
} from '../../application';
import {
  CreateOrganizationRequestDto,
  OrganizationResponseDto,
} from '../dto';
import { PrismaService } from '../../infrastructure/persistence/prisma/prisma.service';
import { CryptoService } from '../../infrastructure/services/crypto.service';
import { EntityNotFoundError, ForbiddenError } from '../../domain';
import { CurrentUser, CurrentUserPayload } from '../decorators/current-user.decorator';

// ========== DTOs ==========
class UpdateSettingsDto {
  @IsOptional()
  @IsString()
  anthropicApiKey?: string; // 平文受け取り→暗号化。空文字でクリア

  @IsOptional()
  @IsIn(['active', 'suspended'])
  status?: string;
}

class AddMemberDto {
  @IsString()
  email: string;

  @IsOptional()
  @IsString()
  role?: string; // '会社管理者' | '一般ユーザー' | MemberRole（OWNER/ADMIN/MEMBER/VIEWER）
}

class UpdateMemberDto {
  @IsString()
  role: string;
}

// 日本語ロール or MemberRole を受け取り、保存する MemberRole に正規化
function normalizeRole(role?: string): 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER' {
  const r = (role ?? '').trim();
  if (r === '会社管理者') return 'OWNER';
  if (r === '一般ユーザー') return 'MEMBER';
  if (r === 'OWNER' || r === 'ADMIN' || r === 'MEMBER' || r === 'VIEWER') {
    return r;
  }
  // 既定は一般ユーザー
  return 'MEMBER';
}

@ApiTags('組織')
@ApiBearerAuth()
@Controller('organizations')
export class OrganizationController {
  constructor(
    private readonly createOrganizationUseCase: CreateOrganizationUseCase,
    private readonly getOrganizationsUseCase: GetOrganizationsUseCase,
    private readonly prisma: PrismaService,
    private readonly cryptoService: CryptoService,
  ) {}

  // 会社管理者（OWNER/ADMIN）または全体管理者か検証
  private async assertCompanyAdmin(
    organizationId: string,
    userId: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isSuperAdmin: true },
    });
    if (user?.isSuperAdmin) return;

    const member = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      select: { role: true },
    });
    if (member && (member.role === 'OWNER' || member.role === 'ADMIN')) {
      return;
    }
    throw new ForbiddenError('この会社を管理する権限がありません');
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '組織作成' })
  @ApiResponse({ status: 201, description: '作成成功', type: OrganizationResponseDto })
  @ApiResponse({ status: 400, description: 'バリデーションエラー' })
  @ApiResponse({ status: 409, description: 'スラッグが既に使用されています' })
  async create(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateOrganizationRequestDto,
  ): Promise<OrganizationResponseDto> {
    const result = await this.createOrganizationUseCase.execute({
      userId: user.id,
      name: dto.name,
      slug: dto.slug,
      description: dto.description,
    });
    return result;
  }

  @Get()
  @ApiOperation({ summary: '組織一覧取得' })
  @ApiResponse({ status: 200, description: '成功', type: [OrganizationResponseDto] })
  async findAll(
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<OrganizationResponseDto[]> {
    const result = await this.getOrganizationsUseCase.execute({
      userId: user.id,
    });
    return result;
  }

  // ========== 会社設定 ==========

  @Get(':id/settings')
  @ApiOperation({ summary: '会社設定取得' })
  async getSettings(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    await this.assertCompanyAdmin(id, user.id);

    const org = await this.prisma.organization.findUnique({
      where: { id },
      select: { status: true, anthropicApiKeyEnc: true },
    });
    if (!org) {
      throw new EntityNotFoundError('Organization', id);
    }

    return {
      status: org.status,
      anthropicApiKeyConfigured: !!org.anthropicApiKeyEnc,
    };
  }

  @Put(':id/settings')
  @ApiOperation({ summary: '会社設定更新' })
  async updateSettings(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: UpdateSettingsDto,
  ) {
    await this.assertCompanyAdmin(id, user.id);

    const org = await this.prisma.organization.findUnique({ where: { id } });
    if (!org) {
      throw new EntityNotFoundError('Organization', id);
    }

    const data: { anthropicApiKeyEnc?: string | null; status?: string } = {};

    if (dto.anthropicApiKey !== undefined) {
      // 空文字はクリア（null）、それ以外は暗号化して保存
      data.anthropicApiKeyEnc = dto.anthropicApiKey
        ? this.cryptoService.encrypt(dto.anthropicApiKey)
        : null;
    }
    if (dto.status !== undefined) {
      data.status = dto.status;
    }

    const updated = await this.prisma.organization.update({
      where: { id },
      data,
      select: { status: true, anthropicApiKeyEnc: true },
    });

    return {
      status: updated.status,
      anthropicApiKeyConfigured: !!updated.anthropicApiKeyEnc,
    };
  }

  // ========== メンバー管理 ==========

  @Get(':id/members')
  @ApiOperation({ summary: '会社メンバー一覧取得' })
  async getMembers(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    await this.assertCompanyAdmin(id, user.id);

    const members = await this.prisma.organizationMember.findMany({
      where: { organizationId: id },
      include: { user: { select: { id: true, email: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });

    return members.map((m) => ({
      userId: m.userId,
      email: m.user.email,
      name: m.user.name,
      role: m.role,
    }));
  }

  @Post(':id/members')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '会社メンバー追加' })
  async addMember(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: AddMemberDto,
  ) {
    await this.assertCompanyAdmin(id, user.id);

    const org = await this.prisma.organization.findUnique({ where: { id } });
    if (!org) {
      throw new EntityNotFoundError('Organization', id);
    }

    const target = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      select: { id: true, email: true, name: true },
    });
    if (!target) {
      throw new EntityNotFoundError('User', dto.email);
    }

    const role = normalizeRole(dto.role);

    const member = await this.prisma.organizationMember.upsert({
      where: {
        organizationId_userId: { organizationId: id, userId: target.id },
      },
      create: { organizationId: id, userId: target.id, role },
      update: { role },
    });

    return {
      userId: target.id,
      email: target.email,
      name: target.name,
      role: member.role,
    };
  }

  @Put(':id/members/:userId')
  @ApiOperation({ summary: '会社メンバーのロール変更' })
  async updateMember(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateMemberDto,
  ) {
    await this.assertCompanyAdmin(id, user.id);

    const existing = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: id, userId } },
      include: { user: { select: { email: true, name: true } } },
    });
    if (!existing) {
      throw new EntityNotFoundError('OrganizationMember', userId);
    }

    const role = normalizeRole(dto.role);
    const updated = await this.prisma.organizationMember.update({
      where: { organizationId_userId: { organizationId: id, userId } },
      data: { role },
    });

    return {
      userId,
      email: existing.user.email,
      name: existing.user.name,
      role: updated.role,
    };
  }

  @Delete(':id/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '会社メンバー削除' })
  async removeMember(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ): Promise<void> {
    await this.assertCompanyAdmin(id, user.id);

    const existing = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: id, userId } },
      select: { id: true },
    });
    if (!existing) {
      throw new EntityNotFoundError('OrganizationMember', userId);
    }

    await this.prisma.organizationMember.delete({
      where: { organizationId_userId: { organizationId: id, userId } },
    });
  }
}
