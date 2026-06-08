'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import {
  Loader2,
  Trash2,
  Plus,
  Users,
  Megaphone,
  CalendarClock,
} from 'lucide-react';
import { RecordSheetTable } from '@/components/records/record-sheet-table';
import type { RecordTemplate } from '@/lib/record-templates';
import {
  type Meeting,
  type MeetingInput,
  type Stakeholder,
  listMeetings,
  createMeeting,
  updateMeeting,
  deleteMeeting,
  setMeetingStakeholders,
  listStakeholders,
} from '@/lib/stakeholders';

// 会議体の編集列（テーブル直接編集 + blur で PATCH）。
const MEETING_FIELDS: {
  key: keyof MeetingInput;
  label: string;
  multiline?: boolean;
}[] = [
  { key: 'name', label: '会議名' },
  { key: 'purpose', label: '目的・ゴール', multiline: true },
  { key: 'frequency', label: '頻度' },
  { key: 'dayTime', label: '曜日・時刻' },
  { key: 'decisionMaker', label: '意思決定者' },
  { key: 'minutesOwner', label: '議事録担当' },
  { key: 'note', label: '備考', multiline: true },
];

/** 支持度→ドット色（対象選択の手掛かりに併記）。 */
function supportDot(support: string | null): string {
  if (support === '支持') return 'bg-emerald-500';
  if (support === '反対') return 'bg-rose-500';
  if (support === '中立') return 'bg-gray-400';
  return 'bg-gray-300';
}

