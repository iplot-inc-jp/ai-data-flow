// 情報の地図（CRUOA マトリクス, REAL table）用の型・APIヘルパー。
//
// 旧来の RecordSheet（projectId × 'info-map:<flowId>', {rows} に __cols/__info を JSON 埋め込み）
// ではなく、フロー単位の専用テーブル CruoaCol / CruoaRow / CruoaCell を直接置換する。
// 既存の他ページと同じく API_URL + /api への raw fetch（localStorage の accessToken）を使う。

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

/** 列定義（ロール列または自由列）。 */
export interface CruoaCol {
  id: string;
  label: string | null;
  roleId: string | null;
  order: number;
}

/** 行定義（情報項目）。 */
export interface CruoaRow {
  id: string;
  info: string | null;
  order: number;
}

/** セル（行×列に対する C/R/U/O/A の値）。 */
export interface CruoaCell {
  rowId: string;
  colId: string;
  value: string | null;
}

/** GET / PUT が返す情報の地図のスナップショット。 */
export interface CruoaSnapshot {
  cols: CruoaCol[];
  rows: CruoaRow[];
  cells: CruoaCell[];
}

// ---------------------------------------------------------------------------
// CRUOA API
// ---------------------------------------------------------------------------

export const cruoaApi = {
  async get(flowId: string): Promise<CruoaSnapshot> {
    const res = await fetch(
      `${API_URL}/api/business-flows/${flowId}/cruoa`,
      { headers: getHeaders() },
    );
    if (!res.ok) throw new Error('情報の地図の読み込みに失敗しました');
    return res.json();
  },

  async save(flowId: string, snapshot: CruoaSnapshot): Promise<CruoaSnapshot> {
    const res = await fetch(
      `${API_URL}/api/business-flows/${flowId}/cruoa`,
      {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(snapshot),
      },
    );
    if (!res.ok) throw new Error('情報の地図の保存に失敗しました');
    return res.json();
  },
};
