import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';
import { IsString, IsOptional, IsInt } from 'class-validator';
import {
  CreateStakeholderUseCase,
  GetStakeholdersUseCase,
  UpdateStakeholderUseCase,
  DeleteStakeholderUseCase,
  StakeholderOutput,
} from '../../application';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../decorators/current-user.decorator';

// ========== DTOs ==========

class CreateStakeholderDto {
  @ApiProperty({ description: 'ステークホルダー名', example: '営業部長' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: '所属' })
  @IsOptional()
  @IsString()
  affiliation?: string | null;

  @ApiPropertyOptional({ description: '役割' })
  @IsOptional()
  @IsString()
  role?: string | null;

  @ApiPropertyOptional({ description: '関心事' })
  @IsOptional()
  @IsString()
  interest?: string | null;

  @ApiPropertyOptional({ description: '懸念' })
  @IsOptional()
  @IsString()
  concern?: string | null;

  @ApiPropertyOptional({ description: '影響度' })
  @IsOptional()
  @IsString()
  influence?: string | null;

  @ApiPropertyOptional({ description: '支持度' })
  @IsOptional()
  @IsString()
  support?: string | null;

  @ApiPropertyOptional({ description: 'エンゲージメント方針' })
  @IsOptional()
  @IsString()
  engagement?: string | null;

  @ApiPropertyOptional({ description: '報告頻度' })
  @IsOptional()
  @IsString()
  reportFrequency?: string | null;

  @ApiPropertyOptional({ description: '連絡手段' })
  @IsOptional()
  @IsString()
  contactMethod?: string | null;

  @ApiPropertyOptional({ description: '担当（オーナー）' })
  @IsOptional()
  @IsString()
  owner?: string | null;

  @ApiPropertyOptional({ description: 'レポートライン' })
  @IsOptional()
  @IsString()
  reportLine?: string | null;

  @ApiPropertyOptional({ description: 'ASISヒアリング' })
  @IsOptional()
  @IsString()
  asisHearing?: string | null;

  @ApiPropertyOptional({ description: 'TOBE壁打ち' })
  @IsOptional()
  @IsString()
  tobeSparring?: string | null;

  @ApiPropertyOptional({ description: '備考' })
  @IsOptional()
  @IsString()
  note?: string | null;

  @ApiPropertyOptional({ description: '並び順' })
  @IsOptional()
  @IsInt()
  order?: number;
}

class UpdateStakeholderDto {
  @ApiPropertyOptional({ description: 'ステークホルダー名' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: '所属' })
  @IsOptional()
  @IsString()
  affiliation?: string | null;

  @ApiPropertyOptional({ description: '役割' })
  @IsOptional()
  @IsString()
  role?: string | null;

  @ApiPropertyOptional({ description: '関心事' })
  @IsOptional()
  @IsString()
  interest?: string | null;

  @ApiPropertyOptional({ description: '懸念' })
  @IsOptional()
  @IsString()
  concern?: string | null;

  @ApiPropertyOptional({ description: '影響度' })
  @IsOptional()
  @IsString()
  influence?: string | null;

  @ApiPropertyOptional({ description: '支持度' })
  @IsOptional()
  @IsString()
  support?: string | null;

  @ApiPropertyOptional({ description: 'エンゲージメント方針' })
  @IsOptional()
  @IsString()
  engagement?: string | null;

  @ApiPropertyOptional({ description: '報告頻度' })
  @IsOptional()
  @IsString()
  reportFrequency?: string | null;

  @ApiPropertyOptional({ description: '連絡手段' })
  @IsOptional()
  @IsString()
  contactMethod?: string | null;

  @ApiPropertyOptional({ description: '担当（オーナー）' })
  @IsOptional()
  @IsString()
  owner?: string | null;

  @ApiPropertyOptional({ description: 'レポートライン' })
  @IsOptional()
  @IsString()
  reportLine?: string | null;

  @ApiPropertyOptional({ description: 'ASISヒアリング' })
  @IsOptional()
  @IsString()
  asisHearing?: string | null;

  @ApiPropertyOptional({ description: 'TOBE壁打ち' })
  @IsOptional()
  @IsString()
  tobeSparring?: string | null;

