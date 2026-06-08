'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PageHeader } from '@/components/ui/page-header';
import { HowToPanel } from '@/components/ui/how-to-panel';
import { ManualButton } from '@/components/ui/manual-dialog';
import { Loader2, Map, GitCompareArrows, Check, Save } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5021';

// このページが読み書きする記録シートの識別子
const TEMPLATE_KEY = 'gap-roadmap';

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

// gap-roadmap シートの1行 = gapId ごとのフェーズ割当
type RoadmapRow = {
  gapId: string;
  phase: string;
  target: string;
  order: number;
  note: string;
};

// フェーズ（列）。TOBE3段階の考え方をミラー。
const PHASES = ['3ヶ月以内 (Quick Win)', '1年以内 (Phase2)', '3年以内 (Phase3)', '未分類'];
const UNASSIGNED = '未分類';

// 列ごとの白テーマ配色
const phaseStyle: Record<string, { head: string; dot: string }> = {
  '3ヶ月以内 (Quick Win)': { head: 'text-blue-700 bg-blue-50 border-blue-200', dot: 'bg-blue-500' },
  '1年以内 (Phase2)': { head: 'text-emerald-700 bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500' },
  '3年以内 (Phase3)': { head: 'text-indigo-700 bg-indigo-50 border-indigo-200', dot: 'bg-indigo-500' },
  '未分類': { head: 'text-gray-600 bg-gray-50 border-gray-200', dot: 'bg-gray-400' },
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [howToOpen, setHowToOpen] = useState(false);

  const getHeaders = useCallback(() => {
    const token = localStorage.getItem('accessToken');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  }, []);

  // GAP一覧 + gap-roadmap シートを同時取得して join
  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = getHeaders();
      const [gapRes, sheetRes] = await Promise.all([
        fetch(`${API_URL}/api/projects/${projectId}/gap-items`, { headers }),
        fetch(`${API_URL}/api/projects/${projectId}/record-sheets/${TEMPLATE_KEY}`, { headers }),
      ]);

      if (!gapRes.ok) {
        setError('GAP一覧の取得に失敗しました');
        return;
      }
      const gaps: GapItem[] = await gapRes.json();
      setGapItems(gaps);

      const map: Record<string, RoadmapRow> = {};
      if (sheetRes.ok) {
        const sheet: { rows?: RoadmapRow[] } = await sheetRes.json();
        const rows = Array.isArray(sheet.rows) ? sheet.rows : [];
        rows.forEach((r) => {
          if (r && typeof r.gapId === 'string') {
            map[r.gapId] = {
              gapId: r.gapId,
              phase: typeof r.phase === 'string' && PHASES.includes(r.phase) ? r.phase : UNASSIGNED,
              target: typeof r.target === 'string' ? r.target : '',
              order: typeof r.order === 'number' ? r.order : 0,
              note: typeof r.note === 'string' ? r.note : '',
            };
          }
        });
      }
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

  // 現時点の割当（gapごと、未割当はデフォルト行を補う）を行配列にして保存
  const persist = useCallback(
    async (next: Record<string, RoadmapRow>) => {
      setSaving(true);
      try {
        const rows: RoadmapRow[] = gapItems.map((g, i) => {
          const a = next[g.id];
          return {
            gapId: g.id,
            phase: a?.phase ?? UNASSIGNED,
            target: a?.target ?? '',
            order: a?.order ?? i,
            note: a?.note ?? '',
          };
        });
        const res = await fetch(
          `${API_URL}/api/projects/${projectId}/record-sheets/${TEMPLATE_KEY}`,
          {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify({ title: 'GAPロードマップ', rows }),
          },
        );
        if (res.ok) {
          setSavedAt(Date.now());
        } else {
          setError('保存に失敗しました');
        }
      } catch (err) {
        console.error('Failed to save roadmap:', err);
        setError('保存に失敗しました');
      } finally {
        setSaving(false);
      }
    },
    [projectId, gapItems, getHeaders],
  );

  // 1件の割当を更新してオートセーブ
  const updateAssignment = useCallback(
    (gapId: string, patch: Partial<RoadmapRow>) => {
      setAssignments((prev) => {
        const current = prev[gapId] ?? {
          gapId,
          phase: UNASSIGNED,
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

  // 全件まとめて保存（保存ボタン）
  const handleSaveAll = useCallback(() => {
    void persist(assignments);
  }, [persist, assignments]);

  // フェーズごとにカードを束ねる（優先度→order でソート）
  const columns = useMemo(() => {
    const byPhase: Record<string, { gap: GapItem; row: RoadmapRow }[]> = {};
    PHASES.forEach((p) => (byPhase[p] = []));
    gapItems.forEach((g, i) => {
      const row: RoadmapRow = assignments[g.id] ?? {
        gapId: g.id,
        phase: UNASSIGNED,
        target: '',
        order: i,
        note: '',
      };
      const phase = PHASES.includes(row.phase) ? row.phase : UNASSIGNED;
      byPhase[phase].push({ gap: g, row });
    });
    PHASES.forEach((p) => {
      byPhase[p].sort((a, b) => {
        const pa = priorityMeta[a.gap.priority]?.rank ?? 1;
        const pb = priorityMeta[b.gap.priority]?.rank ?? 1;
        if (pa !== pb) return pa - pb;
        return (a.row.order ?? 0) - (b.row.order ?? 0);
      });
    });
    return byPhase;
  }, [gapItems, assignments]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Map className="h-6 w-6 text-blue-600" />
            ロードマップ
          </span>
        }
        description="GAP（課題）をフェーズ別に並べて推進計画を作る"
        help="GAP（課題）をフェーズに割り当てて段階的なロードマップ化します。各カードのフェーズを選び直すと、その課題を Quick Win / Phase2 / Phase3 に振り分けて推進計画にできます。"
        backHref={`/dashboard/projects/${projectId}`}
        actions={
          <>
            <HowToPanel
              open={howToOpen}
              onOpenChange={setHowToOpen}
              steps={[
                'このページは GAP（課題一覧）からロードマップを作ります（GAPからロードマップ作り）。',
                '各カードはひとつの GAP。カード上の「フェーズ」を選ぶと、3ヶ月以内(Quick Win)／1年以内(Phase2)／3年以内(Phase3) の列に移動します。',
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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {PHASES.map((phase) => {
            const cards = columns[phase] ?? [];
            const style = phaseStyle[phase] ?? phaseStyle[UNASSIGNED];
            return (
              <div key={phase} className="flex flex-col">
                {/* 列ヘッダー */}
                <div
                  className={`flex items-center justify-between rounded-t-lg border px-3 py-2 ${style.head}`}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <span className={`h-2 w-2 rounded-full ${style.dot}`} />
                    {phase}
                  </span>
                  <span className="text-xs font-medium opacity-80">{cards.length}件</span>
                </div>
                {/* 列ボディ */}
                <div className="flex-1 space-y-3 rounded-b-lg border border-t-0 border-gray-200 bg-gray-50/50 p-3 min-h-[120px]">
                  {cards.length === 0 ? (
                    <p className="py-6 text-center text-xs text-gray-400">
                      ここにカードはありません
                    </p>
                  ) : (
                    cards.map(({ gap, row }) => {
                      const pm = priorityMeta[gap.priority] ?? priorityMeta.MEDIUM;
                      return (
                        <Card key={gap.id} className="bg-white border-gray-200 shadow-sm">
                          <CardContent className="p-3 space-y-2">
                            {/* タイトル + 優先度バッジ */}
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm font-medium text-gray-900 leading-snug">
                                {gap.businessArea}
                              </p>
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

                            {/* フェーズ移動 */}
                            <Select
                              value={row.phase}
                              onValueChange={(v) => updateAssignment(gap.id, { phase: v })}
                            >
                              <SelectTrigger className="h-8 bg-white border-gray-300 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="bg-white">
                                {PHASES.map((p) => (
                                  <SelectItem key={p} value={p} className="text-xs">
                                    {p}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </CardContent>
                        </Card>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
