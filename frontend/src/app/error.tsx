'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Home, RefreshCw } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // エラーをログに記録
    console.error('Application error:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        {/* Icon */}
        <div className="mb-8">
          <div className="w-24 h-24 mx-auto bg-red-50 rounded-full flex items-center justify-center">
            <AlertTriangle className="w-12 h-12 text-red-500" />
          </div>
        </div>

        {/* Error Code */}
        <h1 className="text-8xl font-bold text-gray-200 mb-2">500</h1>

        {/* Message */}
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          エラーが発生しました
        </h2>
        <p className="text-gray-600 mb-4">
          申し訳ございません。予期せぬエラーが発生しました。
          <br />
          しばらく時間をおいて再度お試しください。
        </p>

        {/* Error Details (Development only) */}
        {process.env.NODE_ENV === 'development' && error.message && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-left">
            <p className="text-xs font-mono text-red-700 break-all">
              {error.message}
            </p>
            {error.digest && (
              <p className="text-xs text-red-500 mt-2">
                Error ID: {error.digest}
              </p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button
            variant="outline"
            onClick={reset}
            className="border-gray-300 text-gray-700"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            もう一度試す
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

