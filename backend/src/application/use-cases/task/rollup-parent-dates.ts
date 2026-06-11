import { ITaskRepository } from '../../../domain';

/**
 * 親タスクの期間ロールアップ。
 * 「親タスクは子タスクの最大と最小の日付に合わせる」仕様の共有ヘルパ。
 *
 * - parent.startDate = 子タスク群の startDate の最小（null は無視）
 * - parent.dueDate   = 子タスク群の dueDate の最大（null は無視）
 * - 子が1件も該当日付を持たない場合、そのフィールドは現状維持
 * - 再計算で親の日付が変わったら、さらにその親へと祖先方向に伝播（ルートまで）
 */

/** Date | null 同士の等価判定（getTime ベース） */
export function isSameDate(a: Date | null, b: Date | null): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  return a.getTime() === b.getTime();
}

/**
 * 指定タスク（通常は変更が起きたタスクの親）から祖先方向へ順に
 * 期間を再計算して保存する。
 *
 * 日付が変わらなくなった時点で打ち切る（それより上の祖先は影響を受けない）。
 * parentId 構造上 cycle は起きない前提だが、念のため訪問済みガードを持つ。
 */
export async function rollupAncestorDates(
  taskRepository: ITaskRepository,
  startTaskId: string | null | undefined,
): Promise<void> {
  const visited = new Set<string>();
  let currentId: string | null = startTaskId ?? null;

  while (currentId !== null && !visited.has(currentId)) {
    visited.add(currentId);

    const parent = await taskRepository.findById(currentId);
    if (!parent) {
      return;
    }

    const children = await taskRepository.findChildrenByParentId(parent.id);

    const childStarts = children
      .map((c) => c.startDate)
      .filter((d): d is Date => d !== null);
    const childDues = children
      .map((c) => c.dueDate)
      .filter((d): d is Date => d !== null);

    // 子が日付を持たないフィールドは現状維持（undefined = 変更しない）
    const nextStart =
      childStarts.length > 0
        ? new Date(Math.min(...childStarts.map((d) => d.getTime())))
        : undefined;
    const nextDue =
      childDues.length > 0
        ? new Date(Math.max(...childDues.map((d) => d.getTime())))
        : undefined;

    const startChanged =
      nextStart !== undefined && !isSameDate(nextStart, parent.startDate);
    const dueChanged =
      nextDue !== undefined && !isSameDate(nextDue, parent.dueDate);

    if (!startChanged && !dueChanged) {
      // この親の期間が変わらないなら、さらに上の祖先も変わらない
      return;
    }

    parent.update({
      startDate: startChanged ? nextStart : undefined,
      dueDate: dueChanged ? nextDue : undefined,
    });
    await taskRepository.save(parent);

    currentId = parent.parentId;
  }
}
