// 業務フロー フォルダ（FlowFolder）の型・APIヘルパー・純粋ツリー化ユーティリティ。
//
// バックエンド（実装済み）:
//   GET    /api/projects/:projectId/flow-folders        → FlowFolder[]（parentId 付きフラット）
//   POST   /api/projects/:projectId/flow-folders        {name, parentId?, order?}
//   PATCH  /api/flow-folders/:id                        {name}（リネーム）/ {parentId, order}（移動）
//   DELETE /api/flow-folders/:id                        （子フォルダはカスケード削除）
//   GET    /api/business-flows/project/:projectId/all   → フロー（folderId 含む）
//   PUT    /api/business-flows/:id                       {folderId}（フローをフォルダへ移動）
//
// raw fetch + localStorage 'accessToken'（既存 lib 慣習）。

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5021';

// ---------------------------------------------------------------------------
// 型
// ---------------------------------------------------------------------------

export interface FlowFolder {
  id: string;
  projectId: string;
  parentId: string | null;
  name: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export type FlowKind = 'ASIS' | 'TOBE';

/** フォルダ画面で扱う最小限のフロー情報。 */
export interface FolderFlow {
  id: string;
  name: string;
  description?: string | null;
  kind?: FlowKind;
  folderId: string | null;
  parentId: string | null;
  subProjectId?: string | null;
  updatedAt: string;
}

function headers(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  const t =
    typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  if (t) h['Authorization'] = `Bearer ${t}`;
  return h;
}

async function ok<T>(res: Response, errMsg: string): Promise<T> {
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.message || errMsg);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export const flowFolderApi = {
  async list(projectId: string): Promise<FlowFolder[]> {
    const res = await fetch(
      `${API_URL}/api/projects/${projectId}/flow-folders`,
      { headers: headers() },
    );
    return ok<FlowFolder[]>(res, 'フォルダ一覧の取得に失敗しました');
  },

  async create(
    projectId: string,
    input: { name: string; parentId?: string | null; order?: number },
  ): Promise<FlowFolder> {
    const res = await fetch(
      `${API_URL}/api/projects/${projectId}/flow-folders`,
      { method: 'POST', headers: headers(), body: JSON.stringify(input) },
    );
    return ok<FlowFolder>(res, 'フォルダの作成に失敗しました');
  },

  async rename(folderId: string, name: string): Promise<FlowFolder> {
    const res = await fetch(`${API_URL}/api/flow-folders/${folderId}`, {
      method: 'PATCH',
      headers: headers(),
      body: JSON.stringify({ name }),
    });
    return ok<FlowFolder>(res, 'フォルダ名の変更に失敗しました');
  },

  /** 移動（親フォルダ変更）。parentId=null でルートへ。 */
  async move(
    folderId: string,
    input: { parentId?: string | null; order?: number },
  ): Promise<FlowFolder> {
    const res = await fetch(`${API_URL}/api/flow-folders/${folderId}`, {
      method: 'PATCH',
      headers: headers(),
      body: JSON.stringify(input),
    });
    return ok<FlowFolder>(res, 'フォルダの移動に失敗しました');
  },

  async remove(folderId: string): Promise<{ success: boolean }> {
    const res = await fetch(`${API_URL}/api/flow-folders/${folderId}`, {
      method: 'DELETE',
      headers: headers(),
    });
    return ok<{ success: boolean }>(res, 'フォルダの削除に失敗しました');
  },

  /** プロジェクトの全フロー（folderId 含む）。 */
  async listFlows(projectId: string): Promise<FolderFlow[]> {
    const res = await fetch(
      `${API_URL}/api/business-flows/project/${projectId}/all`,
      { headers: headers() },
    );
    return ok<FolderFlow[]>(res, 'フローの取得に失敗しました');
  },

  /** フローを別フォルダへ移動（folderId=null でフォルダ外＝未整理へ）。 */
  async moveFlow(flowId: string, folderId: string | null): Promise<unknown> {
    const res = await fetch(`${API_URL}/api/business-flows/${flowId}`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({ folderId }),
    });
    return ok<unknown>(res, 'フローの移動に失敗しました');
  },
};

// ---------------------------------------------------------------------------
// 純粋ユーティリティ（テスト可能・副作用なし）
// ---------------------------------------------------------------------------

/** ツリー描画用フォルダノード。 */
export interface FlowFolderNode {
  folder: FlowFolder;
  depth: number;
  children: FlowFolderNode[];
}

/**
 * フラットな FlowFolder[] を parentId で入れ子ツリーにする。
 * 各階層は order → name で安定ソート。親が見つからない（孤児）フォルダはルート扱いにする
 * （データ不整合でも UI から消えてしまわないようにする）。
 */
export function buildFolderTree(folders: FlowFolder[]): FlowFolderNode[] {
  const byId = new Map<string, FlowFolderNode>();
  for (const f of folders) {
    byId.set(f.id, { folder: f, depth: 0, children: [] });
  }

  const roots: FlowFolderNode[] = [];
  for (const node of Array.from(byId.values())) {
    const pid = node.folder.parentId;
    const parent = pid ? byId.get(pid) : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const cmp = (a: FlowFolderNode, b: FlowFolderNode) =>
    a.folder.order - b.folder.order ||
    a.folder.name.localeCompare(b.folder.name, 'ja');

  const assignDepth = (nodes: FlowFolderNode[], depth: number) => {
    nodes.sort(cmp);
    for (const n of nodes) {
      n.depth = depth;
      assignDepth(n.children, depth + 1);
    }
  };
  assignDepth(roots, 0);

  return roots;
}

/**
 * フォルダ id から「ルート→そのフォルダ」までのパンくず（自身を含む）を返す。
 * 見つからない場合は空配列。
 */
export function folderBreadcrumb(
  folders: FlowFolder[],
  folderId: string | null,
): FlowFolder[] {
  if (!folderId) return [];
  const byId = new Map(folders.map((f) => [f.id, f] as const));
  const path: FlowFolder[] = [];
  const seen = new Set<string>();
  let cur = byId.get(folderId);
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    path.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return path;
}

/** あるフォルダの「直下の子フォルダ」だけを order→name 順で返す。 */
export function childFolders(
  folders: FlowFolder[],
  parentId: string | null,
): FlowFolder[] {
  return folders
    .filter((f) => (f.parentId ?? null) === (parentId ?? null))
    .sort(
      (a, b) => a.order - b.order || a.name.localeCompare(b.name, 'ja'),
    );
}

/** あるフォルダ直下（folderId 一致）のフローを name 順で返す。 */
export function flowsInFolder(
  flows: FolderFlow[],
  folderId: string | null,
): FolderFlow[] {
  return flows
    .filter((f) => (f.folderId ?? null) === (folderId ?? null))
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'));
}

/**
 * フォルダ id の集合のうち、与えた id 自身とその全子孫を返す（移動の循環防止に使う）。
 * 自身を含む。
 */
export function collectDescendantIds(
  folders: FlowFolder[],
  rootId: string,
): Set<string> {
  const childrenByParent = new Map<string, FlowFolder[]>();
  for (const f of folders) {
    const pid = f.parentId ?? '';
    if (!childrenByParent.has(pid)) childrenByParent.set(pid, []);
    childrenByParent.get(pid)!.push(f);
  }
  const out = new Set<string>([rootId]);
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    for (const child of childrenByParent.get(id) ?? []) {
      if (!out.has(child.id)) {
        out.add(child.id);
        stack.push(child.id);
      }
    }
  }
  return out;
}
