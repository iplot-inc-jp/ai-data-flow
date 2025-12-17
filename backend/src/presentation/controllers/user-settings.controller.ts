import {
  Controller,
  Get,
  Put,
  Body,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsOptional, IsObject } from 'class-validator';
import { PrismaService } from '../../infrastructure/persistence/prisma/prisma.service';
import { CurrentUser, CurrentUserPayload } from '../decorators';
import { v4 as uuid } from 'uuid';

class UpdateApiKeysDto {
  @IsOptional()
  @IsString()
  anthropicApiKey?: string;

  @IsOptional()
  @IsString()
  openaiApiKey?: string;
}

class UpdateSettingsDto {
  @IsOptional()
  @IsObject()
  settings?: Record<string, any>;
}

@ApiTags('User Settings')
@ApiBearerAuth()
@Controller('user-settings')
export class UserSettingsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'ユーザー設定を取得' })
  async getSettings(@CurrentUser() user: CurrentUserPayload) {
    let settings = await this.prisma.userSetting.findUnique({
      where: { userId: user.id },
    });

    // 設定がない場合は作成
    if (!settings) {
      settings = await this.prisma.userSetting.create({
        data: {
          id: uuid(),
          userId: user.id,
          settings: {},
        },
      });
    }

    return {
      id: settings.id,
      userId: settings.userId,
      // APIキーは存在するかどうかだけ返す（セキュリティのため）
      hasAnthropicApiKey: !!settings.anthropicApiKey,
      hasOpenaiApiKey: !!settings.openaiApiKey,
      settings: settings.settings,
      createdAt: settings.createdAt,
      updatedAt: settings.updatedAt,
    };
  }

  @Put('api-keys')
  @ApiOperation({ summary: 'APIキーを更新' })
  async updateApiKeys(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdateApiKeysDto,
  ) {
    // 設定を取得または作成
    let settings = await this.prisma.userSetting.findUnique({
      where: { userId: user.id },
    });

    const data: any = {};
    
    // 空文字の場合はnullに、それ以外は値をセット
    if (dto.anthropicApiKey !== undefined) {
      data.anthropicApiKey = dto.anthropicApiKey || null;
    }
    if (dto.openaiApiKey !== undefined) {
      data.openaiApiKey = dto.openaiApiKey || null;
    }

    if (!settings) {
      settings = await this.prisma.userSetting.create({
        data: {
          id: uuid(),
          userId: user.id,
          ...data,
          settings: {},
        },
      });
    } else {
      settings = await this.prisma.userSetting.update({
        where: { userId: user.id },
        data,
      });
    }

    return {
      success: true,
      hasAnthropicApiKey: !!settings.anthropicApiKey,
      hasOpenaiApiKey: !!settings.openaiApiKey,
    };
  }

  @Put('preferences')
  @ApiOperation({ summary: 'その他の設定を更新' })
  async updatePreferences(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdateSettingsDto,
  ) {
    let settings = await this.prisma.userSetting.findUnique({
      where: { userId: user.id },
    });

    if (!settings) {
      settings = await this.prisma.userSetting.create({
        data: {
          id: uuid(),
          userId: user.id,
          settings: dto.settings || {},
        },
      });
    } else {
      settings = await this.prisma.userSetting.update({
        where: { userId: user.id },
        data: {
          settings: {
            ...(settings.settings as object),
            ...dto.settings,
          },
        },
      });
    }

    return {
      id: settings.id,
      settings: settings.settings,
    };
  }

  @Get('api-key/test')
  @ApiOperation({ summary: 'APIキーの有効性をテスト' })
  async testApiKey(@CurrentUser() user: CurrentUserPayload) {
    const settings = await this.prisma.userSetting.findUnique({
      where: { userId: user.id },
    });

    const results: Record<string, boolean | string> = {};

    // Anthropic APIキーのテスト
    if (settings?.anthropicApiKey) {
      try {
        const Anthropic = require('@anthropic-ai/sdk');
        const client = new Anthropic({ apiKey: settings.anthropicApiKey });
        
        // 小さなリクエストでテスト
        await client.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Hi' }],
        });
        
        results.anthropic = true;
      } catch (err: any) {
        results.anthropic = err.message || 'Invalid API key';
      }
    } else {
      results.anthropic = 'Not configured';
    }

    return results;
  }
}

