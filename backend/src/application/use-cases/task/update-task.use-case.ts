import { Inject, Injectable } from '@nestjs/common';
import {
  TaskStatus,
  TaskPriority,
  ITaskRepository,
  TASK_REPOSITORY,
  ProjectRepository,
  PROJECT_REPOSITORY,
  OrganizationRepository,
  ORGANIZATION_REPOSITORY,
  EntityNotFoundError,
  ForbiddenError,
  ValidationError,
} from '../../../domain';
import { TaskOutput, toTaskOutput } from './task.output';

export interface UpdateTaskInput {
  userId: string;
  taskId: string;
  parentId?: string | null;
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeName?: string | null;
  assigneeRoleId?: string | null;
  startDate?: Date | null;
  dueDate?: Date | null;
  progress?: number;
  estimatedHours?: number | null;
  actualHours?: number | null;
  milestone?: string | null;
  category?: string | null;
  order?: number;
}

/**
 * タスク更新ユースケース。
 * 親付け替え（reparent）・ステータス・進捗・期日・担当・並び順など
 * 任意のフィールドをまとめて更新できる。
 */
@Injectable()
export class UpdateTaskUseCase {
  constructor(
    @Inject(TASK_REPOSITORY)
    private readonly taskRepository: ITaskRepository,
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepository: OrganizationRepository,
  ) {}

  async execute(input: UpdateTaskInput): Promise<TaskOutput> {
    const task = await this.taskRepository.findById(input.taskId);
    if (!task) {
      throw new EntityNotFoundError('Task', input.taskId);
    }

    const project = await this.projectRepository.findById(task.projectId);
    if (!project) {
      throw new EntityNotFoundError('Project', task.projectId);
    }

    const isMember = await this.organizationRepository.isMember(
      project.organizationId,
      input.userId,
    );
    if (!isMember) {
      throw new ForbiddenError('You are not a member of this organization');
    }

    // 親付け替え（reparent）の検証
    if (input.parentId !== undefined && input.parentId !== null) {
      const parent = await this.taskRepository.findById(input.parentId);
      if (!parent || parent.projectId !== task.projectId) {
        throw new EntityNotFoundError('Task', input.parentId);
      }
      if (await this.wouldCreateCycle(task.id, input.parentId)) {
        throw new ValidationError(
          'Cannot move a task into its own descendant',
        );
      }
    }

    task.update({
      parentId: input.parentId,
      title: input.title,
      description: input.description,
      status: input.status,
      priority: input.priority,
      assigneeName: input.assigneeName,
      assigneeRoleId: input.assigneeRoleId,
      startDate: input.startDate,
      dueDate: input.dueDate,
      progress: input.progress,
      estimatedHours: input.estimatedHours,
      actualHours: input.actualHours,
      milestone: input.milestone,
      category: input.category,
      order: input.order,
    });

    await this.taskRepository.save(task);

    return toTaskOutput(task);
  }

  /** 新しい親が自身またはその子孫であるかを判定 */
  private async wouldCreateCycle(
    taskId: string,
    newParentId: string,
  ): Promise<boolean> {
    let current: string | null = newParentId;
    const visited = new Set<string>();
    while (current) {
      if (current === taskId) return true;
      if (visited.has(current)) break;
      visited.add(current);
      const node = await this.taskRepository.findById(current);
      current = node?.parentId ?? null;
    }
    return false;
  }
}
