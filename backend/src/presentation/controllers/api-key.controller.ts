import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Inject,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsOptional, MaxLength } from 'class-validator';
import { PrismaService } from '../../infrastructure/persistence/prisma/prisma.service';
import { ApiKeyService } from '../../infrastructure/services/api-key.service';
import { CurrentUser, CurrentUserPayload } from '../decorators/current-user.decorator';

class CreateApiKeyDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  projectId?: string;
}

/**
 * 公開API / MCP 用のAPIキー管理。JWTログイン中のユーザーが自分のキーを発行・失効できる。
 * 平文キーは作成レスポンスでのみ返す（以後は keyPrefix のみ）。
 */
@ApiTags('APIキー')
@ApiBearerAuth()
@Controller('api-keys')
export class ApiKeyController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ApiKeyService) private readonly apiKeyService: ApiKeyService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'APIキーを発行（平文キーは一度だけ返却）' })
  async create(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateApiKeyDto) {
    const { key, keyHash, keyPrefix } = this.apiKeyService.generate();
    const record = await this.prisma.apiKey.create({
      data: {
        userId: user.id,
        projectId: dto.projectId ?? null,
        name: dto.name,
        keyHash,
        keyPrefix,
      },
    });
    return {
      id: record.id,
      name: record.name,
      projectId: record.projectId,
      keyPrefix: record.keyPrefix,
      key, // 平文（このレスポンスでのみ）
      createdAt: record.createdAt,
    };
  }

  @Get()
  @ApiOperation({ summary: 'APIキー一覧（平文は含まない）' })
  async list(@CurrentUser() user: CurrentUserPayload) {
    return this.prisma.apiKey.findMany({
      where: { userId: user.id, revokedAt: null },
      select: {
        id: true,
        name: true,
        projectId: true,
        keyPrefix: true,
        lastUsedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'APIキーを失効' })
  async revoke(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    await this.prisma.apiKey.updateMany({
      where: { id, userId: user.id },
      data: { revokedAt: new Date() },
    });
    return { success: true };
  }
}
