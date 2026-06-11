'use client';

/**
 * 領域（SubProject）管理ページ。
 *
 * 領域は ASIS/TOBE/課題で共有する分類軸。parentId==null を「領域」、
 * parentId を持つものを「サブ領域」として、親の下にインデント表示する
 * （業務定義シートの toTreeOrder と同様の親子並べ）。
 *
 * - 領域の作成（name）
 * - サブ領域の作成（name + 親領域 select）
 * - name のインライン編集（onBlur 保存）
 * - 削除
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Loader2, Plus, Trash2, FolderTree, CornerDownRight, GitBranch } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { HowToPanel } from '@/components/ui/how-to-panel';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { subProjectApi, type SubProjectMaster } from '@/lib/masters';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5021';

/** 領域配下に並べる業務フロー（一覧表示に必要な最小限）。 */
type FlowLite = {
  id: string;
  name: string;
  kind?: 'ASIS' | 'TOBE';
  subProjectId?: string | null;
};

/** localStorage の accessToken を載せた fetch 用ヘッダ（既存ページの作法に合わせる）。 */
function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

/**
 * 親子（parentId 自己参照）でツリー化し、親→その子 の順に並べ替える。
 * ルートは parentId==null、または親が一覧に存在しないもの（孤児はルート扱い）。
 * 兄弟間は元の並び（order→createdAt 昇順）を保つ。循環は訪問済みセットで防ぐ。
 * 返り値は各行に depth（0=領域, 1=サブ領域）を付与する。
 */
function toTreeOrder(rows: SubProjectMaster[]): { row: SubProjectMaster; depth: number }[] {
  const byId = new Map<string, SubProjectMaster>(rows.map((r) => [r.id, r]));
  const childrenOf = new Map<string, SubProjectMaster[]>();
  const roots: SubProjectMaster[] = [];

  for (const r of rows) {
    const isRoot = r.parentId == null || !byId.has(r.parentId);
    if (isRoot) {
      roots.push(r);
    } else {
      const list = childrenOf.get(r.parentId!) ?? [];
      list.push(r);
      childrenOf.set(r.parentId!, list);
    }
  }

  const ordered: { row: SubProjectMaster; depth: number }[] = [];
  const visited = new Set<string>();
  const walk = (node: SubProjectMaster, depth: number) => {
    if (visited.has(node.id)) return; // 循環防止
    visited.add(node.id);
    ordered.push({ row: node, depth });
    for (const child of childrenOf.get(node.id) ?? []) walk(child, depth + 1);
  };
  for (const root of roots) walk(root, 0);
  // 取りこぼし（循環の輪に含まれて未訪問のもの）は末尾に救済
  for (const r of rows) if (!visited.has(r.id)) ordered.push({ row: r, depth: 0 });

  return ordered;
}

