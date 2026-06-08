import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Stakeholder, IStakeholderRepository } from '../../../domain';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Stakeholder リポジトリ実装
 */
@Injectable()
export class StakeholderRepositoryImpl implements IStakeholderRepository {
  constructor(private readonly prisma: PrismaService) {}

  private toDomain(data: {
    id: string;
    projectId: string;
    name: string;
    affiliation: string | null;
    role: string | null;
    interest: string | null;
    concern: string | null;
    influence: string | null;
    support: string | null;
    engagement: string | null;
    reportFrequency: string | null;
    contactMethod: string | null;
    owner: string | null;
    reportLine: string | null;
    asisHearing: string | null;
    tobeSparring: string | null;
    note: string | null;
    order: number;
    createdAt: Date;
    updatedAt: Date;
  }): Stakeholder {
    return Stakeholder.reconstruct({
      id: data.id,
      projectId: data.projectId,
      name: data.name,
      affiliation: data.affiliation,
      role: data.role,
      interest: data.interest,
      concern: data.concern,
      influence: data.influence,
      support: data.support,
      engagement: data.engagement,
      reportFrequency: data.reportFrequency,
      contactMethod: data.contactMethod,
      owner: data.owner,
      reportLine: data.reportLine,
      asisHearing: data.asisHearing,
      tobeSparring: data.tobeSparring,
      note: data.note,
      order: data.order,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    });
  }

  async findById(id: string): Promise<Stakeholder | null> {
    const data = await this.prisma.stakeholder.findUnique({ where: { id } });
    if (!data) return null;
    return this.toDomain(data);
  }

  async findByProjectId(projectId: string): Promise<Stakeholder[]> {
    const data = await this.prisma.stakeholder.findMany({
      where: { projectId },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
    return data.map((s) => this.toDomain(s));
  }

  async save(stakeholder: Stakeholder): Promise<void> {
    const data = {
      projectId: stakeholder.projectId,
      name: stakeholder.name,
      affiliation: stakeholder.affiliation,
      role: stakeholder.role,
      interest: stakeholder.interest,
      concern: stakeholder.concern,
      influence: stakeholder.influence,
      support: stakeholder.support,
      engagement: stakeholder.engagement,
      reportFrequency: stakeholder.reportFrequency,
      contactMethod: stakeholder.contactMethod,
      owner: stakeholder.owner,
      reportLine: stakeholder.reportLine,
      asisHearing: stakeholder.asisHearing,
      tobeSparring: stakeholder.tobeSparring,
      note: stakeholder.note,
      order: stakeholder.order,
    };

    await this.prisma.stakeholder.upsert({
      where: { id: stakeholder.id },
      create: {
        id: stakeholder.id,
        ...data,
        createdAt: stakeholder.createdAt,
        updatedAt: stakeholder.updatedAt,
      },
      update: {
        ...data,
        updatedAt: stakeholder.updatedAt,
      },
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.stakeholder.delete({ where: { id } });
  }

  generateId(): string {
    return randomUUID();
  }
}
