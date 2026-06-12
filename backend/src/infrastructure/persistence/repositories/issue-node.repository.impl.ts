import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  IssueNode,
  IssueNodeKind,
  NodeVerification,
  NodeRecommendation,
  IIssueNodeRepository,
} from '../../../domain';
import { PrismaService } from '../prisma/prisma.service';
import {
  IssueNodeKind as PrismaIssueNodeKind,
  NodeVerification as PrismaNodeVerification,
  NodeRecommendation as PrismaNodeRecommendation,
  Prisma,
} from '@prisma/client';

/**
 * イシューノードリポジトリ実装
 */
@Injectable()
export class IssueNodeRepositoryImpl implements IIssueNodeRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<IssueNode | null> {
    const data = await this.prisma.issueNode.findUnique({
      where: { id },
    });

    if (!data) return null;

    return this.toDomain(data);
  }

  async findByTreeId(treeId: string): Promise<IssueNode[]> {
    const data = await this.prisma.issueNode.findMany({
      where: { treeId },
      orderBy: [{ depth: 'asc' }, { order: 'asc' }],
    });

    return data.map((n) => this.toDomain(n));
  }

  async save(node: IssueNode): Promise<void> {
    const data = {
      treeId: node.treeId,
      parentId: node.parentId,
      depth: node.depth,
      order: node.order,
      label: node.label,
      kind: node.kind as PrismaIssueNodeKind,
      verification: node.verification as PrismaNodeVerification,
      recommendation: node.recommendation as PrismaNodeRecommendation,
      evidence: node.evidence,
      rootCauseNodeId: node.rootCauseNodeId,
      metadata: node.metadata as Prisma.InputJsonValue,
    };

    await this.prisma.issueNode.upsert({
      where: { id: node.id },
      create: {
        id: node.id,
        createdAt: node.createdAt,
        updatedAt: node.updatedAt,
        ...data,
      },
      update: {
        ...data,
        updatedAt: node.updatedAt,
      },
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.issueNode.delete({
      where: { id },
    });
  }

  generateId(): string {
    return randomUUID();
  }

  private toDomain(record: {
    id: string;
    treeId: string;
    parentId: string | null;
    depth: number;
    order: number;
    label: string;
    kind: PrismaIssueNodeKind;
    verification: PrismaNodeVerification;
    recommendation: PrismaNodeRecommendation;
    evidence: string | null;
    rootCauseNodeId: string | null;
    metadata: Prisma.JsonValue;
    createdAt: Date;
    updatedAt: Date;
  }): IssueNode {
    return IssueNode.reconstruct({
      id: record.id,
      treeId: record.treeId,
      parentId: record.parentId,
      depth: record.depth,
      order: record.order,
      label: record.label,
      kind: record.kind as IssueNodeKind,
      verification: record.verification as NodeVerification,
      recommendation: record.recommendation as NodeRecommendation,
      evidence: record.evidence,
      rootCauseNodeId: record.rootCauseNodeId,
      metadata: (record.metadata as Record<string, unknown>) ?? {},
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }
}
