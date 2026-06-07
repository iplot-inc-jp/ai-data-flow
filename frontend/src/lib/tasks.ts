// タスク管理（WBS / バックログ）のための型・ラベル・APIヘルパー・純粋ユーティリティ。
//
// 純粋関数（buildTaskTree / computeWbsNumbers）は副作用を持たず、テスト可能なように
// エクスポートしています。fetch ヘルパー群は API_URL と localStorage の accessToken を
// 用いた raw fetch で実装しています。

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5021';

// ---------------------------------------------------------------------------
// 型
// ---------------------------------------------------------------------------

export type TaskStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

export type TaskPriority = 'HIGH' | 'MEDIUM' | 'LOW';

export interface Task {
  id: string;
  projectId: string;
  parentId: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeName: string | null;
  assigneeRoleId: string | null;
  startDate: string | null;
  dueDate: string | null;
  progress: number;
  estimatedHours: number | null;
  actualHours: number | null;
  milestone: boolean;
  category: string | null;
  order: number;
}

export interface TaskDependency {
  id: string;
  predecessorId: string;
  successorId: string;
}

export interface TasksResponse {
  tasks: Task[];
  dependencies: TaskDependency[];
}

/** 作成/更新時に送る入力（id・projectId はパス側で扱うため除外可能） */
export type TaskInput = Partial<Omit<Task, 'id' | 'projectId'>> & {
  title: string;
};

/** プロジェクトの担当ロール（assigneeRole 選択肢） */
export interface TaskRole {
  id: string;
  name: string;
  type?: string;
  color?: string | null;
}

/** buildTaskTree が返す入れ子ノード */
export interface TaskTreeNode extends Task {
  depth: number;
  children: TaskTreeNode[];
}

// ---------------------------------------------------------------------------
// ラベル・色マップ
// ---------------------------------------------------------------------------

export const TASK_STATUSES: TaskStatus[] = [
  'OPEN',
  'IN_PROGRESS',
  'RESOLVED',
  'CLOSED',
];

export const TASK_PRIORITIES: TaskPriority[] = ['HIGH', 'MEDIUM', 'LOW'];

export const taskStatusLabels: Record<
  TaskStatus,
  { label: string; color: string; dot: string }
> = {
  OPEN: {
    label: '未対応',
    color: 'bg-gray-100 text-gray-700 border-gray-200',
    dot: 'bg-gray-400',
  },
  IN_PROGRESS: {
    label: '処理中',
    color: 'bg-blue-50 text-blue-700 border-blue-200',
    dot: 'bg-blue-500',
  },
  RESOLVED: {
    label: '処理済',
    color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dot: 'bg-emerald-500',
  },
  CLOSED: {
    label: '完了',
    color: 'bg-slate-100 text-slate-600 border-slate-200',
    dot: 'bg-slate-400',
  },
};

export const taskPriorityLabels: Record<
  TaskPriority,
  { label: string; color: string }
> = {
  HIGH: { label: '高', color: 'bg-red-50 text-red-600 border-red-200' },
  MEDIUM: { label: '中', color: 'bg-amber-50 text-amber-600 border-amber-200' },
  LOW: { label: '低', color: 'bg-green-50 text-green-600 border-green-200' },
};

export function taskStatusLabel(status: string): string {
  return taskStatusLabels[status as TaskStatus]?.label ?? status;
}

export function taskPriorityLabel(priority: string): string {
  return taskPriorityLabels[priority as TaskPriority]?.label ?? priority;
}

// ---------------------------------------------------------------------------
// fetch ヘルパー
// ---------------------------------------------------------------------------

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token =
    typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || `API Error: ${res.status}`);
  }
  // DELETE などは本文が無い場合がある
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const tasksApi = {
  /** GET /api/projects/:projectId/tasks */
  list: (projectId: string) =>
    fetch(`${API_URL}/api/projects/${projectId}/tasks`, {
      headers: authHeaders(),
    }).then((r) => handle<TasksResponse>(r)),

  /** POST /api/projects/:projectId/tasks */
  create: (projectId: string, input: TaskInput) =>
    fetch(`${API_URL}/api/projects/${projectId}/tasks`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(input),
    }).then((r) => handle<Task>(r)),

  /** GET /api/tasks/:id */
  get: (id: string) =>
    fetch(`${API_URL}/api/tasks/${id}`, { headers: authHeaders() }).then((r) =>
      handle<Task>(r)
    ),

  /** PUT /api/tasks/:id */
  update: (id: string, input: Partial<TaskInput>) =>
    fetch(`${API_URL}/api/tasks/${id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(input),
    }).then((r) => handle<Task>(r)),

  /** DELETE /api/tasks/:id */
  delete: (id: string) =>
    fetch(`${API_URL}/api/tasks/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    }).then((r) => handle<void>(r)),

  /** POST /api/tasks/:id/dependencies { predecessorId } */
  addDep: (taskId: string, predecessorId: string) =>
    fetch(`${API_URL}/api/tasks/${taskId}/dependencies`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ predecessorId }),
    }).then((r) => handle<TaskDependency>(r)),

  /** DELETE /api/tasks/dependencies/:depId */
  removeDep: (depId: string) =>
    fetch(`${API_URL}/api/tasks/dependencies/${depId}`, {
      method: 'DELETE',
      headers: authHeaders(),
    }).then((r) => handle<void>(r)),

  /** GET /api/projects/:projectId/roles */
  listRoles: (projectId: string) =>
    fetch(`${API_URL}/api/projects/${projectId}/roles`, {
      headers: authHeaders(),
    }).then((r) => handle<TaskRole[]>(r)),
};