  @ApiPropertyOptional({ description: '備考' })
  @IsOptional()
  @IsString()
  note?: string | null;

  @ApiPropertyOptional({ description: '並び順' })
  @IsOptional()
  @IsInt()
  order?: number;
}

@ApiTags('ステークホルダー')
@ApiBearerAuth()
@Controller('projects/:projectId/stakeholders')
export class StakeholderController {
  constructor(
    private readonly createStakeholderUseCase: CreateStakeholderUseCase,
    private readonly getStakeholdersUseCase: GetStakeholdersUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'ステークホルダー一覧取得（プロジェクト内）' })
  @ApiParam({ name: 'projectId', description: 'プロジェクトID' })
  @ApiResponse({ status: 403, description: '権限がありません' })
  @ApiResponse({ status: 404, description: 'プロジェクトが見つかりません' })
  async list(
    @CurrentUser() user: CurrentUserPayload,
    @Param('projectId') projectId: string,
  ): Promise<StakeholderOutput[]> {
    return this.getStakeholdersUseCase.execute({
      userId: user.id,
      projectId,
    });
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'ステークホルダー作成' })
  @ApiParam({ name: 'projectId', description: 'プロジェクトID' })
  @ApiResponse({ status: 201, description: '作成成功' })
  @ApiResponse({ status: 403, description: '権限がありません' })
  @ApiResponse({ status: 404, description: 'プロジェクトが見つかりません' })
  async create(
    @CurrentUser() user: CurrentUserPayload,
    @Param('projectId') projectId: string,
    @Body() dto: CreateStakeholderDto,
  ): Promise<StakeholderOutput> {
    return this.createStakeholderUseCase.execute({
      userId: user.id,
      projectId,
      name: dto.name,
      affiliation: dto.affiliation,
      role: dto.role,
      interest: dto.interest,
      concern: dto.concern,
      influence: dto.influence,
      support: dto.support,
      engagement: dto.engagement,
      reportFrequency: dto.reportFrequency,
      contactMethod: dto.contactMethod,
      owner: dto.owner,
      reportLine: dto.reportLine,
      asisHearing: dto.asisHearing,
      tobeSparring: dto.tobeSparring,
      note: dto.note,
      order: dto.order,
    });
  }
}

@ApiTags('ステークホルダー')
@ApiBearerAuth()
@Controller('stakeholders')
export class StakeholderByIdController {
  constructor(
    private readonly updateStakeholderUseCase: UpdateStakeholderUseCase,
    private readonly deleteStakeholderUseCase: DeleteStakeholderUseCase,
  ) {}

  @Patch(':id')
  @ApiOperation({ summary: 'ステークホルダー更新' })
  @ApiParam({ name: 'id', description: 'ステークホルダーID' })
  @ApiResponse({ status: 403, description: '権限がありません' })
  @ApiResponse({ status: 404, description: 'ステークホルダーが見つかりません' })
  async update(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: UpdateStakeholderDto,
  ): Promise<StakeholderOutput> {
    return this.updateStakeholderUseCase.execute({
      userId: user.id,
      id,
      name: dto.name,
      affiliation: dto.affiliation,
      role: dto.role,
      interest: dto.interest,
      concern: dto.concern,
      influence: dto.influence,
      support: dto.support,
      engagement: dto.engagement,
      reportFrequency: dto.reportFrequency,
      contactMethod: dto.contactMethod,
      owner: dto.owner,
      reportLine: dto.reportLine,
      asisHearing: dto.asisHearing,
      tobeSparring: dto.tobeSparring,
      note: dto.note,
      order: dto.order,
    });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'ステークホルダー削除' })
  @ApiParam({ name: 'id', description: 'ステークホルダーID' })
  @ApiResponse({ status: 403, description: '権限がありません' })
  @ApiResponse({ status: 404, description: 'ステークホルダーが見つかりません' })
  async delete(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ): Promise<{ success: boolean }> {
    await this.deleteStakeholderUseCase.execute({
      userId: user.id,
      id,
    });
    return { success: true };
  }
}
