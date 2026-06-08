'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  GitBranch,
  Plus,
  Loader2,
  FolderTree,
  Database,
  GitCompare,
  ClipboardList,
  Folder,
  Layers,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/ui/page-header';
import { HowToPanel } from '@/components/ui/how-to-panel';
import { EditableMemoBoard } from '@/components/records/editable-memo-board';
import {
  asisMemoApi,
  type AsisMemo,
  type AsisMemoInput,
} from '@/lib/asis-tobe';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5021';

type FlowKind = 'ASIS' | 'TOBE';

type BusinessFlow = {
  id: string;
  name: string;
  kind: FlowKind;
  folderId?: string | null;
  subProjectId?: string | null;
  description?: string | null;
};

type SubProject = { id: string; name: string };
type FlowFolder = { id: string; name: string };

type GapItem = {
  id: string;
  businessArea: string;
  asisDescription: string | null;
  gapDescription: string | null;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  status: 'OPEN' | 'RESOLVED';
};

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token =
    typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

const priorityBadge: Record<GapItem['priority'], string> = {
  HIGH: 'text-red-700 bg-red-50 border-red-300',
  MEDIUM: 'text-amber-700 bg-amber-50 border-amber-300',
  LOW: 'text-green-700 bg-green-50 border-green-300',
};

