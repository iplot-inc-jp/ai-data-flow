'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { 
  FolderOpen, 
  Plus, 
  ArrowRight, 
  Loader2, 
  Database, 
  GitBranch, 
  Users,
  Clock,
  Sparkles
} from 'lucide-react'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5021'

type Organization = {
  id: string
  name: string
  slug: string
}

type Project = {
  id: string
  name: string
  description?: string
  organizationId: string
  createdAt: string
  updatedAt: string
}

export default function DashboardPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  const getHeaders = useCallback(() => {
    const token = localStorage.getItem('accessToken')
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`
    return headers
  }, [])

  useEffect(() => {
    const fetchData = async () => {
      try {
        const headers = getHeaders()
        
        // 組織一覧を取得
        const orgsRes = await fetch(`${API_URL}/api/organizations`, { headers })
        if (orgsRes.ok) {
          const orgsData = await orgsRes.json()
          setOrganizations(orgsData)
          
          // 各組織のプロジェクトを取得
          const allProjects: Project[] = []
          for (const org of orgsData) {
            const projRes = await fetch(`${API_URL}/api/organizations/${org.id}/projects`, { headers })
            if (projRes.ok) {
              const projData = await projRes.json()
              allProjects.push(...projData)
            }
          }
          // 更新日時でソート
          allProjects.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
          setProjects(allProjects)
        }
      } catch (err) {
        console.error('Failed to fetch data:', err)
      } finally {
        setLoading(false)
      }
    }
    
    fetchData()
  }, [getHeaders])

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('ja-JP', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">ダッシュボード</h1>
          <p className="text-gray-500 mt-1">プロジェクトを選択して作業を開始</p>
        </div>
        <Link href="/dashboard/projects">
          <Button className="bg-blue-600 hover:bg-blue-700">
            <Plus className="h-4 w-4 mr-2" />
            新規プロジェクト
          </Button>
        </Link>
      </div>

      {/* プロジェクトがない場合 */}
      {projects.length === 0 ? (
        <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200 shadow-sm">
          <CardContent className="py-12">
            <div className="flex flex-col items-center text-center">
              <div className="w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center mb-6">
                <Sparkles className="h-10 w-10 text-blue-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                DataFlowへようこそ！
              </h2>
              <p className="text-gray-600 mb-6 max-w-md">
                まずはプロジェクトを作成しましょう。プロジェクト内でデータカタログ、業務フロー、ロールを管理できます。
              </p>
              <Link href="/dashboard/projects">
                <Button size="lg" className="bg-blue-600 hover:bg-blue-700">
                  <FolderOpen className="h-5 w-5 mr-2" />
                  プロジェクトを作成
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* 統計 */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="bg-white border-gray-200 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-gray-500">プロジェクト数</CardTitle>
                <FolderOpen className="h-4 w-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-gray-900">{projects.length}</div>
                <p className="text-xs text-gray-500">作成済みのプロジェクト</p>
              </CardContent>
            </Card>
            <Card className="bg-white border-gray-200 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-gray-500">組織数</CardTitle>
                <Users className="h-4 w-4 text-purple-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-gray-900">{organizations.length}</div>
                <p className="text-xs text-gray-500">所属している組織</p>
              </CardContent>
            </Card>
            <Card className="bg-white border-gray-200 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-gray-500">最終更新</CardTitle>
                <Clock className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-lg font-bold text-gray-900 truncate">
                  {projects[0]?.name || '-'}
                </div>
                <p className="text-xs text-gray-500">
                  {projects[0] ? formatDate(projects[0].updatedAt) : '-'}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* プロジェクト一覧 */}
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="bg-white border-gray-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-gray-900">最近のプロジェクト</CardTitle>
                <CardDescription className="text-gray-500">
                  プロジェクトを選択して作業を開始
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {projects.slice(0, 5).map((project) => (
                  <Link 
                    key={project.id} 
                    href={`/dashboard/projects/${project.id}`} 
                    className="block"
                  >
                    <div className="flex items-center justify-between p-4 rounded-lg bg-gray-50 hover:bg-blue-50 transition-colors border border-gray-200 hover:border-blue-200">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                          <FolderOpen className="h-5 w-5 text-blue-600" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{project.name}</p>
                          <p className="text-sm text-gray-500">
                            {project.description || '説明なし'}
                          </p>
                        </div>
                      </div>
                      <ArrowRight className="h-5 w-5 text-gray-400" />
                    </div>
                  </Link>
                ))}
                {projects.length > 5 && (
                  <Link href="/dashboard/projects" className="block">
                    <div className="text-center py-2 text-sm text-blue-600 hover:text-blue-700">
                      すべてのプロジェクトを表示 →
                    </div>
                  </Link>
                )}
              </CardContent>
            </Card>

            <Card className="bg-white border-gray-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-gray-900">クイックガイド</CardTitle>
                <CardDescription className="text-gray-500">
                  DataFlowの使い方
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-50 border border-blue-100">
                  <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm flex-shrink-0">
                    1
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">プロジェクトを選択</p>
                    <p className="text-sm text-gray-600">
                      左のリストからプロジェクトを選ぶか、新規作成します
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 border border-gray-200">
                  <div className="w-8 h-8 rounded-full bg-gray-400 text-white flex items-center justify-center font-bold text-sm flex-shrink-0">
                    2
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">ロールを定義</p>
                    <p className="text-sm text-gray-600">
                      業務を担当する人・システムを登録します
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 border border-gray-200">
                  <div className="w-8 h-8 rounded-full bg-gray-400 text-white flex items-center justify-center font-bold text-sm flex-shrink-0">
                    3
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">業務フローを作成</p>
                    <p className="text-sm text-gray-600">
                      BPMNスタイルで業務プロセスを可視化します
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 border border-gray-200">
                  <div className="w-8 h-8 rounded-full bg-gray-400 text-white flex items-center justify-center font-bold text-sm flex-shrink-0">
                    4
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">データカタログを整備</p>
                    <p className="text-sm text-gray-600">
                      テーブルとカラムを登録し、業務フローと紐付けます
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
