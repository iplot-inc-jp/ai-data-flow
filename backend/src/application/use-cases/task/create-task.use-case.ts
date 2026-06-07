import { Inject, Injectable } from '@nestjs/common';
import {
  Task,
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
} from '../../../domain';
import { TaskOutput, toTaskOutput } from './task.output';

export interface CreateTaskInput {
  userId: string;
  projectId: string;
  parentId?: string | null;
  title: string;
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
 * タスク作成ユースケース
 */
@Injectable()
export class CreateTaskUseCase {
  constructor(
    @Inject(TASK_REPOSITORY)
    private readonly taskRepository: ITaskRepository,
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepository: OrganizationRepository,
  ) {}

  async execute(input: CreateTaskInput): Promise<TaskOutput> {
    const project = await this.projectRepository.findById(input.projectId);
    if (!project) {
      throw new EntityNotFoundError('Project', input.projectId);
    }

    const isMember = await this.organizationRepository.isMember(
      project.organizationId,
      input.userId,
    );
    if (!isMember) {
      throw new ForbiddenError('You are not a member of this organization');
    }

    // 親タスクが指定されている場合、同一プロジェクトに属することを確認
    if (input.parentId) {
      const parent = await this.taskRepository.findById(input.parentId);
      if (!parent || parent.projectId !== input.projectId) {
        throw new EntityNotFoundError('Task', input.parentId);
      }
    }

    const id = this.taskRepository.generateId();
    const task = Task.create(
      {
        projectId: input.projectId,
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
      },
      id,
    );

    await this.taskRepository.save(task);

    return toTaskOutput(task);
  }
}
