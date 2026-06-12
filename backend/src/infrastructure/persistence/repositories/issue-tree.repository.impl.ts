import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  IssueTree,
  IssueTreeType,
  IssueTreePattern,
  IIssueTreeRepository,
} from '../../../domain';
import { PrismaService } from '../prisma/prisma.service';
import {
  IssueTreeType as PrismaIssueTreeType,
  IssueTreePattern as PrismaIssueTreePattern,
} from '@prisma/client';

/**
 * イシューツリーリポジトリ実装
 */
@Injectable()
export class IssueTreeRepositoryImpl implements IIssueTreeRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<IssueTree | null> {
    const data = await this.prisma.issueTree.findUnique({
      where: { id },
    });

    if (!data) return null;

    return IssueTree.reconstruct({
      id: data.id,
      projectId: data.projectId,
      type: data.type as IssueTreeType,
      pattern: data.pattern as IssueTreePattern,
      name: data.name,
      rootQuestion: data.rootQuestion,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    });
  }

  async findByProjectId(
    projectId: string,
    type?: IssueTreeType,
  ): Promise<IssueTree[]> {
    const data = await this.prisma.issueTree.findMany({
      where: {
        projectId,
        ...(type ? { type: type as PrismaIssueTreeType } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    return data.map((t) =>
      IssueTree.reconstruct({
        id: t.id,
        projectId: t.projectId,
        type: t.type as IssueTreeType,
        pattern: t.pattern as IssueTreePattern,
        name: t.name,
        rootQuestion: t.rootQuestion,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      }),
    );
  }

  async save(tree: IssueTree): Promise<void> {
    await this.prisma.issueTree.upsert({
      where: { id: tree.id },
      create: {
        id: tree.id,
        projectId: tree.projectId,
        type: tree.type as PrismaIssueTreeType,
        pattern: tree.pattern as PrismaIssueTreePattern,
        name: tree.name,
        rootQuestion: tree.rootQuestion,
        createdAt: tree.createdAt,
        updatedAt: tree.updatedAt,
      },
      update: {
        type: tree.type as PrismaIssueTreeType,
        pattern: tree.pattern as PrismaIssueTreePattern,
        name: tree.name,
        rootQuestion: tree.rootQuestion,
        updatedAt: tree.updatedAt,
      },
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.issueTree.delete({
      where: { id },
    });
  }

  generateId(): string {
    return randomUUID();
  }
}
