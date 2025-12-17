import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Inject,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import {
  TABLE_REPOSITORY,
  ITableRepository,
  COLUMN_REPOSITORY,
  IColumnRepository,
  CRUD_MAPPING_REPOSITORY,
  ICrudMappingRepository,
  Table,
  Column,
} from '../../domain';
import { v4 as uuid } from 'uuid';

// DTOs
class CreateTableDto {
  projectId: string;
  name: string;
  displayName?: string;
  description?: string;
  tags?: string[];
}

class UpdateTableDto {
  name?: string;
  displayName?: string;
  description?: string;
  tags?: string[];
}

class CreateColumnDto {
  name: string;
  displayName?: string;
  dataType?: string;
  description?: string;
  isPrimaryKey?: boolean;
  isForeignKey?: boolean;
  isNullable?: boolean;
  isUnique?: boolean;
  defaultValue?: string;
  foreignKeyTable?: string;
  foreignKeyColumn?: string;
  order?: number;
}

class CreateCrudMappingDto {
  columnId: string;
  operation: 'CREATE' | 'READ' | 'UPDATE' | 'DELETE';
  roleId: string;
  flowId?: string;
  flowNodeId?: string;
  how?: string;
  condition?: string;
  description?: string;
}

@ApiTags('Tables')
@ApiBearerAuth()
@Controller('tables')
export class TableController {
  constructor(
    @Inject(TABLE_REPOSITORY)
    private readonly tableRepository: ITableRepository,
    @Inject(COLUMN_REPOSITORY)
    private readonly columnRepository: IColumnRepository,
    @Inject(CRUD_MAPPING_REPOSITORY)
    private readonly crudMappingRepository: ICrudMappingRepository,
  ) {}

  @Get('project/:projectId')
  @ApiOperation({ summary: 'プロジェクトのテーブル一覧を取得' })
  async getByProjectId(@Param('projectId') projectId: string) {
    const tables = await this.tableRepository.findByProjectId(projectId);
    return tables.map((t) => this.toResponse(t));
  }

  @Get(':id')
  @ApiOperation({ summary: 'テーブル詳細を取得' })
  async getById(@Param('id') id: string) {
    const table = await this.tableRepository.findById(id);
    if (!table) {
      return { error: 'Table not found' };
    }
    const columns = await this.columnRepository.findByTableId(id);
    return {
      ...this.toResponse(table),
      columns: columns.map((c) => this.columnToResponse(c)),
    };
  }

  @Post()
  @ApiOperation({ summary: 'テーブルを作成' })
  async create(@Body() dto: CreateTableDto) {
    const table = Table.create({
      id: uuid(),
      projectId: dto.projectId,
      name: dto.name,
      displayName: dto.displayName,
      description: dto.description,
      tags: dto.tags,
    });
    const saved = await this.tableRepository.save(table);
    return this.toResponse(saved);
  }

