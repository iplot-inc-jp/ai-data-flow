import { describe, it, expect } from 'vitest';
import { applyDelta } from './image-op-delta';
import type { DiagramElementDto } from '../lib/diagram-elements';

const dto = (id: string, over: Partial<DiagramElementDto> = {}): DiagramElementDto => ({
  id,
  projectId: 'p1',
  diagramKind: 'FLOW',
  diagramId: 'f1',
  type: 'IMAGE',
  positionX: 0,
  positionY: 0,
  width: 200,
  height: 150,
  rotation: 0,
  z: 0,
  attachmentId: 'a1',
  text: '',
  color: null,
  ...over,
});

describe('applyDelta', () => {
  it('upsert: 既存 id はフィールド上書き（位置/サイズの undo＝move/resize 逆操作）', () => {
    const before = [dto('e1', { positionX: 5, positionY: 6 }), dto('e2')];
    const out = applyDelta(before, {
      type: 'upsert',
      elements: [{ id: 'e1', type: 'IMAGE', positionX: 50, positionY: 60, width: 200, height: 150, rotation: 0, z: 0, attachmentId: 'a1', text: '', color: null }],
    });
    expect(out.find((e) => e.id === 'e1')).toMatchObject({ positionX: 50, positionY: 60 });
    expect(out.find((e) => e.id === 'e2')).toBeTruthy(); // 他要素は不変
    expect(out).toHaveLength(2); // 件数不変（新規追加なし）
  });

  it('upsert: 未存在 id は末尾追加（delete の undo＝同一 id で復活）', () => {
    const before = [dto('e1')];
    const revived = dto('e2', { positionX: 9 });
    const out = applyDelta(before, { type: 'upsert', elements: [revived] });
    expect(out).toHaveLength(2);
    expect(out.find((e) => e.id === 'e2')).toMatchObject({ id: 'e2', positionX: 9 });
  });

  it('delete: 指定 id を除去（create の undo / 削除の redo）', () => {
    const before = [dto('e1'), dto('e2'), dto('e3')];
    const out = applyDelta(before, { type: 'delete', ids: ['e2'] });
    expect(out.map((e) => e.id)).toEqual(['e1', 'e3']);
  });

  it('delete: 存在しない id は no-op（冪等）', () => {
    const before = [dto('e1')];
    const out = applyDelta(before, { type: 'delete', ids: ['gone'] });
    expect(out.map((e) => e.id)).toEqual(['e1']);
  });

  it('入力配列を破壊しない（純粋関数）', () => {
    const before = [dto('e1', { positionX: 1 })];
    const snapshot = JSON.stringify(before);
    applyDelta(before, { type: 'upsert', elements: [{ id: 'e1', type: 'IMAGE', positionX: 99, positionY: 0, width: 200, height: 150, rotation: 0, z: 0, attachmentId: 'a1', text: '', color: null }] });
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});
