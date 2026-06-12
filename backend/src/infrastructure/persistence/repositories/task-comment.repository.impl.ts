import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { TaskComment } from '../../../domain/entities/task-comment.entity';
import { ITaskCommentRepository } from '../../../domain/repositories/task-comment.repository';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TaskCommentRepositoryImpl implements ITaskCommentRepository {
  constructor(private readonly prisma: PrismaService) {}

  private toDomain(record: {
    id: string;
    taskId: string;
    authorUserId: string | null;
    authorName: string | null;
    body: string;
    createdAt: Date;
    updatedAt: Date;
  }): TaskComment {
    return TaskComment.reconstruct({
      id: record.id,
      taskId: record.taskId,
      authorUserId: record.authorUserId,
      authorName: record.authorName,
      body: record.body,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }

  async findById(id: string): Promise<TaskComment | null> {
    const record = await this.prisma.taskComment.findUnique({ where: { id } });
    if (!record) return null;
    return this.toDomain(record);
  }

  async findByTaskId(taskId: string): Promise<TaskComment[]> {
    const records = await this.prisma.taskComment.findMany({
      where: { taskId },
      orderBy: { createdAt: 'asc' },
    });
    return records.map((r) => this.toDomain(r));
  }

  async save(comment: TaskComment): Promise<void> {
    const data = {
      taskId: comment.taskId,
      authorUserId: comment.authorUserId,
      authorName: comment.authorName,
      body: comment.body,
    };

    await this.prisma.taskComment.upsert({
      where: { id: comment.id },
      create: {
        id: comment.id,
        ...data,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
      },
      update: {
        ...data,
        updatedAt: comment.updatedAt,
      },
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.taskComment.delete({ where: { id } });
  }

  generateId(): string {
    return randomUUID();
  }
}
