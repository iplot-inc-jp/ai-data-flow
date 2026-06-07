// 我々のドメイン（Task / TaskDependency）を frappe-gantt の FrappeTask[] へ
// 変換する純粋関数群。React / DOM に依存しない。
//
// 設計メモ:
//  - 並びは WBS（buildTaskTree → computeWbsNumbers）の表示順に揃える。
//  - name は「WBS番号 タイトル」。子は depth に応じて全角スペースでインデントする。
//  - frappe の end は「終了日込み」。start のみのタスクは end=start（1 日分）にする。
//  - dependencies は「この task を後続とする先行 id」をカンマ区切りで列挙する。
//    （frappe は task.dependencies に向かって 先行 → 後続 の矢印を描く。）
//  - frappe の progress は 0..100。我々の Task.progress も 0..100 なので無変換。

import type { FrappeTask } from 'frappe-gantt';
import {
  buildTaskTree,
  computeWbsNumbers,
  flattenTaskTree,
  type Task,
  type TaskDependency,
} from '@/lib/tasks';

/** 'YYYY-MM-DD'（ローカル日付）に整形。 */
export function dateToYmd(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

/** 文字列（'YYYY-MM-DD' / ISO）→ 'YYYY-MM-DD'。不正は null。 */
function normalizeYmd(value: string | null | undefined): string | null {
  if (!value) return null;
  const head = value.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(head)) return head;
  const t = Date.parse(value);
  if (Number.isNaN(t)) return null;
  return dateToYmd(new Date(t));
}

function clampProgress(n: number | null | undefined): number {
  if (n == null || Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export interface MapToFrappeOptions {
  /** 開始日が無いタスクのフォールバック基準日（通常は今日）。 */
  today?: Date;
}

/**
 * Task[] / TaskDependency[] を WBS 表示順の FrappeTask[] に変換する。
 *
 * @returns name 先頭に WBS 番号とインデントを付与した、表示順のタスク配列。
 */
export function mapTasksToFrappe(
  tasks: Task[],
  dependencies: TaskDependency[],
  options: MapToFrappeOptions = {}
): FrappeTask[] {
  const tree = buildTaskTree(tasks);
  const wbs = computeWbsNumbers(tree);
  const ordered = flattenTaskTree(tree); // depth を保持した WBS 表示順

  const todayYmd = dateToYmd(options.today ?? new Date());

  // この task を「後続」とする依存の先行 id を集める（successorId === task.id）。
  const predsBySuccessor = new Map<string, string[]>();
  for (const d of dependencies) {
    const arr = predsBySuccessor.get(d.successorId) ?? [];
    arr.push(d.predecessorId);
    predsBySuccessor.set(d.successorId, arr);
  }

  return ordered.map((node) => {
    const start = normalizeYmd(node.startDate) ?? todayYmd;
    // 期限が無ければ start と同日（frappe の end は「込み」なので 1 日分のバー）。
    let end = normalizeYmd(node.dueDate) ?? start;
    // 逆転していたら start に寄せる。
    if (end < start) end = start;

    const prefixNum = wbs.get(node.id);
    const indent = '　'.repeat(node.depth); // 全角スペースで階層を表現
    const name = prefixNum
      ? `${indent}${prefixNum} ${node.title}`
      : `${indent}${node.title}`;

    const deps = predsBySuccessor.get(node.id) ?? [];

    return {
      id: node.id,
      name,
      start,
      end,
      progress: clampProgress(node.progress),
      dependencies: deps.join(','),
    };
  });
}