export default function DomainsPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const [items, setItems] = useState<SubProjectMaster[]>([]);
  // 各領域配下に表示する業務フロー（取得失敗時は空配列のまま＝領域一覧は動く）
  const [flows, setFlows] = useState<FlowLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 領域 追加フォーム
  const [newDomainName, setNewDomainName] = useState('');
  // サブ領域 追加フォーム
  const [newSubName, setNewSubName] = useState('');
  const [newSubParentId, setNewSubParentId] = useState('');
  const [creating, setCreating] = useState(false);

  // 業務フローを取得（ルートフローのみ）。
  // ノードのドリルダウンで作られる子フロー（parentId != null の sub-flow）は対象外。
  // 業務フロー一覧ページ flows/page.tsx と同じ /project/:projectId（findRootFlowsByProjectId）を使う。
  // 失敗しても領域一覧は壊さないよう catch で空配列。
  const loadFlows = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/business-flows/project/${projectId}`, {
        headers: authHeaders(),
      });
      if (!res.ok) {
        setFlows([]);
        return;
      }
      const data = await res.json();
      setFlows(Array.isArray(data) ? data : []);
    } catch {
      setFlows([]);
    }
  }, [projectId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 領域一覧とフロー一覧を並行取得（フロー取得失敗は loadFlows 内で握りつぶす）
      const [subProjects] = await Promise.all([subProjectApi.list(projectId), loadFlows()]);
      setItems(subProjects);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [projectId, loadFlows]);

  useEffect(() => {
    void load();
  }, [load]);

  // 領域（parentId==null）一覧。サブ領域の親 select に使う。
  const domains = items.filter((i) => i.parentId == null);

  const handleCreateDomain = useCallback(async () => {
    const name = newDomainName.trim();
    if (!name) return;
    setCreating(true);
    setError(null);
    try {
      await subProjectApi.create(projectId, { name });
      setNewDomainName('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setCreating(false);
    }
  }, [newDomainName, projectId, load]);

  const handleCreateSub = useCallback(async () => {
    const name = newSubName.trim();
    if (!name || !newSubParentId) return;
    setCreating(true);
    setError(null);
    try {
      await subProjectApi.create(projectId, { name, parentId: newSubParentId });
      setNewSubName('');
      // 親はそのまま残す（連続でサブ領域を追加しやすい）
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setCreating(false);
    }
  }, [newSubName, newSubParentId, projectId, load]);

  const treeRows = toTreeOrder(items);

  // 業務フローを subProjectId ごとに振り分け。存在しない/未割当の領域IDは「未分類」へ。
  const validSubProjectIds = new Set(items.map((i) => i.id));
  const flowsBySubProject = new Map<string, FlowLite[]>();
  const unassignedFlows: FlowLite[] = [];
  for (const flow of flows) {
    const sid =
      flow.subProjectId && validSubProjectIds.has(flow.subProjectId) ? flow.subProjectId : null;
    if (sid === null) {
      unassignedFlows.push(flow);
    } else {
      const list = flowsBySubProject.get(sid) ?? [];
      list.push(flow);
      flowsBySubProject.set(sid, list);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="領域"
        description="領域は ASIS/TOBE/課題で共有する分類軸。領域の下にサブ領域を作れます。"
        help="領域は ASIS/TOBE/課題で共有する分類軸です。領域の下にサブ領域を作って入れ子に整理できます。"
        backHref={`/dashboard/projects/${projectId}`}
        backLabel="プロジェクトへ戻る"
        actions={
          <HowToPanel
            steps={[
              '「領域を追加」フォームに名前を入れて追加します（最上位の分類軸）。',
              '「サブ領域を追加」で名前を入れ、親領域を選んで追加します（領域の下に入れ子表示）。',
              '各行の名前をクリックして編集し、フォーカスを外すと保存されます。',
              'ゴミ箱アイコンで削除できます（サブ領域を持つ領域は先にサブ領域を削除してください）。',
            ]}
          />
        }
      />

      {/* 追加フォーム */}
      <Card className="p-4">
        <div className="space-y-3">
          {/* 領域の追加 */}
          <div className="flex items-center gap-2">
            <FolderTree className="h-4 w-4 shrink-0 text-indigo-600" />
            <input
              value={newDomainName}
              onChange={(e) => setNewDomainName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleCreateDomain();
              }}
              placeholder="領域名（例：受注・出荷）"
              className="flex-1 rounded border border-gray-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
            <Button size="sm" onClick={() => void handleCreateDomain()} disabled={creating || !newDomainName.trim()}>
              {creating ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}
              領域を追加
            </Button>
          </div>

          {/* サブ領域の追加 */}
          <div className="flex items-center gap-2">
            <CornerDownRight className="h-4 w-4 shrink-0 text-gray-400" />
            <select
              value={newSubParentId}
              onChange={(e) => setNewSubParentId(e.target.value)}
              className="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
              title="親領域"
            >
              <option value="">親領域を選択…</option>
              {domains.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <input
              value={newSubName}
              onChange={(e) => setNewSubName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleCreateSub();
              }}
              placeholder="サブ領域名（例：与信確認）"
              className="flex-1 rounded border border-gray-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleCreateSub()}
              disabled={creating || !newSubName.trim() || !newSubParentId}
            >
              {creating ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}
              サブ領域を追加
            </Button>
          </div>
        </div>

        {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
      </Card>

      {/* 一覧（親子インデント） */}
      <Card className="p-0">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
          </div>
        ) : items.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-400">
            領域がありません。上のフォームから領域を追加してください。
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {treeRows.map(({ row, depth }) => (
              <DomainRow
                key={row.id}
                item={row}
                depth={depth}
                projectId={projectId}
                flows={flowsBySubProject.get(row.id) ?? []}
                onChanged={load}
              />
            ))}
          </ul>
        )}
      </Card>

      {/* 未分類（どの領域にも属さない業務フロー） */}
      {!loading && unassignedFlows.length > 0 && (
        <Card className="p-0">
          <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2">
            <GitBranch className="h-4 w-4 shrink-0 text-gray-400" />
            <span className="text-sm font-medium text-gray-600">未分類</span>
            <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
              {unassignedFlows.length}
            </span>
            <span className="ml-1 text-xs text-gray-400">
              （どの領域にも属していない業務フロー）
            </span>
          </div>
          <FlowList projectId={projectId} flows={unassignedFlows} />
        </Card>
      )}
    </div>
  );
}

/**
 * 領域配下の業務フローを小さくリスト表示する。
 * ASIS/TOBE バッジ＋フロー名で、クリックでフロー編集ページへ遷移する。
 */
function FlowList({ projectId, flows }: { projectId: string; flows: FlowLite[] }) {
  return (
    <ul className="divide-y divide-gray-50">
      {flows.map((flow) => {
        const kind = flow.kind ?? 'ASIS';
        return (
          <li key={flow.id}>
            <Link
              href={`/dashboard/projects/${projectId}/flows/${flow.id}`}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50"
              title={flow.name}
            >
              <GitBranch className="h-3.5 w-3.5 shrink-0 text-cyan-600" />
              <span
                className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                  kind === 'TOBE'
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-blue-100 text-blue-700'
                }`}
              >
                {kind}
              </span>
              <span className="truncate text-sm text-gray-700">{flow.name}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * 1 行（領域 or サブ領域）。名前のインライン編集（onBlur 保存）＋削除。
 * 行の下に、その領域に属する業務フローを小さくリスト表示する（クリックで開ける）。
 */
