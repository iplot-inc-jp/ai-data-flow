'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  Layers,
  Database,
  GitBranch,
  Users,
  Settings,
  LogOut,
  FolderOpen,
  Menu,
  ChevronLeft,
  ChevronRight,
  PanelLeftClose,
  PanelLeft,
  FileText,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useState, useMemo, useEffect } from 'react'

// プロジェクトIDを抽出する関数
function extractProjectId(pathname: string): string | null {
  const match = pathname.match(/\/dashboard\/projects\/([^/]+)/)
  return match ? match[1] : null
}

// プロジェクト名を取得するhook
function useProjectName(projectId: string | null) {
  const [projectName, setProjectName] = useState<string | null>(null)
  
  useEffect(() => {
    if (!projectId) {
      setProjectName(null)
      return
    }
    
    const fetchProject = async () => {
      try {
        const token = localStorage.getItem('accessToken')
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (token) headers['Authorization'] = `Bearer ${token}`
        
        const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5021'
        const res = await fetch(`${API_URL}/api/projects/${projectId}`, { headers })
        if (res.ok) {
          const data = await res.json()
          setProjectName(data.name)
        }
      } catch (err) {
        console.error('Failed to fetch project:', err)
      }
    }
    
    fetchProject()
  }, [projectId])
  
  return projectName
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false) // モバイル用
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false) // デスクトップ用
  
  // URLからプロジェクトIDを取得
  const projectId = useMemo(() => extractProjectId(pathname), [pathname])
  const projectName = useProjectName(projectId)
  
  // ナビゲーションを動的に生成
  const navigation = useMemo(() => {
    const baseNav = [
      { name: 'ダッシュボード', href: '/dashboard', icon: Layers },
      { name: 'プロジェクト', href: '/dashboard/projects', icon: FolderOpen },
    ]
    
    // プロジェクトが選択されている場合、プロジェクト配下のメニューを追加
    if (projectId) {
      const projectNav = [
        { name: 'データカタログ', href: `/dashboard/projects/${projectId}/catalog`, icon: Database },
        { name: '業務フロー', href: `/dashboard/projects/${projectId}/flows`, icon: GitBranch },
        { name: '要求定義', href: `/dashboard/projects/${projectId}/requirements`, icon: FileText },
        { name: 'ロール', href: `/dashboard/projects/${projectId}/roles`, icon: Users },
        { name: 'プロジェクト設定', href: `/dashboard/projects/${projectId}/settings`, icon: Settings },
      ]
      baseNav.push(...projectNav)
    }
    
    baseNav.push({ name: 'アカウント設定', href: '/dashboard/settings', icon: Settings })
    
    return baseNav
  }, [projectId])

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile sidebar toggle */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2">
            <Layers className="h-6 w-6 text-blue-600" />
            <span className="font-bold text-gray-900">DataFlow</span>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-gray-600"
          >
            <Menu className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 bg-white border-r border-gray-200 transform transition-all duration-200 ease-in-out',
          // モバイル
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
          // デスクトップ
          'lg:translate-x-0',
          sidebarCollapsed ? 'lg:w-16' : 'lg:w-64',
          // モバイルでは常に w-64
          'w-64'
        )}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between px-4 py-5 border-b border-gray-200">
            <Link href="/dashboard" className={cn("flex items-center gap-2", sidebarCollapsed && "lg:hidden")}>
              <Layers className="h-8 w-8 text-blue-600" />
              <span className="text-xl font-bold text-gray-900">DataFlow</span>
            </Link>
            {sidebarCollapsed && (
              <Link href="/dashboard" className="hidden lg:flex items-center justify-center w-full">
                <Layers className="h-8 w-8 text-blue-600" />
              </Link>
            )}
            {/* 折りたたみボタン（デスクトップのみ） */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className={cn("hidden lg:flex text-gray-400 hover:text-gray-600 -mr-2", sidebarCollapsed && "w-full mr-0")}
            >
              {sidebarCollapsed ? <PanelLeft className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
            </Button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
            {navigation.map((item, index) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
              const isProjectMenu = projectId && index >= 2 && index <= 5 // カタログ、フロー、ロール、プロジェクト設定
              
              return (
                <div key={item.name}>
                  {/* プロジェクト配下メニューの区切り線 */}
                  {projectId && index === 2 && !sidebarCollapsed && (
                    <div className="pt-4 pb-2 px-3">
                      <div className="flex items-center gap-1 text-xs text-gray-500 font-medium">
                        <FolderOpen className="h-3 w-3" />
                        <span className="truncate">{projectName || 'プロジェクト'}</span>
                      </div>
                      <div className="mt-2 border-t border-gray-200" />
                    </div>
                  )}
                  {projectId && index === 2 && sidebarCollapsed && (
                    <div className="hidden lg:block pt-2 pb-1">
                      <div className="border-t border-gray-200" />
                    </div>
                  )}
                  <Link
                    href={item.href}
                    onClick={() => setSidebarOpen(false)}
                    title={sidebarCollapsed ? item.name : undefined}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                      isProjectMenu && !sidebarCollapsed && 'ml-2', // プロジェクト配下はインデント
                      sidebarCollapsed && 'lg:justify-center lg:px-2'
                    )}
                  >
                    <item.icon className="h-5 w-5 flex-shrink-0" />
                    <span className={cn(sidebarCollapsed && 'lg:hidden')}>{item.name}</span>
                  </Link>
                </div>
              )
            })}
            
            {/* プロジェクト未選択時のヒント */}
            {!projectId && !sidebarCollapsed && (
              <div className="pt-4 px-3">
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-xs text-amber-700">
                    プロジェクトを選択すると、データカタログ・業務フロー・ロール管理メニューが表示されます
                  </p>
                </div>
              </div>
            )}
          </nav>

          {/* User section */}
          <div className="px-2 py-4 border-t border-gray-200">
            <Button
              variant="ghost"
              title={sidebarCollapsed ? 'ログアウト' : undefined}
              className={cn(
                "w-full gap-3 text-gray-600 hover:text-gray-900 hover:bg-gray-100",
                sidebarCollapsed ? 'lg:justify-center lg:px-2' : 'justify-start'
              )}
              onClick={() => {
                localStorage.removeItem('accessToken')
                window.location.href = '/login'
              }}
            >
              <LogOut className="h-5 w-5 flex-shrink-0" />
              <span className={cn(sidebarCollapsed && 'lg:hidden')}>ログアウト</span>
            </Button>
          </div>
        </div>
      </aside>

      {/* Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <main className={cn(
        "pt-14 lg:pt-0 transition-all duration-200",
        sidebarCollapsed ? 'lg:pl-16' : 'lg:pl-64'
      )}>
        <div className="p-6">{children}</div>
      </main>
    </div>
  )
}