  @Put(':id')
  @ApiOperation({ summary: 'テーブルを更新' })
  async update(@Param('id') id: string, @Body() dto: UpdateTableDto) {
    const table = await this.tableRepository.findById(id);
    if (!table) {
      return { error: 'Table not found' };
    }
    if (dto.name) table.updateName(dto.name);
    if (dto.displayName !== undefined) table.updateDisplayName(dto.displayName);
    if (dto.description !== undefined) table.updateDescription(dto.description);
    if (dto.tags) {
      // Clear and reset tags
      table.tags.forEach((t) => table.removeTag(t));
      dto.tags.forEach((t) => table.addTag(t));
    }
    const saved = await this.tableRepository.save(table);
    return this.toResponse(saved);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'テーブルを削除' })
  async delete(@Param('id') id: string) {
    await this.tableRepository.delete(id);
    return { success: true };
  }

  // ========== Column Endpoints ==========

  @Get(':tableId/columns')
  @ApiOperation({ summary: 'カラム一覧を取得' })
  async getColumns(@Param('tableId') tableId: string) {
    const columns = await this.columnRepository.findByTableId(tableId);
    return columns.map((c) => this.columnToResponse(c));
  }

  @Post(':tableId/columns')
  @ApiOperation({ summary: 'カラムを作成' })
  async createColumn(
    @Param('tableId') tableId: string,
    @Body() dto: CreateColumnDto,
  ) {
    const column = Column.create({
      id: uuid(),
      tableId,
      name: dto.name,
      displayName: dto.displayName,
      dataType: (dto.dataType as any) || 'STRING',
      description: dto.description,
      isPrimaryKey: dto.isPrimaryKey,
      isForeignKey: dto.isForeignKey,
      isNullable: dto.isNullable,
      isUnique: dto.isUnique,
      defaultValue: dto.defaultValue,
      foreignKeyTable: dto.foreignKeyTable,
      foreignKeyColumn: dto.foreignKeyColumn,
      order: dto.order,
    });
    const saved = await this.columnRepository.save(column);
    return this.columnToResponse(saved);
  }

  @Delete(':tableId/columns/:columnId')
  @ApiOperation({ summary: 'カラムを削除' })
  async deleteColumn(@Param('columnId') columnId: string) {
    await this.columnRepository.delete(columnId);
    return { success: true };
  }

  // ========== CRUD Mapping Endpoints ==========

  @Get(':tableId/columns/:columnId/crud-mappings')
  @ApiOperation({ summary: 'カラムのCRUDマッピング一覧を取得' })
  async getCrudMappings(@Param('columnId') columnId: string) {
    const mappings = await this.crudMappingRepository.findByColumnId(columnId);
    return mappings.map((m) => ({
      id: m.id,
      columnId: m.columnId,
      operation: m.operation,
      roleId: m.roleId,
      flowId: m.flowId,
      flowNodeId: m.flowNodeId,
      how: m.how,
      condition: m.condition,
      description: m.description,
    }));
  }

  @Post('crud-mappings')
  @ApiOperation({ summary: 'CRUDマッピングを作成' })
  async createCrudMapping(@Body() dto: CreateCrudMappingDto) {
    const { CrudMapping } = await import('../../domain/entities/crud-mapping.entity');
    const mapping = CrudMapping.create({
      id: uuid(),
      columnId: dto.columnId,
      operation: dto.operation,
      roleId: dto.roleId,
      flowId: dto.flowId,
      flowNodeId: dto.flowNodeId,
      how: dto.how,
      condition: dto.condition,
      description: dto.description,
    });
    const saved = await this.crudMappingRepository.save(mapping);
    return {
      id: saved.id,
      columnId: saved.columnId,
      operation: saved.operation,
      roleId: saved.roleId,
      flowId: saved.flowId,
      flowNodeId: saved.flowNodeId,
      how: saved.how,
      condition: saved.condition,
      description: saved.description,
    };
  }

  @Delete('crud-mappings/:id')
  @ApiOperation({ summary: 'CRUDマッピングを削除' })
  async deleteCrudMapping(@Param('id') id: string) {
    await this.crudMappingRepository.delete(id);
    return { success: true };
  }

  private toResponse(table: Table) {
    return {
      id: table.id,
      projectId: table.projectId,
      name: table.name,
      displayName: table.displayName,
      description: table.description,
      tags: table.tags,
      createdAt: table.createdAt,
      updatedAt: table.updatedAt,
    };
  }

  private columnToResponse(column: Column) {
    return {
      id: column.id,
      tableId: column.tableId,
      name: column.name,
      displayName: column.displayName,
      dataType: column.dataType,
      description: column.description,
      isPrimaryKey: column.isPrimaryKey,
      isForeignKey: column.isForeignKey,
      isNullable: column.isNullable,
      isUnique: column.isUnique,
      defaultValue: column.defaultValue,
      foreignKeyTable: column.foreignKeyTable,
      foreignKeyColumn: column.foreignKeyColumn,
      order: column.order,
      createdAt: column.createdAt,
      updatedAt: column.updatedAt,
    };
  }
}

