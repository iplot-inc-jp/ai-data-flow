'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Database, Loader2, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5021';
const NAVY = '#050f3e';

export default function LoginPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || 'ログインに失敗しました');
      }
      const data = await res.json();
      localStorage.setItem('accessToken', data.accessToken);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-white px-4 text-gray-900">
      {/* トップページと同じ放射状ブルーグロー */}
      <div
        className="absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(60% 50% at 50% 0%, rgba(37,99,235,0.10) 0%, rgba(255,255,255,0) 70%)',
        }}
      />

      <div className="w-full max-w-sm">
        {/* Logo */}
        <Link href="/" className="flex items-center justify-center gap-2 mb-6">
          <span
            className="w-9 h-9 rounded-lg flex items-center justify-center text-white"
            style={{ backgroundColor: NAVY }}
          >
            <Database className="h-5 w-5" />
          </span>
          <span className="text-lg font-bold tracking-tight" style={{ color: NAVY }}>
            ai-data-flow
          </span>
        </Link>

        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          {/* 上部アクセントバー（ネイビー→ブルーのグラデ） */}
          <div
            className="h-1"
            style={{ backgroundImage: `linear-gradient(120deg, ${NAVY} 0%, #2563eb 60%, #60a5fa 100%)` }}
          />

          <div className="p-8">
            <p className="text-[11px] font-bold tracking-[0.25em] text-gray-400 mb-2 uppercase text-center">
              IPLoT Methodology Platform
            </p>
            <h1 className="text-xl font-bold text-center mb-6" style={{ color: NAVY }}>
              ログイン
            </h1>

            <form onSubmit={onSubmit} className="space-y-4">
              {error && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm">
                  {error}
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-gray-700 text-sm">
                  メールアドレス
                </Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoFocus
                  placeholder="you@example.com"
                  className="bg-white border-gray-300 text-gray-900"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-gray-700 text-sm">
                  パスワード
                </Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                  className="bg-white border-gray-300 text-gray-900"
                />
              </div>

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full rounded-full font-bold text-white hover:opacity-90"
                style={{ backgroundColor: NAVY }}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ログイン中...
                  </>
                ) : (
                  <>
                    ログイン
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </>
                )}
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-gray-500">
              アカウントをお持ちでない方は{' '}
              <Link href="/register" className="font-medium" style={{ color: '#2563eb' }}>
                新規登録
              </Link>
            </p>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-gray-400">
          © ai-data-flow — IPLoT Methodology Platform
        </p>
      </div>
    </div>
  );
}