// ---------------------------------------------------------------------------
// 純粋ユーティリティ（テスト対象）
// ---------------------------------------------------------------------------

/**
 * parentId に基づいてフラットなタスク配列を入れ子ツリーに変換する。
 *
 * - 各階層は `order` の昇順、同値は `title` の昇順で安定的に並ぶ。
 * - parentId が存在しない（または親が見つからない）タスクはルートとして扱う。
 * - 親子関係に循環があっても無限ループせず、循環したノードはルートに昇格させる。
 */
export function buildTaskTree(tasks: Task[]): TaskTreeNode[] {
  const byId = new Map<string, TaskTreeNode>();
  for (const t of tasks) {
    byId.set(t.id, { ...t, depth: 0, children: [] });
  }

  const roots: TaskTreeNode[] = [];

  for (const node of Array.from(byId.values())) {
    const parentId = node.parentId;
    const parent = parentId ? byId.get(parentId) : undefined;
    if (parent && !createsCycle(node.id, parentId!, byId)) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortNodes = (nodes: TaskTreeNode[], depth: number) => {
    nodes.sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.title.localeCompare(b.title);
    });
    for (const n of nodes) {
      n.depth = depth;
      sortNodes(n.children, depth + 1);
    }
  };
  sortNodes(roots, 0);

  return roots;
}

/** node を parentId の子にしたとき循環が生じるか判定（node が parent の祖先なら循環）。 */
function createsCycle(
  nodeId: string,
  parentId: string,
  byId: Map<string, TaskTreeNode>
): boolean {
  let current: string | null | undefined = parentId;
  const seen = new Set<string>();
  while (current) {
    if (current === nodeId) return true;
    if (seen.has(current)) return true; // 既存データ側の循環
    seen.add(current);
    current = byId.get(current)?.parentId ?? null;
  }
  return false;
}

/**
 * ツリーから各タスクの WBS 番号（'1', '1.2', '1.2.3' …）を採番する。
 * 並びは buildTaskTree が確定した順（order → title）に従う。
 */
export function computeWbsNumbers(tree: TaskTreeNode[]): Map<string, string> {
  const map = new Map<string, string>();

  const walk = (nodes: TaskTreeNode[], prefix: string) => {
    nodes.forEach((node, i) => {
      const wbs = prefix ? `${prefix}.${i + 1}` : `${i + 1}`;
      map.set(node.id, wbs);
      walk(node.children, wbs);
    });
  };
  walk(tree, '');

  return map;
}

/** ツリーを深さ優先でフラット化（描画用：順序＋depth を保持） */
export function flattenTaskTree(tree: TaskTreeNode[]): TaskTreeNode[] {
  const out: TaskTreeNode[] = [];
  const walk = (nodes: TaskTreeNode[]) => {
    for (const n of nodes) {
      out.push(n);
      walk(n.children);
    }
  };
  walk(tree);
  return out;
}

/**
 * あるタスクの全子孫 id 集合を返す（親セレクトで自分＋子孫を除外するために使用）。
 */
export function collectDescendantIds(
  tasks: Task[],
  rootId: string
): Set<string> {
  const childrenByParent = new Map<string, string[]>();
  for (const t of tasks) {
    if (!t.parentId) continue;
    const arr = childrenByParent.get(t.parentId) ?? [];
    arr.push(t.id);
    childrenByParent.set(t.parentId, arr);
  }
  const result = new Set<string>();
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    for (const childId of childrenByParent.get(id) ?? []) {
      if (!result.has(childId)) {
        result.add(childId);
        stack.push(childId);
      }
    }
  }
  return result;
}
