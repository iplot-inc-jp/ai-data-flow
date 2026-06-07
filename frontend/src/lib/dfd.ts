const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5021';

export type DfdNodeKind = 'FUNCTION' | 'EXTERNAL_ENTITY' | 'DATA_STORE';
export interface DfdNode {
  id: string; kind: DfdNodeKind; label: string; number: string | null;
  refFlowId?: string | null; refNodeId?: string | null;
  positionX: number; positionY: number;
}
export interface DfdFlow {
  id: string; sourceNodeId: string; targetNodeId: string;
  dataItem: string; reportTypeId: string | null; order: number;
}
export interface DfdDiagram {
  id: string; projectId: string; flowId: string | null;
  title: string | null; docId: string | null; authorName: string | null; approverName: string | null;
  updatedAt: string; nodes: DfdNode[]; flows: DfdFlow[];
}

/** FUNCTIONノードに levelPrefix-連番 を採番（既存numberは保持） */
export function assignFunctionNumbers(nodes: DfdNode[], levelPrefix: number): DfdNode[] {
  let seq = 0;
  return nodes.map((n) => {
    if (n.kind !== 'FUNCTION') return n;
    seq += 1;
    return { ...n, number: n.number ?? `${levelPrefix}-${seq}` };
  });
}

export interface DataFlowRow {
  no: number; source: string; dataItem: string; target: string;
  direction: 'IN' | 'OUT'; relatedFunction: string; reportTypeId: string | null;
}
/** データフロー一覧表の行を作る。方向: 宛先がFUNCTIONならIN、源泉がFUNCTIONならOUT。関連処理=FUNCTION側ラベル */
export function buildDataFlowRows(nodes: DfdNode[], flows: DfdFlow[]): DataFlowRow[] {
  const byId = new Map(nodes.map((n) => [n.id, n] as const));
  return flows
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((f, i) => {
      const s = byId.get(f.sourceNodeId);
      const t = byId.get(f.targetNodeId);
      const targetIsFn = t?.kind === 'FUNCTION';
      const fn = targetIsFn ? t : s?.kind === 'FUNCTION' ? s : t;
      return {
        no: i + 1,
        source: s?.label ?? '?',
        dataItem: f.dataItem,
        target: t?.label ?? '?',
        direction: (targetIsFn ? 'IN' : 'OUT') as 'IN' | 'OUT',
        relatedFunction: fn?.label ?? '',
        reportTypeId: f.reportTypeId,
      };
    });
}

function headers(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  const t = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  if (t) h['Authorization'] = `Bearer ${t}`;
  return h;
}
/** multipart 用: Content-Type はブラウザに boundary 付きで設定させるため付けない */
function authHeader(): Record<string, string> {
  const h: Record<string, string> = {};
  const t = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  if (t) h['Authorization'] = `Bearer ${t}`;
  return h;
}
export const dfdApi = {
  async getByFlow(flowId: string): Promise<DfdDiagram> {
    const res = await fetch(`${API_URL}/api/business-flows/${flowId}/dfd`, { headers: headers() });
    if (!res.ok) throw new Error('DFD取得に失敗しました');
    return res.json();
  },
  async generateByFlow(flowId: string): Promise<DfdDiagram> {
    const res = await fetch(`${API_URL}/api/business-flows/${flowId}/dfd`, { method: 'POST', headers: headers() });
    if (!res.ok) throw new Error('DFD生成に失敗しました');
    return res.json();
  },
  async getByProject(projectId: string): Promise<DfdDiagram> {
    const res = await fetch(`${API_URL}/api/projects/${projectId}/dfd`, { headers: headers() });
    if (!res.ok) throw new Error('DFD取得に失敗しました');
    return res.json();
  },
  async generateByProject(projectId: string): Promise<DfdDiagram> {
    const res = await fetch(`${API_URL}/api/projects/${projectId}/dfd`, { method: 'POST', headers: headers() });
    if (!res.ok) throw new Error('DFD生成に失敗しました');
    return res.json();
  },
  async addNode(diagramId: string, body: Partial<DfdNode> & { kind: DfdNodeKind; label: string }): Promise<DfdNode> {
    const res = await fetch(`${API_URL}/api/dfd-diagrams/${diagramId}/nodes`, { method: 'POST', headers: headers(), body: JSON.stringify(body) });
    if (!res.ok) throw new Error('ノード追加に失敗しました');
    return res.json();
  },
  async updateNode(id: string, patch: Partial<DfdNode>): Promise<DfdNode> {
    const res = await fetch(`${API_URL}/api/dfd-nodes/${id}`, { method: 'PATCH', headers: headers(), body: JSON.stringify(patch) });
    if (!res.ok) throw new Error('ノード更新に失敗しました');
    return res.json();
  },
  async deleteNode(id: string): Promise<void> { await fetch(`${API_URL}/api/dfd-nodes/${id}`, { method: 'DELETE', headers: headers() }); },
  async addFlow(diagramId: string, body: { sourceNodeId: string; targetNodeId: string; dataItem: string }): Promise<DfdFlow> {
    const res = await fetch(`${API_URL}/api/dfd-diagrams/${diagramId}/flows`, { method: 'POST', headers: headers(), body: JSON.stringify(body) });
    if (!res.ok) throw new Error('データフロー追加に失敗しました');
    return res.json();
  },
  async updateFlow(id: string, patch: Partial<DfdFlow>): Promise<DfdFlow> {
    const res = await fetch(`${API_URL}/api/dfd-flows/${id}`, { method: 'PATCH', headers: headers(), body: JSON.stringify(patch) });
    if (!res.ok) throw new Error('データフロー更新に失敗しました');
    return res.json();
  },
  async deleteFlow(id: string): Promise<void> { await fetch(`${API_URL}/api/dfd-flows/${id}`, { method: 'DELETE', headers: headers() }); },
  async savePositions(diagramId: string, positions: { id: string; positionX: number; positionY: number }[]): Promise<void> {
    await fetch(`${API_URL}/api/dfd-diagrams/${diagramId}/positions`, { method: 'PUT', headers: headers(), body: JSON.stringify({ positions }) });
  },
};

