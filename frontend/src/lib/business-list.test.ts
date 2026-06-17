import { describe, it, expect } from 'vitest';
import { buildBusinessList, type BusinessFlowItem, type GapItem } from './business-list';

const flows: BusinessFlowItem[] = [
  { id: 'asis1', name: '受注ASIS', kind: 'ASIS', assignees: [{ stakeholderId: 's1', name: '田中', order: 0 }] },
  { id: 'asis2', name: '出荷ASIS', kind: 'ASIS', assignees: [] },
  { id: 'tobe1', name: '受注TOBE', kind: 'TOBE', asisFlowId: 'asis1' },
  { id: 'tobe2', name: '受注TOBE2', kind: 'TOBE', asisFlowId: 'asis1' },
  { id: 'tobeX', name: '孤立TOBE', kind: 'TOBE', asisFlowId: null },
];
const gaps: GapItem[] = [
  { id: 'g1', asisFlowId: 'asis1', gapDescription: '手作業', priority: 'HIGH' },
  { id: 'g2', asisFlowId: 'asis1', gapDescription: '二重入力', priority: 'MEDIUM' },
  { id: 'g3', asisFlowId: null, gapDescription: '未紐付け' },
];

describe('buildBusinessList', () => {
  it('ASIS 起点で行を作り、対応TOBE/GAP を asisFlowId で対応付ける', () => {
    const rows = buildBusinessList(flows, gaps);
    expect(rows.map((r) => r.asis.id)).toEqual(['asis1', 'asis2']);
    const r1 = rows[0];
    expect(r1.tobes.map((t) => t.id)).toEqual(['tobe1', 'tobe2']);
    expect(r1.gaps.map((g) => g.id)).toEqual(['g1', 'g2']);
    expect(r1.asis.assignees?.[0]?.name).toBe('田中');
  });
  it('対応が無い ASIS は空配列を持つ', () => {
    const rows = buildBusinessList(flows, gaps);
    expect(rows[1].tobes).toEqual([]);
    expect(rows[1].gaps).toEqual([]);
  });
  it('asisFlowId を持たない TOBE/GAP はどの行にも入らない', () => {
    const rows = buildBusinessList(flows, gaps);
    const allTobeIds = rows.flatMap((r) => r.tobes.map((t) => t.id));
    const allGapIds = rows.flatMap((r) => r.gaps.map((g) => g.id));
    expect(allTobeIds).not.toContain('tobeX');
    expect(allGapIds).not.toContain('g3');
  });
});
