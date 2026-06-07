import { Task } from '../entities/task.entity';

export const TASK_REPOSITORY = Symbol('TASK_REPOSITORY');

/**
 * タスク依存関係（先行 -> 後続）。
 * predecessor が終わってから successor を始める、という関係を表す。
 */
export interface TaskDependencyRecord {
  id: string;
  predecessorId: string;
  successorId: string;
}

export interface ITaskRepository {
  findById(id: string): Promise<Task | null>;
  /** プロジェクトのタスクをフラットに返す（order -> createdAt 昇順） */
  findByProjectId(projectId: string): Promise<Task[]>;
  /** 直下の子タスク（親付け替えや削除前チェック用） */
  findChildrenByParentId(parentId: string): Promise<Task[]>;
  save(task: Task): Promise<void>;
  /** 子タスクはスキーマの onDelete: Cascade で連鎖削除される */
  delete(id: string): Promise<void>;
  generateId(): string;

  // ===== 依存関係 =====
  /** プロジェクト内タスクに紐づく依存関係を一覧取得 */
  findDependenciesByProjectId(
    projectId: string,
  ): Promise<TaskDependencyRecord[]>;
  /** あるタスクが関係する依存関係を取得（先行・後続どちらでも） */
  findDependenciesByTaskId(taskId: string): Promise<TaskDependencyRecord[]>;
  findDependencyById(depId: string): Promise<TaskDependencyRecord | null>;
  /** 依存を追加（既存ペアがあればそれを返す） */
  addDependency(
    predecessorId: string,
    successorId: string,
  ): Promise<TaskDependencyRecord>;
  deleteDependency(depId: string): Promise<void>;
  deleteDependencyByPair(
    predecessorId: string,
    successorId: string,
  ): Promise<void>;
}
