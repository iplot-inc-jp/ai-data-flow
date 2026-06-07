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
} from '@nestjs/swagger';
import { IsString, IsOptional, IsInt } from 'class-validator';
import {
  CreateReportTypeUseCase,
  GetReportTypesUseCase,
  UpdateReportTypeUseCase,
  DeleteReportTypeUseCase,
  ReportTypeOutput,
} from '../../application';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../decorators/current-user.decorator';

// ========== DTOs ==========

class CreateReportTypeDto {
  @ApiProperty({ description: '帳票種別名', example: '受注書' })
  @IsString()
  name: string;

  @ApiProperty({ description: '説明', required: false, nullable: true })
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiProperty({ description: '並び順', required: false })
  @IsOptional()
  @IsInt()
  order?: number;
}

class UpdateReportTypeDto {
  @ApiProperty({ description: '帳票種別名', required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ description: '説明', required: false, nullable: true })
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiProperty({ description: '並び順', required: false })
  @IsOptional()
  @IsInt()
  order?: number;
}

@ApiTags('帳票種別')
@ApiBearerAuth()
@Controller('projects/:projectId/report-types')
export class ReportTypeController {
  constructor(
    private readonly createReportTypeUseCase: CreateReportTypeUseCase,
    private readonly getReportTypesUseCase: GetReportTypesUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'プロジェクトの帳票種別一覧取得（添付件数付き）' })
  @ApiParam({ name: 'projectId', description: 'プロジェクトID' })
  @ApiResponse({ status: 403, description: '権限がありません' })
  @ApiResponse({ status: 404, description: 'プロジェクトが見つかりません' })
  async list(
    @CurrentUser() user: CurrentUserPayload,
    @Param('projectId') projectId: string,
  ): Promise<ReportTypeOutput[]> {
    return this.getReportTypesUseCase.execute({
      userId: user.id,
      projectId,
    });
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '帳票種別作成' })
  @ApiParam({ name: 'projectId', description: 'プロジェクトID' })
  @ApiResponse({ status: 201, description: '作成成功' })
  @ApiResponse({ status: 403, description: '権限がありません' })
  @ApiResponse({ status: 404, description: 'プロジェクトが見つかりません' })
  async create(
    @CurrentUser() user: CurrentUserPayload,
    @Param('projectId') projectId: string,
    @Body() dto: CreateReportTypeDto,
  ): Promise<ReportTypeOutput> {
    return this.createReportTypeUseCase.execute({
      userId: user.id,
      projectId,
      name: dto.name,
      description: dto.description,
      order: dto.order,
    });
  }
}

@ApiTags('帳票種別')
@ApiBearerAuth()
@Controller('report-types')
export class ReportTypeByIdController {
  constructor(
    private readonly updateReportTypeUseCase: UpdateReportTypeUseCase,
    private readonly deleteReportTypeUseCase: DeleteReportTypeUseCase,
  ) {}

  @Patch(':id')
  @ApiOperation({ summary: '帳票種別更新' })
  @ApiParam({ name: 'id', description: '帳票種別ID' })
  @ApiResponse({ status: 403, description: '権限がありません' })
  @ApiResponse({ status: 404, description: '帳票種別が見つかりません' })
  async update(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: UpdateReportTypeDto,
  ): Promise<ReportTypeOutput> {
    return this.updateReportTypeUseCase.execute({
      userId: user.id,
      reportTypeId: id,
      name: dto.name,
      description: dto.description,
      order: dto.order,
    });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '帳票種別削除（具体帳票はカスケード削除）' })
  @ApiParam({ name: 'id', description: '帳票種別ID' })
  @ApiResponse({ status: 403, description: '権限がありません' })
  @ApiResponse({ status: 404, description: '帳票種別が見つかりません' })
  async delete(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ): Promise<{ success: boolean }> {
    await this.deleteReportTypeUseCase.execute({
      userId: user.id,
      reportTypeId: id,
    });
    return { success: true };
  }
}
