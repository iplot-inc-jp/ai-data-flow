'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  Database,
  GitBranch,
  Users,
  Settings,
  LogOut,
  FolderOpen,
  Menu,
  PanelLeftClose,
  PanelLeft,
  FileText,
  Grid3X3,
  Home,
  ChevronRight,
  Zap,
} from 'lucide-react'
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
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  
  const projectId = useMemo(() => extractProjectId(pathname), [pathname])
  const projectName = useProjectName(projectId)
  
  const navigation = useMemo(() => {
    const baseNav = [
      { name: 'ダッシュボード', href: '/dashboard', icon: Home },
      { name: 'プロジェクト', href: '/dashboard/projects', icon: FolderOpen },
    ]
    
    if (projectId) {
      const projectNav = [
        { name: 'データカタログ', href: `/dashboard/projects/${projectId}/catalog`, icon: Database },
        { name: 'CRUD表', href: `/dashboard/projects/${projectId}/crud-matrix`, icon: Grid3X3 },
        { name: '業務フロー', href: `/dashboard/projects/${projectId}/flows`, icon: GitBranch },
        { name: '要求定義', href: `/dashboard/projects/${projectId}/requirements`, icon: FileText },
        { name: 'ロール', href: `/dashboard/projects/${projectId}/roles`, icon: Users },
        { name: '設定', href: `/dashboard/projects/${projectId}/settings`, icon: Settings },
      ]
      baseNav.push(...projectNav)
    }
    
    baseNav.push({ name: 'アカウント', href: '/dashboard/settings', icon: Settings })
    
    return baseNav
  }, [projectId])

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-card/95 backdrop-blur-sm border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center border border-primary/30">
              <Database className="h-4 w-4 text-primary" />
            </div>
            <span className="font-mono font-semibold text-foreground">DataFlow</span>
          </Link>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 bg-card border-r border-border transform transition-all duration-200 ease-in-out',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
          'lg:translate-x-0',
          sidebarCollapsed ? 'lg:w-16' : 'lg:w-64',
          'w-64'
        )}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between px-4 py-4 border-b border-border">
            <Link 
              href="/dashboard" 
              className={cn("flex items-center gap-3", sidebarCollapsed && "lg:hidden")}
            >
              <div className="w-9 h-9 rounded-lg bg-primary/20 flex items-center justify-center border border-primary/30 glow-cyan">
                <Database className="h-5 w-5 text-primary" />
              </div>
              <span className="font-mono text-lg font-semibold text-foreground">DataFlow</span>
            </Link>
            {sidebarCollapsed && (
              <Link href="/dashboard" className="hidden lg:flex items-center justify-center w-full">
                <div className="w-9 h-9 rounded-lg bg-primary/20 flex items-center justify-center border border-primary/30 glow-cyan">
                  <Database className="h-5 w-5 text-primary" />
                </div>
              </Link>
            )}
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className={cn(
                "hidden lg:flex p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors",
                sidebarCollapsed && "w-full justify-center mt-2"
              )}
            >
              {sidebarCollapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            {navigation.map((item, index) => {
              const isActive = pathname === item.href || 
                (item.href !== '/dashboard' && pathname.startsWith(item.href + '/'))
              const isProjectMenu = projectId && index >= 2 && index <= 7
              
              return (
                <div key={item.name}>
                  {/* Project section divider */}
                  {projectId && index === 2 && !sidebarCollapsed && (
                    <div className="pt-4 pb-3 px-1">
                      <div className="section-title text-xs">
                        <FolderOpen className="h-3.5 w-3.5 text-primary" />
                        <span className="truncate">{projectName || 'プロジェクト'}</span>
                      </div>
                    </div>
                  )}
                  {projectId && index === 2 && sidebarCollapsed && (
                    <div className="hidden lg:block py-2">
                      <div className="border-t border-border" />
                    </div>
                  )}
                  <Link
                    href={item.href}
                    onClick={() => setSidebarOpen(false)}
                    title={sidebarCollapsed ? item.name : undefined}
                    className={cn(
                      'sidebar-link',
                      isActive && 'active',
                      isProjectMenu && !sidebarCollapsed && 'ml-2',
                      sidebarCollapsed && 'lg:justify-center lg:px-2'
                    )}
                  >
                    <item.icon className="h-5 w-5 flex-shrink-0" />
                    <span className={cn("text-sm", sidebarCollapsed && 'lg:hidden')}>{item.name}</span>
                    {isActive && !sidebarCollapsed && (
                      <ChevronRight className="h-4 w-4 ml-auto text-primary" />
                    )}
                  </Link>
                </div>
              )
            })}
            
            {/* Hint when no project selected */}
            {!projectId && !sidebarCollapsed && (
              <div className="pt-6 px-1">
                <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                  <div className="flex items-start gap-2">
                    <Zap className="h-4 w-4 text-primary mt-0.5" />
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      プロジェクトを選択すると、データカタログ・業務フロー・ロール管理メニューが表示されます
                    </p>
                  </div>
                </div>
              </div>
            )}
          </nav>

          {/* User section */}
          <div className="px-3 py-4 border-t border-border">
            <button
              onClick={() => {
                localStorage.removeItem('accessToken')
                window.location.href = '/login'
              }}
              title={sidebarCollapsed ? 'ログアウト' : undefined}
              className={cn(
                "sidebar-link w-full text-red-400 hover:text-red-300 hover:bg-red-500/10",
                sidebarCollapsed ? 'lg:justify-center lg:px-2' : 'justify-start'
              )}
            >
              <LogOut className="h-5 w-5 flex-shrink-0" />
              <span className={cn("text-sm", sidebarCollapsed && 'lg:hidden')}>ログアウト</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <main className={cn(
        "min-h-screen pt-14 lg:pt-0 transition-all duration-200",
        sidebarCollapsed ? 'lg:pl-16' : 'lg:pl-64'
      )}>
        <div className="p-6 lg:p-8">{children}</div>
      </main>
    </div>
  )
}
