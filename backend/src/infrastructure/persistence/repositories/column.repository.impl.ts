import { Injectable } from '@nestjs/common';
import { IColumnRepository } from '../../../domain/repositories/column.repository';
import { Column, ColumnDataType } from '../../../domain/entities/column.entity';
import { PrismaService } from '../prisma/prisma.service';
import { ColumnDataType as PrismaColumnDataType } from '@prisma/client';

@Injectable()
export class PrismaColumnRepository implements IColumnRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Column | null> {
    const column = await this.prisma.column.findUnique({
      where: { id },
    });

    if (!column) return null;

    return this.toDomain(column);
  }

  async findByTableId(tableId: string): Promise<Column[]> {
    const columns = await this.prisma.column.findMany({
      where: { tableId },
      orderBy: { order: 'asc' },
    });

    return columns.map((c) => this.toDomain(c));
  }

  async findByTableIdAndName(tableId: string, name: string): Promise<Column | null> {
    const column = await this.prisma.column.findUnique({
      where: { tableId_name: { tableId, name } },
    });

    if (!column) return null;

    return this.toDomain(column);
  }

  async save(column: Column): Promise<Column> {
    const data = {
      tableId: column.tableId,
      name: column.name,
      displayName: column.displayName,
      dataType: column.dataType as PrismaColumnDataType,
      description: column.description,
      isPrimaryKey: column.isPrimaryKey,
      isForeignKey: column.isForeignKey,
      isNullable: column.isNullable,
      isUnique: column.isUnique,
      defaultValue: column.defaultValue,
      foreignKeyTable: column.foreignKeyTable,
      foreignKeyColumn: column.foreignKeyColumn,
      order: column.order,
    };

    const saved = await this.prisma.column.upsert({
      where: { id: column.id },
      update: data,
      create: { id: column.id, ...data },
    });

    return this.toDomain(saved);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.column.delete({ where: { id } });
  }

  private toDomain(record: {
    id: string;
    tableId: string;
    name: string;
    displayName: string | null;
    dataType: PrismaColumnDataType;
    description: string | null;
    isPrimaryKey: boolean;
    isForeignKey: boolean;
    isNullable: boolean;
    isUnique: boolean;
    defaultValue: string | null;
    foreignKeyTable: string | null;
    foreignKeyColumn: string | null;
    order: number;
    createdAt: Date;
    updatedAt: Date;
  }): Column {
    return new Column({
      id: record.id,
      tableId: record.tableId,
      name: record.name,
      displayName: record.displayName,
      dataType: record.dataType as ColumnDataType,
      description: record.description,
      isPrimaryKey: record.isPrimaryKey,
      isForeignKey: record.isForeignKey,
      isNullable: record.isNullable,
      isUnique: record.isUnique,
      defaultValue: record.defaultValue,
      foreignKeyTable: record.foreignKeyTable,
      foreignKeyColumn: record.foreignKeyColumn,
      order: record.order,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }
}

