import { Injectable } from '@nestjs/common';
import { ICrudMappingRepository } from '../../../domain/repositories/crud-mapping.repository';
import { CrudMapping, CrudOperation } from '../../../domain/entities/crud-mapping.entity';
import { PrismaService } from '../prisma/prisma.service';
import { CrudOperation as PrismaCrudOperation } from '@prisma/client';

@Injectable()
export class PrismaCrudMappingRepository implements ICrudMappingRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<CrudMapping | null> {
    const mapping = await this.prisma.crudMapping.findUnique({
      where: { id },
    });

    if (!mapping) return null;

    return this.toDomain(mapping);
  }

  async findByColumnId(columnId: string): Promise<CrudMapping[]> {
    const mappings = await this.prisma.crudMapping.findMany({
      where: { columnId },
      orderBy: { operation: 'asc' },
    });

    return mappings.map((m) => this.toDomain(m));
  }

  async findByFlowId(flowId: string): Promise<CrudMapping[]> {
    const mappings = await this.prisma.crudMapping.findMany({
      where: { flowId },
      orderBy: { operation: 'asc' },
    });

    return mappings.map((m) => this.toDomain(m));
  }

  async findByFlowNodeId(flowNodeId: string): Promise<CrudMapping[]> {
    const mappings = await this.prisma.crudMapping.findMany({
      where: { flowNodeId },
      orderBy: { operation: 'asc' },
    });

    return mappings.map((m) => this.toDomain(m));
  }

  async findByRoleId(roleId: string): Promise<CrudMapping[]> {
    const mappings = await this.prisma.crudMapping.findMany({
      where: { roleId },
      orderBy: { operation: 'asc' },
    });

    return mappings.map((m) => this.toDomain(m));
  }

  async findByColumnIdAndOperation(
    columnId: string,
    operation: CrudOperation,
  ): Promise<CrudMapping[]> {
    const mappings = await this.prisma.crudMapping.findMany({
      where: {
        columnId,
        operation: operation as PrismaCrudOperation,
      },
    });

    return mappings.map((m) => this.toDomain(m));
  }

  async save(mapping: CrudMapping): Promise<CrudMapping> {
    const data = {
      columnId: mapping.columnId,
      operation: mapping.operation as PrismaCrudOperation,
      roleId: mapping.roleId,
      flowId: mapping.flowId,
      flowNodeId: mapping.flowNodeId,
      how: mapping.how,
      condition: mapping.condition,
      description: mapping.description,
    };

    const saved = await this.prisma.crudMapping.upsert({
      where: { id: mapping.id },
      update: data,
      create: { id: mapping.id, ...data },
    });

    return this.toDomain(saved);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.crudMapping.delete({ where: { id } });
  }

  private toDomain(record: {
    id: string;
    columnId: string;
    operation: PrismaCrudOperation;
    roleId: string;
    flowId: string | null;
    flowNodeId: string | null;
    how: string | null;
    condition: string | null;
    description: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): CrudMapping {
    return new CrudMapping({
      id: record.id,
      columnId: record.columnId,
      operation: record.operation as CrudOperation,
      roleId: record.roleId,
      flowId: record.flowId,
      flowNodeId: record.flowNodeId,
      how: record.how,
      condition: record.condition,
      description: record.description,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }
}

