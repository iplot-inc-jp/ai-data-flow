'use client';

/**
 * 業務フロー フォルダ画面。
 *
 * 業務フローを「フォルダ階層（FlowFolder：parentId で入れ子）」で整理・閲覧する。
 * - 左：フォルダツリー（クリックでそのフォルダへ移動。「未整理」はフォルダ未設定のフロー）。
 * - 上：パンくず（ルート → 現在のフォルダ）。
 * - 主：現在フォルダ直下の「子フォルダ」カードと「業務フロー」一覧。
 *   - フォルダカードをクリックで潜る。フロー行クリックで編集画面へ。
 *   - 編集権限があれば：フォルダ作成 / リネーム / 削除、フローの別フォルダへの移動。
 *
 * バックエンドは実装済み（lib/flow-folders.ts のラッパ経由）。raw fetch + accessToken。
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  ChevronRight,
  Folder,
  FolderOpen,
  FolderPlus,
  FolderTree,
  GitBranch,
  Home,
  Loader2,
  Pencil,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PageHeader } from '@/components/ui/page-header';
import { HowToPanel } from '@/components/ui/how-to-panel';
import { useToast } from '@/components/ui/use-toast';
import { useReadOnly } from '@/components/read-only-context';
import {
  flowFolderApi,
  buildFolderTree,
  folderBreadcrumb,
  childFolders,
  flowsInFolder,
  collectDescendantIds,
  type FlowFolder,
  type FlowFolderNode,
  type FolderFlow,
} from '@/lib/flow-folders';

// 「未整理（フォルダ未設定）」を表す select 値。
const UNFILED = '__unfiled__';

export default function FlowFoldersPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const { canEdit } = useReadOnly();
  const { toast } = useToast();

  const [folders, setFolders] = useState<FlowFolder[]>([]);
  const [flows, setFlows] = useState<FolderFlow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 現在開いているフォルダ（null = ルート）。
  const [currentId, setCurrentId] = useState<string | null>(null);

  // 作成フォーム
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  // リネーム中フォルダ
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [fol, fl] = await Promise.all([
        flowFolderApi.list(projectId),
        flowFolderApi.listFlows(projectId),
      ]);
      setFolders(fol);
      setFlows(fl);
    } catch (err) {
      setError(err instanceof Error ? err.message : '読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  // 現在のフォルダが削除等で消えていたらルートに戻す。
  useEffect(() => {
    if (currentId && !folders.some((f) => f.id === currentId)) {
      setCurrentId(null);
    }
  }, [folders, currentId]);

  const tree = useMemo<FlowFolderNode[]>(
    () => buildFolderTree(folders),
    [folders],
  );
  const breadcrumb = useMemo(
    () => folderBreadcrumb(folders, currentId),
    [folders, currentId],
  );
  const subFolders = useMemo(
    () => childFolders(folders, currentId),
    [folders, currentId],
  );
  const currentFlows = useMemo(
    () => flowsInFolder(flows, currentId),
    [flows, currentId],
  );

  // 各フォルダ直下のフロー件数（カードのバッジ用）。
  const flowCountByFolder = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of flows) {
      if (f.folderId) m.set(f.folderId, (m.get(f.folderId) ?? 0) + 1);
    }
    return m;
  }, [flows]);

  const unfiledCount = useMemo(
    () => flows.filter((f) => !f.folderId).length,
    [flows],
  );

  // 移動先 select 用：現在フローを移せるフォルダ（全フォルダ）。
  const allFoldersSorted = useMemo(
    () =>
      [...folders].sort(
        (a, b) => a.name.localeCompare(b.name, 'ja') || a.order - b.order,
      ),
    [folders],
  );

  // -------------------------------------------------------------------------
  // 操作
  // -------------------------------------------------------------------------

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name || !canEdit) return;
    setCreating(true);
    try {
      await flowFolderApi.create(projectId, { name, parentId: currentId });
      setNewName('');
      toast({ title: 'フォルダを作成しました' });
      await load();
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'フォルダの作成に失敗しました',
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setCreating(false);
    }
  };

  const beginRename = (folder: FlowFolder) => {
    setEditingId(folder.id);
    setEditingName(folder.name);
  };

  const commitRename = async () => {
    if (!editingId) return;
    const name = editingName.trim();
    const target = folders.find((f) => f.id === editingId);
    if (!name || !target || name === target.name) {
      setEditingId(null);
      return;
    }
    try {
      await flowFolderApi.rename(editingId, name);
      toast({ title: 'フォルダ名を変更しました' });
      await load();
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'フォルダ名の変更に失敗しました',
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setEditingId(null);
      setEditingName('');
    }
  };

  const handleDelete = async (folder: FlowFolder) => {
    if (!canEdit) return;
    const descendants = collectDescendantIds(folders, folder.id);
    const childCount = descendants.size - 1;
    const flowsAffected = flows.filter(
      (f) => f.folderId && descendants.has(f.folderId),
    ).length;
    const msg =
      `フォルダ「${folder.name}」を削除します。` +
      (childCount > 0 ? `\n子フォルダ ${childCount} 件も一緒に削除されます。` : '') +
      (flowsAffected > 0
        ? `\nこのフォルダ（配下含む）の業務フロー ${flowsAffected} 件は「未整理」に戻ります（フロー自体は削除されません）。`
        : '') +
      '\nよろしいですか？';
    if (!window.confirm(msg)) return;
    try {
      await flowFolderApi.remove(folder.id);
      if (descendants.has(currentId ?? '')) setCurrentId(folder.parentId);
      toast({ title: 'フォルダを削除しました' });
      await load();
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'フォルダの削除に失敗しました',
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  const handleMoveFlow = async (flowId: string, value: string) => {
    if (!canEdit) return;
    const folderId = value === UNFILED ? null : value;
    try {
      await flowFolderApi.moveFlow(flowId, folderId);
      toast({ title: 'フローを移動しました' });
      await load();
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'フローの移動に失敗しました',
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  // -------------------------------------------------------------------------
  // 描画
  // -------------------------------------------------------------------------

  const renderTreeNode = (node: FlowFolderNode) => {
    const isCurrent = node.folder.id === currentId;
    const count = flowCountByFolder.get(node.folder.id) ?? 0;
    return (
      <div key={node.folder.id}>
        <button
          type="button"
          onClick={() => setCurrentId(node.folder.id)}
          className={`flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-sm transition-colors ${
            isCurrent
              ? 'bg-blue-50 font-medium text-blue-700'
              : 'text-gray-700 hover:bg-gray-50'
          }`}
          style={{ paddingLeft: `${node.depth * 16 + 8}px` }}
        >
          {isCurrent ? (
            <FolderOpen className="h-4 w-4 shrink-0 text-blue-500" />
          ) : (
            <Folder className="h-4 w-4 shrink-0 text-gray-400" />
          )}
          <span className="truncate">{node.folder.name}</span>
          {count > 0 && (
            <span className="ml-auto rounded-full bg-gray-100 px-1.5 text-xs text-gray-500">
              {count}
            </span>
          )}
        </button>
        {node.children.map((child) => renderTreeNode(child))}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-gray-400">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        読み込み中…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <FolderTree className="h-5 w-5 text-blue-600" />
            業務フロー（フォルダ）
          </span>
        }
        description="業務フローをフォルダ階層で整理します。フォルダをクリックして潜り、フローを別フォルダへ移動できます。"
        help="フォルダは parentId で入れ子にできます。左のツリーまたはカードをクリックしてフォルダへ移動し、フロー行の「フォルダ」セレクトで所属フォルダを変更します。フォルダを削除しても業務フロー自体は消えず「未整理」に戻ります。"
        backHref={`/dashboard/projects/${projectId}/flows`}
        backLabel="業務フロー一覧へ戻る"
        actions={
          <HowToPanel
            title="フォルダ画面の使い方"
            steps={[
              '左のツリー、または中央の📁カードをクリックすると、そのフォルダへ潜れます。上部のパンくずで親へ戻れます。',
              '編集権限があれば、上の入力欄に名前を入れて「フォルダ作成」で現在のフォルダ直下に作成できます。',
              'フォルダカードの鉛筆でリネーム、ゴミ箱で削除します（子フォルダも削除、配下のフローは未整理に戻ります）。',
              'フロー行の「フォルダ」セレクトで、そのフローを別フォルダ（または未整理）へ移動できます。',
              'フロー名をクリックすると、その業務フローの編集画面を開きます。',
            ]}
          />
        }
      />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
        {/* 左：フォルダツリー */}
        <Card className="h-fit p-2">
          <button
            type="button"
            onClick={() => setCurrentId(null)}
            className={`flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-sm transition-colors ${
              currentId === null
                ? 'bg-blue-50 font-medium text-blue-700'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Home className="h-4 w-4 shrink-0 text-gray-400" />
            <span>すべて（ルート）</span>
          </button>
          {tree.map((node) => renderTreeNode(node))}
          {/* 未整理（フォルダ未設定）はツリー上の擬似項目として常に最後に */}
          {unfiledCount > 0 && (
            <div className="mt-1 border-t border-gray-100 px-2 pt-1.5 text-xs text-gray-400">
              未整理のフロー {unfiledCount} 件はルート直下に表示されます
            </div>
          )}
        </Card>

        {/* 右：パンくず + 作成 + 子フォルダ + フロー */}
        <div className="space-y-4">
          {/* パンくず */}
          <div className="flex flex-wrap items-center gap-1 text-sm text-gray-600">
            <button
              type="button"
              onClick={() => setCurrentId(null)}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-gray-100"
            >
              <Home className="h-3.5 w-3.5" />
              ルート
            </button>
            {breadcrumb.map((f) => (
              <span key={f.id} className="inline-flex items-center gap-1">
                <ChevronRight className="h-3.5 w-3.5 text-gray-300" />
                <button
                  type="button"
                  onClick={() => setCurrentId(f.id)}
                  className="rounded px-1.5 py-0.5 hover:bg-gray-100"
                >
                  {f.name}
                </button>
              </span>
            ))}
          </div>

          {/* 作成フォーム（編集権限時のみ） */}
          {canEdit && (
            <Card className="flex flex-wrap items-center gap-2 p-3">
              <FolderPlus className="h-4 w-4 shrink-0 text-blue-600" />
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleCreate();
                }}
                placeholder={
                  currentId
                    ? `「${breadcrumb[breadcrumb.length - 1]?.name ?? ''}」の中に新しいフォルダ名…`
                    : 'ルート直下に新しいフォルダ名…'
                }
                className="h-9 max-w-xs flex-1"
              />
              <Button
                size="sm"
                onClick={() => void handleCreate()}
                disabled={creating || !newName.trim()}
              >
                {creating ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <FolderPlus className="mr-1 h-4 w-4" />
                )}
                フォルダ作成
              </Button>
            </Card>
          )}

          {/* 子フォルダ カード一覧 */}
          {subFolders.length > 0 && (
            <div>
              <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
                フォルダ
              </h2>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {subFolders.map((folder) => {
                  const count = flowCountByFolder.get(folder.id) ?? 0;
                  const isEditing = editingId === folder.id;
                  return (
                    <Card
                      key={folder.id}
                      className="group flex items-center gap-2 p-3 transition-colors hover:border-blue-300"
                    >
                      {isEditing ? (
                        <>
                          <Folder className="h-5 w-5 shrink-0 text-blue-500" />
                          <Input
                            autoFocus
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onBlur={() => void commitRename()}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') void commitRename();
                              if (e.key === 'Escape') {
                                setEditingId(null);
                                setEditingName('');
                              }
                            }}
                            className="h-8"
                          />
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => setCurrentId(folder.id)}
                            className="flex min-w-0 flex-1 items-center gap-2 text-left"
                          >
                            <Folder className="h-5 w-5 shrink-0 text-blue-500" />
                            <span className="truncate text-sm font-medium text-gray-800">
                              {folder.name}
                            </span>
                            <span className="ml-auto rounded-full bg-gray-100 px-2 text-xs text-gray-500">
                              {count}
                            </span>
                          </button>
                          {canEdit && (
                            <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                              <button
                                type="button"
                                onClick={() => beginRename(folder)}
                                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                                title="名前を変更"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDelete(folder)}
                                className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                                title="削除"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {/* このフォルダ直下のフロー一覧 */}
          <div>
            <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
              {currentId ? 'このフォルダの業務フロー' : '未整理の業務フロー'}
            </h2>
            {currentFlows.length === 0 ? (
              <Card className="p-6 text-center text-sm text-gray-400">
                {subFolders.length > 0
                  ? 'このフォルダに直接属する業務フローはありません（サブフォルダを開いてください）。'
                  : 'このフォルダに業務フローはありません。'}
              </Card>
            ) : (
              <Card className="divide-y divide-gray-100">
                {currentFlows.map((flow) => (
                  <div
                    key={flow.id}
                    className="flex flex-wrap items-center gap-2 px-3 py-2.5"
                  >
                    <GitBranch className="h-4 w-4 shrink-0 text-gray-400" />
                    <Link
                      href={`/dashboard/projects/${projectId}/flows/${flow.id}`}
                      className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800 hover:text-blue-600 hover:underline"
                    >
                      {flow.name}
                    </Link>
                    {flow.kind && (
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs ${
                          flow.kind === 'TOBE'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {flow.kind}
                      </span>
                    )}
                    {/* 所属フォルダの変更 */}
                    <Select
                      value={flow.folderId ?? UNFILED}
                      onValueChange={(v) => void handleMoveFlow(flow.id, v)}
                      disabled={!canEdit}
                    >
                      <SelectTrigger className="h-8 w-44 text-xs">
                        <SelectValue placeholder="フォルダ" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={UNFILED}>未整理（フォルダなし）</SelectItem>
                        {allFoldersSorted.map((f) => (
                          <SelectItem key={f.id} value={f.id}>
                            {f.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </Card>
            )}
          </div>

          {folders.length === 0 && (
            <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-400">
              まだフォルダがありません。
              {canEdit
                ? '上の入力欄からフォルダを作成して、業務フローを整理しましょう。'
                : '編集権限のあるメンバーがフォルダを作成できます。'}
              <div className="mt-2">
                <Link href={`/dashboard/projects/${projectId}/flows`}>
                  <Button variant="outline" size="sm">
                    <ArrowLeft className="mr-1 h-4 w-4" />
                    業務フロー一覧へ
                  </Button>
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
