'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Layers } from 'lucide-react'

export default function RegisterPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setIsLoading(true)
    setError('')

    const formData = new FormData(e.currentTarget)
    const name = formData.get('name') as string
    const email = formData.get('email') as string
    const password = formData.get('password') as string

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5021'}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      })

      if (!res.ok) {
        throw new Error('登録に失敗しました')
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <Card className="w-full max-w-md bg-white border-gray-200 shadow-lg">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <Link href="/" className="flex items-center gap-2">
              <Layers className="h-8 w-8 text-blue-600" />
              <span className="text-xl font-bold text-gray-900">DataFlow</span>
            </Link>
          </div>
          <CardTitle className="text-2xl text-gray-900">新規登録</CardTitle>
          <CardDescription className="text-gray-500">
            アカウントを作成してDataFlowを始めましょう
          </CardDescription>
        </CardHeader>
        <form onSubmit={onSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <div className="p-3 text-sm text-red-600 bg-red-50 rounded-md border border-red-200">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="name" className="text-gray-700">お名前</Label>
              <Input
                id="name"
                name="name"
                type="text"
                placeholder="山田 太郎"
                required
                className="bg-white border-gray-300 text-gray-900 placeholder:text-gray-400"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email" className="text-gray-700">メールアドレス</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="you@example.com"
                required
                className="bg-white border-gray-300 text-gray-900 placeholder:text-gray-400"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-gray-700">パスワード</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                minLength={6}
                className="bg-white border-gray-300 text-gray-900"
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              disabled={isLoading}
            >
              {isLoading ? '登録中...' : '登録'}
            </Button>
            <p className="text-sm text-gray-500 text-center">
              すでにアカウントをお持ちの方は{' '}
              <Link href="/login" className="text-blue-600 hover:underline">
                ログイン
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