export default function AsisManagementPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;

  const [flows, setFlows] = useState<BusinessFlow[]>([]);
  const [subProjects, setSubProjects] = useState<SubProject[]>([]);
  const [folders, setFolders] = useState<FlowFolder[]>([]);
  const [gapItems, setGapItems] = useState<GapItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // フロー作成ダイアログ
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [flowRes, subRes, folderRes, gapRes] = await Promise.all([
        fetch(`${API_URL}/api/business-flows/project/${projectId}/all`, {
          headers: authHeaders(),
        }),
        fetch(`${API_URL}/api/projects/${projectId}/sub-projects`, {
          headers: authHeaders(),
        }),
        fetch(`${API_URL}/api/projects/${projectId}/flow-folders`, {
          headers: authHeaders(),
        }),
        fetch(`${API_URL}/api/projects/${projectId}/gap-items`, {
          headers: authHeaders(),
        }),
      ]);

      if (flowRes.ok) {
        const data = await flowRes.json();
        setFlows(Array.isArray(data) ? data : []);
      } else {
        setError('業務フローの読み込みに失敗しました');
      }
      if (subRes.ok) {
        const data = await subRes.json();
        setSubProjects(Array.isArray(data) ? data : []);
      }
      if (folderRes.ok) {
        const data = await folderRes.json();
        setFolders(Array.isArray(data) ? data : []);
      }
      if (gapRes.ok) {
        const data = await gapRes.json();
        setGapItems(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Failed to fetch ASIS data:', err);
      setError('読み込み中にエラーが発生しました');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const asisFlows = useMemo(
    () => flows.filter((f) => f.kind === 'ASIS'),
    [flows]
  );

  const subProjectName = useCallback(
    (id?: string | null) => subProjects.find((s) => s.id === id)?.name ?? null,
    [subProjects]
  );
  const folderName = useCallback(
    (id?: string | null) => folders.find((f) => f.id === id)?.name ?? null,
    [folders]
  );

  const openFlow = (id: string) =>
    router.push(`/dashboard/projects/${projectId}/flows/${id}`);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/business-flows`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          projectId,
          name: newName.trim(),
          kind: 'ASIS',
          description: newDescription.trim() || undefined,
        }),
      });
      if (res.ok) {
        const created: BusinessFlow = await res.json();
        setIsCreateOpen(false);
        setNewName('');
        setNewDescription('');
        if (created?.id) {
          openFlow(created.id);
          return;
        }
        fetchAll();
      } else {
        setError('ASISフローの作成に失敗しました');
      }
    } catch (err) {
      console.error('Failed to create ASIS flow:', err);
      setError('作成中にエラーが発生しました');
    } finally {
      setCreating(false);
    }
  };

  const openGapItems = gapItems.filter((g) => g.status === 'OPEN');

  return (
    <div className="space-y-8">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-amber-600" />
            ASIS管理
          </span>
        }
        description="現状（ASIS）の業務フロー・データ・課題・状態を一元管理"
        help="このページで現状（ASIS）の業務フローを選んで開き、現状のデータ・課題・状態メモを一箇所で管理します。"
        actions={
          <HowToPanel
            title="ASIS管理の使い方"
            steps={[
              'ASIS業務フローのカードをクリックすると、そのフローを開いて編集できます。',
              '「ASISフロー作成」で新しい現状フローを作成し、そのまま編集画面に移動します。',
              '現状のデータはデータカタログ、課題はGAP一覧へのリンクから確認・編集できます。',
              '現状メモ（状態）の表に、項目ごとの現状・課題・制約を自由に書き留めます。',
            ]}
          />
        }
      />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex h-[320px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
        </div>
      ) : (
        <>
          {/* ── Section: ASIS業務フロー ───────────────────────── */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
                  <GitBranch className="h-5 w-5 text-amber-600" />
                  ASIS業務フロー
                  <span className="text-sm font-normal text-muted-foreground">
                    （{asisFlows.length}）
                  </span>
                </h2>
                <p className="text-sm text-muted-foreground">
                  現状の業務フローを選んで開く / 新規作成する
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/dashboard/projects/${projectId}/flows`}>
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <Folder className="h-4 w-4" />
                    フォルダ
                  </Button>
                </Link>
                <Link href={`/dashboard/projects/${projectId}/flows/hierarchy`}>
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <FolderTree className="h-4 w-4" />
                    階層
                  </Button>
                </Link>
                <Button
                  size="sm"
                  onClick={() => setIsCreateOpen(true)}
                  className="gap-1.5 bg-amber-600 hover:bg-amber-700"
                >
                  <Plus className="h-4 w-4" />
                  ASISフロー作成
                </Button>
              </div>
            </div>

            {asisFlows.length === 0 ? (
              <Card className="border-dashed border-amber-200 bg-amber-50/40">
                <CardContent className="py-10 text-center">
                  <p className="text-sm text-muted-foreground">
                    ASIS業務フローはまだありません。「ASISフロー作成」から現状フローを追加しましょう。
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {asisFlows.map((flow) => {
                  const sp = subProjectName(flow.subProjectId);
                  const fd = folderName(flow.folderId);
                  return (
                    <button
                      key={flow.id}
                      type="button"
                      onClick={() => openFlow(flow.id)}
                      className="group flex w-full flex-col items-start gap-2 rounded-lg border border-gray-200 bg-white p-4 text-left transition-colors hover:border-amber-400 hover:bg-amber-50/40"
                    >
                      <div className="flex w-full items-start justify-between gap-2">
                        <span className="flex items-center gap-2 font-medium text-foreground">
                          <GitBranch className="h-4 w-4 shrink-0 text-amber-600" />
                          <span className="truncate">{flow.name}</span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-gray-300 group-hover:text-amber-600" />
                      </div>
                      {(sp || fd) && (
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          {fd && (
                            <span className="inline-flex items-center gap-1 rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5">
                              <Folder className="h-3 w-3" />
                              {fd}
                            </span>
                          )}
                          {sp && (
                            <span className="inline-flex items-center gap-1 rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5">
                              <Layers className="h-3 w-3" />
                              {sp}
                            </span>
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* ── Section: 現状のデータ・課題 ───────────────────── */}
          <section className="space-y-3">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
                <Database className="h-5 w-5 text-amber-600" />
                現状のデータ・課題
              </h2>
              <p className="text-sm text-muted-foreground">
                現状のデータカタログと、未解決の課題（GAP）を確認する
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Card className="bg-white">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between text-base">
                    <span className="flex items-center gap-2">
                      <Database className="h-4 w-4 text-amber-600" />
                      データカタログ
                    </span>
                    <Link
                      href={`/dashboard/projects/${projectId}/catalog`}
                      className="text-sm font-normal text-blue-600 hover:underline"
                    >
                      開く
                    </Link>
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  現状で扱っているマスタ・テーブル・項目を登録・参照します。
                </CardContent>
              </Card>

              <Card className="bg-white">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between text-base">
                    <span className="flex items-center gap-2">
                      <GitCompare className="h-4 w-4 text-amber-600" />
                      課題（GAP）
                      <span className="text-sm font-normal text-muted-foreground">
                        未解決 {openGapItems.length} 件
                      </span>
                    </span>
                    <Link
                      href={`/dashboard/projects/${projectId}/gap-items`}
                      className="text-sm font-normal text-blue-600 hover:underline"
                    >
                      開く
                    </Link>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {openGapItems.length === 0 ? (
                    <p className="px-6 pb-6 text-sm text-muted-foreground">
                      未解決の課題はありません。
                    </p>
                  ) : (
                    <ul className="divide-y divide-gray-100">
                      {openGapItems.slice(0, 5).map((g) => (
                        <li
                          key={g.id}
                          className="flex items-start gap-2 px-6 py-2 text-sm"
                        >
                          <span
                            className={`mt-0.5 shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold ${priorityBadge[g.priority]}`}
                          >
                            {g.priority}
                          </span>
                          <span className="min-w-0">
                            <span className="font-medium text-foreground">
                              {g.businessArea || '（業務領域未設定）'}
                            </span>
                            {g.gapDescription && (
                              <span className="block truncate text-muted-foreground">
                                {g.gapDescription}
                              </span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>
          </section>

          {/* ── Section: 現状メモ（状態） ─────────────────────── */}
          <section className="space-y-3">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
                <ClipboardList className="h-5 w-5 text-amber-600" />
                現状メモ（状態）
              </h2>
              <p className="text-sm text-muted-foreground">
                項目ごとに現状・課題・痛み・制約を自由に書き留めます
              </p>
            </div>
            <EditableMemoBoard<AsisMemo, AsisMemoInput>
              projectId={projectId}
              api={asisMemoApi}
              entityLabel="現状メモ"
              columns={[
                { key: 'topic', label: '項目', kind: 'text' },
                { key: 'currentState', label: '現状', kind: 'multiline' },
                { key: 'pain', label: '課題・痛み', kind: 'multiline' },
                { key: 'restriction', label: '制約', kind: 'multiline' },
                { key: 'note', label: 'メモ', kind: 'multiline' },
              ]}
            />
          </section>
        </>
      )}

      {/* ── ASISフロー作成ダイアログ ─────────────────────── */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="bg-white text-gray-900">
          <DialogHeader>
            <DialogTitle>ASISフローを作成</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="asis-flow-name">フロー名</Label>
              <Input
                id="asis-flow-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="例: 仕入先発注（現状）"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate();
                }}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="asis-flow-desc">説明（任意）</Label>
              <Input
                id="asis-flow-desc"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="このフローの概要"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsCreateOpen(false)}
              disabled={creating}
            >
              キャンセル
            </Button>
            <Button
              onClick={handleCreate}
              disabled={creating || !newName.trim()}
              className="gap-1.5 bg-amber-600 hover:bg-amber-700"
            >
              {creating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              作成して開く
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
