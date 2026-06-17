import { describe, it, expect } from 'vitest';
import { applyEdgePatch, type FlowDataEdge } from './flow-types';

const baseEdge: FlowDataEdge = {
  id: 'e1',
  sourceNodeId: 'a',
  targetNodeId: 'b',
  label: '受注',
  pathStyle: 'bezier',
  labelT: 0.5,
  infoT: 0.5,
  informationTypeId: 'it1',
  informationType: { id: 'it1', name: '注文書', category: 'DOCUMENT' },
};

describe('applyEdgePatch (業務フロー楽観更新)', () => {
  it('曲線→直線: pathStyle のみ差し替え、他フィールドは保持', () => {
    const out = applyEdgePatch(baseEdge, { pathStyle: 'straight' });
    expect(out.pathStyle).toBe('straight');
    expect(out.label).toBe('受注');
    expect(out.informationType?.name).toBe('注文書');
    // 非破壊（新オブジェクト）。
    expect(out).not.toBe(baseEdge);
  });

  it('ラベル/チップ位置: labelT・infoT を更新', () => {
    const out = applyEdgePatch(baseEdge, { labelT: 0.2, infoT: 0.8 });
    expect(out.labelT).toBe(0.2);
    expect(out.infoT).toBe(0.8);
    expect(out.pathStyle).toBe('bezier');
  });

  it('ラベル文字を更新', () => {
    const out = applyEdgePatch(baseEdge, { label: '出荷' });
    expect(out.label).toBe('出荷');
  });

  it('informationTypeId=null で情報種別を埋め込みごとクリア', () => {
    const out = applyEdgePatch(baseEdge, { informationTypeId: null });
    expect(out.informationTypeId).toBeNull();
    expect(out.informationType).toBeNull();
  });

  it('未指定のキーは変更しない', () => {
    const out = applyEdgePatch(baseEdge, {});
    expect(out.label).toBe('受注');
    expect(out.pathStyle).toBe('bezier');
    expect(out.labelT).toBe(0.5);
    expect(out.informationTypeId).toBe('it1');
  });

  it('pathStyle=null（既定の角ばりへ戻す）を許容', () => {
    const out = applyEdgePatch(baseEdge, { pathStyle: null });
    expect(out.pathStyle).toBeNull();
  });
});
