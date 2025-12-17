'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { FileQuestion, Home, ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        {/* Icon */}
        <div className="mb-8">
          <div className="w-24 h-24 mx-auto bg-gray-100 rounded-full flex items-center justify-center">
            <FileQuestion className="w-12 h-12 text-gray-400" />
          </div>
        </div>

        {/* Error Code */}
        <h1 className="text-8xl font-bold text-gray-200 mb-2">404</h1>

        {/* Message */}
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          ページが見つかりません
        </h2>
        <p className="text-gray-600 mb-8">
          お探しのページは存在しないか、移動した可能性があります。
          <br />
          URLをご確認ください。
        </p>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button
            variant="outline"
            onClick={() => window.history.back()}
            className="border-gray-300 text-gray-700"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            前のページに戻る
          </Button>
          <Link href="/dashboard">
            <Button className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto">
              <Home className="w-4 h-4 mr-2" />
              ダッシュボードへ
            </Button>
          </Link>
        </div>

        {/* Help Text */}
        <p className="mt-8 text-sm text-gray-500">
          問題が解決しない場合は、
          <Link href="/dashboard/settings" className="text-blue-600 hover:underline">
            サポート
          </Link>
          にお問い合わせください。
        </p>
      </div>
    </div>
  );
}

