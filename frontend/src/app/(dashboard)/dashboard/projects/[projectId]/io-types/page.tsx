'use client';

/**
 * INPUT/OUTPUT 管理ページ。
 *
 * 業務フローや DFD の INPUT/OUTPUT で扱う「物体・情報・帳票」のマスタ
 * （InformationType）を一覧・作成・インライン編集・削除する。
 * 各 INPUT/OUTPUT には、データカタログの表（Table）を informationTypeId で
 * 紐づけられる（紐付け操作はカタログ側で行う。ここでは読み取り表示）。
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  Loader2,
  Plus,
  Trash2,
  Table2,
  ArrowRightLeft,
  ChevronDown,
  ChevronRight,
  Paperclip,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { HowToPanel } from '@/components/ui/how-to-panel';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EditGate } from '@/components/edit-gate';
import { useReadOnly } from '@/components/read-only-context';
import { FeatureSectionIo } from '@/components/io/FeatureSectionIo';
import {
  informationTypeApi,
  INFORMATION_CATEGORY_LABELS,
  INFORMATION_CATEGORY_OPTIONS,
  type InformationType,
  type InformationCategory,
} from '@/lib/dfd';
import { IoAttachmentsPanel } from './_components/IoAttachmentsPanel';
import { subProjectApi, type SubProjectMaster } from '@/lib/masters';
import { SubProjectPicker } from '@/components/ui/sub-project-picker';
import { tablesApi, type Table } from '@/lib/api';

/** 分類バッジ（情報/物体/帳票）。InformationTypeRegistry と同じ配色。 */
function CategoryBadge({ category }: { category: InformationCategory }) {
  const styles: Record<InformationCategory, string> = {
    INFORMATION: 'border-blue-200 bg-blue-50 text-blue-700',
    OBJECT: 'border-amber-200 bg-amber-50 text-amber-700',
    DOCUMENT: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  };
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${styles[category]}`}
    >
      {INFORMATION_CATEGORY_LABELS[category]}
    </span>
  );
}

export default function IoTypesPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const { canEdit } = useReadOnly();

  const [ioTypes, setIoTypes] = useState<InformationType[]>([]);
  const [subProjects, setSubProjects] = useState<SubProjectMaster[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState<InformationCategory>('INFORMATION');
  const [creating, setCreating] = useState(false);

  // 具体データ（添付）アコーディオンの展開状態。複数行を同時に開ける。
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // プロジェクト内で観測した添付フォルダ名（専用マスタは持たず既存値から候補を構成）。
  // 各行の添付一覧取得・フォルダ作成のたびにマージされる。
  const [knownFolders, setKnownFolders] = useState<Set<string>>(new Set());
  const reportFolders = useCallback((names: string[]) => {
    setKnownFolders((prev) => {
      const fresh = names.filter((n) => n && !prev.has(n));
      if (fresh.length === 0) return prev;
      const next = new Set(prev);
      for (const n of fresh) next.add(n);
      return next;
    });
  }, []);
  const folderCandidates = useMemo(
    () => Array.from(knownFolders).sort((a, b) => a.localeCompare(b, 'ja')),
    [knownFolders],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 領域・カタログ表は補助情報なので失敗しても本体（INPUT/OUTPUT）は表示する
      const [list, subs, tbls] = await Promise.all([
        informationTypeApi.list(projectId),
        subProjectApi.list(projectId).catch(() => [] as SubProjectMaster[]),
        tablesApi.list(projectId).catch(() => [] as Table[]),
      ]);
      setIoTypes(list);
      setSubProjects(subs);
      setTables(tbls);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  /** informationTypeId → 紐づくカタログ表（チップ表示用）。 */
  const tablesByIoType = useMemo(() => {
    const map = new Map<string, Table[]>();
    for (const t of tables) {
      if (!t.informationTypeId) continue;
      const arr = map.get(t.informationTypeId) ?? [];
      arr.push(t);
      map.set(t.informationTypeId, arr);
    }
    return map;
  }, [tables]);

  const handleCreate = useCallback(async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    setError(null);
    try {
      await informationTypeApi.create(projectId, { name, category: newCategory });
      setNewName('');
      setNewCategory('INFORMATION');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setCreating(false);
    }
  }, [newName, newCategory, projectId, load]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="INPUT/OUTPUT"
        description="業務フローやDFDの INPUT/OUTPUT で扱う物体・情報・帳票のマスタ。データカタログの表をここに紐づけられます。"
        help="INPUT/OUTPUT を追加し、分類（情報/物体/帳票）・説明・領域をインライン編集します。カタログ表との紐付けは「データカタログ」ページで行います。"
        backHref={`/dashboard/projects/${projectId}`}
        backLabel="プロジェクトへ戻る"
        actions={
          <>
            <HowToPanel
              steps={[
                '下の追加フォームに名前を入力し、分類（情報／物体／帳票）を選んで「追加」します。',
                '各行はクリックではなくフォーカスを外す（onBlur）と自動保存されます。名前・説明・分類・領域を編集できます。',
                '行末のゴミ箱で削除します（紐づく具体帳票も削除されます）。',
                '「紐づくカタログ表」は読み取り表示です。紐付けは「データカタログ」ページの各表で設定します。',
                '行頭の「>」（📎件数）をクリックすると展開し、具体データ（PDF・画像）をアップロード・閲覧・削除できます。',
                '具体データはフォルダごとに整理できます。鉛筆アイコンで表示名を編集、select でフォルダ移動（「＋ 新しいフォルダ…」で新規作成）、アップロード時も振り分け先フォルダを指定できます。',
              ]}
            />
            <FeatureSectionIo
              projectId={projectId}
              sectionKey="informationTypes"
              label="情報種別"
              canEdit={canEdit}
              onDone={() => void load()}
            />
          </>
        }
      />

      <Card className="bg-white">
        {/* 見出し */}
        <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-2.5">
          <ArrowRightLeft className="h-4 w-4 text-emerald-600" />
          <h2 className="text-sm font-semibold text-gray-800">INPUT/OUTPUT 一覧</h2>
          <span className="text-xs text-gray-400">
            業務フロー・DFD が参照する物体・情報・帳票のマスタ
          </span>
        </div>

        <div className="space-y-3 p-4">
          {/* 追加フォーム（name + category）（閲覧専用時は無効化） */}
          <EditGate>
          <div className="flex items-center gap-2">
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value as InformationCategory)}
              className="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
              title="分類"
            >
              {INFORMATION_CATEGORY_OPTIONS.map((o) => (
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
              placeholder="INPUT/OUTPUT 名（例：受注書、在庫データ、出荷品）"
              className="flex-1 rounded border border-gray-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
            <Button size="sm" onClick={() => void handleCreate()} disabled={creating || !newName.trim()}>
              {creating ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-1 h-4 w-4" />
              )}
              追加
            </Button>
          </div>
          </EditGate>

          {error && <p className="text-xs text-red-600">{error}</p>}

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
            </div>
          ) : ioTypes.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">
              INPUT/OUTPUT がありません。上のフォームから追加してください。
            </p>
          ) : (
            <ul className="divide-y divide-gray-100 rounded border border-gray-100">
              {ioTypes.map((it) => (
                <IoTypeRow
                  key={it.id}
                  ioType={it}
                  subProjects={subProjects}
                  linkedTables={tablesByIoType.get(it.id) ?? []}
                  expanded={expandedIds.has(it.id)}
                  onToggle={() => toggleExpanded(it.id)}
                  onChanged={load}
                  folderCandidates={folderCandidates}
                  onFoldersSeen={reportFolders}
                />
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}

function IoTypeRow({
  ioType,
  subProjects,
  linkedTables,
  expanded,
  onToggle,
  onChanged,
  folderCandidates,
  onFoldersSeen,
}: {
  ioType: InformationType;
  subProjects: SubProjectMaster[];
  linkedTables: Table[];
  expanded: boolean;
  onToggle: () => void;
  onChanged: () => Promise<void> | void;
  folderCandidates: string[];
  onFoldersSeen: (folders: string[]) => void;
}) {
  const [name, setName] = useState(ioType.name);
  const [category, setCategory] = useState<InformationCategory>(ioType.category);
  const [description, setDescription] = useState(ioType.description ?? '');
  const [subProjectId, setSubProjectId] = useState<string | null>(ioType.subProjectId);
  const [busy, setBusy] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);

  // 具体データ（添付）の件数バッジ。attachmentCount を初期値に、パネル取得後は実件数で更新。
  const [attachmentCount, setAttachmentCount] = useState(ioType.attachmentCount);

  // 親から最新値が来たら表示を同期（再読込後など）
  useEffect(() => {
    setName(ioType.name);
    setCategory(ioType.category);
    setDescription(ioType.description ?? '');
    setSubProjectId(ioType.subProjectId);
  }, [ioType.name, ioType.category, ioType.description, ioType.subProjectId]);

  useEffect(() => {
    setAttachmentCount(ioType.attachmentCount);
  }, [ioType.attachmentCount]);

  /** 指定パッチで保存。変更が無ければ何もしない。 */
  const save = useCallback(
    async (patch: { name?: string; category?: InformationCategory; description?: string | null; subProjectId?: string | null }) => {
      setBusy(true);
      setRowError(null);
      try {
        await informationTypeApi.update(ioType.id, patch);
        await onChanged();
      } catch (err) {
        setRowError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setBusy(false);
      }
    },
    [ioType.id, onChanged],
  );

  const handleNameBlur = useCallback(() => {
    const v = name.trim();
    if (!v) {
      setName(ioType.name); // 空は元に戻す
      return;
    }
    if (v !== ioType.name) void save({ name: v });
  }, [name, ioType.name, save]);

  const handleDescriptionBlur = useCallback(() => {
    const v = description.trim();
    const current = ioType.description ?? '';
    if (v !== current) void save({ description: v || null });
  }, [description, ioType.description, save]);

  const handleCategoryChange = useCallback(
    (next: InformationCategory) => {
      setCategory(next);
      if (next !== ioType.category) void save({ category: next });
    },
    [ioType.category, save],
  );

  const handleSubProjectChange = useCallback(
    (next: string | null) => {
      setSubProjectId(next);
      if (next !== ioType.subProjectId) void save({ subProjectId: next });
    },
    [ioType.subProjectId, save],
  );

  const handleDelete = useCallback(async () => {
    if (!confirm(`INPUT/OUTPUT「${ioType.name}」を削除しますか？（紐づく具体帳票も削除されます）`)) return;
    setBusy(true);
    setRowError(null);
    try {
      await informationTypeApi.delete(ioType.id);
      await onChanged();
    } catch (err) {
      setRowError(err instanceof Error ? err.message : 'Unknown error');
      setBusy(false);
    }
  }, [ioType.id, ioType.name, onChanged]);

  return (
    <li className="px-3 py-2.5">
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={onToggle}
          className="mt-0.5 inline-flex shrink-0 items-center gap-0.5 rounded px-0.5 py-0.5 text-gray-400 hover:bg-gray-50 hover:text-gray-600"
          title={expanded ? '具体データを閉じる' : '具体データ（添付ファイル）を表示'}
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <span className="inline-flex items-center gap-0.5 text-[11px] tabular-nums">
            <Paperclip className="h-3 w-3" />
            {attachmentCount}
          </span>
        </button>

        <CategoryBadge category={category} />

        <div className="min-w-0 flex-1 space-y-1.5">
          {/* 1行目: 名前 + 分類 + 領域 + 削除 */}
          <div className="flex items-center gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={handleNameBlur}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
              placeholder="名前"
              className="min-w-0 flex-1 rounded border border-transparent px-1.5 py-1 text-sm font-medium text-gray-800 hover:border-gray-200 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
            <select
              value={category}
              onChange={(e) => handleCategoryChange(e.target.value as InformationCategory)}
              className="rounded border border-gray-300 bg-white px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
              title="分類"
            >
              {INFORMATION_CATEGORY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {/* 領域（任意）。共通の領域ピッカー（ツリー＋検索）。クリアで '' → null 保存。 */}
            <SubProjectPicker
              subProjects={subProjects}
              value={subProjectId ?? ''}
              onChange={(v) => handleSubProjectChange(v || null)}
              placeholder="領域を選択"
            />
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />}
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

          {/* 2行目: 説明 */}
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={handleDescriptionBlur}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
            placeholder="説明（任意）"
            className="w-full rounded border border-transparent px-1.5 py-1 text-xs text-gray-600 hover:border-gray-200 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />

          {/* 3行目: 紐づくカタログ表（読み取り表示） */}
          <div className="flex flex-wrap items-center gap-1.5 px-1.5">
            <span className="inline-flex items-center gap-1 text-[11px] text-gray-400">
              <Table2 className="h-3 w-3" />
              紐づくカタログ表:
            </span>
            {linkedTables.length === 0 ? (
              <span className="text-[11px] text-gray-400">
                なし（紐付けは「データカタログ」ページで設定）
              </span>
            ) : (
              linkedTables.map((t) => (
                <span
                  key={t.id}
                  className="inline-flex items-center rounded border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[11px] text-indigo-700"
                  title={t.description || undefined}
                >
                  {t.displayName || t.name}
                </span>
              ))
            )}
          </div>

          {rowError && <p className="px-1.5 text-[11px] text-red-600">{rowError}</p>}
        </div>
      </div>

      {/* アコーディオン: 具体データ（PDF・画像などの添付）。フォルダ分け・名前編集はパネル側。
          collapsed 中も mount したまま（取得済み一覧を保持し、再展開時の再取得を避ける） */}
      <IoAttachmentsPanel
        informationTypeId={ioType.id}
        expanded={expanded}
        folderCandidates={folderCandidates}
        onFoldersSeen={onFoldersSeen}
        onCountChange={setAttachmentCount}
      />
    </li>
  );
}