export function MeetingReportBoard({
  projectId,
  reportCalendarTemplate,
}: {
  projectId: string;
  reportCalendarTemplate: RecordTemplate | null;
}) {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [stakeholders, setStakeholders] = useState<Stakeholder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openPicker, setOpenPicker] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const [mt, sh] = await Promise.all([
        listMeetings(projectId),
        listStakeholders(projectId),
      ]);
      setMeetings(mt);
      setStakeholders(sh);
    } catch (e) {
      setError(e instanceof Error ? e.message : '読み込みに失敗しました');
    }
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await reload();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const stakeholderById = useMemo(
    () => new Map(stakeholders.map((s) => [s.id, s])),
    [stakeholders],
  );
  const hasStakeholders = stakeholders.length > 0;

  const handleAdd = async () => {
    setError(null);
    try {
      await createMeeting(projectId, { name: '新しい会議体' });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : '会議体の作成に失敗しました');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('この会議体を削除しますか？')) return;
    setError(null);
    try {
      await deleteMeeting(id);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : '会議体の削除に失敗しました');
    }
  };

  // ローカル編集（テーブル入力）。
  const setField = (id: string, key: keyof MeetingInput, value: string) =>
    setMeetings((prev) =>
      prev.map((m) => (m.id === id ? { ...m, [key]: value } : m)),
    );

  // blur で PATCH（name は空なら送らない）。
  const commitField = async (
    id: string,
    key: keyof MeetingInput,
    value: string,
  ) => {
    const trimmed = value.trim();
    const payload: Partial<MeetingInput> = {
      [key]: key === 'name' ? trimmed || '（無題）' : trimmed === '' ? null : trimmed,
    } as Partial<MeetingInput>;
    try {
      await updateMeeting(id, payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : '会議体の更新に失敗しました');
      await reload();
    }
  };

  const toggleStakeholder = async (meeting: Meeting, stakeholderId: string) => {
    const next = meeting.stakeholderIds.includes(stakeholderId)
      ? meeting.stakeholderIds.filter((x) => x !== stakeholderId)
      : [...meeting.stakeholderIds, stakeholderId];
    // 楽観更新
    setMeetings((prev) =>
      prev.map((m) =>
        m.id === meeting.id ? { ...m, stakeholderIds: next } : m,
      ),
    );
    try {
      await setMeetingStakeholders(meeting.id, next);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : '対象ステークホルダーの更新に失敗しました',
      );
      await reload();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[240px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 会議体 CRUD */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-[#050f3e]">
            <CalendarClock className="h-4 w-4 text-blue-600" />
            会議体
          </h3>
          <button
            type="button"
            onClick={handleAdd}
            className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            会議体を追加
          </button>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        <p className="text-xs text-gray-500">
          各会議体に名前・目的・頻度・曜日時刻・意思決定者・議事録担当を設定し、対象ステークホルダーを複数選択します。各セルは入力後フォーカスを外すと自動保存されます。
        </p>

        {!hasStakeholders && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
            「ステークホルダー」タブで関係者を登録すると、各会議体の対象として選べるようになります。
          </div>
        )}

        <Card className="bg-white border-gray-200">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="w-10 px-2 py-2 text-left text-xs font-medium text-gray-400">
                      #
                    </th>
                    {MEETING_FIELDS.map((f) => (
                      <th
                        key={f.key as string}
                        className="min-w-[140px] whitespace-nowrap px-3 py-2 text-left text-xs font-semibold text-gray-600"
                      >
                        {f.label}
                      </th>
                    ))}
                    <th className="min-w-[230px] bg-blue-50 px-3 py-2 text-left text-xs font-semibold text-blue-700">
                      対象ステークホルダー
                    </th>
                    <th className="w-12 px-2 py-2" aria-label="操作" />
                  </tr>
                </thead>
                <tbody>
                  {meetings.map((m, i) => (
                    <tr
                      key={m.id}
                      className="border-b border-gray-100 align-top hover:bg-gray-50/50"
                    >
                      <td className="px-2 py-2 align-middle text-xs text-gray-400">
                        {i + 1}
                      </td>
                      {MEETING_FIELDS.map((f) => (
                        <td key={f.key as string} className="px-1.5 py-1.5 align-middle">
                          {f.multiline ? (
                            <textarea
                              value={(m[f.key] as string | null) ?? ''}
                              onChange={(e) =>
                                setField(m.id, f.key, e.target.value)
                              }
                              onBlur={(e) =>
                                commitField(m.id, f.key, e.target.value)
                              }
                              rows={2}
                              placeholder={f.label}
                              className="w-full min-w-[120px] resize-y rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm text-gray-900 hover:border-gray-200 focus:border-primary focus:bg-white focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                          ) : (
                            <input
                              type="text"
                              value={(m[f.key] as string | null) ?? ''}
                              onChange={(e) =>
                                setField(m.id, f.key, e.target.value)
                              }
                              onBlur={(e) =>
                                commitField(m.id, f.key, e.target.value)
                              }
                              placeholder={f.label}
                              className="w-full min-w-[120px] rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm text-gray-900 hover:border-gray-200 focus:border-primary focus:bg-white focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                          )}
                        </td>
                      ))}

                      {/* 対象ステークホルダー（チップ + 複数選択） */}
                      <td className="bg-blue-50/40 px-2 py-1.5">
                        <div className="flex flex-wrap gap-1">
                          {m.stakeholderIds.map((sid) => {
                            const s = stakeholderById.get(sid);
                            return (
                              <span
                                key={sid}
                                className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] text-blue-800"
                                title={
                                  s
                                    ? `影響度:${s.influence || '—'} / 支持度:${s.support || '—'}`
                                    : '未登録'
                                }
                              >
                                <span
                                  className={`h-1.5 w-1.5 rounded-full ${supportDot(
                                    s?.support ?? null,
                                  )}`}
                                />
                                {s?.name ?? '（不明）'}
                                <button
                                  type="button"
                                  onClick={() => toggleStakeholder(m, sid)}
                                  className="text-blue-500 hover:text-blue-800"
                                  aria-label="外す"
                                >
                                  ×
                                </button>
                              </span>
                            );
                          })}
                        </div>
                        <div className="relative mt-1">
                          <button
                            type="button"
                            onClick={() =>
                              setOpenPicker(openPicker === m.id ? null : m.id)
                            }
                            disabled={!hasStakeholders}
                            className="flex items-center gap-1 rounded-md border border-blue-200 bg-white px-2 py-1 text-[11px] text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Users className="h-3 w-3" />
                            選択
                          </button>
                          {openPicker === m.id && hasStakeholders && (
                            <>
                              <button
                                type="button"
                                aria-label="閉じる"
                                onClick={() => setOpenPicker(null)}
                                className="fixed inset-0 z-10 cursor-default"
                              />
                              <div className="absolute z-20 mt-1 max-h-56 w-60 overflow-y-auto rounded-md border border-gray-200 bg-white p-1 shadow-lg">
                                {stakeholders.map((s) => {
                                  const checked = m.stakeholderIds.includes(
                                    s.id,
                                  );
                                  return (
                                    <label
                                      key={s.id}
                                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-gray-50"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() =>
                                          toggleStakeholder(m, s.id)
                                        }
                                        className="h-3.5 w-3.5"
                                      />
                                      <span
                                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${supportDot(
                                          s.support,
                                        )}`}
                                      />
                                      <span className="flex-1 text-gray-800">
                                        {s.name}
                                      </span>
                                      {s.influence && (
                                        <span className="rounded bg-gray-100 px-1 text-[10px] text-gray-500">
                                          影響{s.influence}
                                        </span>
                                      )}
                                    </label>
                                  );
                                })}
                              </div>
                            </>
                          )}
                        </div>
                      </td>

                      <td className="px-2 py-1.5 text-center align-middle">
                        <button
                          type="button"
                          onClick={() => handleDelete(m.id)}
                          className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                          title="この会議体を削除"
                          aria-label="この会議体を削除"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {meetings.length === 0 && (
                    <tr>
                      <td
                        colSpan={MEETING_FIELDS.length + 3}
                        className="px-4 py-10 text-center text-sm text-gray-400"
                      >
                        まだ会議体がありません。「会議体を追加」から始めましょう。
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-gray-100 px-3 py-2">
              <p className="text-xs text-gray-400">{meetings.length} 会議体</p>
              <button
                type="button"
                onClick={handleAdd}
                className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
              >
                <Plus className="h-4 w-4" />
                会議体を追加
              </button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 報告・連絡カレンダー（RecordSheet のまま、このタブのセクションとして） */}
      {reportCalendarTemplate && (
        <div className="space-y-2">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-[#050f3e]">
            <Megaphone className="h-4 w-4 text-blue-600" />
            報告・連絡カレンダー
          </h3>
          <p className="text-xs text-gray-500">
            {reportCalendarTemplate.description}
          </p>
          <RecordSheetTable
            projectId={projectId}
            template={reportCalendarTemplate}
          />
        </div>
      )}
    </div>
  );
}
