'use client';

import { useParams } from 'next/navigation';
import { BookOpen } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { ManualButton } from '@/components/ui/manual-dialog';
import { MANUAL_ENTRIES } from '@/components/manual/manual-content';

/**
 * マニュアル インデックス。
 * 全機能のマニュアル(MANUAL_ENTRIES)をカード(タイトル + 目的)で一覧表示し、
 * 各カードの「マニュアルを見る」から各ページと同じ ManualDialog を開く。
 */
export default function ManualIndexPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const entries = Object.values(MANUAL_ENTRIES);

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" style={{ color: '#2563eb' }} />
            マニュアル
          </span>
        }
        description="各機能の目的・操作手順・画面イメージ（簡易図解）をまとめています。カードの「マニュアルを見る」から詳細を開けます。"
        backHref={`/dashboard/projects/${projectId}`}
        backLabel="プロジェクトへ戻る"
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {entries.map((entry) => (
          <Card key={entry.key} className="flex h-full flex-col border-slate-200 bg-white">
            <CardContent className="flex h-full flex-col gap-3 p-5">
              <h2
                className="text-base font-semibold leading-snug"
                style={{ color: '#050f3e' }}
              >
                {entry.title}
              </h2>
              <p className="flex-1 text-sm leading-relaxed text-slate-600">
                {entry.purpose}
              </p>
              <div className="pt-1">
                <ManualButton feature={entry.key} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