function DomainRow({
  item,
  depth,
  projectId,
  flows,
  onChanged,
}: {
  item: SubProjectMaster;
  depth: number;
  projectId: string;
  flows: FlowLite[];
  onChanged: () => Promise<void> | void;
}) {
  const [name, setName] = useState(item.name);
  const [busy, setBusy] = useState(false);

  // 親側で再読込されると最新値に追従する
  useEffect(() => {
    setName(item.name);
  }, [item.name]);

  const handleSaveName = useCallback(async () => {
    const v = name.trim();
    if (!v || v === item.name) {
      setName(item.name); // 空 or 無変更は元に戻す
      return;
    }
    setBusy(true);
    try {
      await subProjectApi.update(item.id, { name: v });
      await onChanged();
    } catch {
      setName(item.name); // 失敗時は元に戻す
    } finally {
      setBusy(false);
    }
  }, [name, item.id, item.name, onChanged]);

  const handleDelete = useCallback(async () => {
    const label = depth === 0 ? '領域' : 'サブ領域';
    if (!confirm(`${label}「${item.name}」を削除しますか？`)) return;
    setBusy(true);
    try {
      await subProjectApi.delete(item.id);
      await onChanged();
    } finally {
      setBusy(false);
    }
  }, [item.id, item.name, depth, onChanged]);

  const isSub = depth > 0;
  // この領域に属するフローの先頭位置（フロー一覧のインデントは行の名前に揃える）
  const flowIndent = 12 + depth * 24 + 24;

  return (
    <>
      <li
        className="flex items-center gap-2 px-3 py-2"
        style={{ paddingLeft: `${12 + depth * 24}px` }}
      >
        {isSub ? (
          <CornerDownRight className="h-4 w-4 shrink-0 text-gray-400" />
        ) : (
          <FolderTree className="h-4 w-4 shrink-0 text-indigo-600" />
        )}
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => void handleSaveName()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') {
              setName(item.name);
              (e.target as HTMLInputElement).blur();
            }
          }}
          disabled={busy}
          className={`flex-1 rounded border border-transparent px-2 py-1 text-sm hover:border-gray-200 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-50 ${
            isSub ? 'text-gray-700' : 'font-medium text-gray-800'
          }`}
        />
        {/* フロー件数バッジ（0 件のときは出さない） */}
        {flows.length > 0 && (
          <span
            className="shrink-0 rounded-full bg-cyan-50 px-1.5 py-0.5 text-[10px] font-medium text-cyan-700"
            title={`この領域の業務フロー ${flows.length} 件`}
          >
            フロー {flows.length}
          </span>
        )}
        {busy && <Loader2 className="h-4 w-4 animate-spin text-blue-600" />}
        <button
          type="button"
          onClick={() => void handleDelete()}
          disabled={busy}
          className="text-gray-400 hover:text-red-600 disabled:opacity-40"
          title="削除"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </li>

      {/* この領域に属する業務フロー（クリックで開ける）
          親 ul の divide-y による上罫線を border-t-0 で消し、領域行と一体に見せる。 */}
      {flows.length > 0 && (
        <li className="border-t-0 bg-gray-50/50 pb-1" style={{ paddingLeft: `${flowIndent}px` }}>
          <FlowList projectId={projectId} flows={flows} />
        </li>
      )}
    </>
  );
}
