import { Controller, Get, Put, Body, Param } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
  ApiProperty,
} from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PrismaService } from '../../infrastructure/persistence/prisma/prisma.service';

class CruoaColDto {
  @ApiProperty()
  @IsString()
  id: string;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  label?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  roleId?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  order?: number;
}

class CruoaRowDto {
  @ApiProperty()
  @IsString()
  id: string;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  info?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  order?: number;
}

class CruoaCellDto {
  @ApiProperty()
  @IsString()
  rowId: string;

  @ApiProperty()
  @IsString()
  colId: string;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  value?: string | null;
}

class ReplaceCruoaDto {
  @ApiProperty({ type: [CruoaColDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CruoaColDto)
  cols: CruoaColDto[];

  @ApiProperty({ type: [CruoaRowDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CruoaRowDto)
  rows: CruoaRowDto[];

  @ApiProperty({ type: [CruoaCellDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CruoaCellDto)
  cells: CruoaCellDto[];
}

@ApiTags('CRUOA情報の地図')
@ApiBearerAuth()
@Controller('business-flows/:flowId/cruoa')
export class CruoaController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'CRUOA 情報の地図（列/行/セル）を取得' })
  @ApiParam({ name: 'flowId', description: '業務フローID' })
  async getCruoa(@Param('flowId') flowId: string) {
    const [cols, rows] = await Promise.all([
      this.prisma.cruoaCol.findMany({
        where: { flowId },
        orderBy: { order: 'asc' },
      }),
      this.prisma.cruoaRow.findMany({
        where: { flowId },
        orderBy: { order: 'asc' },
        include: { cells: true },
      }),
    ]);

    return {
      cols: cols.map((c) => ({
        id: c.id,
        label: c.label,
        roleId: c.roleId,
        order: c.order,
      })),
      rows: rows.map((r) => ({
        id: r.id,
        info: r.info,
        order: r.order,
      })),
      cells: rows.flatMap((r) =>
        r.cells.map((cell) => ({
          rowId: cell.rowId,
          colId: cell.colId,
          value: cell.value,
        })),
      ),
    };
  }

  @Put()
  @ApiOperation({
    summary: 'CRUOA 情報の地図を一括置換（全削除→再作成）',
  })
  @ApiParam({ name: 'flowId', description: '業務フローID' })
  async replaceCruoa(
    @Param('flowId') flowId: string,
    @Body() dto: ReplaceCruoaDto,
  ) {
    const cols = dto.cols ?? [];
    const rows = dto.rows ?? [];
    const cells = dto.cells ?? [];

    await this.prisma.$transaction(async (tx) => {
      // このフローに属する行に紐づくセルを先に削除
      const existingRows = await tx.cruoaRow.findMany({
        where: { flowId },
        select: { id: true },
      });
      const existingRowIds = existingRows.map((r) => r.id);
      if (existingRowIds.length > 0) {
        await tx.cruoaCell.deleteMany({
          where: { rowId: { in: existingRowIds } },
        });
      }
      await tx.cruoaRow.deleteMany({ where: { flowId } });
      await tx.cruoaCol.deleteMany({ where: { flowId } });

      if (cols.length > 0) {
        await tx.cruoaCol.createMany({
          data: cols.map((c, index) => ({
            id: c.id,
            flowId,
            label: c.label ?? null,
            roleId: c.roleId ?? null,
            order: c.order ?? index,
          })),
        });
      }
      if (rows.length > 0) {
        await tx.cruoaRow.createMany({
          data: rows.map((r, index) => ({
            id: r.id,
            flowId,
            info: r.info ?? null,
            order: r.order ?? index,
          })),
        });
      }
      if (cells.length > 0) {
        await tx.cruoaCell.createMany({
          data: cells.map((cell) => ({
            rowId: cell.rowId,
            colId: cell.colId,
            value: cell.value ?? null,
          })),
        });
      }
    });

    return this.getCruoa(flowId);
  }
}
