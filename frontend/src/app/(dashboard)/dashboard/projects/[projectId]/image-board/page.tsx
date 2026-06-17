'use client';

/**
 * 業務イメージ（スライド）ボード ページ。
 * 図形/矢印/テキスト/画像/手書きを自由配置して ASIS/TOBE の業務の流れを
 * 「1枚のスライド」でラフに描く補完ツール（構造化図 DFD/swimlane/object-map の手前）。
 * キャンバスは Excalidraw を埋め込み、ボード単位で scene(JSON) を保存する。
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { useReadOnly } from '@/components/read-only-context';
import { cn } from '@/lib/utils';
import {
  Loader2,
  Plus,
  Trash2,
  Presentation,
  Image as ImageIcon,
  Check,
  CloudOff,
} from 'lucide-react';
import {
  imageBoardApi,
  type ImageBoardKind,
  type ImageBoardSummary,
  type ImageBoardDto,
} from '@/lib/image-board';
import type { SaveState } from './_components/ExcalidrawBoard';

// Excalidraw は window 依存なので ssr:false で動的読込（このページ専用）。
const ExcalidrawBoard = dynamic(() => import('./_components/ExcalidrawBoard'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-slate-50">
      <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
    </div>
  ),
});

const KIND_TABS: { value: ImageBoardKind; label: string; color: string }[] = [
  { value: 'ASIS', label: '現状（ASIS）', color: '#d97706' },
  { value: 'TOBE', label: 'あるべき姿（TOBE）', color: '#059669' },
];

export default function ImageBoardPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const { canEdit } = useReadOnly();

  const [kind, setKind] = useState<ImageBoardKind>('ASIS');
  const [boards, setBoards] = useState<ImageBoardSummary[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [board, setBoard] = useState<ImageBoardDto | null>(null);
  const [loadingBoard, setLoadingBoard] = useState(false);

  const [creating, setCreating] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [titleDraft, setTitleDraft] = useState('');

  // ボード一覧（kind 単位）。先頭を自動選択。
  const loadList = useCallback(
    async (selectAfter?: string) => {
      setLoadingList(true);
      setListError(null);
      try {
        const list = await imageBoardApi.list(projectId, kind);
        setBoards(list);
        setSelectedId((prev) => {
          if (selectAfter) return selectAfter;
          if (prev && list.some((b) => b.id === prev)) return prev;
          return list[0]?.id ?? null;
        });
      } catch (e) {
        setListError(e instanceof Error ? e.message : '読み込みに失敗しました');
      } finally {
        setLoadingList(false);
      }
    },
    [projectId, kind],
  );

  useEffect(() => {
    void loadList();
  }, [loadList]);

  // 選択ボードの scene を取得。
  useEffect(() => {
    if (!selectedId) {
      setBoard(null);
      return;
    }
    let cancelled = false;
    setLoadingBoard(true);
    setSaveState('idle');
    imageBoardApi
      .get(selectedId)
      .then((b) => {
        if (cancelled) return;
        setBoard(b);
        setTitleDraft(b.title);
      })
      .catch(() => {
        if (!cancelled) setBoard(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingBoard(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const handleCreate = useCallback(async () => {
    setCreating(true);
    try {
      const created = await imageBoardApi.create(projectId, {
        kind,
        title: '無題のボード',
      });
      await loadList(created.id);
    } catch {
      /* noop（一覧エラーは loadList が拾う） */
    } finally {
      setCreating(false);
    }
  }, [projectId, kind, loadList]);

  const handleDelete = useCallback(
    async (id: string) => {
      if (!window.confirm('このボードを削除しますか？')) return;
      try {
        await imageBoardApi.remove(id);
        if (selectedId === id) setSelectedId(null);
        await loadList();
      } catch {
        /* noop */
      }
    },
    [selectedId, loadList],
  );

  const commitTitle = useCallback(async () => {
    if (!board) return;
    const next = titleDraft.trim();
    if (next === board.title) return;
    try {
      await imageBoardApi.update(board.id, { title: next });
      setBoard((b) => (b ? { ...b, title: next } : b));
      setBoards((list) =>
        list.map((b) => (b.id === board.id ? { ...b, title: next } : b)),
      );
    } catch {
      /* noop */
    }
  }, [board, titleDraft]);

  const tab = useMemo(() => KIND_TABS.find((t) => t.value === kind)!, [kind]);

  return (
    <div className="space-y-4">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Presentation className="h-5 w-5" style={{ color: '#2563eb' }} />
            業務イメージボード
          </span>
        }
        description="図形・アイコン・テキスト・矢印・画像を自由配置して、ASIS/TOBE の業務の流れを1枚のスライドとしてラフに描きます。構造化図（業務フロー/DFD/オブジェクト関係性マップ）の手前のラフ下書きとして使います。"
        backHref={`/dashboard/projects/${projectId}`}
        backLabel="プロジェクトへ戻る"
      />

      {/* ASIS/TOBE タブ */}
      <div className="flex items-center gap-2 border-b border-gray-200">
        {KIND_TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setKind(t.value)}
            className={cn(
              'relative px-4 py-2 text-sm font-semibold transition-colors',
              kind === t.value
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
            {kind === t.value && (
              <span
                className="absolute inset-x-0 -bottom-px h-0.5"
                style={{ backgroundColor: t.color }}
              />
            )}
          </button>
        ))}
      </div>

      <div className="flex h-[calc(100vh-260px)] min-h-[520px] gap-3">
        {/* 左: ボード一覧 */}
        <div className="flex w-60 flex-shrink-0 flex-col rounded-lg border border-gray-200 bg-white">
          <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
            <span className="text-xs font-semibold text-muted-foreground">
              {tab.label} のボード
            </span>
            {canEdit && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2"
                onClick={handleCreate}
                disabled={creating}
              >
                {creating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {loadingList ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
              </div>
            ) : listError ? (
              <p className="px-2 py-4 text-xs text-red-600">{listError}</p>
            ) : boards.length === 0 ? (
              <div className="px-2 py-8 text-center">
                <ImageIcon className="mx-auto h-8 w-8 text-gray-300" />
                <p className="mt-2 text-xs text-muted-foreground">
                  まだボードがありません
                </p>
                {canEdit && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3"
                    onClick={handleCreate}
                    disabled={creating}
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    ボードを作成
                  </Button>
                )}
              </div>
            ) : (
              <ul className="space-y-1">
                {boards.map((b) => (
                  <li key={b.id}>
                    <div
                      className={cn(
                        'group flex items-center gap-1 rounded-md px-2 py-1.5 text-sm',
                        b.id === selectedId
                          ? 'bg-blue-50 text-blue-700'
                          : 'hover:bg-gray-50',
                      )}
                    >
                      <button
                        className="min-w-0 flex-1 truncate text-left"
                        onClick={() => setSelectedId(b.id)}
                        title={b.title || '無題のボード'}
                      >
                        {b.title || '無題のボード'}
                      </button>
                      {canEdit && (
                        <button
                          className="flex-shrink-0 text-gray-300 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
                          onClick={() => handleDelete(b.id)}
                          title="削除"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* 右: キャンバス */}
        <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white">
          {!selectedId ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <Presentation className="h-10 w-10 text-gray-300" />
              <p className="mt-3 text-sm text-muted-foreground">
                左からボードを選ぶか、新しいボードを作成してください。
              </p>
            </div>
          ) : (
            <>
              {/* ボードヘッダー（タイトル編集 + 保存状態） */}
              <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2">
                <Input
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onBlur={commitTitle}
                  disabled={!canEdit}
                  placeholder="ボード名"
                  className="h-8 max-w-xs border-transparent text-sm font-semibold focus-visible:border-input"
                />
                <SaveStateBadge state={saveState} readOnly={!canEdit} />
              </div>

              {/* Excalidraw 本体（ボード切替で remount） */}
              <div className="relative min-h-0 flex-1">
                {loadingBoard || !board ? (
                  <div className="flex h-full items-center justify-center bg-slate-50">
                    <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                  </div>
                ) : (
                  <ExcalidrawBoard
                    key={board.id}
                    boardId={board.id}
                    initialScene={board.scene}
                    readOnly={!canEdit}
                    onSaveStateChange={setSaveState}
                  />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SaveStateBadge({
  state,
  readOnly,
}: {
  state: SaveState;
  readOnly: boolean;
}) {
  if (readOnly) {
    return <span className="text-xs text-muted-foreground">閲覧のみ</span>;
  }
  if (state === 'saving') {
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> 保存中…
      </span>
    );
  }
  if (state === 'saved') {
    return (
      <span className="flex items-center gap-1 text-xs text-emerald-600">
        <Check className="h-3 w-3" /> 保存済み
      </span>
    );
  }
  if (state === 'error') {
    return (
      <span className="flex items-center gap-1 text-xs text-red-600">
        <CloudOff className="h-3 w-3" /> 保存に失敗
      </span>
    );
  }
  return null;
}
