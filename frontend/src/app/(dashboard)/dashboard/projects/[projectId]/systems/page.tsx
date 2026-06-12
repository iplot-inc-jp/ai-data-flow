'use client';

/**
 * システム（System）管理ページ。
 *
 * プロジェクトのシステムを CRUD する。各行は
 * - name（インライン編集 / onBlur 保存）
 * - kind（周辺システム=PERIPHERAL / 対象システム=TARGET の select、アイコン色で区別）
 * - description（インライン編集 / onBlur 保存）
 * - 領域(subProjectId)（任意。領域一覧から select）
 *
 * 作成は上部フォーム（name + kind）。
 */

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Loader2, Plus, Trash2, Server, Box } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { HowToPanel } from '@/components/ui/how-to-panel';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  systemApi,
  subProjectApi,
  type SystemMaster,
  type SystemKind,
  type SubProjectMaster,
} from '@/lib/masters';
import { SubProjectPicker } from '@/components/ui/sub-project-picker';
import {
  adoptionApi,
  listStakeholders,
  normalizeAdoptionStage,
} from '@/lib/stakeholders';

/** 導入サマリ集計（全ステークホルダー数 + システム別の定着+本稼働 人数）。 */
interface AdoptionAggregate {
  total: number;
  liveBySystem: Map<string, number>;
}

/** TARGET 行に出す導入サマリ（定着+本稼働 n / 全 m 人）。 */
interface AdoptionSummary {
  adopted: number;
  total: number;
}

/** kind の表示ラベル。 */
const KIND_LABELS: Record<SystemKind, string> = {
  PERIPHERAL: '周辺システム',
  TARGET: '対象システム',
};

const KIND_OPTIONS: { value: SystemKind; label: string }[] = [
  { value: 'TARGET', label: KIND_LABELS.TARGET },
  { value: 'PERIPHERAL', label: KIND_LABELS.PERIPHERAL },
];

/** kind バッジ（対象=青のサーバ / 周辺=灰のボックス）。 */
function KindIcon({ kind }: { kind: SystemKind }) {
  return kind === 'TARGET' ? (
    <Server className="h-4 w-4 shrink-0 text-blue-600" />
  ) : (
    <Box className="h-4 w-4 shrink-0 text-gray-400" />
  );
}

