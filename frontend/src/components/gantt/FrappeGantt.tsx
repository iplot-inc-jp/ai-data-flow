'use client';

// frappe-gantt（MIT）のクライアント専用ラッパー。
//
// frappe-gantt は素の DOM/SVG を直接操作する命令型ライブラリのため、
// ページ側からは next/dynamic({ ssr:false }) で読み込み、ここで CSS を取り込む。
// React の管理する <div> に new Gantt(el, tasks, options) でマウントし、
// tasks の変化では refresh()、viewMode の変化では change_view_mode() を呼ぶ。
//
// コールバック（on_date_change / on_progress_change / on_click / onArrowClick）は
// ref 経由で最新の関数を呼ぶようにし、インスタンスを毎回作り直さなくても済むようにする。
//
// 依存（矢印）編集のため:
//  - mode='connect' のときはコンテナに接続用クラスを付け、バークリックを接続ロジックに回す
//    （実際のモード分岐はページ側 onClick が担う。ここでは見た目だけ切り替える）。
//  - pendingFromId のバーをハイライト（接続元の見える化）。
//  - 矢印 <path data-from data-to> の委譲クリックで onArrowClick(from,to) を呼ぶ。

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
  /** 依存（矢印）クリック時。data-from=先行, data-to=後続。 */
  onArrowClick: (fromId: string, toId: string) => void;
  /** 'navigate'=クリックで詳細へ / 'connect'=クリックで依存を引く接続モード。 */
  mode: 'navigate' | 'connect';
  /** 接続モードで選択済みの先行タスク id（未選択は null）。バーをハイライトする。 */
  pendingFromId: string | null;
}

// frappe-gantt の内部 API（型定義が無い）に触れるための最小ナロー型。
// bars: 各バーは .task.id と .group（SVG <g class="bar-wrapper">）を持つ。
type GanttInternal = {
  bars?: { task: { id: string }; group: SVGGElement }[];
};

export default function FrappeGantt({
  tasks,
  viewMode,
  onDateChange,
  onProgressChange,
  onClick,
  onArrowClick,
  mode,
  pendingFromId,
}: FrappeGanttProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const ganttRef = useRef<Gantt | null>(null);

  // コールバックは最新参照を ref に保持（インスタンスは初回のみ生成するため）。
  const cbRef = useRef({ onDateChange, onProgressChange, onClick, onArrowClick });
  cbRef.current = { onDateChange, onProgressChange, onClick, onArrowClick };

  // 初回マウント: Gantt インスタンス生成 + 矢印クリックの委譲リスナー登録。
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

    // 矢印クリックは委譲リスナーで拾う。refresh() で矢印 <path> が作り直されても、
    // コンテナ自体は残るのでリスナーは生き続ける。
    const handleArrowClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      const path = target?.closest?.('path[data-from]') as SVGPathElement | null;
      if (!path) return;
      const from = path.getAttribute('data-from');
      const to = path.getAttribute('data-to');
      if (from && to) cbRef.current.onArrowClick(from, to);
    };
    el.addEventListener('click', handleArrowClick);

    return () => {
      el.removeEventListener('click', handleArrowClick);
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

  // 接続モードの見た目（カーソル等）をコンテナのクラスで切り替える。
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.classList.toggle('connect-mode', mode === 'connect');
  }, [mode]);

  // 接続元バーのハイライト。pendingFromId が変わるたびに前回分をクリアして付け直す。
  // refresh() でも DOM が作り直されるが、tasks 変化時はこの effect も pendingFromId
  // を維持したまま再評価されないため、refresh 直後はハイライトが外れる場合がある。
  // その場合 pendingFromId は接続成立時にクリアされる運用なので実害は無い。
  useEffect(() => {
    const gantt = ganttRef.current as (Gantt & GanttInternal) | null;
    if (!gantt) return;
    try {
      // frappe 内部 API（bars）に触れるため try/catch で囲う。
      const bars = gantt.bars ?? [];
      bars.forEach((b) => b.group?.classList?.remove('connect-source'));
      if (pendingFromId) {
        const bar = bars.find((b) => b.task.id === pendingFromId);
        bar?.group?.classList?.add('connect-source');
      }
    } catch (err) {
      console.error('Failed to highlight connect source:', err);
    }
  }, [pendingFromId, tasks]);

  return <div ref={containerRef} className="frappe-gantt-host" />;
}
