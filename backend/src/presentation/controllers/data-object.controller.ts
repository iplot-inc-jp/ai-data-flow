import {
  Controller, Get, Post, Patch, Put, Delete, Body, Param, HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import {
  IsArray, IsIn, IsNumber, IsOptional, IsString, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  GetObjectGraphUseCase,
  CreateDataObjectUseCase,
  UpdateDataObjectUseCase,
  DeleteDataObjectUseCase,
  CreateObjectRelationUseCase,
  UpdateObjectRelationUseCase,
  DeleteObjectRelationUseCase,
  SaveObjectPositionsUseCase,
  ImportFromDfdUseCase,
  GetErGraphUseCase,
  LinkTableToObjectUseCase,
  SaveErPositionsUseCase,
} from '../../application';
import { RelationCardinalityValue } from '../../domain/entities/data-object-relation.entity';
import { CurrentUser, CurrentUserPayload } from '../decorators';

const CARDINALITIES = ['ONE_TO_ONE', 'ONE_TO_MANY', 'MANY_TO_MANY'];

class CreateDataObjectDto {
  @IsString() name!: string;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsString() color?: string | null;
  @IsOptional() @IsNumber() positionX?: number;
  @IsOptional() @IsNumber() positionY?: number;
  @IsOptional() @IsNumber() order?: number;
}

class UpdateDataObjectDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsString() color?: string | null;
  @IsOptional() @IsNumber() order?: number;
}

class CreateObjectRelationDto {
  @IsString() sourceObjectId!: string;
  @IsString() targetObjectId!: string;
  @IsOptional() @IsIn(CARDINALITIES) cardinality?: RelationCardinalityValue;
  @IsOptional() @IsString() label?: string | null;
  @IsOptional() @IsString() description?: string | null;
}

class UpdateObjectRelationDto {
  @IsOptional() @IsString() sourceObjectId?: string;
  @IsOptional() @IsString() targetObjectId?: string;
  @IsOptional() @IsIn(CARDINALITIES) cardinality?: RelationCardinalityValue;
  @IsOptional() @IsString() label?: string | null;
  @IsOptional() @IsString() description?: string | null;
}

class PositionItemDto {
  @IsString() id!: string;
  @IsNumber() positionX!: number;
  @IsNumber() positionY!: number;
}

class SavePositionsDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => PositionItemDto)
  positions!: PositionItemDto[];
}

class LinkTableDto {
  /** null で紐づけ解除 */
  @IsOptional() @IsString() dataObjectId?: string | null;
}

@ApiTags('データオブジェクト（オブジェクト関係性マップ・ER図）')
@ApiBearerAuth()
@Controller()
export class DataObjectController {
  constructor(
    private readonly getObjectGraph: GetObjectGraphUseCase,
    private readonly createObject: CreateDataObjectUseCase,
    private readonly updateObject: UpdateDataObjectUseCase,
    private readonly deleteObject: DeleteDataObjectUseCase,
    private readonly createRelation: CreateObjectRelationUseCase,
    private readonly updateRelation: UpdateObjectRelationUseCase,
    private readonly deleteRelation: DeleteObjectRelationUseCase,
    private readonly saveObjectPositions: SaveObjectPositionsUseCase,
    private readonly importFromDfd: ImportFromDfdUseCase,
    private readonly getErGraph: GetErGraphUseCase,
    private readonly linkTable: LinkTableToObjectUseCase,
    private readonly saveErPositions: SaveErPositionsUseCase,
  ) {}

  // ========== オブジェクト関係性マップ ==========

  @Get('projects/:projectId/data-objects')
  @ApiOperation({ summary: 'オブジェクト関係性マップ取得（objects＋relations）' })
  async getGraph(@CurrentUser() user: CurrentUserPayload, @Param('projectId') projectId: string) {
    return this.getObjectGraph.execute({ userId: user.id, projectId });
  }

  @Post('projects/:projectId/data-objects')
  @ApiOperation({ summary: 'データオブジェクト作成' })
  async create(
    @CurrentUser() user: CurrentUserPayload,
    @Param('projectId') projectId: string,
    @Body() dto: CreateDataObjectDto,
  ) {
    return this.createObject.execute({ userId: user.id, projectId, ...dto });
  }

  @Patch('data-objects/:id')
  @ApiOperation({ summary: 'データオブジェクト更新（name/description/color/order）' })
  async patch(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: UpdateDataObjectDto,
  ) {
    return this.updateObject.execute({ userId: user.id, id, ...dto });
  }

  @Delete('data-objects/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'データオブジェクト削除' })
  async remove(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    await this.deleteObject.execute({ userId: user.id, id });
  }

  // ========== 関係線 ==========

  @Post('projects/:projectId/data-object-relations')
  @ApiOperation({ summary: 'オブジェクト関係線作成（source=target は拒否）' })
  async createRel(
    @CurrentUser() user: CurrentUserPayload,
    @Param('projectId') projectId: string,
    @Body() dto: CreateObjectRelationDto,
  ) {
    return this.createRelation.execute({ userId: user.id, projectId, ...dto });
  }

  @Patch('data-object-relations/:id')
  @ApiOperation({ summary: 'オブジェクト関係線更新' })
  async patchRel(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: UpdateObjectRelationDto,
  ) {
    return this.updateRelation.execute({ userId: user.id, id, ...dto });
  }

  @Delete('data-object-relations/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'オブジェクト関係線削除' })
  async removeRel(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    await this.deleteRelation.execute({ userId: user.id, id });
  }

  // ========== 位置一括保存（マップ） ==========

  @Put('projects/:projectId/data-objects/positions')
  @HttpCode(204)
  @ApiOperation({ summary: 'オブジェクト位置一括保存' })
  async putPositions(
    @CurrentUser() user: CurrentUserPayload,
    @Param('projectId') projectId: string,
    @Body() dto: SavePositionsDto,
  ) {
    await this.saveObjectPositions.execute({ userId: user.id, projectId, positions: dto.positions });
  }

  // ========== DFD取り込み ==========

  @Post('projects/:projectId/data-objects/import-from-dfd')
  @ApiOperation({ summary: '第1レベルDFDのデータストアからオブジェクトを取り込み（冪等）' })
  async importDfd(@CurrentUser() user: CurrentUserPayload, @Param('projectId') projectId: string) {
    return this.importFromDfd.execute({ userId: user.id, projectId });
  }

  // ========== ER図 ==========

  @Get('projects/:projectId/er-graph')
  @ApiOperation({ summary: 'ER図グラフ取得（objects＋tables＋fkEdges＋relations）' })
  async getEr(@CurrentUser() user: CurrentUserPayload, @Param('projectId') projectId: string) {
    return this.getErGraph.execute({ userId: user.id, projectId });
  }

  @Put('projects/:projectId/er-positions')
  @HttpCode(204)
  @ApiOperation({ summary: 'ER図テーブル位置一括保存' })
  async putErPositions(
    @CurrentUser() user: CurrentUserPayload,
    @Param('projectId') projectId: string,
    @Body() dto: SavePositionsDto,
  ) {
    await this.saveErPositions.execute({ userId: user.id, projectId, positions: dto.positions });
  }

  @Put('tables/:tableId/data-object')
  @HttpCode(204)
  @ApiOperation({ summary: 'テーブルをオブジェクトに紐づけ/解除（dataObjectId=null で解除）' })
  async putTableObject(
    @CurrentUser() user: CurrentUserPayload,
    @Param('tableId') tableId: string,
    @Body() dto: LinkTableDto,
  ) {
    await this.linkTable.execute({ userId: user.id, tableId, dataObjectId: dto.dataObjectId ?? null });
  }
}