export default function SystemsPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const [systems, setSystems] = useState<SystemMaster[]>([]);
  const [subProjects, setSubProjects] = useState<SubProjectMaster[]>([]);
  // 導入サマリ（取得失敗時は null のまま = 非表示）
  const [adoptionAgg, setAdoptionAgg] = useState<AdoptionAggregate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 追加フォーム
  const [newName, setNewName] = useState('');
  const [newKind, setNewKind] = useState<SystemKind>('TARGET');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 領域 select 用に領域一覧も同時取得（取得失敗してもシステム一覧は出す）
      const [list, subs, agg] = await Promise.all([
        systemApi.list(projectId),
        subProjectApi.list(projectId).catch(() => [] as SubProjectMaster[]),
        // TARGET 行の導入サマリ用（定着+本稼働 n / 全 m 人）。取得失敗時は非表示。
        Promise.all([listStakeholders(projectId), adoptionApi.list(projectId)])
          .then(([stakeholders, adoptions]): AdoptionAggregate => {
            const liveBySystem = new Map<string, number>();
            for (const a of adoptions) {
              if (!a.systemId) continue;
              const stage = normalizeAdoptionStage(a.stage);
              if (stage === 'LIVE' || stage === 'ESTABLISHED') {
                liveBySystem.set(
                  a.systemId,
                  (liveBySystem.get(a.systemId) ?? 0) + 1,
                );
              }
            }
            return { total: stakeholders.length, liveBySystem };
          })
          .catch(() => null),
      ]);
      setSystems(list);
      setSubProjects(subs);
      setAdoptionAgg(agg);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = useCallback(async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    setError(null);
    try {
      await systemApi.create(projectId, { name, kind: newKind });
      setNewName('');
      setNewKind('TARGET');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setCreating(false);
    }
  }, [newName, newKind, projectId, load]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="システム"
        description="プロジェクトに登場するシステムを、対象システム／周辺システムに分けて管理します"
        help="システムは対象システム（今回作る・改修する側）と周辺システム（連携先）に分けて整理します。各システムは領域に紐づけられます。"
        backHref={`/dashboard/projects/${projectId}`}
        backLabel="プロジェクトへ戻る"
        actions={
          <HowToPanel
            steps={[
              '上のフォームに名前を入れ、種別（対象／周辺）を選んで追加します。',
              '各行の名前・説明をクリックして編集し、フォーカスを外すと保存されます。',
              '種別や所属領域は行内の select で切り替えるとすぐ保存されます。',
              'ゴミ箱アイコンで削除できます。',
            ]}
          />
        }
      />

      {/* 追加フォーム */}
      <Card className="p-4">
        <div className="flex items-center gap-2">
          <select
            value={newKind}
            onChange={(e) => setNewKind(e.target.value as SystemKind)}
            className="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
            title="種別"
          >
            {KIND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleCreate();
            }}
            placeholder="システム名（例：受注管理システム）"
            className="flex-1 rounded border border-gray-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          <Button size="sm" onClick={() => void handleCreate()} disabled={creating || !newName.trim()}>
            {creating ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}
            追加
          </Button>
        </div>

        {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
      </Card>

      {/* 一覧 */}
      <Card className="p-0">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
          </div>
        ) : systems.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-400">
            システムがありません。上のフォームから追加してください。
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {systems.map((s) => (
              <SystemRow
                key={s.id}
                system={s}
                subProjects={subProjects}
                adoption={
                  s.kind === 'TARGET' && adoptionAgg
                    ? {
                        adopted: adoptionAgg.liveBySystem.get(s.id) ?? 0,
                        total: adoptionAgg.total,
                      }
                    : null
                }
                onChanged={load}
              />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/** 1 行。名前・説明はインライン編集（onBlur 保存）、種別・領域は select で即保存。 */
function SystemRow({
  system,
  subProjects,
  adoption,
  onChanged,
}: {
  system: SystemMaster;
  subProjects: SubProjectMaster[];
  /** TARGET 行の導入サマリ（定着+本稼働 n / 全 m 人）。null は非表示。 */
  adoption: AdoptionSummary | null;
  onChanged: () => Promise<void> | void;
}) {
  const [name, setName] = useState(system.name);
  const [description, setDescription] = useState(system.description ?? '');
  const [busy, setBusy] = useState(false);

  // 親で再読込されると最新値に追従
  useEffect(() => {
    setName(system.name);
    setDescription(system.description ?? '');
  }, [system.name, system.description]);

  const runUpdate = useCallback(
    async (patch: Parameters<typeof systemApi.update>[1]) => {
      setBusy(true);
      try {
        await systemApi.update(system.id, patch);
        await onChanged();
      } finally {
        setBusy(false);
      }
    },
    [system.id, onChanged],
  );

  const handleSaveName = useCallback(async () => {
    const v = name.trim();
    if (!v || v === system.name) {
      setName(system.name);
      return;
    }
    await runUpdate({ name: v });
  }, [name, system.name, runUpdate]);

  const handleSaveDescription = useCallback(async () => {
    const v = description.trim();
    const original = system.description ?? '';
    if (v === original) return;
    await runUpdate({ description: v === '' ? null : v });
  }, [description, system.description, runUpdate]);

  const handleDelete = useCallback(async () => {
    if (!confirm(`システム「${system.name}」を削除しますか？`)) return;
    setBusy(true);
    try {
      await systemApi.delete(system.id);
      await onChanged();
    } finally {
      setBusy(false);
    }
  }, [system.id, system.name, onChanged]);

  return (
    <li className="px-3 py-2.5">
      <div className="flex items-center gap-2">
        <KindIcon kind={system.kind} />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => void handleSaveName()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') {
              setName(system.name);
              (e.target as HTMLInputElement).blur();
            }
          }}
          disabled={busy}
          className="flex-1 rounded border border-transparent px-2 py-1 text-sm font-medium text-gray-800 hover:border-gray-200 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-50"
        />

        {/* 導入サマリ（TARGET のみ。定着+本稼働 n / 全 m 人） */}
        {adoption && (
          <div
            className="flex shrink-0 items-center gap-1.5"
            title={`導入状況: 定着+本稼働 ${adoption.adopted} / 全 ${adoption.total} 人`}
          >
            <span className="whitespace-nowrap text-[11px] font-medium text-emerald-700">
              導入 {adoption.adopted}/{adoption.total} 人
            </span>
            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full bg-emerald-500"
                style={{
                  width: `${
                    adoption.total > 0
                      ? Math.round((adoption.adopted / adoption.total) * 100)
                      : 0
                  }%`,
                }}
              />
            </div>
          </div>
        )}

        {/* 種別（即保存） */}
        <select
          value={system.kind}
          onChange={(e) => void runUpdate({ kind: e.target.value as SystemKind })}
          disabled={busy}
          className="rounded border border-gray-300 bg-white px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-50"
          title="種別"
        >
          {KIND_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        {/* 所属領域（任意・即保存）。共通の領域ピッカー（ツリー＋検索）。クリアで '' → null 保存。 */}
        <SubProjectPicker
          subProjects={subProjects}
          value={system.subProjectId ?? ''}
          onChange={(v) => void runUpdate({ subProjectId: v === '' ? null : v })}
          disabled={busy}
          placeholder="領域を選択"
        />

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
      </div>

      {/* 説明（インライン編集） */}
      <div className="mt-1.5 pl-6">
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => void handleSaveDescription()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') {
              setDescription(system.description ?? '');
              (e.target as HTMLInputElement).blur();
            }
          }}
          disabled={busy}
          placeholder="説明（任意）"
          className="w-full rounded border border-transparent px-2 py-1 text-xs text-gray-600 hover:border-gray-200 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-50"
        />
      </div>
    </li>
  );
}
