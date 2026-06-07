import { Task, TaskStatus, TaskPriority } from '../../../domain';
import { TaskDependencyRecord } from '../../../domain';

export interface TaskOutput {
  id: string;
  projectId: string;
  parentId: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeName: string | null;
  assigneeRoleId: string | null;
  startDate: Date | null;
  dueDate: Date | null;
  progress: number;
  estimatedHours: number | null;
  actualHours: number | null;
  milestone: string | null;
  category: string | null;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface TaskDependencyOutput {
  id: string;
  predecessorId: string;
  successorId: string;
}

/**
 * 一覧レスポンス。フロントはこの tasks[] からツリーを組み、
 * dependencies[] で先行/後続の矢印を描画する。
 */
export interface TaskListOutput {
  tasks: TaskOutput[];
  dependencies: TaskDependencyOutput[];
}

export function toTaskOutput(task: Task): TaskOutput {
  return {
    id: task.id,
    projectId: task.projectId,
    parentId: task.parentId,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    assigneeName: task.assigneeName,
    assigneeRoleId: task.assigneeRoleId,
    startDate: task.startDate,
    dueDate: task.dueDate,
    progress: task.progress,
    estimatedHours: task.estimatedHours,
    actualHours: task.actualHours,
    milestone: task.milestone,
    category: task.category,
    order: task.order,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

export function toTaskDependencyOutput(
  dep: TaskDependencyRecord,
): TaskDependencyOutput {
  return {
    id: dep.id,
    predecessorId: dep.predecessorId,
    successorId: dep.successorId,
  };
}
