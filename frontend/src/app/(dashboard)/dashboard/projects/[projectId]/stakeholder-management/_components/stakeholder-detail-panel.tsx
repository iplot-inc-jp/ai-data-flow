'use client';

// 人単位ビュー（ステークホルダー詳細サイドパネル）。
//
// 1人のステークホルダーに関する情報を集約表示する:
// - 側（内部/外部）・役職・役割・関心・懸念
// - 担当領域（RACI 一覧）
// - 導入状況（対象システムごとの段階バッジ＋次アクション。無ければ未着手）
// - 所有リスク（Risk.ownerStakeholderId の逆引き。スコア/ライフサイクル付き）
// - 主催/参加会議（Meeting の逆引き。主催は王冠アイコン）

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  X,
  Pencil,
  Crown,
  FolderTree,
  ShieldAlert,
  CalendarClock,
  ExternalLink,
  Rocket,
} from 'lucide-react';
import {
  normalizeSide,
  sideMeta,
  raciMeta,
  pickRaci,
  orderDomainTree,
  adoptionApi,
  adoptionStageMeta,
  normalizeAdoptionStage,
  type AdoptionStage,
  type DomainAssignment,
  type Meeting,
  type Stakeholder,
} from '@/lib/stakeholders';
import {
  riskScore,
  scoreBandBadgeClasses,
  scoreBand,
  lifecycleMeta,
  type Risk,
} from '@/lib/risks';
import { systemApi, type SubProjectMaster, type SystemMaster } from '@/lib/masters';

/** 導入状況セクションの1行（システム or 全体 × 段階 × 次アクション）。 */
interface AdoptionEntry {
  key: string;
  label: string;
  stage: AdoptionStage;
  nextAction: string | null;
}

