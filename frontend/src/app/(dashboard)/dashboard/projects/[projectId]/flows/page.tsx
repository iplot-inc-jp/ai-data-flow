'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { HelpTooltip } from '@/components/ui/help-tooltip';
import { HowToPanel } from '@/components/ui/how-to-panel';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  GitBranch,
  Plus,
  Search,
  Clock,
  Play,
  Loader2,
  ChevronLeft,
  FolderPlus,
  Folder,
  Pencil,
  Check,
  X,
} from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5021';

const UNASSIGNED = '__unassigned__';

type FlowKind = 'ASIS' | 'TOBE';

type FlowData = {
  id: string;
  name: string;
  description?: string;
  version: number;
  kind?: FlowKind;
  confidence?: 'HYPOTHESIS' | 'CONFIRMED';
  nodesCount?: number;
  subProjectId?: string | null;
  updatedAt: string;
};

type SubProject = {
  id: string;
  projectId: string;
  name: string;
  description?: string | null;
  order: number;
  createdAt: string;
  updatedAt: string;
};

type FlowGroup = {
  key: string;
  subProject: SubProject | null;
  flows: FlowData[];
};

export default function ProjectFlowsPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const [flows, setFlows] = useState<FlowData[]>([]);
  const [subProjects, setSubProjects] = useState<SubProject[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isSubProjectDialogOpen, setIsSubProjectDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [kindFilter, setKindFilter] = useState<'ALL' | FlowKind>('ALL');
  const [newFlow, setNewFlow] = useState<{
    name: string;
    description: string;
    kind: FlowKind;
    subProjectId: string;
  }>({ name: '', description: '', kind: 'ASIS', subProjectId: UNASSIGNED });
  const [newSubProject, setNewSubProject] = useState<{ name: string; description: string }>({
    name: '',
    description: '',
  });
  const [editingSubProjectId, setEditingSubProjectId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const searchInputRef = useRef<HTMLInputElement>(null);
  const howToRef = useRef<HTMLDivElement>(null);

  // ? でHowToPanelを開く / n・⌘Enterで作成 / / で検索フォーカス
  useKeyboardShortcuts([
    {
      combo: 'shift+/',
      handler: () => howToRef.current?.querySelector('button')?.click(),
    },
    {
      combo: 'n',
      handler: () => setIsCreateDialogOpen(true),
    },
    {
      combo: 'mod+enter',
      whenTyping: true,
      handler: () => setIsCreateDialogOpen(true),
    },
    {
      combo: '/',
      handler: (e) => {
        e.preventDefault();
        searchInputRef.current?.focus();
      },
    },
  ]);

  const getHeaders = useCallback(() => {
    const token = localStorage.getItem('accessToken');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  }, []);

  const fetchFlows = useCallback(async () => {
    try {
      const headers = getHeaders();
      const res = await fetch(`${API_URL}/api/business-flows/project/${projectId}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setFlows(data);
      }
    } catch (err) {
      console.error('Failed to fetch flows:', err);
    }
  }, [projectId, getHeaders]);

  const fetchSubProjects = useCallback(async () => {
    try {
      const headers = getHeaders();
      const res = await fetch(`${API_URL}/api/projects/${projectId}/sub-projects`, { headers });
      if (res.ok) {
        const data = await res.json();
        setSubProjects(data);
      }
    } catch (err) {
      console.error('Failed to fetch sub-projects:', err);
    }
  }, [projectId, getHeaders]);

  const refetchAll = useCallback(async () => {
    await Promise.all([fetchFlows(), fetchSubProjects()]);
  }, [fetchFlows, fetchSubProjects]);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      await refetchAll();
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [refetchAll]);

  const handleCreateFlow = async () => {
    if (!newFlow.name) return;

    try {
      const headers = getHeaders();
      const res = await fetch(`${API_URL}/api/business-flows`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          projectId,
          name: newFlow.name,
          description: newFlow.description || null,
          kind: newFlow.kind,
          subProjectId: newFlow.subProjectId === UNASSIGNED ? null : newFlow.subProjectId,
        }),
      });
      if (res.ok) {
        await fetchFlows();
        setIsCreateDialogOpen(false);
        setNewFlow({ name: '', description: '', kind: 'ASIS', subProjectId: UNASSIGNED });
      }
    } catch (err) {
      console.error('Failed to create flow:', err);
    }
  };

  const handleCreateSubProject = async () => {
    if (!newSubProject.name) return;

    try {
      const headers = getHeaders();
      const res = await fetch(`${API_URL}/api/projects/${projectId}/sub-projects`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: newSubProject.name,
          description: newSubProject.description || null,
        }),
      });
      if (res.ok) {
        await fetchSubProjects();
        setIsSubProjectDialogOpen(false);
        setNewSubProject({ name: '', description: '' });
      }
    } catch (err) {
      console.error('Failed to create sub-project:', err);
    }
  };

  const handleRenameSubProject = async (id: string) => {
    const name = editingName.trim();
    if (!name) {
      setEditingSubProjectId(null);
      return;
    }

    try {
      const headers = getHeaders();
      const res = await fetch(`${API_URL}/api/sub-projects/${id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        await fetchSubProjects();
      }
    } catch (err) {
      console.error('Failed to rename sub-project:', err);
    } finally {
      setEditingSubProjectId(null);
      setEditingName('');
    }
  };

  const handleAssignSubProject = async (flowId: string, value: string) => {
    const subProjectId = value === UNASSIGNED ? null : value;
    try {
      const headers = getHeaders();
      const res = await fetch(`${API_URL}/api/business-flows/${flowId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ subProjectId }),
      });
      if (res.ok) {
        await fetchFlows();
      }
    } catch (err) {
      console.error('Failed to assign sub-project:', err);
    }
  };

  const filteredFlows = useMemo(
    () =>
      flows.filter((flow) => {
        const q = searchQuery.toLowerCase();
        const matchesSearch =
          flow.name.toLowerCase().includes(q) ||
          (flow.description?.toLowerCase().includes(q) ?? false);
        const matchesKind = kindFilter === 'ALL' || (flow.kind ?? 'ASIS') === kindFilter;
        return matchesSearch && matchesKind;
      }),
    [flows, searchQuery, kindFilter],
  );

  // Group flows by sub-project: one section per sub-project (in order), plus a 未分類 section.
  const groups = useMemo<FlowGroup[]>(() => {
    const byId = new Map<string, FlowData[]>();
    const unassigned: FlowData[] = [];

    for (const flow of filteredFlows) {
      const spId = flow.subProjectId ?? null;
      if (spId && subProjects.some((sp) => sp.id === spId)) {
        const list = byId.get(spId) ?? [];
        list.push(flow);
        byId.set(spId, list);
      } else {
        unassigned.push(flow);
      }
    }

    const result: FlowGroup[] = subProjects.map((sp) => ({
      key: sp.id,
      subProject: sp,
      flows: byId.get(sp.id) ?? [],
    }));

    result.push({ key: UNASSIGNED, subProject: null, flows: unassigned });

    return result;
  }, [filteredFlows, subProjects]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const selectClass =
    'rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400';

  const hasAnyFlows = filteredFlows.length > 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={`/dashboard/projects/${projectId}`}>
            <Button variant="ghost" size="sm" className="text-gray-600">
              <ChevronLeft className="w-4 h-4 mr-1" />
              戻る
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold text-gray-900">業務フロー</h1>
              <HelpTooltip text="業務プロセスを誰が・何を・どの順で行うかをスイムレーン図で可視化します。現状（ASIS）とあるべき姿（TOBE）を作り分け、その差分が改善対象になります。" />
            </div>
            <p className="text-gray-500 mt-1">業務プロセスを可視化して管理</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* 操作ガイド */}
          <div ref={howToRef}>
            <HowToPanel
              title="業務フロー一覧の使い方"
              steps={[
                'カードをクリックすると、そのフローのスイムレーン図を開けます。',
                '「フロー作成」で ASIS（現状）または TOBE（あるべき姿）のフローを新規作成します。',
                '「サブプロジェクト追加」で業務単位のフォルダを作り、各カード下のセレクトでフローを振り分けます。',
                '上部の検索・ASIS/TOBE フィルタで目的のフローに素早く絞り込めます。',
              ]}
              shortcuts={[
                { keys: 'N', desc: 'フロー作成ダイアログを開く' },
                { keys: '⌘/Ctrl+Enter', desc: 'フロー作成ダイアログを開く' },
                { keys: '/', desc: '検索ボックスにフォーカス' },
                { keys: 'Shift+/（?）', desc: 'この操作方法を開く' },
              ]}
            />
          </div>
          {/* Add sub-project */}
          <Dialog open={isSubProjectDialogOpen} onOpenChange={setIsSubProjectDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="border-gray-300 text-gray-700">
                <FolderPlus className="h-4 w-4 mr-2" />
                サブプロジェクト追加
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-white border-gray-200">
              <DialogHeader>
                <DialogTitle className="text-gray-900">サブプロジェクト追加</DialogTitle>
                <DialogDescription className="text-gray-500">
                  フローをまとめるサブプロジェクトを作成します
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="sp-name" className="text-gray-700">サブプロジェクト名</Label>
                  <Input
                    id="sp-name"
                    placeholder="受注管理"
                    value={newSubProject.name}
                    onChange={(e) => setNewSubProject({ ...newSubProject, name: e.target.value })}
                    className="bg-white border-gray-300 text-gray-900"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sp-description" className="text-gray-700">説明</Label>
                  <Input
                    id="sp-description"
                    placeholder="サブプロジェクトの説明を入力"
                    value={newSubProject.description}
                    onChange={(e) =>
                      setNewSubProject({ ...newSubProject, description: e.target.value })
                    }
                    className="bg-white border-gray-300 text-gray-900"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsSubProjectDialogOpen(false)}
                  className="border-gray-300 text-gray-700"
                >
                  キャンセル
                </Button>
                <Button
                  className="bg-blue-600 hover:bg-blue-700"
                  onClick={handleCreateSubProject}
                >
                  作成
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Create flow */}
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-blue-600 hover:bg-blue-700">
                <Plus className="h-4 w-4 mr-2" />
                フロー作成
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-white border-gray-200">
              <DialogHeader>
                <DialogTitle className="text-gray-900">新規フロー作成</DialogTitle>
                <DialogDescription className="text-gray-500">
                  新しい業務フローを作成します
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-gray-700">フロー名</Label>
                  <Input
                    id="name"
                    placeholder="注文処理フロー"
                    value={newFlow.name}
                    onChange={(e) => setNewFlow({ ...newFlow, name: e.target.value })}
                    className="bg-white border-gray-300 text-gray-900"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description" className="text-gray-700">説明</Label>
                  <Input
                    id="description"
                    placeholder="フローの説明を入力"
                    value={newFlow.description}
                    onChange={(e) => setNewFlow({ ...newFlow, description: e.target.value })}
                    className="bg-white border-gray-300 text-gray-900"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="flow-sub-project" className="text-gray-700">サブプロジェクト</Label>
                    <HelpTooltip text="フローをまとめる業務単位のフォルダです。受注管理・出荷管理など、関連するフローを束ねて整理できます（未分類のままでもOK）。" />
                  </div>
                  <select
                    id="flow-sub-project"
                    value={newFlow.subProjectId}
                    onChange={(e) => setNewFlow({ ...newFlow, subProjectId: e.target.value })}
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  >
                    <option value={UNASSIGNED}>未分類</option>
                    {subProjects.map((sp) => (
                      <option key={sp.id} value={sp.id}>
                        {sp.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label className="text-gray-700">種別</Label>
                    <HelpTooltip text="ASIS（現状）は今の業務の流れ、TOBE（あるべき姿）は改善後の理想の流れです。両者の差（GAP）が改善・システム化の対象になります。" />
                  </div>
                  <div className="flex gap-2">
                    {(['ASIS', 'TOBE'] as const).map((k) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setNewFlow({ ...newFlow, kind: k })}
                        className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                          newFlow.kind === k
                            ? k === 'TOBE'
                              ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                              : 'border-blue-400 bg-blue-50 text-blue-700'
                            : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        {k === 'ASIS' ? 'ASIS（現状）' : 'TOBE（あるべき姿）'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsCreateDialogOpen(false)}
                  className="border-gray-300 text-gray-700"
                >
                  キャンセル
                </Button>
                <Button className="bg-blue-600 hover:bg-blue-700" onClick={handleCreateFlow}>
                  作成
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Search + Kind filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            ref={searchInputRef}
            placeholder="フローを検索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-white border-gray-300 text-gray-900 placeholder:text-gray-400"
          />
        </div>
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1 text-sm self-start">
          {(['ALL', 'ASIS', 'TOBE'] as const).map((k) => (
            <button
              key={k}
              onClick={() => setKindFilter(k)}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                kindFilter === k ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {k === 'ALL' ? 'すべて' : k}
            </button>
          ))}
        </div>
      </div>

      {/* Grouped sections */}
      {hasAnyFlows || subProjects.length > 0 ? (
        <div className="space-y-8">
          {groups.map((group) => {
            // Hide an empty 未分類 section when there are no orphan flows.
            if (group.subProject === null && group.flows.length === 0) return null;

            const isEditing = group.subProject !== null && editingSubProjectId === group.subProject.id;

            return (
              <section key={group.key} className="space-y-3">
                {/* Section header */}
                <div className="flex items-center gap-2 border-b border-gray-200 pb-2">
                  <Folder className="h-4 w-4 text-gray-400" />
                  {isEditing && group.subProject ? (
                    <div className="flex items-center gap-2">
                      <Input
                        autoFocus
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRenameSubProject(group.subProject!.id);
                          if (e.key === 'Escape') {
                            setEditingSubProjectId(null);
                            setEditingName('');
                          }
                        }}
                        className="h-8 w-56 bg-white border-gray-300 text-gray-900"
                      />
                      <button
                        type="button"
                        onClick={() => handleRenameSubProject(group.subProject!.id)}
                        className="text-emerald-600 hover:text-emerald-700"
                        aria-label="保存"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingSubProjectId(null);
                          setEditingName('');
                        }}
                        className="text-gray-400 hover:text-gray-600"
                        aria-label="キャンセル"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-semibold text-gray-900">
                        {group.subProject ? group.subProject.name : '（未分類）'}
                      </h2>
                      <span className="text-xs text-gray-400">{group.flows.length}</span>
                      {group.subProject && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingSubProjectId(group.subProject!.id);
                            setEditingName(group.subProject!.name);
                          }}
                          className="text-gray-400 hover:text-gray-600"
                          aria-label="名前を変更"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Section description */}
                {group.subProject?.description && (
                  <p className="text-sm text-gray-500">{group.subProject.description}</p>
                )}

                {/* Flow cards */}
                {group.flows.length > 0 ? (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {group.flows.map((flow) => (
                      <Card
                        key={flow.id}
                        className="bg-white border-gray-200 hover:border-gray-300 hover:shadow-md transition-all h-full flex flex-col"
                      >
                        <Link
                          href={`/dashboard/projects/${projectId}/flows/${flow.id}`}
                          className="block flex-1"
                        >
                          <CardHeader className="pb-3">
                            <div className="flex items-start justify-between">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-lg bg-cyan-100 flex items-center justify-center">
                                  <GitBranch className="h-5 w-5 text-cyan-600" />
                                </div>
                                <div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <CardTitle className="text-gray-900 text-lg">
                                      {flow.name}
                                    </CardTitle>
                                    <span
                                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                        (flow.kind ?? 'ASIS') === 'TOBE'
                                          ? 'bg-emerald-100 text-emerald-700'
                                          : 'bg-blue-100 text-blue-700'
                                      }`}
                                    >
                                      {flow.kind ?? 'ASIS'}
                                    </span>
                                    {flow.confidence === 'HYPOTHESIS' && (
                                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-100 text-amber-700">
                                        仮説
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-xs text-gray-500">v{flow.version}</span>
                                </div>
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <p className="text-sm text-gray-500 line-clamp-2 mb-4">
                              {flow.description || '説明なし'}
                            </p>
                            <div className="flex items-center justify-between text-xs text-gray-500">
                              {flow.nodesCount !== undefined && (
                                <div className="flex items-center gap-1">
                                  <Play className="h-3 w-3" />
                                  {flow.nodesCount} ノード
                                </div>
                              )}
                              <div className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {formatDate(flow.updatedAt)}
                              </div>
                            </div>
                          </CardContent>
                        </Link>
                        {/* Per-flow sub-project assignment */}
                        <div className="flex items-center gap-2 border-t border-gray-100 px-6 py-3">
                          <span className="text-xs text-gray-400 whitespace-nowrap">
                            サブプロジェクト
                          </span>
                          <select
                            value={flow.subProjectId ?? UNASSIGNED}
                            onChange={(e) => handleAssignSubProject(flow.id, e.target.value)}
                            className={selectClass}
                          >
                            <option value={UNASSIGNED}>未分類</option>
                            {subProjects.map((sp) => (
                              <option key={sp.id} value={sp.id}>
                                {sp.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">このサブプロジェクトにはフローがありません</p>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <Card className="bg-white border-gray-200">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <GitBranch className="h-8 w-8 text-gray-400" />
            </div>
            <p className="text-gray-500 mb-2">フローが見つかりません</p>
            <p className="text-sm text-gray-400 mb-4">
              {searchQuery ? '検索条件を変更してください' : '最初のフローを作成しましょう'}
            </p>
            {!searchQuery && (
              <Button
                className="bg-blue-600 hover:bg-blue-700"
                onClick={() => setIsCreateDialogOpen(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                フロー作成
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
