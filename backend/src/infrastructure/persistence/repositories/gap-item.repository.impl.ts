import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  GapItem,
  GapPriority,
  GapStatus,
  IGapItemRepository,
  FindGapItemsFilters,
} from '../../../domain';
import { PrismaService } from '../prisma/prisma.service';

/**
 * GapItem リポジトリ実装
 */
@Injectable()
export class GapItemRepositoryImpl implements IGapItemRepository {
  constructor(private readonly prisma: PrismaService) {}

  private toDomain(data: {
    id: string;
    projectId: string;
    phaseId: string | null;
    businessArea: string;
    asisDescription: string | null;
    tobeDescription: string | null;
    gapDescription: string | null;
    priority: string;
    status: string;
    ownerName: string | null;
    order: number;
    outOfScope: boolean;
    asisFlowId: string | null;
    asisNodeId: string | null;
    tobeFlowId: string | null;
    tobeNodeId: string | null;
    issueTreeId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): GapItem {
    return GapItem.reconstruct({
      id: data.id,
      projectId: data.projectId,
      phaseId: data.phaseId,
      businessArea: data.businessArea,
      asisDescription: data.asisDescription,
      tobeDescription: data.tobeDescription,
      gapDescription: data.gapDescription,
      priority: data.priority as GapPriority,
      status: data.status as GapStatus,
      ownerName: data.ownerName,
      order: data.order,
      outOfScope: data.outOfScope,
      asisFlowId: data.asisFlowId,
      asisNodeId: data.asisNodeId,
      tobeFlowId: data.tobeFlowId,
      tobeNodeId: data.tobeNodeId,
      issueTreeId: data.issueTreeId,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    });
  }

  async findById(id: string): Promise<GapItem | null> {
    const data = await this.prisma.gapItem.findUnique({
      where: { id },
    });

    if (!data) return null;

    return this.toDomain(data);
  }

  async findByProjectId(
    projectId: string,
    filters?: FindGapItemsFilters,
  ): Promise<GapItem[]> {
    const data = await this.prisma.gapItem.findMany({
      where: {
        projectId,
        ...(filters?.phaseId ? { phaseId: filters.phaseId } : {}),
        ...(filters?.priority ? { priority: filters.priority } : {}),
        ...(filters?.status ? { status: filters.status } : {}),
      },
      orderBy: { order: 'asc' },
    });

    return data.map((g) => this.toDomain(g));
  }

  async save(gapItem: GapItem): Promise<void> {
    await this.prisma.gapItem.upsert({
      where: { id: gapItem.id },
      create: {
        id: gapItem.id,
        projectId: gapItem.projectId,
        phaseId: gapItem.phaseId,
        businessArea: gapItem.businessArea,
        asisDescription: gapItem.asisDescription,
        tobeDescription: gapItem.tobeDescription,
        gapDescription: gapItem.gapDescription,
        priority: gapItem.priority,
        status: gapItem.status,
        ownerName: gapItem.ownerName,
        order: gapItem.order,
        outOfScope: gapItem.outOfScope,
        asisFlowId: gapItem.asisFlowId,
        asisNodeId: gapItem.asisNodeId,
        tobeFlowId: gapItem.tobeFlowId,
        tobeNodeId: gapItem.tobeNodeId,
        issueTreeId: gapItem.issueTreeId,
        createdAt: gapItem.createdAt,
        updatedAt: gapItem.updatedAt,
      },
      update: {
        phaseId: gapItem.phaseId,
        businessArea: gapItem.businessArea,
        asisDescription: gapItem.asisDescription,
        tobeDescription: gapItem.tobeDescription,
        gapDescription: gapItem.gapDescription,
        priority: gapItem.priority,
        status: gapItem.status,
        ownerName: gapItem.ownerName,
        order: gapItem.order,
        outOfScope: gapItem.outOfScope,
        asisFlowId: gapItem.asisFlowId,
        asisNodeId: gapItem.asisNodeId,
        tobeFlowId: gapItem.tobeFlowId,
        tobeNodeId: gapItem.tobeNodeId,
        issueTreeId: gapItem.issueTreeId,
        updatedAt: gapItem.updatedAt,
      },
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.gapItem.delete({
      where: { id },
    });
  }

  generateId(): string {
    return randomUUID();
  }
}
