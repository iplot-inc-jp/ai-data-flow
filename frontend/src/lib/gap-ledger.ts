// GAP台帳オーバーレイ（REAL table）用の型・APIヘルパー。
//
// 旧来の RecordSheet（projectId × 'gap-ledger-meta' / 'gap-roadmap', {rows}）ではなく、
// 専用テーブル GapLedger を直接読み書きする。
// 既存の他ページと同じく API_URL + /api への raw fetch（localStorage の accessToken）を使う。
// PUT は行ごとに「明示的に渡したキーのみ」をマージ UPSERT する（lib/risks.ts のヘッダ流儀をミラー）。

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5021';

function getHeaders(): Record<string, string> {
  const token =
    typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

// ---------------------------------------------------------------------------
// 型
// ---------------------------------------------------------------------------

/** GAP台帳オーバーレイ（GapLedger テーブル）の1行。 */
export interface GapLedger {
  id?: string;
  gapId: string;
  impact: string | null;
  difficulty: string | null;
  phase: string | null;
  toComplete: string | null;
  // roadmap ページ用（期日/目標・メモ・並び順）
  target: string | null;
  note: string | null;
  order: number;
}

/**
 * 保存（PUT）で送る1行。gapId 必須・他は任意。
 * 渡したキーのみがマージ更新されるため、用途ごとに送る項目を絞れる。
 * （ledger UI は全項目、roadmap UI は {gapId, phase} のみ）
 */
export type GapLedgerInput = {
  gapId: string;
  impact?: string | null;
  difficulty?: string | null;
  phase?: string | null;
  toComplete?: string | null;
  target?: string | null;
  note?: string | null;
  order?: number;
};

// ---------------------------------------------------------------------------
// GapLedger API
// ---------------------------------------------------------------------------

export const gapLedgerApi = {
  async list(projectId: string): Promise<GapLedger[]> {
    const res = await fetch(
      `${API_URL}/api/projects/${projectId}/gap-ledgers`,
      { headers: getHeaders() },
    );
    if (!res.ok) throw new Error('GAP台帳の読み込みに失敗しました');
    return res.json();
  },

  async save(
    projectId: string,
    rows: GapLedgerInput[],
  ): Promise<GapLedger[]> {
    const res = await fetch(
      `${API_URL}/api/projects/${projectId}/gap-ledgers`,
      {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ rows }),
      },
    );
    if (!res.ok) throw new Error('GAP台帳の保存に失敗しました');
    return res.json();
  },
};
