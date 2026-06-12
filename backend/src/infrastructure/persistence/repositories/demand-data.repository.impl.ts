import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DemandData, IDemandDataRepository } from '../../../domain';
import { PrismaService } from '../prisma/prisma.service';

/**
 * DemandData リポジトリ実装
 */
@Injectable()
export class DemandDataRepositoryImpl implements IDemandDataRepository {
  constructor(private readonly prisma: PrismaService) {}

  private toDomain(data: {
    id: string;
    projectId: string;
    productName: string | null;
    period: string | null;
    quantity: number | null;
    note: string | null;
    order: number;
    createdAt: Date;
    updatedAt: Date;
  }): DemandData {
    return DemandData.reconstruct({
      id: data.id,
      projectId: data.projectId,
      productName: data.productName,
      period: data.period,
      quantity: data.quantity,
      note: data.note,
      order: data.order,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    });
  }

  async findById(id: string): Promise<DemandData | null> {
    const data = await this.prisma.demandData.findUnique({ where: { id } });
    if (!data) return null;
    return this.toDomain(data);
  }

  async findByProjectId(projectId: string): Promise<DemandData[]> {
    const data = await this.prisma.demandData.findMany({
      where: { projectId },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
    return data.map((d) => this.toDomain(d));
  }

  async save(demandData: DemandData): Promise<void> {
    const data = {
      projectId: demandData.projectId,
      productName: demandData.productName,
      period: demandData.period,
      quantity: demandData.quantity,
      note: demandData.note,
      order: demandData.order,
    };

    await this.prisma.demandData.upsert({
      where: { id: demandData.id },
      create: {
        id: demandData.id,
        ...data,
        createdAt: demandData.createdAt,
        updatedAt: demandData.updatedAt,
      },
      update: {
        ...data,
        updatedAt: demandData.updatedAt,
      },
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.demandData.delete({ where: { id } });
  }

  generateId(): string {
    return randomUUID();
  }
}
