'use client';

// RACI マトリクス（領域 × 人）。
//
// 行 = 領域（SubProject、親子インデント）、列 = ステークホルダー
// （外部/内部でグループ）。セルクリックで R→A→C→I→なし を循環し、
// 親（stakeholder-table-board）が replace-all 保存する。
// PMBOK では A（説明責任）は各領域に1人が原則なので、
// A が複数 or 0人の行には行頭に注意アイコンを出す。

import { useMemo } from 'react';
import { AlertTriangle, CornerDownRight, FolderTree } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import {
  normalizeSide,
  sideMeta,
  raciMeta,
  pickRaci,
  cycleRaci,
  orderDomainTree,
  type DomainAssignment,
  type Raci,
  type Stakeholder,
} from '@/lib/stakeholders';
import type { SubProjectMaster } from '@/lib/masters';

export function RaciMatrix({
  domains,
  stakeholders,
  assignments,
  onCellChange,
}: {
  domains: SubProjectMaster[];
  stakeholders: Stakeholder[];
  assignments: DomainAssignment[];
  /** セルの新しい値（null=割当なし）。保存は親が行う。 */
  onCellChange: (
    stakeholderId: string,
    subProjectId: string,
    raci: Raci | null,
  ) => void | Promise<void>;
}) {
  const treeRows = useMemo(() => orderDomainTree(domains), [domains]);

  // 外部 → 内部 の順に列グループ化
  const groups = useMemo(() => {
    const external = stakeholders.filter(
      (s) => normalizeSide(s.side) === 'EXTERNAL',
    );
    const internal = stakeholders.filter(
      (s) => normalizeSide(s.side) === 'INTERNAL',
    );
    return [
      { side: 'EXTERNAL' as const, members: external },
      { side: 'INTERNAL' as const, members: internal },
    ].filter((g) => g.members.length > 0);
  }, [stakeholders]);

  const columns = useMemo(
    () => groups.flatMap((g) => g.members),
    [groups],
  );

  // (subProjectId, stakeholderId) → raci
  const cellMap = useMemo(() => {
    const m = new Map<string, Raci>();
    for (const a of assignments) {
      const raci = pickRaci(a.raci);
      if (raci) m.set(`${a.subProjectId}__${a.stakeholderId}`, raci);
    }
    return m;
  }, [assignments]);

  if (domains.length === 0 || columns.length === 0) {
    return (
      <Card className="bg-white border-gray-200">
        <CardContent className="py-8 text-center text-sm text-gray-400">
          {domains.length === 0
            ? '領域がありません。「領域」ページで領域を作成すると、ここで担当（RACI）を割り当てられます。'
            : 'ステークホルダーがいません。追加すると、ここで領域ごとの担当（RACI）を割り当てられます。'}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white border-gray-200">
      <CardContent className="overflow-x-auto p-0">
        <table className="w-full border-collapse text-sm">
          <thead>
            {/* グループ行（外部 / 内部） */}
            <tr className="border-b border-gray-200">
              <th className="min-w-[180px] bg-gray-50 px-3 py-1.5 text-left text-[11px] font-semibold text-gray-400">
                領域 \ ステークホルダー
              </th>
              {groups.map((g) => (
                <th
                  key={g.side}
                  colSpan={g.members.length}
                  className={`border-l border-gray-200 px-2 py-1.5 text-center text-[11px] font-semibold ${
                    g.side === 'EXTERNAL'
                      ? 'bg-blue-50 text-blue-700'
                      : 'bg-emerald-50 text-emerald-700'
                  }`}
                >
                  {sideMeta[g.side].label}
                </th>
              ))}
            </tr>
            {/* 氏名行 */}
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="px-3 py-2" />
              {groups.flatMap((g) =>
                g.members.map((s) => (
                  <th
                    key={s.id}
                    className="min-w-[72px] border-l border-gray-100 px-2 py-2 text-center text-xs font-semibold text-gray-700"
                    title={s.affiliation ?? undefined}
                  >
                    {s.name || '（無名）'}
                  </th>
                )),
              )}
            </tr>
          </thead>
          <tbody>
            {treeRows.map(({ row: domain, depth }) => {
              // この領域の A の人数（PMBOK: A は1人）
              const aCount = columns.filter(
                (s) => cellMap.get(`${domain.id}__${s.id}`) === 'A',
              ).length;
              return (
                <tr
                  key={domain.id}
                  className="border-b border-gray-100 hover:bg-gray-50/60"
                >
                  <td
                    className="whitespace-nowrap px-3 py-1.5 align-middle"
                    style={{ paddingLeft: `${12 + depth * 20}px` }}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      {aCount !== 1 && (
                        <span
                          className="shrink-0"
                          title={
                            aCount === 0
                              ? '説明責任(A)が未設定です（PMBOK: Aは各領域に1人）'
                              : `説明責任(A)が${aCount}人います（PMBOK: Aは各領域に1人）`
                          }
                        >
                          <AlertTriangle
                            className={`h-3.5 w-3.5 ${
                              aCount === 0 ? 'text-amber-400' : 'text-rose-500'
                            }`}
                          />
                        </span>
                      )}
                      {depth > 0 ? (
                        <CornerDownRight className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                      ) : (
                        <FolderTree className="h-3.5 w-3.5 shrink-0 text-indigo-600" />
                      )}
                      <span
                        className={
                          depth > 0
                            ? 'text-gray-700'
                            : 'font-medium text-gray-800'
                        }
                      >
                        {domain.name}
                      </span>
                    </span>
                  </td>
                  {columns.map((s) => {
                    const raci = cellMap.get(`${domain.id}__${s.id}`) ?? null;
                    return (
                      <td
                        key={s.id}
                        className="border-l border-gray-100 px-1 py-1 text-center align-middle"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            void onCellChange(s.id, domain.id, cycleRaci(raci))
                          }
                          className={`inline-flex h-6 w-9 items-center justify-center rounded border text-xs font-bold transition-colors ${
                            raci
                              ? raciMeta[raci].chip
                              : 'border-dashed border-gray-200 text-gray-300 hover:border-blue-300 hover:text-blue-500'
                          }`}
                          title={
                            raci
                              ? `${s.name} × ${domain.name}: ${raci}（${raciMeta[raci].label}）— クリックで切替`
                              : `${s.name} × ${domain.name}: 割当なし — クリックで R から割当`
                          }
                        >
                          {raci === 'A' ? '★A' : (raci ?? '—')}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* 凡例 */}
        <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 px-3 py-2 text-[11px] text-gray-500">
          {(['R', 'A', 'C', 'I'] as Raci[]).map((r) => (
            <span key={r} className="inline-flex items-center gap-1">
              <span
                className={`inline-flex h-4 w-7 items-center justify-center rounded border text-[10px] font-bold ${raciMeta[r].chip}`}
              >
                {r === 'A' ? '★A' : r}
              </span>
              {raciMeta[r].label}
            </span>
          ))}
          <span className="inline-flex items-center gap-1">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
            A（説明責任）が1人でない領域
          </span>
          <span>セルをクリックすると R→A→C→I→なし の順に切り替わります。</span>
        </div>
      </CardContent>
    </Card>
  );
}
