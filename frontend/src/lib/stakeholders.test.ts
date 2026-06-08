import { describe, it, expect } from 'vitest';
import {
  pickLevel,
  buildInfluenceSupportGrid,
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
