// 複数の Undo チャンネル（業務フローのスナップショット履歴と画像要素の op-log）を横断して
// 「直近に行われた操作はどちらか」を判定するための、セッション内で単調増加する共有シーケンス番号。
// page 側のルーターが各チャンネルの peekUndoSeq()/peekRedoSeq() を比較して Cmd+Z の振り先を決める。
let _seq = 0;

/** 次の単調増加シーケンス番号を返す（操作を記録/捕捉するたびに採番）。 */
export function nextUndoSeq(): number {
  _seq += 1;
  return _seq;
}
