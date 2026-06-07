import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ReportType } from '../../../domain/entities/report-type.entity';
import { IReportTypeRepository } from '../../../domain/repositories/report-type.repository';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReportTypeRepositoryImpl implements IReportTypeRepository {
  constructor(private readonly prisma: PrismaService) {}

  private toDomain(record: {
    id: string;
    projectId: string;
    name: string;
    description: string | null;
    order: number;
    createdAt: Date;
    updatedAt: Date;
  }): ReportType {
    return ReportType.reconstruct({
      id: record.id,
      projectId: record.projectId,
      name: record.name,
      description: record.description,
      order: record.order,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }

  async findById(id: string): Promise<ReportType | null> {
    const record = await this.prisma.reportType.findUnique({ where: { id } });
    if (!record) return null;
    return this.toDomain(record);
  }

  async findByProjectId(projectId: string): Promise<ReportType[]> {
    const records = await this.prisma.reportType.findMany({
      where: { projectId },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
    return records.map((r) => this.toDomain(r));
  }

  async countAttachmentsByProjectId(
    projectId: string,
  ): Promise<Map<string, number>> {
    const grouped = await this.prisma.attachment.groupBy({
      by: ['reportTypeId'],
      where: { reportType: { projectId } },
      _count: { _all: true },
    });
    const map = new Map<string, number>();
    for (const g of grouped) {
      if (g.reportTypeId) map.set(g.reportTypeId, g._count._all);
    }
    return map;
  }

  async save(reportType: ReportType): Promise<void> {
    const data = {
      projectId: reportType.projectId,
      name: reportType.name,
      description: reportType.description,
      order: reportType.order,
    };

    await this.prisma.reportType.upsert({
      where: { id: reportType.id },
      create: {
        id: reportType.id,
        ...data,
        createdAt: reportType.createdAt,
        updatedAt: reportType.updatedAt,
      },
      update: {
        ...data,
        updatedAt: reportType.updatedAt,
      },
    });
  }

  async delete(id: string): Promise<void> {
    // DfdFlow.reportTypeId は onDelete: SetNull、Attachment.reportTypeId は onDelete: Cascade
    await this.prisma.reportType.delete({ where: { id } });
  }

  generateId(): string {
    return randomUUID();
  }
}
