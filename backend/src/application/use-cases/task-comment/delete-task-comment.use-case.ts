import { Inject, Injectable } from '@nestjs/common';
import {
  ITaskCommentRepository,
  TASK_COMMENT_REPOSITORY,
  ITaskRepository,
  TASK_REPOSITORY,
  ProjectRepository,
  PROJECT_REPOSITORY,
  OrganizationRepository,
  ORGANIZATION_REPOSITORY,
  EntityNotFoundError,
  ForbiddenError,
} from '../../../domain';

export interface DeleteTaskCommentInput {
  userId: string;
  commentId: string;
}

/**
 * タスクコメント削除ユースケース。
 * 作者本人、または組織メンバー（super-admin バイパス含む）が削除できる。
 */
@Injectable()
export class DeleteTaskCommentUseCase {
  constructor(
    @Inject(TASK_COMMENT_REPOSITORY)
    private readonly taskCommentRepository: ITaskCommentRepository,
    @Inject(TASK_REPOSITORY)
    private readonly taskRepository: ITaskRepository,
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepository: OrganizationRepository,
  ) {}

  async execute(input: DeleteTaskCommentInput): Promise<void> {
    const comment = await this.taskCommentRepository.findById(input.commentId);
    if (!comment) {
      throw new EntityNotFoundError('TaskComment', input.commentId);
    }

    const task = await this.taskRepository.findById(comment.taskId);
    if (!task) {
      throw new EntityNotFoundError('Task', comment.taskId);
    }

    const project = await this.projectRepository.findById(task.projectId);
    if (!project) {
      throw new EntityNotFoundError('Project', task.projectId);
    }

    // 作者本人なら無条件で許可、そうでなければ組織メンバーであることを要求
    if (!comment.isAuthor(input.userId)) {
      const isMember = await this.organizationRepository.isMember(
        project.organizationId,
        input.userId,
      );
      if (!isMember) {
        throw new ForbiddenError('You are not allowed to delete this comment');
      }
    }

    await this.taskCommentRepository.delete(input.commentId);
  }
}
