import { describe, it, expect } from 'vitest';
import {
  ISSUE_TREE_PATTERNS,
  ISSUE_NODE_KINDS,
  KIND_CONFIG,
  PATTERN_META,
  ROOT_PRIMARY_KIND,
  rootKindForPattern,
  patternFromLegacyType,
  legacyTreeTypeForPattern,
  emptyRollupCounts,
  addVerificationToCounts,
  rollupStatus,
  type IssueTreePattern,
} from './issue-tree-patterns';

describe('issue-tree-patterns config', () => {
  it('defines meta for all 6 patterns', () => {
    expect(ISSUE_TREE_PATTERNS).toHaveLength(6);
    for (const p of ISSUE_TREE_PATTERNS) {
      expect(PATTERN_META[p]).toBeTruthy();
      expect(PATTERN_META[p].label.length).toBeGreaterThan(0);
      expect(ROOT_PRIMARY_KIND[p].length).toBeGreaterThan(0);
    }
  });

  it('defines config for all 11 kinds with a valid affordance', () => {
    expect(ISSUE_NODE_KINDS).toHaveLength(11);
    const valid = new Set(['verification', 'recommendation', 'task', 'metric', null]);
    for (const k of ISSUE_NODE_KINDS) {
      const cfg = KIND_CONFIG[k];
      expect(cfg).toBeTruthy();
      expect(valid.has(cfg.affordance)).toBe(true);
    }
  });

  it('maps affordances per spec', () => {
    expect(KIND_CONFIG.CAUSE.affordance).toBe('verification');
    expect(KIND_CONFIG.POINT.affordance).toBe('verification');
    expect(KIND_CONFIG.HYPOTHESIS.affordance).toBe('verification');
    expect(KIND_CONFIG.VERIFICATION.affordance).toBe('verification');
    expect(KIND_CONFIG.RESULT.affordance).toBe('verification');
    expect(KIND_CONFIG.OPTION.affordance).toBe('recommendation');
    expect(KIND_CONFIG.COUNTERMEASURE.affordance).toBe('recommendation');
    expect(KIND_CONFIG.ACTION.affordance).toBe('task');
    expect(KIND_CONFIG.METRIC.affordance).toBe('metric');
    expect(KIND_CONFIG.ELEMENT.affordance).toBeNull();
    expect(KIND_CONFIG.ISSUE.affordance).toBeNull();
  });

  it('recursion: POINT/CAUSE/ELEMENT/OPTION/ACTION/METRIC can add same-kind child', () => {
    const recursive: Array<keyof typeof KIND_CONFIG> = [
      'POINT',
      'CAUSE',
      'ELEMENT',
      'OPTION',
      'ACTION',
      'METRIC',
    ];
    for (const k of recursive) {
      expect(KIND_CONFIG[k].childAddButtons.some((b) => b.childKind === k)).toBe(true);
    }
  });

  it('issue-point chain: POINT→HYPOTHESIS→VERIFICATION→RESULT', () => {
    expect(KIND_CONFIG.POINT.childAddButtons.some((b) => b.childKind === 'HYPOTHESIS')).toBe(true);
    expect(KIND_CONFIG.HYPOTHESIS.childAddButtons.some((b) => b.childKind === 'VERIFICATION')).toBe(
      true,
    );
    expect(KIND_CONFIG.VERIFICATION.childAddButtons.some((b) => b.childKind === 'RESULT')).toBe(
      true,
    );
  });

  it('rootKindForPattern: KPI→METRIC, others→ISSUE', () => {
    expect(rootKindForPattern('KPI')).toBe('METRIC');
    (['ISSUE_POINT', 'WHY', 'WHAT', 'HOW', 'MECE_ACTION'] as IssueTreePattern[]).forEach((p) => {
      expect(rootKindForPattern(p)).toBe('ISSUE');
    });
  });

  it('legacy type <-> pattern fallbacks', () => {
    expect(patternFromLegacyType('SOLUTION')).toBe('HOW');
    expect(patternFromLegacyType('WHY')).toBe('WHY');
    expect(patternFromLegacyType(undefined)).toBe('WHY');
    expect(legacyTreeTypeForPattern('HOW')).toBe('SOLUTION');
    expect(legacyTreeTypeForPattern('MECE_ACTION')).toBe('SOLUTION');
    expect(legacyTreeTypeForPattern('WHY')).toBe('WHY');
    expect(legacyTreeTypeForPattern('ISSUE_POINT')).toBe('WHY');
  });
});

describe('rollup (発散→収束)', () => {
  it('NA is not counted', () => {
    const c = addVerificationToCounts(emptyRollupCounts(), 'NA');
    expect(c.total).toBe(0);
    expect(rollupStatus(c)).toBe('none');
  });

  it('all CONFIRMED => confirmed', () => {
    let c = emptyRollupCounts();
    c = addVerificationToCounts(c, 'CONFIRMED');
    c = addVerificationToCounts(c, 'CONFIRMED');
    expect(c.total).toBe(2);
    expect(c.confirmed).toBe(2);
    expect(rollupStatus(c)).toBe('confirmed');
  });

  it('any REJECTED => rejected (takes precedence over confirmed)', () => {
    let c = emptyRollupCounts();
    c = addVerificationToCounts(c, 'CONFIRMED');
    c = addVerificationToCounts(c, 'REJECTED');
    expect(rollupStatus(c)).toBe('rejected');
  });

  it('UNKNOWN / NEEDS_HEARING (no reject) => partial', () => {
    let c = emptyRollupCounts();
    c = addVerificationToCounts(c, 'CONFIRMED');
    c = addVerificationToCounts(c, 'UNKNOWN');
    expect(rollupStatus(c)).toBe('partial');

    let d = emptyRollupCounts();
    d = addVerificationToCounts(d, 'NEEDS_HEARING');
    expect(d.unknown).toBe(1);
    expect(rollupStatus(d)).toBe('partial');
  });

  it('reject beats unknown', () => {
    let c = emptyRollupCounts();
    c = addVerificationToCounts(c, 'UNKNOWN');
    c = addVerificationToCounts(c, 'REJECTED');
    expect(rollupStatus(c)).toBe('rejected');
  });
});
