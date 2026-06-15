import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { IsObject, IsOptional, IsIn } from 'class-validator';
import {
  ProjectBundleService,
  ImportMode,
  SectionImportPayload,
} from '../../infrastructure/services/project-bundle.service';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../decorators/current-user.decorator';
import { ProjectScopedAccess } from '../decorators/project-scoped-access.decorator';
import { ProjectAccessGuard } from '../guards/project-access.guard';
import { Public } from '../decorators/public.decorator';

// ========== DTO ==========

class ImportSectionDto {
  /** model 名 -> Row[]（export の rows と同形）。 */
  @IsObject()
  rows: Record<string, Array<Record<string, unknown>>>;

  @IsOptional()
  @IsIn(['replace', 'merge'])
  mode?: ImportMode;
}

/**
 * 機能(section)単位の export / import 露出。
 *
 * プロジェクト全体 export/import（ProjectBundleService.export/import）は引き続き
 * 全 section の合成。本コントローラは同じ SECTIONS 定義・内部機械を共有しつつ、
 * 1 機能だけを個別に出し入れできるようにする。
 *
 * 認可: @ProjectScopedAccess + ProjectAccessGuard（GET=view / POST=edit）。
 *
 * graph 系（flows/dfd/issues/cruoa/flowLinks）は #15 EntityJsonService の
 * self-contained bundle が担当（listSections の note 参照）。section 露出の対象は
 * gap/tasks/risks/stakeholders/kpi/masters/data-objects(object-map)/requirements/
 * tobe/analysis/adoption/charter 等の flatter な機能。
 */
@ApiTags('機能単位I/O')
@ApiBearerAuth()
@ProjectScopedAccess()
@UseGuards(ProjectAccessGuard)
@Controller('projects/:projectId/feature-sections')
export class FeatureIoController {
  constructor(private readonly bundleService: ProjectBundleService) {}

  @Get()
  @ApiOperation({
    summary:
      '利用可能な機能(section)一覧（models / dependsOnKeys / graph系の住み分け note）',
  })
  @ApiParam({ name: 'projectId', description: 'プロジェクトID' })
  @ApiResponse({ status: 200, description: 'section descriptor 配列' })
  @ApiResponse({ status: 403, description: '権限がありません' })
  listSections() {
    return this.bundleService.listSections();
  }

  @Get(':key/export')
  @ApiOperation({
    summary: '1機能(section)だけをエクスポート（{ formatVersion, section, rows }）',
  })
  @ApiParam({ name: 'projectId', description: 'プロジェクトID' })
  @ApiParam({ name: 'key', description: 'section キー' })
  @ApiResponse({ status: 200, description: 'section エクスポート JSON' })
  @ApiResponse({ status: 403, description: '権限がありません' })
  exportSection(
    @Param('projectId') projectId: string,
    @Param('key') key: string,
  ) {
    return this.bundleService.exportSection(projectId, key);
  }

  @Post(':key/import')
  @ApiOperation({
    summary:
      'このプロジェクトへ1機能(section)だけを取り込み（mode: replace=その section の対象モデルのみ置換 / merge=追加）',
  })
  @ApiParam({ name: 'projectId', description: '取り込み先プロジェクトID' })
  @ApiParam({ name: 'key', description: 'section キー' })
  @ApiResponse({ status: 201, description: '取り込んだモデルごとの件数サマリ' })
  @ApiResponse({ status: 403, description: '権限がありません' })
  importSection(
    @CurrentUser() user: CurrentUserPayload,
    @Param('projectId') projectId: string,
    @Param('key') key: string,
    @Body() dto: ImportSectionDto,
  ) {
    const mode: ImportMode = dto.mode ?? 'merge';
    const payload: SectionImportPayload = { rows: dto.rows };
    return this.bundleService.importSection(
      projectId,
      key,
      payload,
      mode,
      user.id,
    );
  }
}

/**
 * 機能単位ペイロードの機械可読 JSON Schema（draft-07）。AI が事前取得できるよう @Public。
 * GET /api/feature-sections/schema → 全 section の rows ペイロード Schema。
 */
@ApiTags('機能単位I/O')
@Controller('feature-sections')
export class FeatureIoSchemaController {
  constructor(private readonly bundleService: ProjectBundleService) {}

  @Get('schema')
  @Public()
  @ApiOperation({
    summary: '全機能(section)の rows ペイロード機械可読 JSON Schema（draft-07）',
  })
  @ApiResponse({ status: 200, description: 'JSON Schema' })
  getSchema(): Record<string, unknown> {
    return this.bundleService.allSchemas();
  }
}
