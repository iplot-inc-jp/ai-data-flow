// 業務一覧: ステークホルダー担当者 × ASIS業務フロー × 対応TOBE/GAP。
// 集約エンドポイントは作らず、既存3エンドポイントをフロントで結合する。
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5021';

function headers(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  const t = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  if (t) h['Authorization'] = `Bearer ${t}`;
  return h;
}

export type FlowAssignee = { stakeholderId: string; name: string; order: number };

export type BusinessFlowItem = {
  id: string;
  name: string;
  kind: 'ASIS' | 'TOBE';
  asisFlowId?: string | null;
  subProjectId?: string | null;
  assignees?: FlowAssignee[];
};

export type GapItem = {
  id: string;
  asisFlowId?: string | null;
  tobeFlowId?: string | null;
  gapDescription?: string | null;
  priority?: string | null;
  status?: string | null;
};

export type BusinessListRow = {
  asis: BusinessFlowItem;
  tobes: BusinessFlowItem[];
  gaps: GapItem[];
};

/** 純関数: ASIS 起点に TOBE/GAP を asisFlowId で対応付ける。 */
export function buildBusinessList(
  flows: BusinessFlowItem[],
  gaps: GapItem[],
): BusinessListRow[] {
  const tobesByAsis = new Map<string, BusinessFlowItem[]>();
  for (const f of flows) {
    if (f.kind === 'TOBE' && f.asisFlowId) {
      const arr = tobesByAsis.get(f.asisFlowId) ?? [];
      arr.push(f);
      tobesByAsis.set(f.asisFlowId, arr);
    }
  }
  const gapsByAsis = new Map<string, GapItem[]>();
  for (const g of gaps) {
    if (g.asisFlowId) {
      const arr = gapsByAsis.get(g.asisFlowId) ?? [];
      arr.push(g);
      gapsByAsis.set(g.asisFlowId, arr);
    }
  }
  return flows
    .filter((f) => f.kind === 'ASIS')
    .map((asis) => ({
      asis,
      tobes: tobesByAsis.get(asis.id) ?? [],
      gaps: gapsByAsis.get(asis.id) ?? [],
    }));
}

export async function listProjectFlows(projectId: string): Promise<BusinessFlowItem[]> {
  const res = await fetch(`${API_URL}/api/business-flows/project/${projectId}/all`, { headers: headers() });
  if (!res.ok) throw new Error('業務フローの取得に失敗しました');
  return res.json();
}

export async function listGapItemsRaw(projectId: string): Promise<GapItem[]> {
  const res = await fetch(`${API_URL}/api/projects/${projectId}/gap-items`, { headers: headers() });
  if (!res.ok) throw new Error('GAPの取得に失敗しました');
  return res.json();
}

export async function setFlowStakeholders(
  flowId: string,
  stakeholderIds: string[],
): Promise<{ assignees: FlowAssignee[] }> {
  const res = await fetch(`${API_URL}/api/business-flows/${flowId}/stakeholders`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify({ stakeholderIds }),
  });
  if (!res.ok) throw new Error('担当者の保存に失敗しました');
  return res.json();
}
