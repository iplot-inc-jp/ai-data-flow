import { TaskComment } from '../entities/task-comment.entity';

export const TASK_COMMENT_REPOSITORY = Symbol('TASK_COMMENT_REPOSITORY');

export interface ITaskCommentRepository {
  findById(id: string): Promise<TaskComment | null>;
  /** タスクのコメントを古い順（createdAt 昇順）で返す */
  findByTaskId(taskId: string): Promise<TaskComment[]>;
  save(comment: TaskComment): Promise<void>;
  delete(id: string): Promise<void>;
  generateId(): string;
}
