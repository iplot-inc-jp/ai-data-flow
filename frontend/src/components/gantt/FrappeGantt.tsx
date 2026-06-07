'use client';

// frappe-gantt（MIT）のクライアント専用ラッパー。
//
// frappe-gantt は素の DOM/SVG を直接操作する命令型ライブラリのため、
// ページ側からは next/dynamic({ ssr:false }) で読み込み、ここで CSS を取り込む。
// React の管理する <div> に new Gantt(el, tasks, options) でマウントし、
// tasks の変化では refresh()、viewMode の変化では change_view_mode() を呼ぶ。
//
// コールバック（on_date_change / on_progress_change / on_click）は ref 経由で
// 最新の関数を呼ぶようにし、インスタンスを毎回作り直さなくても済むようにする。

import { useEffect, useRef } from 'react';
import Gantt, {
  type FrappeTask,
  type FrappeViewMode,
} from 'frappe-gantt';
// frappe-gantt の package.json exports は CSS サブパスを公開しないため、
// dist/frappe-gantt.css をローカルにベンダリングして読み込む（MIT）。
import './frappe-gantt.vendor.css';

export type { FrappeTask, FrappeViewMode };

export interface FrappeGanttProps {
  tasks: FrappeTask[];
  viewMode: FrappeViewMode;
  /** バー本体ドラッグ／端リサイズ確定時。start/end はその日 0:00 / 終了日。 */
  onDateChange: (id: string, start: Date, end: Date) => void;
  /** 進捗ハンドル操作時（0..100）。 */
  onProgressChange: (id: string, progress: number) => void;
  /** バークリック時。 */
  onClick: (id: string) => void;
}

export default function FrappeGantt({
  tasks,
  viewMode,
  onDateChange,
  onProgressChange,
  onClick,
}: FrappeGanttProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const ganttRef = useRef<Gantt | null>(null);

  // コールバックは最新参照を ref に保持（インスタンスは初回のみ生成するため）。
  const cbRef = useRef({ onDateChange, onProgressChange, onClick });
  cbRef.current = { onDateChange, onProgressChange, onClick };

  // 初回マウント: Gantt インスタンス生成。
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // frappe-gantt は渡したタスクオブジェクトを破壊的に書き換える（id/dependencies の
    // 正規化など）。React state を汚さないようプレーンコピーを渡す。
    const initial = tasks.map((t) => ({ ...t }));

    const gantt = new Gantt(el, initial, {
      view_mode: viewMode,
      language: 'ja',
      bar_height: 22,
      padding: 14,
      popup_on: 'hover',
      on_date_change: (task, start, end) => {
        cbRef.current.onDateChange(String(task.id), start, end);
      },
      on_progress_change: (task, progress) => {
        cbRef.current.onProgressChange(String(task.id), progress);
      },
      on_click: (task) => {
        cbRef.current.onClick(String(task.id));
      },
    });
    ganttRef.current = gantt;

    return () => {
      // frappe-gantt に dispose API は無いので DOM を空にして破棄。
      ganttRef.current = null;
      if (el) el.innerHTML = '';
    };
    // 初回のみ。tasks/viewMode の更新は別 effect で反映する。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // tasks 変化: refresh（現在の表示モードは維持される）。
  useEffect(() => {
    const gantt = ganttRef.current;
    if (!gantt) return;
    gantt.refresh(tasks.map((t) => ({ ...t })));
    // refresh は内部で change_view_mode() を呼び現在モードを維持するが、
    // 念のため viewMode を反映しておく。
    gantt.change_view_mode(viewMode);
  }, [tasks, viewMode]);

  return <div ref={containerRef} className="frappe-gantt-host" />;
}
