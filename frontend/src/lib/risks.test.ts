import { describe, it, expect } from 'vitest';
import {
  classifyPriority,
  countByPriority,
  suggestPriority,
  pickLevel,
  type Risk,
} from './risks';

function mk(partial: Partial<Risk> & { id: string }): Risk {
  return {
    projectId: 'p',
    code: null,
    type: null,
    event: null,
    causeCategory: null,
    probability: null,
    impact: null,
    priority: null,
    countermeasure: null,
    needsMtg: null,
    mtgDate: null,
    deadline: null,
    owner: null,
    status: null,
    note: null,
    order: 0,
    ...partial,
  };
}

describe('pickLevel', () => {
  it('exact match (with surrounding whitespace) returns the level', () => {
    expect(pickLevel(' 高 ')).toBe('高');
    expect(pickLevel('中')).toBe('中');
    expect(pickLevel('低')).toBe('低');
  });

  it('non-matching / verbose / null values return empty', () => {
    expect(pickLevel('発生確率(高/中/低)')).toBe('');
    expect(pickLevel(null)).toBe('');
    expect(pickLevel(undefined)).toBe('');
    expect(pickLevel('')).toBe('');
  });
});

describe('classifyPriority', () => {
  it('maps Japanese and English variants', () => {
    expect(classifyPriority('高')).toBe('high');
    expect(classifyPriority('High')).toBe('high');
    expect(classifyPriority('中')).toBe('mid');
    expect(classifyPriority(' medium ')).toBe('mid');
    expect(classifyPriority('低')).toBe('low');
    expect(classifyPriority('LOW')).toBe('low');
  });

  it('blank / unknown values are other', () => {
    expect(classifyPriority(null)).toBe('other');
    expect(classifyPriority('')).toBe('other');
    expect(classifyPriority('   ')).toBe('other');
    expect(classifyPriority('緊急')).toBe('other');
  });
});

describe('countByPriority', () => {
  it('tallies risks by priority bucket', () => {
    const counts = countByPriority([
      mk({ id: 'a', priority: '高' }),
      mk({ id: 'b', priority: '高' }),
      mk({ id: 'c', priority: '中' }),
      mk({ id: 'd', priority: '低' }),
      mk({ id: 'e', priority: null }),
      mk({ id: 'f', priority: '謎' }),
    ]);
    expect(counts).toEqual({ high: 2, mid: 1, low: 1, other: 2 });
  });

  it('empty list yields all zeros', () => {
    expect(countByPriority([])).toEqual({ high: 0, mid: 0, low: 0, other: 0 });
  });
});

describe('suggestPriority', () => {
  it('combines probability and impact into a level', () => {
    expect(suggestPriority('高', '高')).toBe('高'); // 3+3=6
    expect(suggestPriority('高', '中')).toBe('高'); // 3+2=5
    expect(suggestPriority('高', '低')).toBe('中'); // 3+1=4
    expect(suggestPriority('中', '中')).toBe('中'); // 2+2=4
    expect(suggestPriority('中', '低')).toBe('低'); // 2+1=3
    expect(suggestPriority('低', '低')).toBe('低'); // 1+1=2
  });

  it('returns empty when either side is unset / invalid', () => {
    expect(suggestPriority('高', null)).toBe('');
    expect(suggestPriority(null, '低')).toBe('');
    expect(suggestPriority('発生確率', '影響度')).toBe('');
  });
});
