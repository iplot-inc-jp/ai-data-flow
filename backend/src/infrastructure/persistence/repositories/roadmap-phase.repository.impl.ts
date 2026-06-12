import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { RoadmapPhase } from '../../../domain/entities/roadmap-phase.entity';
import { IRoadmapPhaseRepository } from '../../../domain/repositories/roadmap-phase.repository';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RoadmapPhaseRepositoryImpl implements IRoadmapPhaseRepository {
  constructor(private readonly prisma: PrismaService) {}

  private toDomain(record: {
    id: string;
    projectId: string;
    name: string;
    legacyKey: string | null;
    order: number;
    createdAt: Date;
    updatedAt: Date;
  }): RoadmapPhase {
    return RoadmapPhase.reconstruct({
      id: record.id,
      projectId: record.projectId,
      name: record.name,
      legacyKey: record.legacyKey,
      order: record.order,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }

  async findById(id: string): Promise<RoadmapPhase | null> {
    const record = await this.prisma.roadmapPhase.findUnique({ where: { id } });
    if (!record) return null;
    return this.toDomain(record);
  }

  async findByProjectId(projectId: string): Promise<RoadmapPhase[]> {
    const records = await this.prisma.roadmapPhase.findMany({
      where: { projectId },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
    return records.map((r) => this.toDomain(r));
  }

  async create(roadmapPhase: RoadmapPhase): Promise<void> {
    await this.prisma.roadmapPhase.create({
      data: {
        id: roadmapPhase.id,
        projectId: roadmapPhase.projectId,
        name: roadmapPhase.name,
        legacyKey: roadmapPhase.legacyKey,
        order: roadmapPhase.order,
        createdAt: roadmapPhase.createdAt,
        updatedAt: roadmapPhase.updatedAt,
      },
    });
  }

  async update(roadmapPhase: RoadmapPhase): Promise<void> {
    await this.prisma.roadmapPhase.update({
      where: { id: roadmapPhase.id },
      data: {
        name: roadmapPhase.name,
        order: roadmapPhase.order,
        updatedAt: roadmapPhase.updatedAt,
      },
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.roadmapPhase.delete({ where: { id } });
  }

  generateId(): string {
    return randomUUID();
  }
}
