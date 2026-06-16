'use client';

/**
 * 俯瞰思考（俯瞰マトリクス）編集ページ。
 * スナップショットを取得し OverviewMatrixEditor に渡すだけのシェル。
 * ロード/エラーと一覧への戻りリンクを担当する。
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ChevronLeft, Loader2 } from 'lucide-react';
import {
  overviewMatrixApi,
  type OverviewMatrixSnapshot,
} from '@/lib/overview-matrix';
import { OverviewMatrixEditor } from '../_components/OverviewMatrixEditor';

export default function OverviewMatrixEditorPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const matrixId = params.matrixId as string;

  const [snapshot, setSnapshot] = useState<OverviewMatrixSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const listHref = `/dashboard/projects/${projectId}/overview-matrix`;

  const fetchSnapshot = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await overviewMatrixApi.get(matrixId);
      setSnapshot(data);
    } catch (err) {
      console.error('Failed to fetch overview matrix:', err);
      setError('俯瞰マトリクスの読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, [matrixId]);

  useEffect(() => {
    fetchSnapshot();
  }, [fetchSnapshot]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (error || !snapshot) {
    return (
      <div className="space-y-4">
        <Link
          href={listHref}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          俯瞰思考一覧へ
        </Link>
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error ?? '俯瞰マトリクスが見つかりませんでした'}
        </div>
        <Button variant="outline" onClick={fetchSnapshot}>
          再読み込み
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Link
        href={listHref}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        俯瞰思考一覧へ
      </Link>
      <OverviewMatrixEditor matrixId={matrixId} snapshot={snapshot} />
    </div>
  );
}
