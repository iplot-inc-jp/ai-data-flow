import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  ProjectPhase,
  PhaseKind,
  PhaseStatus,
  IProjectPhaseRepository,
} from '../../../domain';
import { PrismaService } from '../prisma/prisma.service';
import {
  PhaseKind as PrismaPhaseKind,
  PhaseStatus as PrismaPhaseStatus,
  Prisma,
} from '@prisma/client';

/**
 * プロジェクトフェーズリポジトリ実装
 */
@Injectable()
export class ProjectPhaseRepositoryImpl implements IProjectPhaseRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<ProjectPhase | null> {
    const data = await this.prisma.projectPhase.findUnique({
      where: { id },
    });

    if (!data) return null;

    return this.toDomain(data);
  }

  async findByProjectId(projectId: string): Promise<ProjectPhase[]> {
    const data = await this.prisma.projectPhase.findMany({
      where: { projectId },
      orderBy: { order: 'asc' },
    });

    return data.map((d) => this.toDomain(d));
  }

  async findByProjectIdAndKind(
    projectId: string,
    kind: PhaseKind,
  ): Promise<ProjectPhase | null> {
    const data = await this.prisma.projectPhase.findUnique({
      where: {
        projectId_kind: {
          projectId,
          kind: kind as PrismaPhaseKind,
        },
      },
    });

    if (!data) return null;

    return this.toDomain(data);
  }

  async save(phase: ProjectPhase): Promise<void> {
    await this.prisma.projectPhase.upsert({
      where: { id: phase.id },
      create: {
        id: phase.id,
        projectId: phase.projectId,
        kind: phase.kind as PrismaPhaseKind,
        order: phase.order,
        status: phase.status as PrismaPhaseStatus,
        summary: phase.summary,
        detail: phase.detail,
        metadata: phase.metadata as Prisma.InputJsonValue,
        createdAt: phase.createdAt,
        updatedAt: phase.updatedAt,
      },
      update: {
        kind: phase.kind as PrismaPhaseKind,
        order: phase.order,
        status: phase.status as PrismaPhaseStatus,
        summary: phase.summary,
        detail: phase.detail,
        metadata: phase.metadata as Prisma.InputJsonValue,
        updatedAt: phase.updatedAt,
      },
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.projectPhase.delete({
      where: { id },
    });
  }

  generateId(): string {
    return randomUUID();
  }

  private toDomain(record: {
    id: string;
    projectId: string;
    kind: PrismaPhaseKind;
    order: number;
    status: PrismaPhaseStatus;
    summary: string | null;
    detail: string | null;
    metadata: Prisma.JsonValue;
    createdAt: Date;
    updatedAt: Date;
  }): ProjectPhase {
    return ProjectPhase.reconstruct({
      id: record.id,
      projectId: record.projectId,
      kind: record.kind as PhaseKind,
      order: record.order,
      status: record.status as PhaseStatus,
      summary: record.summary,
      detail: record.detail,
      metadata: (record.metadata as Record<string, unknown>) || {},
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }
}
