// GAP item 作成ヘルパー。
// 旧 _lib/use-record-sheet.ts から RecordSheet 廃止に伴い移設（分析結果→打ち手 の起票で使用）。

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5021';

function getHeaders(): Record<string, string> {
  const token =
    typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

/** GAP item を既存の作成APIで起票する（分析結果→打ち手）。 */
export async function createGapItem(
  projectId: string,
  body: {
    businessArea: string;
    asisDescription?: string;
    tobeDescription?: string;
    gapDescription?: string;
    priority?: 'HIGH' | 'MEDIUM' | 'LOW';
    ownerName?: string;
  },
): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/projects/${projectId}/gap-items`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch (err) {
    console.error('Failed to create gap item:', err);
    return false;
  }
}
