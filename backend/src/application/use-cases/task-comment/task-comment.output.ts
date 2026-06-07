import { TaskComment } from '../../../domain';

export interface TaskCommentOutput {
  id: string;
  taskId: string;
  authorUserId: string | null;
  authorName: string | null;
  body: string;
  createdAt: Date;
  updatedAt: Date;
}

export function toTaskCommentOutput(comment: TaskComment): TaskCommentOutput {
  return {
    id: comment.id,
    taskId: comment.taskId,
    authorUserId: comment.authorUserId,
    authorName: comment.authorName,
    body: comment.body,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
  };
}
