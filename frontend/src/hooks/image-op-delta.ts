// 画像 op-log の純粋リデューサ。React も `@/` エイリアスも値 import せず（型のみ相対 import）、
// node 環境の vitest からそのまま読めるよう独立させている（use-image-op-log は値 import を持つ）。
import type { DiagramElementDto, DiagramElementOp } from '../lib/diagram-elements';

/**
 * op を画像配列へ純粋適用（楽観反映）。
 * - upsert: 既存 id は該当要素にフィールド上書き、未存在 id は末尾追加（id 保持）。
 * - delete: 指定 id を除去。
 * サーバ側 applyOps と同じ意味を持たせ、undo/redo 後に全件再取得しなくても整合する。
 */
export function applyDelta(
  images: DiagramElementDto[],
  op: DiagramElementOp,
): DiagramElementDto[] {
  if (op.type === 'delete') {
    const gone = new Set(op.ids);
    return images.filter((e) => !gone.has(e.id));
  }
  const byId = new Map(op.elements.map((e) => [e.id, e]));
  const present = new Set(images.map((e) => e.id));
  const out = images.map((e) => {
    const patch = byId.get(e.id);
    return patch ? { ...e, ...patch } : e;
  });
  for (const el of op.elements) {
    // 未存在 id は復活/新規。delete の逆操作・create の redo では呼び出し側が完全な DTO を
    // 記録しているため、描画に必要なフィールド(id/座標/サイズ/attachmentId)は揃っている。
    if (!present.has(el.id)) out.push(el as DiagramElementDto);
  }
  return out;
}
