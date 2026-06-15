// backend/src/presentation/controllers/liveblocks.controller.ts
import { Body, Controller, Post, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiProperty, ApiResponse } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';
import type { Response } from 'express';
import { CurrentUser, CurrentUserPayload } from '../decorators/current-user.decorator';
import { IssueLiveblocksTokenUseCase } from '../../application/use-cases/liveblocks/issue-liveblocks-token.use-case';

class IssueLiveblocksTokenDto {
  @ApiProperty({ description: 'プレゼンス対象プロジェクトID' })
  @IsString()
  @IsNotEmpty()
  projectId!: string;
}

/**
 * Liveblocks プレゼンス用トークン発行エンドポイント。
 * グローバル JwtAuthGuard 配下（@Public ではない）。秘密鍵はサーバ専用。
 */
@ApiTags('リアルタイム・プレゼンス')
@ApiBearerAuth()
@Controller('liveblocks')
export class LiveblocksController {
  constructor(private readonly useCase: IssueLiveblocksTokenUseCase) {}

  @Post('token')
  @ApiOperation({ summary: 'Liveblocks プレゼンストークン発行（要 project アクセス権）' })
  @ApiResponse({ status: 403, description: 'プロジェクトアクセス権が無い / API キー呼び出し' })
  async token(
    @CurrentUser() user: CurrentUserPayload & { apiKeyId?: string },
    @Body() dto: IssueLiveblocksTokenDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<unknown> {
    const { body, status } = await this.useCase.execute({
      userId: user.id,
      apiKeyId: user.apiKeyId,
      projectId: dto.projectId,
    });
    res.status(status);
    return JSON.parse(body); // Liveblocks の body は JSON 文字列
  }
}
