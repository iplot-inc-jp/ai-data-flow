// ロードマップフェーズ（RoadmapPhase マスタ）の API クライアント。
// fetch 作法・headers()・エラーメッセージは masters.ts を踏襲する。
//
// list はバックエンド側で 0 件時に初期3フェーズ（Q / P2 / P3）を冪等シードして返す。
// GapLedger.phase との互換規約:
//   - 保存値は phaseStorageKey()（legacyKey ?? name）。未分類は 'NONE'。
//   - 読み込みは resolvePhase()（legacyKey 一致 → name 一致 → 見つからなければ未分類）。

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5021';

function headers(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  const t = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  if (t) h['Authorization'] = `Bearer ${t}`;
  return h;
}

export interface RoadmapPhase {
  id: string;
  projectId: string;
  name: string;
  /** 旧固定フェーズ互換キー（'Q' | 'P2' | 'P3'）。カスタムフェーズは null。 */
  legacyKey: string | null;
  order: number;
  createdAt: string;
  updatedAt: string;
}

/** GapLedger.phase に保存する値（legacyKey 優先、なければ name）。 */
export function phaseStorageKey(phase: RoadmapPhase): string {
  return phase.legacyKey ?? phase.name;
}

/**
 * GapLedger.phase の生値からフェーズ行を解決する。
 * legacyKey 一致 → name 一致 の順に探し、どれにも無ければ undefined（= 未分類）。
 * 旧データ（Q / P2 / P3）はシード行の legacyKey でそのまま解決される。
 */
export function resolvePhase(
  raw: string | null | undefined,
  phases: RoadmapPhase[],
): RoadmapPhase | undefined {
  if (!raw || raw === 'NONE') return undefined;
  return (
    phases.find((p) => p.legacyKey === raw) ?? phases.find((p) => p.name === raw)
  );
}

export const roadmapPhaseApi = {
  async list(projectId: string): Promise<RoadmapPhase[]> {
    const res = await fetch(`${API_URL}/api/projects/${projectId}/roadmap-phases`, { headers: headers() });
    if (!res.ok) throw new Error('ロードマップフェーズの取得に失敗しました');
    return res.json();
  },
  async create(
    projectId: string,
    body: { name: string; order?: number },
  ): Promise<RoadmapPhase> {
    const res = await fetch(`${API_URL}/api/projects/${projectId}/roadmap-phases`, { method: 'POST', headers: headers(), body: JSON.stringify(body) });
    if (!res.ok) throw new Error('ロードマップフェーズの作成に失敗しました');
    return res.json();
  },
  async update(
    id: string,
    patch: { name?: string; order?: number },
  ): Promise<RoadmapPhase> {
    const res = await fetch(`${API_URL}/api/roadmap-phases/${id}`, { method: 'PATCH', headers: headers(), body: JSON.stringify(patch) });
    if (!res.ok) throw new Error('ロードマップフェーズの更新に失敗しました');
    return res.json();
  },
  async delete(id: string): Promise<void> {
    const res = await fetch(`${API_URL}/api/roadmap-phases/${id}`, { method: 'DELETE', headers: headers() });
    if (!res.ok) throw new Error('ロードマップフェーズの削除に失敗しました');
  },
};
