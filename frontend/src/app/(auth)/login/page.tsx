'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Database, ArrowRight, Zap, GitBranch, Loader2 } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setIsLoading(true)
    setError('')

    const formData = new FormData(e.currentTarget)
    const email = formData.get('email') as string
    const password = formData.get('password') as string

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5021'}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      if (!res.ok) {
        throw new Error('ログインに失敗しました')
      }

      const data = await res.json()
      localStorage.setItem('accessToken', data.accessToken)
      router.push('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left Panel - Branding */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        {/* Background with grid */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#0a0f1a] via-[#111827] to-[#0f172a]">
          {/* Grid pattern */}
          <div 
            className="absolute inset-0 opacity-30"
            style={{
              backgroundImage: `
                linear-gradient(rgba(6, 182, 212, 0.1) 1px, transparent 1px),
                linear-gradient(90deg, rgba(6, 182, 212, 0.1) 1px, transparent 1px)
              `,
              backgroundSize: '40px 40px'
            }}
          />
          {/* Radial gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-transparent to-transparent" />
        </div>
        
        {/* Content */}
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center border border-cyan-500/30">
              <Database className="w-5 h-5 text-cyan-400" />
            </div>
            <span className="font-mono text-xl font-semibold text-white">DataFlow</span>
          </div>
          
          {/* Main content */}
          <div className="space-y-8">
            <div className="space-y-4">
              <h1 className="text-4xl lg:text-5xl font-bold text-white leading-tight">
                データと業務フローを
                <br />
                <span className="text-gradient-cyan">シームレスに統合</span>
              </h1>
              <p className="text-lg text-slate-400 max-w-md">
                データカタログと業務プロセスを紐づけ、
                組織のデータガバナンスを次のレベルへ
              </p>
            </div>
            
            {/* Features */}
            <div className="space-y-4">
              {[
                { icon: Database, label: 'データカタログ管理', desc: 'テーブル・カラムの一元管理' },
                { icon: GitBranch, label: 'BPMNフローエディタ', desc: '直感的な業務フロー設計' },
                { icon: Zap, label: 'CRUD自動マッピング', desc: 'データと業務の自動紐付け' },
              ].map((feature, i) => (
                <div 
                  key={i}
                  className="flex items-center gap-4 p-4 rounded-lg bg-white/5 border border-white/10 backdrop-blur-sm animate-slide-up"
                  style={{ animationDelay: `${i * 0.1}s` }}
                >
                  <div className="w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                    <feature.icon className="w-5 h-5 text-cyan-400" />
                  </div>
                  <div>
                    <div className="font-medium text-white">{feature.label}</div>
                    <div className="text-sm text-slate-500">{feature.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          {/* Footer */}
          <div className="text-sm text-slate-600">
            © 2024 DataFlow. All rights reserved.
          </div>
        </div>
        
        {/* Decorative elements */}
        <div className="absolute -bottom-20 -right-20 w-80 h-80 bg-cyan-500/20 rounded-full blur-3xl" />
        <div className="absolute top-20 -right-10 w-40 h-40 bg-blue-500/10 rounded-full blur-2xl" />
      </div>
      
      {/* Right Panel - Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-[#0a0f1a]">
        <div className="w-full max-w-md space-y-8 animate-fade-in">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center justify-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center border border-cyan-500/30">
              <Database className="w-5 h-5 text-cyan-400" />
            </div>
            <span className="font-mono text-xl font-semibold text-white">DataFlow</span>
          </div>
          
          {/* Header */}
          <div className="text-center lg:text-left">
            <h2 className="text-2xl font-bold text-white">ログイン</h2>
            <p className="mt-2 text-slate-400">
              アカウントにサインインして続行
            </p>
          </div>
          
          {/* Form */}
          <form onSubmit={onSubmit} className="space-y-6">
            {error && (
              <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm animate-scale-in">
                {error}
              </div>
            )}
            
            <div className="space-y-2">
              <label htmlFor="email" className="block text-sm font-medium text-slate-300">
                メールアドレス
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                placeholder="you@example.com"
                className="input-glow"
              />
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="block text-sm font-medium text-slate-300">
                  パスワード
                </label>
                <Link href="#" className="text-sm text-cyan-400 hover:text-cyan-300 transition-colors">
                  パスワードをお忘れですか？
                </Link>
              </div>
              <input
                id="password"
                name="password"
                type="password"
                required
                className="input-glow"
              />
            </div>
            
            <button
              type="submit"
              disabled={isLoading}
              className="btn-glow w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  ログイン中...
                </>
              ) : (
                <>
                  ログイン
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
          
          {/* Register link */}
          <div className="text-center">
            <p className="text-slate-400">
              アカウントをお持ちでない方は{' '}
              <Link href="/register" className="text-cyan-400 hover:text-cyan-300 transition-colors font-medium">
                新規登録
              </Link>
            </p>
          </div>
          
          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-700" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-[#0a0f1a] text-slate-500">または</span>
            </div>
          </div>
          
          {/* Demo login */}
          <button
            type="button"
            onClick={async () => {
              setIsLoading(true)
              try {
                const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5021'}/api/auth/login`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ email: 'demo@example.com', password: 'demo123' }),
                })
                if (res.ok) {
                  const data = await res.json()
                  localStorage.setItem('accessToken', data.accessToken)
                  router.push('/dashboard')
                }
              } catch {
                setError('デモログインに失敗しました')
              } finally {
                setIsLoading(false)
              }
            }}
            className="w-full py-3 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800/50 hover:border-slate-600 transition-all duration-200"
          >
            デモアカウントでログイン
          </button>
        </div>
      </div>
    </div>
  )
}
