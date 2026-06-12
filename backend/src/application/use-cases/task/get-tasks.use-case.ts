import { Inject, Injectable } from '@nestjs/common';
import {
  ITaskRepository,
  TASK_REPOSITORY,
  ProjectRepository,
  PROJECT_REPOSITORY,
  OrganizationRepository,
  ORGANIZATION_REPOSITORY,
  EntityNotFoundError,
  ForbiddenError,
} from '../../../domain';
import {
  TaskListOutput,
  toTaskOutput,
  toTaskDependencyOutput,
} from './task.output';

export interface GetTasksInput {
  userId: string;
  projectId: string;
  /** 指定すると、その紐付けノードのタスクのみに絞り込む */
  issueNodeId?: string;
}

/**
 * プロジェクトのタスク一覧取得ユースケース。
 * フラットな tasks[]（order -> createdAt 昇順）と
 * 依存関係 dependencies[]（{ predecessorId, successorId }）を返す。
 * フロントは parentId からツリーを組み、dependencies で矢印を描く。
 */
@Injectable()
export class GetTasksUseCase {
  constructor(
    @Inject(TASK_REPOSITORY)
    private readonly taskRepository: ITaskRepository,
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepository: OrganizationRepository,
  ) {}

  async execute(input: GetTasksInput): Promise<TaskListOutput> {
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

    const tasks = await this.taskRepository.findByProjectId(
      input.projectId,
      input.issueNodeId,
    );
    const dependencies =
      await this.taskRepository.findDependenciesByProjectId(input.projectId);

    return {
      tasks: tasks.map((t) => toTaskOutput(t)),
      dependencies: dependencies.map((d) => toTaskDependencyOutput(d)),
    };
  }
}
