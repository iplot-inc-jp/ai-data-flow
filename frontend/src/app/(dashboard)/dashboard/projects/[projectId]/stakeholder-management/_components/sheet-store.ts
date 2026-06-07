'use client';

import { useCallback, useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5021';

export type SheetRow = Record<string, string>;

function getHeaders(): Record<string, string> {
  const token =
    typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

/**
 * 既存の RecordSheet API（GET/PUT /api/projects/:projectId/record-sheets/:templateKey,
 * body は {rows:any[]}）を、ステークホルダーマネジメントの purpose-built UI から
 * 共通利用するためのフック。各セルは文字列に正規化して扱う（入力 UI が文字列前提）。
 * バックエンドは追加せず既存エンドポイントのみを使う。
 */
export function useSheetStore(projectId: string, templateKey: string) {
  const [rows, setRows] = useState<SheetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchSheet = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${API_URL}/api/projects/${projectId}/record-sheets/${encodeURIComponent(
          templateKey,
        )}`,
        { headers: getHeaders() },
      );
      if (res.ok) {
        const data = await res.json();
        const fetched = Array.isArray(data?.rows) ? data.rows : [];
        const normalized: SheetRow[] = fetched.map((row: unknown) => {
          const out: SheetRow = {};
          if (row && typeof row === 'object') {
            for (const [k, v] of Object.entries(row as Record<string, unknown>)) {
              out[k] = v == null ? '' : String(v);
            }
          }
          return out;
        });
        setRows(normalized);
      } else if (res.status !== 404) {
        setError('読み込みに失敗しました');
      }
    } catch (err) {
      console.error('Failed to fetch record sheet:', err);
      setError('読み込み中にエラーが発生しました');
    } finally {
      setLoading(false);
    }
  }, [projectId, templateKey]);

  useEffect(() => {
    fetchSheet();
  }, [fetchSheet]);

  const save = useCallback(
    async (next: SheetRow[]) => {
      setSaving(true);
      setError(null);
      try {
        const res = await fetch(
          `${API_URL}/api/projects/${projectId}/record-sheets/${encodeURIComponent(
            templateKey,
          )}`,
          {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify({ rows: next }),
          },
        );
        if (res.ok) {
          setSavedAt(Date.now());
        } else {
          setError('保存に失敗しました');
        }
      } catch (err) {
        console.error('Failed to save record sheet:', err);
        setError('保存中にエラーが発生しました');
      } finally {
        setSaving(false);
      }
    },
    [projectId, templateKey],
  );

  /** ローカルの行を更新する（保存はしない＝未保存状態に戻す）。 */
  const update = useCallback((updater: (prev: SheetRow[]) => SheetRow[]) => {
    setRows((prev) => updater(prev));
    setSavedAt(null);
  }, []);

  return { rows, setRows, update, loading, saving, savedAt, error, save };
}

/** RecordSheet の別テンプレ（保存はせず参照のみ）を読み込む軽量フック。 */
export function useSheetRowsReadOnly(projectId: string, templateKey: string) {
  const [rows, setRows] = useState<SheetRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `${API_URL}/api/projects/${projectId}/record-sheets/${encodeURIComponent(
            templateKey,
          )}`,
          { headers: getHeaders() },
        );
        if (!res.ok) return;
        const data = await res.json();
        const fetched = Array.isArray(data?.rows) ? data.rows : [];
        if (cancelled) return;
        const normalized: SheetRow[] = fetched.map((row: unknown) => {
          const out: SheetRow = {};
          if (row && typeof row === 'object') {
            for (const [k, v] of Object.entries(row as Record<string, unknown>)) {
              out[k] = v == null ? '' : String(v);
            }
          }
          return out;
        });
        setRows(normalized);
      } catch (err) {
        console.error('Failed to fetch reference sheet:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, templateKey]);

  return rows;
}