// ========== 帳票種別（ReportType）+ 具体帳票（Attachment 流用） ==========

export interface ReportType {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  order: number;
  attachmentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ReportTypeAttachment {
  id: string;
  reportTypeId: string | null;
  kind: 'IMAGE' | 'PDF' | 'FILE';
  filename: string;
  mimeType: string;
  url: string;
  size: number;
  order: number;
  createdAt: string;
}

export const reportTypeApi = {
  async list(projectId: string): Promise<ReportType[]> {
    const res = await fetch(`${API_URL}/api/projects/${projectId}/report-types`, { headers: headers() });
    if (!res.ok) throw new Error('帳票種別の取得に失敗しました');
    return res.json();
  },
  async create(projectId: string, body: { name: string; description?: string | null; order?: number }): Promise<ReportType> {
    const res = await fetch(`${API_URL}/api/projects/${projectId}/report-types`, { method: 'POST', headers: headers(), body: JSON.stringify(body) });
    if (!res.ok) throw new Error('帳票種別の作成に失敗しました');
    return res.json();
  },
  async update(id: string, patch: { name?: string; description?: string | null; order?: number }): Promise<ReportType> {
    const res = await fetch(`${API_URL}/api/report-types/${id}`, { method: 'PATCH', headers: headers(), body: JSON.stringify(patch) });
    if (!res.ok) throw new Error('帳票種別の更新に失敗しました');
    return res.json();
  },
  async delete(id: string): Promise<void> {
    const res = await fetch(`${API_URL}/api/report-types/${id}`, { method: 'DELETE', headers: headers() });
    if (!res.ok) throw new Error('帳票種別の削除に失敗しました');
  },
  async listAttachments(reportTypeId: string): Promise<ReportTypeAttachment[]> {
    const res = await fetch(`${API_URL}/api/report-types/${reportTypeId}/attachments`, { headers: headers() });
    if (!res.ok) throw new Error('具体帳票の取得に失敗しました');
    return res.json();
  },
  async upload(reportTypeId: string, file: File): Promise<ReportTypeAttachment> {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${API_URL}/api/report-types/${reportTypeId}/attachments`, { method: 'POST', headers: authHeader(), body: form });
    if (!res.ok) throw new Error('具体帳票のアップロードに失敗しました');
    return res.json();
  },
  async deleteAttachment(attachmentId: string): Promise<void> {
    const res = await fetch(`${API_URL}/api/attachments/${attachmentId}`, { method: 'DELETE', headers: headers() });
    if (!res.ok) throw new Error('具体帳票の削除に失敗しました');
  },
  /** 添付ファイルの配信URL（@Public, 認証不要） */
  fileUrl(attachmentId: string): string {
    return `${API_URL}/api/attachments/${attachmentId}/file`;
  },
};
