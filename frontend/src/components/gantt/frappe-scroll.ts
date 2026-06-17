// ガントの初期スクロール位置を決める純粋関数。
//
// frappe-mapping.ts から切り出した独立モジュール。frappe-mapping は `@/lib/tasks` を
// import するため node 環境の vitest（このリポジトリは @ エイリアスを解決しない）では
// 読み込めない。ここは DOM もエイリアス import も持たないのでそのまま単体テストできる。

/** 'YYYY-MM-DD'（ローカル日付）に整形。 */
function ymd(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

/**
 * ガントの初期スクロール位置を決める。
 *
 * frappe の既定 `scroll_to:'today'` は、タスクが今日付近に無いプロジェクト
 * （過去/未来に固まっている）だと開いた瞬間に空白のタイムラインへ飛んでしまい、
 * 「表示期間が変・バーが見えない」状態になる。そこで:
 *   - 今日がタスク期間内なら 'today'（従来どおり今日を見せる）
 *   - 今日が期間外なら最早開始日（最初のバーが左寄りに見える）
 *   - タスクが無ければ 'today'
 * を返す。月/週/日のどの表示でも、開いた瞬間にバーが視界に入る。
 *
 * start/end は 'YYYY-MM-DD' に正規化済み前提なので、辞書順比較＝日付順比較。
 */
export function computeInitialScroll(
  tasks: ReadonlyArray<{ start: string; end: string }>,
  today: Date = new Date()
): string {
  if (tasks.length === 0) return 'today';
  let min = tasks[0].start;
  let max = tasks[0].end;
  for (const t of tasks) {
    if (t.start && t.start < min) min = t.start;
    if (t.end && t.end > max) max = t.end;
  }
  const todayYmd = ymd(today);
  if (todayYmd >= min && todayYmd <= max) return 'today';
  return min;
}