export function StakeholderDetailPanel({
  projectId,
  stakeholder,
  domains,
  assignments,
  risks,
  meetings,
  onClose,
  onEdit,
}: {
  projectId: string;
  stakeholder: Stakeholder;
  domains: SubProjectMaster[];
  assignments: DomainAssignment[];
  risks: Risk[];
  /** この人が参加/主催する会議（親で逆引き済み）。 */
  meetings: { meeting: Meeting; isOwner: boolean }[];
  onClose: () => void;
  onEdit: () => void;
}) {
  const side = normalizeSide(stakeholder.side);

  const domainById = useMemo(
    () => new Map(domains.map((d) => [d.id, d])),
    [domains],
  );

  // 担当領域（ツリー順に並べる）
  const myAssignments = useMemo(() => {
    const mine = new Map<string, string | null>();
    for (const a of assignments) {
      if (a.stakeholderId === stakeholder.id) mine.set(a.subProjectId, a.raci);
    }
    return orderDomainTree(domains)
      .filter(({ row }) => mine.has(row.id))
      .map(({ row, depth }) => ({
        domain: row,
        depth,
        raci: pickRaci(mine.get(row.id)),
      }));
  }, [assignments, domains, stakeholder.id]);

  // 所有リスク（ownerStakeholderId の逆引き）
  const ownedRisks = useMemo(
    () => risks.filter((r) => r.ownerStakeholderId === stakeholder.id),
    [risks, stakeholder.id],
  );

  // 導入状況（この人 × 対象システム）。パネル内で自前取得。
  // 取得失敗は「記録なし（未着手）」と区別して控えめに表示する。
  const [adoptionEntries, setAdoptionEntries] = useState<
    AdoptionEntry[] | null
  >(null);
  const [adoptionLoadFailed, setAdoptionLoadFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setAdoptionEntries(null);
    setAdoptionLoadFailed(false);
    (async () => {
      try {
        const [adoptions, systems] = await Promise.all([
          adoptionApi.list(projectId),
          systemApi.list(projectId).catch(() => [] as SystemMaster[]),
        ]);
        if (cancelled) return;
        const mine = adoptions.filter(
          (a) => a.stakeholderId === stakeholder.id,
        );
        const byKey = new Map(mine.map((a) => [a.systemId ?? '', a]));
        const entries: AdoptionEntry[] = [];
        // 全体（systemId null）の記録があれば先頭に
        const whole = byKey.get('');
        if (whole) {
          entries.push({
            key: '__whole__',
            label: '全体（プロジェクト共通）',
            stage: normalizeAdoptionStage(whole.stage),
            nextAction: whole.nextAction,
          });
        }
        // 対象システム（TARGET）は記録が無くても未着手として並べる
        for (const sys of systems.filter((s) => s.kind === 'TARGET')) {
          const a = byKey.get(sys.id);
          entries.push({
            key: sys.id,
            label: sys.name,
            stage: normalizeAdoptionStage(a?.stage),
            nextAction: a?.nextAction ?? null,
          });
        }
        // 対象外システムへの記録も漏らさず表示
        for (const a of mine) {
          if (!a.systemId) continue;
          if (entries.some((e) => e.key === a.systemId)) continue;
          const sys = systems.find((s) => s.id === a.systemId);
          entries.push({
            key: a.systemId,
            label: sys?.name ?? '（不明なシステム）',
            stage: normalizeAdoptionStage(a.stage),
            nextAction: a.nextAction,
          });
        }
        setAdoptionEntries(entries);
      } catch {
        if (!cancelled) {
          setAdoptionLoadFailed(true);
          setAdoptionEntries([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, stakeholder.id]);

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-md flex-col bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="border-b border-gray-200 px-5 py-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold text-[#050f3e]">
                  {stakeholder.name || '（無名）'}
                </h3>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${sideMeta[side].badge}`}
                >
                  {sideMeta[side].label}
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                {[stakeholder.affiliation, stakeholder.role]
                  .filter(Boolean)
                  .join(' / ') || '所属・役割 未設定'}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={onEdit}
                className="flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                title="この人を編集"
              >
                <Pencil className="h-3.5 w-3.5" />
                編集
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded p-1 text-gray-500 hover:bg-gray-100"
                aria-label="閉じる"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 space-y-5 overflow-auto px-5 py-4">
          {/* 関心・懸念 */}
          <section className="space-y-2">
            <h4 className="text-xs font-semibold text-gray-500">関心・懸念</h4>
            <div className="space-y-2 text-sm">
              <div className="rounded-md border border-gray-100 bg-gray-50/60 p-2.5">
                <p className="text-[11px] font-medium text-gray-400">
                  関心事（成功と感じるもの）
                </p>
                <p className="mt-0.5 whitespace-pre-wrap text-gray-800">
                  {stakeholder.interest || (
                    <span className="text-gray-300">—</span>
                  )}
                </p>
              </div>
              <div className="rounded-md border border-gray-100 bg-gray-50/60 p-2.5">
                <p className="text-[11px] font-medium text-gray-400">
                  不安・懸念
                </p>
                <p className="mt-0.5 whitespace-pre-wrap text-gray-800">
                  {stakeholder.concern || (
                    <span className="text-gray-300">—</span>
                  )}
                </p>
              </div>
            </div>
          </section>

          {/* 担当領域（RACI） */}
          <section className="space-y-2">
            <h4 className="flex items-center gap-1.5 text-xs font-semibold text-gray-500">
              <FolderTree className="h-3.5 w-3.5 text-indigo-600" />
              担当領域（RACI）
              <span className="text-gray-400">{myAssignments.length} 件</span>
            </h4>
            {myAssignments.length > 0 ? (
              <ul className="space-y-1">
                {myAssignments.map(({ domain, depth, raci }) => (
                  <li
                    key={domain.id}
                    className="flex items-center gap-2 text-sm"
                    style={{ paddingLeft: `${depth * 16}px` }}
                  >
                    {raci ? (
                      <span
                        className={`inline-flex h-5 w-9 shrink-0 items-center justify-center rounded border text-[11px] font-bold ${raciMeta[raci].chip}`}
                        title={raciMeta[raci].label}
                      >
                        {raci === 'A' ? '★A' : raci}
                      </span>
                    ) : (
                      <span className="inline-flex h-5 w-9 shrink-0 items-center justify-center rounded border border-gray-200 text-[11px] text-gray-300">
                        —
                      </span>
                    )}
                    <span className="text-gray-800">{domain.name}</span>
                    {raci && (
                      <span className="text-[11px] text-gray-400">
                        {raciMeta[raci].label}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-gray-400">
                担当領域はありません（編集モーダル、または下の RACI
                マトリクスで割り当てられます）。
              </p>
            )}
          </section>

          {/* 導入状況（対象システムごとの段階＋次アクション） */}
          <section className="space-y-2">
            <h4 className="flex items-center gap-1.5 text-xs font-semibold text-gray-500">
              <Rocket className="h-3.5 w-3.5 text-emerald-600" />
              導入状況
            </h4>
            {adoptionEntries == null ? (
              <p className="text-xs text-gray-400">読み込み中…</p>
            ) : adoptionLoadFailed ? (
              <p className="text-xs text-gray-400">
                導入状況を読み込めませんでした（再度開くと再取得します）。
              </p>
            ) : adoptionEntries.length === 0 ? (
              <p className="flex items-center gap-1.5 text-xs text-gray-400">
                <span
                  className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${adoptionStageMeta.NOT_STARTED.badge}`}
                >
                  {adoptionStageMeta.NOT_STARTED.label}
                </span>
                導入状況の記録はまだありません（「導入状況」タブで更新できます）。
              </p>
            ) : (
              <ul className="space-y-1">
                {adoptionEntries.map((entry) => (
                  <li
                    key={entry.key}
                    className="rounded-md border border-gray-100 bg-gray-50/60 px-2.5 py-1.5"
                  >
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span
                        className="min-w-0 truncate text-gray-800"
                        title={entry.label}
                      >
                        {entry.label}
                      </span>
                      <span
                        className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${adoptionStageMeta[entry.stage].badge}`}
                      >
                        {adoptionStageMeta[entry.stage].label}
                      </span>
                    </div>
                    {entry.nextAction && (
                      <p className="mt-0.5 whitespace-pre-wrap text-[11px] text-gray-500">
                        次アクション: {entry.nextAction}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 所有リスク */}
          <section className="space-y-2">
            <h4 className="flex items-center justify-between text-xs font-semibold text-gray-500">
              <span className="flex items-center gap-1.5">
                <ShieldAlert className="h-3.5 w-3.5 text-rose-600" />
                所有リスク（リスクオーナー）
                <span className="text-gray-400">{ownedRisks.length} 件</span>
              </span>
              <Link
                href={`/dashboard/projects/${projectId}/risk-management`}
                className="flex items-center gap-0.5 text-[11px] font-medium text-blue-600 hover:underline"
              >
                リスク管理へ
                <ExternalLink className="h-3 w-3" />
              </Link>
            </h4>
            {ownedRisks.length > 0 ? (
              <ul className="space-y-1.5">
                {ownedRisks.map((r) => {
                  const score = riskScore(r.probabilityScore, r.impactScore);
                  const lc = lifecycleMeta(r.lifecycle);
                  return (
                    <li key={r.id}>
                      <Link
                        href={`/dashboard/projects/${projectId}/risk-management`}
                        className="flex items-center gap-2 rounded-md border border-gray-100 bg-gray-50/60 px-2.5 py-1.5 text-sm transition-colors hover:border-blue-200 hover:bg-blue-50/40"
                        title={`${r.event ?? ''} — リスク管理で開く`}
                      >
                        {r.code && (
                          <span className="shrink-0 text-[11px] font-mono text-gray-400">
                            {r.code}
                          </span>
                        )}
                        <span className="min-w-0 flex-1 truncate text-gray-800">
                          {r.event || '（内容未記入）'}
                        </span>
                        {score != null && (
                          <span
                            className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-bold ${scoreBandBadgeClasses[scoreBand(score)]}`}
                            title={`スコア P×I = ${score}`}
                          >
                            {score}
                          </span>
                        )}
                        <span
                          className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${lc.chip}`}
                        >
                          {lc.label}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-xs text-gray-400">
                この人がオーナーのリスクはありません。
              </p>
            )}
          </section>

          {/* 主催/参加会議 */}
          <section className="space-y-2">
            <h4 className="flex items-center justify-between text-xs font-semibold text-gray-500">
              <span className="flex items-center gap-1.5">
                <CalendarClock className="h-3.5 w-3.5 text-blue-600" />
                主催/参加会議
                <span className="text-gray-400">{meetings.length} 件</span>
              </span>
              <Link
                href={`/dashboard/projects/${projectId}/meetings`}
                className="flex items-center gap-0.5 text-[11px] font-medium text-blue-600 hover:underline"
              >
                会議マスタへ
                <ExternalLink className="h-3 w-3" />
              </Link>
            </h4>
            {meetings.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {meetings.map(({ meeting, isOwner }) => (
                  <Link
                    key={meeting.id}
                    href={`/dashboard/projects/${projectId}/meetings`}
                    className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] text-blue-800 transition-colors hover:bg-blue-200"
                    title={
                      isOwner
                        ? `${meeting.name}（主催）— 会議マスタで管理`
                        : `${meeting.name} — 会議マスタで管理`
                    }
                  >
                    {isOwner && <Crown className="h-3 w-3 text-amber-500" />}
                    {meeting.name || '（無題）'}
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400">
                参加している会議はありません。
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
