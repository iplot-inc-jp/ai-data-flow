import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AsisMemo, IAsisMemoRepository } from '../../../domain';
import { PrismaService } from '../prisma/prisma.service';

/**
 * AsisMemo リポジトリ実装
 */
@Injectable()
export class AsisMemoRepositoryImpl implements IAsisMemoRepository {
  constructor(private readonly prisma: PrismaService) {}

  private toDomain(data: {
    id: string;
    projectId: string;
    topic: string | null;
    currentState: string | null;
    pain: string | null;
    restriction: string | null;
    note: string | null;
    order: number;
    createdAt: Date;
    updatedAt: Date;
  }): AsisMemo {
    return AsisMemo.reconstruct({
      id: data.id,
      projectId: data.projectId,
      topic: data.topic,
      currentState: data.currentState,
      pain: data.pain,
      restriction: data.restriction,
      note: data.note,
      order: data.order,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    });
  }

  async findById(id: string): Promise<AsisMemo | null> {
    const data = await this.prisma.asisMemo.findUnique({ where: { id } });
    if (!data) return null;
    return this.toDomain(data);
  }

  async findByProjectId(projectId: string): Promise<AsisMemo[]> {
    const data = await this.prisma.asisMemo.findMany({
      where: { projectId },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
    return data.map((r) => this.toDomain(r));
  }

  async save(asisMemo: AsisMemo): Promise<void> {
    const data = {
      projectId: asisMemo.projectId,
      topic: asisMemo.topic,
      currentState: asisMemo.currentState,
      pain: asisMemo.pain,
      restriction: asisMemo.restriction,
      note: asisMemo.note,
      order: asisMemo.order,
    };

    await this.prisma.asisMemo.upsert({
      where: { id: asisMemo.id },
      create: {
        id: asisMemo.id,
        ...data,
        createdAt: asisMemo.createdAt,
        updatedAt: asisMemo.updatedAt,
      },
      update: {
        ...data,
        updatedAt: asisMemo.updatedAt,
      },
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.asisMemo.delete({ where: { id } });
  }

  generateId(): string {
    return randomUUID();
  }
}
