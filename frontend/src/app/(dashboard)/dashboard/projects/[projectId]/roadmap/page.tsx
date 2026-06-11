'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { HowToPanel } from '@/components/ui/how-to-panel';
import { ManualButton } from '@/components/ui/manual-dialog';
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from '@hello-pangea/dnd';
import {
  Loader2,
  Map,
  GitCompareArrows,
  Check,
  Save,
  GripVertical,
  Pencil,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { gapLedgerApi } from '@/lib/gap-ledger';
import {
  roadmapPhaseApi,
  phaseStorageKey,
  resolvePhase,
  type RoadmapPhase,
} from '@/lib/roadmap-phases';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5021';

type Priority = 'HIGH' | 'MEDIUM' | 'LOW';

type GapItem = {
  id: string;
  businessArea: string;
  gapDescription: string | null;
  asisDescription: string | null;
  tobeDescription: string | null;
  priority: Priority;
  status: string;
};

// 1行 = gapId ごとのフェーズ割当。
// phase は GapLedger.phase の生値（フェーズ行の legacyKey ?? name。未分類は 'NONE'）。
type RoadmapRow = {
  gapId: string;
  phase: string;
  target: string;
  order: number;
  note: string;
};

// 末尾固定の「未分類」列（編集・削除不可）。
// GapLedger.phase には 'NONE' を保存（旧固定フェーズ時代と同じ）。
const UNASSIGNED_ID = 'NONE';
const UNASSIGNED_LABEL = '未分類';
const UNASSIGNED_KEY = 'NONE';

// 列ごとの白テーマ配色（フェーズは order 順にパレットを循環）
type ColumnStyle = { head: string; dot: string };
const PHASE_PALETTE: ColumnStyle[] = [
  { head: 'text-blue-700 bg-blue-50 border-blue-200', dot: 'bg-blue-500' },
  { head: 'text-emerald-700 bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500' },
  { head: 'text-indigo-700 bg-indigo-50 border-indigo-200', dot: 'bg-indigo-500' },
  { head: 'text-amber-700 bg-amber-50 border-amber-200', dot: 'bg-amber-500' },
  { head: 'text-rose-700 bg-rose-50 border-rose-200', dot: 'bg-rose-500' },
  { head: 'text-cyan-700 bg-cyan-50 border-cyan-200', dot: 'bg-cyan-500' },
];
const UNASSIGNED_STYLE: ColumnStyle = {
  head: 'text-gray-600 bg-gray-50 border-gray-200',
  dot: 'bg-gray-400',
};

// カンバン列 = フェーズ行（order 昇順）+ 末尾固定「未分類」
type PhaseColumn = {
  id: string; // phase.id（未分類は 'NONE'）
  name: string;
  storageKey: string; // GapLedger.phase に保存する値（legacyKey ?? name / 'NONE'）
  phase: RoadmapPhase | null; // 未分類は null
  style: ColumnStyle;
};

// 優先度バッジ（高=rose / 中=amber / 低=gray）
const priorityMeta: Record<Priority, { label: string; badge: string; rank: number }> = {
  HIGH: { label: '高', badge: 'text-rose-700 bg-rose-50 border-rose-300', rank: 0 },
  MEDIUM: { label: '中', badge: 'text-amber-700 bg-amber-50 border-amber-300', rank: 1 },
  LOW: { label: '低', badge: 'text-gray-600 bg-gray-50 border-gray-300', rank: 2 },
};

export default function RoadmapPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const [gapItems, setGapItems] = useState<GapItem[]>([]);
  // gapId -> RoadmapRow
  const [assignments, setAssignments] = useState<Record<string, RoadmapRow>>({});
  // RoadmapPhase マスタ（列定義）。list がバックエンドで初期3フェーズをシード。
  const [phases, setPhases] = useState<RoadmapPhase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [howToOpen, setHowToOpen] = useState(false);

  // フェーズ名のインライン編集
  const [editingPhaseId, setEditingPhaseId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const cancelEditRef = useRef(false);

  const getHeaders = useCallback(() => {
    const token = localStorage.getItem('accessToken');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  }, []);

  // GAP一覧 + GAP台帳（GapLedger.phase）+ フェーズマスタを同時取得して join
  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = getHeaders();
      const [gapRes, ledgers, phaseRows] = await Promise.all([
        fetch(`${API_URL}/api/projects/${projectId}/gap-items`, { headers }),
        gapLedgerApi.list(projectId).catch(() => []),
        roadmapPhaseApi.list(projectId),
      ]);

      if (!gapRes.ok) {
        setError('GAP一覧の取得に失敗しました');
        return;
      }
      const gaps: GapItem[] = await gapRes.json();
      setGapItems(gaps);
      setPhases(phaseRows);

      // 各 GAP の台帳行から phase（生値）を読み、割当マップを作る
      const map: Record<string, RoadmapRow> = {};
      ledgers.forEach((r) => {
        if (r && typeof r.gapId === 'string') {
          map[r.gapId] = {
            gapId: r.gapId,
            phase: r.phase ?? UNASSIGNED_KEY,
            target: r.target ?? '',
            order: r.order ?? 0,
            note: r.note ?? '',
          };
        }
      });
      setAssignments(map);
    } catch (err) {
      console.error('Failed to fetch roadmap:', err);
      setError('エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }, [projectId, getHeaders]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // order 昇順のフェーズ列
  const sortedPhases = useMemo(
    () =>
      [...phases].sort(
        (a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt),
      ),
    [phases],
  );

  // カンバン列 = フェーズ行（order 昇順）+ 末尾固定「未分類」
  const phaseColumns = useMemo<PhaseColumn[]>(
    () => [
      ...sortedPhases.map((p, i) => ({
        id: p.id,
        name: p.name,
        storageKey: phaseStorageKey(p),
        phase: p,
        style: PHASE_PALETTE[i % PHASE_PALETTE.length],
      })),
      {
        id: UNASSIGNED_ID,
        name: UNASSIGNED_LABEL,
        storageKey: UNASSIGNED_KEY,
        phase: null,
        style: UNASSIGNED_STYLE,
      },
    ],
    [sortedPhases],
  );

  // 現時点の割当を {gapId, phase, target, note, order} で保存。
  // impact/difficulty/toComplete（ledger タブ所有）は送らないのでマージ更新で保持される。
  const persist = useCallback(
    async (next: Record<string, RoadmapRow>) => {
      setSaving(true);
      try {
        const rows = gapItems.map((g) => {
          const a = next[g.id];
          return {
            gapId: g.id,
            phase: a?.phase ?? UNASSIGNED_KEY,
            target: a?.target ?? '',
            note: a?.note ?? '',
            order: a?.order ?? 0,
          };
        });
        await gapLedgerApi.save(projectId, rows);
        setSavedAt(Date.now());
      } catch (err) {
        console.error('Failed to save roadmap:', err);
        setError('保存に失敗しました');
      } finally {
        setSaving(false);
      }
    },
    [projectId, gapItems],
  );

  // 1件の割当を更新してオートセーブ
  const updateAssignment = useCallback(
    (gapId: string, patch: Partial<RoadmapRow>) => {
      setAssignments((prev) => {
        const current = prev[gapId] ?? {
          gapId,
          phase: UNASSIGNED_KEY,
          target: '',
          order: 0,
          note: '',
        };
        const next = { ...prev, [gapId]: { ...current, ...patch } };
        // オートセーブ（GAP一覧が読めている時のみ）
        void persist(next);
        return next;
      });
    },
    [persist],
  );

  // カンバン：カードを別フェーズ列へドロップしたとき、そのGAPの phase を
  // destination 列の保存値（legacyKey ?? name / NONE）に更新してオートセーブ。
  const handleDragEnd = useCallback(
    (result: DropResult) => {
      const { destination, source, draggableId } = result;
      if (!destination) return; // 列外へのドロップは無視
      const col = phaseColumns.find((c) => c.id === destination.droppableId);
      if (!col) return;
      // 同一フェーズ列内（並べ替えのみ）は永続化しても意味がないので no-op
      if (destination.droppableId === source.droppableId) return;
      updateAssignment(draggableId, { phase: col.storageKey });
    },
    [phaseColumns, updateAssignment],
  );

  // 全件まとめて保存（保存ボタン）
  const handleSaveAll = useCallback(() => {
    void persist(assignments);
  }, [persist, assignments]);

  // フェーズごとにカードを束ねる（優先度→order でソート）。
  // 解決は legacyKey 一致 → name 一致 → 未分類（旧データ Q/P2/P3 もそのまま動く）。
  const columns = useMemo(() => {
    const byCol: Record<string, { gap: GapItem; row: RoadmapRow }[]> = {};
    phaseColumns.forEach((c) => (byCol[c.id] = []));
    gapItems.forEach((g, i) => {
      const row: RoadmapRow = assignments[g.id] ?? {
        gapId: g.id,
        phase: UNASSIGNED_KEY,
        target: '',
        order: i,
        note: '',
      };
      const colId = resolvePhase(row.phase, sortedPhases)?.id ?? UNASSIGNED_ID;
      byCol[colId].push({ gap: g, row });
    });
    phaseColumns.forEach((c) => {
      byCol[c.id].sort((a, b) => {
        const pa = priorityMeta[a.gap.priority]?.rank ?? 1;
        const pb = priorityMeta[b.gap.priority]?.rank ?? 1;
        if (pa !== pb) return pa - pb;
        return (a.row.order ?? 0) - (b.row.order ?? 0);
      });
    });
    return byCol;
  }, [gapItems, assignments, phaseColumns, sortedPhases]);

  // ---------------------------------------------------------------------------
  // フェーズ（列）の編集
  // ---------------------------------------------------------------------------

  const startEditing = useCallback((phase: RoadmapPhase) => {
    cancelEditRef.current = false;
    setEditingPhaseId(phase.id);
    setEditingName(phase.name);
  }, []);

  // インライン改名の確定（PATCH）。
  // custom フェーズ（legacyKey null）は phase 値が name 保存のため、
  // その列の既存カードの assignments を新 name で再保存する。
  // legacyKey 行（Q/P2/P3）は保存値が legacyKey のままなので表示が変わるだけ。
  const commitRename = useCallback(async () => {
    const phase = phases.find((p) => p.id === editingPhaseId);
    setEditingPhaseId(null);
    if (!phase) return;
    const newName = editingName.trim();
    if (!newName || newName === phase.name) return;
    try {
      const updated = await roadmapPhaseApi.update(phase.id, { name: newName });
      setPhases((prev) => prev.map((p) => (p.id === phase.id ? updated : p)));
      if (!phase.legacyKey) {
        const next: Record<string, RoadmapRow> = {};
        let changed = false;
        Object.entries(assignments).forEach(([gapId, row]) => {
          if (row.phase === phase.name) {
            next[gapId] = { ...row, phase: newName };
            changed = true;
          } else {
            next[gapId] = row;
          }
        });
        if (changed) {
          setAssignments(next);
          await persist(next);
        }
      }
    } catch (err) {
      console.error('Failed to rename phase:', err);
      setError('フェーズの改名に失敗しました');
    }
  }, [phases, editingPhaseId, editingName, assignments, persist]);

  // 「＋フェーズ追加」: 末尾（未分類の前）に挿入し、すぐ改名モードへ
  const handleAddPhase = useCallback(async () => {
    try {
      const maxOrder = phases.reduce((m, p) => Math.max(m, p.order), -1);
      const created = await roadmapPhaseApi.create(projectId, {
        name: '新フェーズ',
        order: maxOrder + 1,
      });
      setPhases((prev) => [...prev, created]);
      startEditing(created);
    } catch (err) {
      console.error('Failed to add phase:', err);
      setError('フェーズの追加に失敗しました');
    }
  }, [phases, projectId, startEditing]);

  // ←/→ で隣のフェーズと order を入替（PATCH×2）
  const handleMovePhase = useCallback(
    async (phaseId: string, dir: -1 | 1) => {
      const idx = sortedPhases.findIndex((p) => p.id === phaseId);
      const target = sortedPhases[idx];
      const neighbor = sortedPhases[idx + dir];
      if (!target || !neighbor) return;
      // order が同値だと入替が no-op になるため index ベースで振り直す
      let orderA = neighbor.order;
      let orderB = target.order;
      if (orderA === orderB) {
        orderA = idx + dir;
        orderB = idx;
      }
      setPhases((prev) =>
        prev.map((p) =>
          p.id === target.id
            ? { ...p, order: orderA }
            : p.id === neighbor.id
              ? { ...p, order: orderB }
              : p,
        ),
      );
      try {
        await Promise.all([
          roadmapPhaseApi.update(target.id, { order: orderA }),
          roadmapPhaseApi.update(neighbor.id, { order: orderB }),
        ]);
      } catch (err) {
        console.error('Failed to reorder phases:', err);
        setError('フェーズの並べ替えに失敗しました');
      }
    },
    [sortedPhases],
  );

  // フェーズ削除（confirm）。削除前にその列のカードを未分類へ移してから DELETE。
  const handleDeletePhase = useCallback(
    async (phase: RoadmapPhase) => {
      if (
        !window.confirm(
          `フェーズ「${phase.name}」を削除しますか？\nこの列のカードは「${UNASSIGNED_LABEL}」へ移動します。`,
        )
      ) {
        return;
      }
      try {
        const next: Record<string, RoadmapRow> = {};
        let moved = false;
        Object.entries(assignments).forEach(([gapId, row]) => {
          if (resolvePhase(row.phase, sortedPhases)?.id === phase.id) {
            next[gapId] = { ...row, phase: UNASSIGNED_KEY };
            moved = true;
          } else {
            next[gapId] = row;
          }
        });
        if (moved) {
          setAssignments(next);
          await persist(next);
        }
        await roadmapPhaseApi.delete(phase.id);
        setPhases((prev) => prev.filter((p) => p.id !== phase.id));
      } catch (err) {
        console.error('Failed to delete phase:', err);
        setError('フェーズの削除に失敗しました');
      }
    },
    [assignments, sortedPhases, persist],
  );

  // ---------------------------------------------------------------------------
  // 描画
  // ---------------------------------------------------------------------------

  const renderColumn = (col: PhaseColumn, phaseIndex: number) => {
    const cards = columns[col.id] ?? [];
    const isEditing = col.phase !== null && editingPhaseId === col.phase.id;
    return (
      <div key={col.id} className="flex min-w-[280px] flex-1 flex-col">
        {/* 列ヘッダー */}
        <div
          className={`flex items-center justify-between gap-1 rounded-t-lg border px-3 py-2 ${col.style.head}`}
        >
          <span className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold">
            <span className={`h-2 w-2 shrink-0 rounded-full ${col.style.dot}`} />
            {isEditing && col.phase ? (
              <input
                autoFocus
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onBlur={() => {
                  if (cancelEditRef.current) {
                    cancelEditRef.current = false;
                    setEditingPhaseId(null);
                    return;
                  }
                  void commitRename();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.currentTarget.blur();
                  } else if (e.key === 'Escape') {
                    cancelEditRef.current = true;
                    e.currentTarget.blur();
                  }
                }}
                className="w-full min-w-0 rounded border border-blue-300 bg-white px-1.5 py-0.5 text-sm font-semibold text-gray-900 outline-none focus:ring-1 focus:ring-blue-300"
              />
            ) : col.phase ? (
              <button
                type="button"
                onClick={() => startEditing(col.phase!)}
                title="クリックして改名"
                className="truncate text-left hover:underline"
              >
                {col.name}
              </button>
            ) : (
              <span className="truncate">{col.name}</span>
            )}
          </span>
          <span className="flex shrink-0 items-center gap-0.5">
            {col.phase && !isEditing && (
              <>
                <button
                  type="button"
                  onClick={() => startEditing(col.phase!)}
                  title="改名"
                  className="rounded p-1 opacity-60 hover:bg-white/70 hover:opacity-100"
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => void handleMovePhase(col.phase!.id, -1)}
                  disabled={phaseIndex <= 0}
                  title="左へ移動"
                  className="rounded p-1 opacity-60 hover:bg-white/70 hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-20"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => void handleMovePhase(col.phase!.id, 1)}
                  disabled={phaseIndex >= sortedPhases.length - 1}
                  title="右へ移動"
                  className="rounded p-1 opacity-60 hover:bg-white/70 hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-20"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => void handleDeletePhase(col.phase!)}
                  title="フェーズを削除（カードは未分類へ）"
                  className="rounded p-1 opacity-60 hover:bg-white/70 hover:text-rose-600 hover:opacity-100"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </>
            )}
            <span className="ml-1 text-xs font-medium opacity-80">{cards.length}件</span>
          </span>
        </div>
        {/* 列ボディ（ドロップ先） */}
        <Droppable droppableId={col.id}>
          {(provided, snapshot) => (
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              className={`flex-1 space-y-3 rounded-b-lg border border-t-0 p-3 min-h-[120px] transition-colors ${
                snapshot.isDraggingOver
                  ? 'border-blue-300 bg-blue-50/60'
                  : 'border-gray-200 bg-gray-50/50'
              }`}
            >
              {cards.length === 0 && !snapshot.isDraggingOver && (
                <p className="py-6 text-center text-xs text-gray-400">
                  ここにカードをドラッグ
                </p>
              )}
              {cards.map(({ gap, row }, index) => {
                const pm = priorityMeta[gap.priority] ?? priorityMeta.MEDIUM;
                return (
                  <Draggable key={gap.id} draggableId={gap.id} index={index}>
                    {(dragProvided, dragSnapshot) => (
                      <Card
                        ref={dragProvided.innerRef}
                        {...dragProvided.draggableProps}
                        // カード全体をドラッグハンドルにする。input/textarea 等の
                        // interactive 要素からはドラッグが始まらない（dnd の既定動作）
                        // ので target/note の編集はそのまま使える。
                        {...dragProvided.dragHandleProps}
                        style={dragProvided.draggableProps.style as React.CSSProperties}
                        className={`cursor-grab bg-white shadow-sm transition-shadow active:cursor-grabbing ${
                          dragSnapshot.isDragging
                            ? 'border-blue-300 shadow-md ring-1 ring-blue-200'
                            : 'border-gray-200'
                        }`}
                      >
                        <CardContent className="p-3 space-y-2">
                          {/* タイトル + ドラッグヒント + 優先度バッジ */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-start gap-1.5 min-w-0">
                              <span
                                className="mt-0.5 -ml-1 shrink-0 text-gray-300"
                                title="ドラッグして別フェーズへ移動"
                              >
                                <GripVertical className="h-4 w-4" />
                              </span>
                              <p className="text-sm font-medium text-gray-900 leading-snug">
                                {gap.businessArea}
                              </p>
                            </div>
                            <span
                              className={`flex-shrink-0 rounded border px-1.5 py-0.5 text-[11px] font-semibold ${pm.badge}`}
                            >
                              {pm.label}
                            </span>
                          </div>
                          {gap.gapDescription && (
                            <p className="text-xs text-gray-500 leading-snug line-clamp-3">
                              {gap.gapDescription}
                            </p>
                          )}

                          {/* 期日/目標（target） */}
                          <input
                            defaultValue={row.target}
                            placeholder="期日/目標（例: 9月末までに自動化）"
                            onBlur={(e) => {
                              const v = e.target.value;
                              if (v !== (row.target ?? '')) {
                                updateAssignment(gap.id, { target: v });
                              }
                            }}
                            className="w-full rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 outline-none focus:ring-1 focus:ring-blue-300 placeholder:text-gray-300"
                          />

                          {/* メモ */}
                          <textarea
                            defaultValue={row.note}
                            placeholder="メモ"
                            rows={2}
                            onBlur={(e) => {
                              const v = e.target.value;
                              if (v !== (row.note ?? '')) {
                                updateAssignment(gap.id, { note: v });
                              }
                            }}
                            className="w-full resize-none rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 outline-none focus:ring-1 focus:ring-blue-300 placeholder:text-gray-300"
                          />
                        </CardContent>
                      </Card>
                    )}
                  </Draggable>
                );
              })}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Map className="h-6 w-6 text-blue-600" />
            ロードマップ
          </span>
        }
        description="GAP（課題）をフェーズ別に並べて推進計画を作る（カンバン）"
        help="GAP（課題）をフェーズに割り当てて段階的なロードマップ化します。各カードを別のフェーズ列へドラッグすると、その課題を各フェーズ（初期値: Quick Win / Phase2 / Phase3）に振り分けて推進計画にできます。フェーズ列は名前の変更・追加・並べ替え・削除ができます。"
        backHref={`/dashboard/projects/${projectId}`}
        actions={
          <>
            <HowToPanel
              open={howToOpen}
              onOpenChange={setHowToOpen}
              steps={[
                'このページは GAP（課題一覧）からロードマップを作ります（GAPからロードマップ作り）。',
                '各カードはひとつの GAP。カードを別の列へドラッグ＆ドロップすると、そのフェーズ（初期値: 3ヶ月以内(Quick Win)／1年以内(Phase2)／3年以内(Phase3)）に振り分けられます。',
                'フェーズ列は自由に編集できます。列名クリック（または鉛筆）で改名、「＋フェーズ追加」で列を増やし、←/→ で並べ替え、ゴミ箱で削除（カードは未分類へ）。',
                '期日/目標（target）とメモを入力して、いつまでに何を実現するかを書き込みます。',
                'カードは各列で 優先度（高→中→低）→ 並び順 でソートされます。',
                '変更は自動保存されます。手動で保存したいときは「保存」を押してください。',
              ]}
            />
            <ManualButton feature="roadmap" />
            <Button
              onClick={handleSaveAll}
              disabled={saving || loading || gapItems.length === 0}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              保存
            </Button>
          </>
        }
      />

      {savedAt && !saving && (
        <div className="inline-flex items-center gap-1.5 text-xs text-emerald-700">
          <Check className="h-3.5 w-3.5" />
          保存しました
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-[300px]">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      ) : error ? (
        <Card className="bg-white border-gray-200">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-red-600 mb-4">{error}</p>
            <Button variant="outline" onClick={fetchAll}>
              再読み込み
            </Button>
          </CardContent>
        </Card>
      ) : gapItems.length === 0 ? (
        <Card className="bg-white border-gray-200">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <GitCompareArrows className="h-8 w-8 text-gray-400" />
            </div>
            <p className="text-gray-700 font-medium mb-2">GAP（課題）がありません</p>
            <p className="text-sm text-gray-500 mb-4">
              ロードマップは GAP（課題）をフェーズ別に並べて作ります。まずは GAP を洗い出しましょう。
            </p>
            <Link href={`/dashboard/projects/${projectId}/gap-items`}>
              <Button className="bg-blue-600 hover:bg-blue-700">
                <GitCompareArrows className="h-4 w-4 mr-2" />
                GAP（課題）を作成する
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="flex items-stretch gap-4 overflow-x-auto pb-2">
            {/* フェーズ列（order 昇順） */}
            {phaseColumns
              .filter((c) => c.phase !== null)
              .map((col, i) => renderColumn(col, i))}
            {/* ＋フェーズ追加（末尾・未分類の前） */}
            <button
              type="button"
              onClick={() => void handleAddPhase()}
              className="flex h-10 w-32 shrink-0 items-center justify-center gap-1 self-start rounded-lg border border-dashed border-gray-300 text-sm text-gray-500 transition-colors hover:border-blue-300 hover:bg-blue-50/50 hover:text-blue-600"
            >
              <Plus className="h-4 w-4" />
              フェーズ追加
            </button>
            {/* 末尾固定: 未分類（編集・削除不可） */}
            {phaseColumns
              .filter((c) => c.phase === null)
              .map((col) => renderColumn(col, -1))}
          </div>
        </DragDropContext>
      )}
    </div>
  );
}
