import { describe, it, expect } from 'vitest';
import {
  pickLevel,
  buildInfluenceSupportGrid,
  normalizeSide,
  pickRaci,
  cycleRaci,
  orderDomainTree,
  INFLUENCE_LEVELS,
  SUPPORT_LEVELS,
  type Stakeholder,
} from './stakeholders';

function mk(partial: Partial<Stakeholder> & { id: string }): Stakeholder {
  return {
    projectId: 'p',
    name: partial.id,
    affiliation: null,
    role: null,
    interest: null,
    concern: null,
    influence: null,
    support: null,
    engagement: null,
    reportFrequency: null,
    contactMethod: null,
    owner: null,
    reportLine: null,
    asisHearing: null,
    tobeSparring: null,
    note: null,
    order: 0,
    ...partial,
  };
}

describe('pickLevel', () => {
  it('exact match (with surrounding whitespace) returns the level', () => {
    expect(pickLevel(' 高 ', INFLUENCE_LEVELS)).toBe('高');
    expect(pickLevel('支持', SUPPORT_LEVELS)).toBe('支持');
  });

  it('non-matching / verbose / null values return empty', () => {
    expect(pickLevel('影響度(高/中/低)', INFLUENCE_LEVELS)).toBe('');
    expect(pickLevel(null, INFLUENCE_LEVELS)).toBe('');
    expect(pickLevel(undefined, SUPPORT_LEVELS)).toBe('');
    expect(pickLevel('', SUPPORT_LEVELS)).toBe('');
  });
});

describe('normalizeSide', () => {
  it('EXTERNAL passes through, everything else falls back to INTERNAL', () => {
    expect(normalizeSide('EXTERNAL')).toBe('EXTERNAL');
    expect(normalizeSide('INTERNAL')).toBe('INTERNAL');
    expect(normalizeSide(null)).toBe('INTERNAL');
    expect(normalizeSide(undefined)).toBe('INTERNAL');
    expect(normalizeSide('external')).toBe('INTERNAL'); // 大文字以外は不明扱い
    expect(normalizeSide('外部')).toBe('INTERNAL');
  });
});

describe('pickRaci', () => {
  it('returns R/A/C/I as-is', () => {
    expect(pickRaci('R')).toBe('R');
    expect(pickRaci('A')).toBe('A');
    expect(pickRaci('C')).toBe('C');
    expect(pickRaci('I')).toBe('I');
  });

  it('returns null for unset / unknown values', () => {
    expect(pickRaci(null)).toBeNull();
    expect(pickRaci(undefined)).toBeNull();
    expect(pickRaci('')).toBeNull();
    expect(pickRaci('r')).toBeNull(); // 小文字は不正
    expect(pickRaci('X')).toBeNull();
  });
});

describe('cycleRaci', () => {
  it('cycles R→A→C→I→null→R…', () => {
    expect(cycleRaci(null)).toBe('R');
    expect(cycleRaci('R')).toBe('A');
    expect(cycleRaci('A')).toBe('C');
    expect(cycleRaci('C')).toBe('I');
    expect(cycleRaci('I')).toBeNull();
    // null（割当なし）からもう一周
    expect(cycleRaci(cycleRaci('I'))).toBe('R');
  });

  it('treats unset / unknown values as null (next is R)', () => {
    expect(cycleRaci(undefined)).toBe('R');
    expect(cycleRaci('')).toBe('R');
    expect(cycleRaci('X')).toBe('R');
  });
});

describe('orderDomainTree', () => {
  type Row = { id: string; parentId: string | null };
  const ids = (rows: { row: Row; depth: number }[]) =>
    rows.map((r) => `${r.row.id}:${r.depth}`);

  it('orders parent → children with depth, keeping sibling input order', () => {
    // 入力順は意図的にバラす（c2 が c1 より先）
    const rows: Row[] = [
      { id: 'c2', parentId: 'root' },
      { id: 'g1', parentId: 'c1' },
      { id: 'root', parentId: null },
      { id: 'c1', parentId: 'root' },
    ];
    // 兄弟（c2, c1）は元の並び順（c2 が先）を保つ
    expect(ids(orderDomainTree(rows))).toEqual([
      'root:0',
      'c2:1',
      'c1:1',
      'g1:2',
    ]);
  });

  it('treats orphans (parent missing from the list) as roots', () => {
    const rows: Row[] = [
      { id: 'a', parentId: null },
      { id: 'orphan', parentId: 'no-such-parent' },
      { id: 'b', parentId: 'a' },
    ];
    // 深さ優先: a の子 b を出してから次のルート（孤児）へ
    expect(ids(orderDomainTree(rows))).toEqual(['a:0', 'b:1', 'orphan:0']);
  });

  it('does not loop on cycles and salvages cycle members at depth 0', () => {
    // x→y→x の循環（どちらもルートにならない）
    const rows: Row[] = [
      { id: 'x', parentId: 'y' },
      { id: 'y', parentId: 'x' },
      { id: 'z', parentId: null },
    ];
    const result = orderDomainTree(rows);
    // 全行が一度ずつ出力される（取りこぼし・重複なし）
    expect(result).toHaveLength(3);
    expect(ids(result)).toEqual(['z:0', 'x:0', 'y:0']);
  });

  it('handles self-referencing rows without infinite loop', () => {
    const rows: Row[] = [
      { id: 'self', parentId: 'self' },
      { id: 'a', parentId: null },
    ];
    const result = orderDomainTree(rows);
    expect(result).toHaveLength(2);
    expect(ids(result)).toEqual(['a:0', 'self:0']);
  });

  it('returns empty for empty input', () => {
    expect(orderDomainTree([])).toEqual([]);
  });
});

describe('buildInfluenceSupportGrid', () => {
  it('groups stakeholders into 影響__支持 cells and drops unplaced ones', () => {
    const grid = buildInfluenceSupportGrid([
      mk({ id: 'a', influence: '高', support: '支持' }),
      mk({ id: 'b', influence: '高', support: '支持' }),
      mk({ id: 'c', influence: '中', support: '反対' }),
      mk({ id: 'd', influence: '高', support: null }), // unplaced
      mk({ id: 'e' }), // unplaced
    ]);

    expect(grid.get('高__支持')).toEqual(['a', 'b']);
    expect(grid.get('中__反対')).toEqual(['c']);
    expect(grid.get('高__反対')).toBeUndefined();
    // unplaced are not in any cell
    const all = Array.from(grid.values()).flat();
    expect(all).not.toContain('d');
    expect(all).not.toContain('e');
  });
});
