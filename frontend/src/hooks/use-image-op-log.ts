'use client';

// 業務フローキャンバスの画像要素(DiagramElement)の Undo/Redo を、スナップショットではなく
// 操作ログ（op-log）で管理するフック。各ジェスチャ（作成/移動/リサイズ/削除）が「順操作(do)」と
// 「逆操作(undo)」のペアを記録し、undo/redo はそのペアをローカルへ純粋適用(applyDelta)しつつ
// 冪等な applyOps でサーバへ反映する。スナップショット比較・全件再取得・isRestoring 窓・jsonb
// キー順といった脆い機構を一切持たないため、設計上 race を生まない（applyDelta は純粋関数で
// ユニットテスト可能）。
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import {
  diagramElementApi,
  type DiagramElementDto,
  type DiagramElementOp,
} from '@/lib/diagram-elements';
import { nextUndoSeq } from './undo-seq';
import { applyDelta } from './image-op-delta';

// 純粋リデューサは ./image-op-delta から再エクスポート（node 環境の vitest 用に分離している）。
export { applyDelta };

const MAX_OPS = 50;

interface OpEntry {
  do: DiagramElementOp;
  undo: DiagramElementOp;
  seq: number;
}

/** 親（page）が ⌘Z ルーターから画像Undoを駆動するための命令的ハンドル。 */
export interface ImageUndoApi {
  undo: () => void;
  redo: () => void;
  /** undo で取り消される操作の seq（無ければ null）。 */
  peekUndoSeq: () => number | null;
  /** redo で再適用される操作の seq（無ければ null）。 */
  peekRedoSeq: () => number | null;
}

export interface UseImageOpLogResult extends ImageUndoApi {
  /** ジェスチャ確定時に順操作と逆操作を記録する（操作自体は呼び出し側が既に適用済み）。 */
  recordImageOp: (doOp: DiagramElementOp, undoOp: DiagramElementOp) => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function useImageOpLog(params: {
  projectId?: string;
  diagramId: string;
  setImageElements: Dispatch<SetStateAction<DiagramElementDto[]>>;
}): UseImageOpLogResult {
  const { projectId, diagramId, setImageElements } = params;
  // past/future は ref で保持（ルーターの peek* が常に最新を読む）。UI 用の真偽は force で再描画。
  const pastRef = useRef<OpEntry[]>([]);
  const futureRef = useRef<OpEntry[]>([]);
  const [, force] = useState(0);
  const rerender = useCallback(() => force((n) => n + 1), []);

  // フロー切替（diagramId 変更）で op-log を破棄する。SwimlaneCanvasInner はドリルダウンで
  // 再マウントされず diagramId だけが変わるため、これをしないと別フローの操作を取り消してしまう。
  useEffect(() => {
    pastRef.current = [];
    futureRef.current = [];
    rerender();
  }, [diagramId, rerender]);

  // 1 op をローカル(applyDelta)へ楽観反映し、サーバ(applyOps 冪等)へ送る。サーバ失敗時は
  // ローカルを逆操作で巻き戻し（＝サーバ真実に再同期）＋スタックも元へ戻して silent divergence を防ぐ。
  // 失敗を握りつぶすと、ローカルは undo 済み表示のままサーバは未反映 → フロー切替/リロードの
  // list() 上書きで undo が黙って消える（ユーザ intent の喪失）。
  const applyWithRollback = useCallback(
    (op: DiagramElementOp, onServerError: () => void) => {
      setImageElements((prev) => applyDelta(prev, op));
      if (!projectId) return;
      void diagramElementApi
        .applyOps(projectId, 'FLOW', diagramId, [op])
        .catch((e) => {
          console.error('[image-undo] applyOps failed; rolling back', e);
          onServerError();
        });
    },
    [projectId, diagramId, setImageElements],
  );

  const recordImageOp = useCallback(
    (doOp: DiagramElementOp, undoOp: DiagramElementOp) => {
      pastRef.current.push({ do: doOp, undo: undoOp, seq: nextUndoSeq() });
      if (pastRef.current.length > MAX_OPS) pastRef.current.shift();
      futureRef.current = []; // 新規操作で redo 分岐は破棄。
      rerender();
    },
    [rerender],
  );

  const undo = useCallback(() => {
    const entry = pastRef.current[pastRef.current.length - 1];
    if (!entry) return;
    pastRef.current.pop();
    futureRef.current.push(entry);
    rerender();
    // 逆操作を反映。サーバ失敗時は entry がまだ future 先頭の時だけ、ローカル(do 再適用)とスタックを
    // 同一ガード下で巻き戻す。その後に新 op が入っていれば一切触らず、次の list() 再取得で自己回復させる
    // （順序敏感な applyDelta の部分適用で local/server を乖離させないため）。
    applyWithRollback(entry.undo, () => {
      if (futureRef.current[futureRef.current.length - 1] === entry) {
        futureRef.current.pop();
        pastRef.current.push(entry);
        setImageElements((prev) => applyDelta(prev, entry.do));
        rerender();
      }
    });
  }, [applyWithRollback, rerender, setImageElements]);

  const redo = useCallback(() => {
    const entry = futureRef.current[futureRef.current.length - 1];
    if (!entry) return;
    futureRef.current.pop();
    pastRef.current.push(entry);
    rerender();
    applyWithRollback(entry.do, () => {
      if (pastRef.current[pastRef.current.length - 1] === entry) {
        pastRef.current.pop();
        futureRef.current.push(entry);
        setImageElements((prev) => applyDelta(prev, entry.undo));
        rerender();
      }
    });
  }, [applyWithRollback, rerender, setImageElements]);

  return {
    recordImageOp,
    undo,
    redo,
    canUndo: pastRef.current.length > 0,
    canRedo: futureRef.current.length > 0,
    peekUndoSeq: () =>
      pastRef.current.length ? pastRef.current[pastRef.current.length - 1].seq : null,
    peekRedoSeq: () =>
      futureRef.current.length ? futureRef.current[futureRef.current.length - 1].seq : null,
  };
}
