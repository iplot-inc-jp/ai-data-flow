import { describe, it, expect } from 'vitest';
import { computeInitialScroll } from './frappe-scroll';

const T = (start: string, end: string) => ({ start, end });

describe('computeInitialScroll', () => {
  it("returns 'today' when there are no tasks", () => {
    expect(computeInitialScroll([], new Date('2026-06-17'))).toBe('today');
  });

  it("returns 'today' when today falls within the task span", () => {
    const tasks = [T('2026-06-01', '2026-06-10'), T('2026-06-15', '2026-06-30')];
    expect(computeInitialScroll(tasks, new Date('2026-06-17'))).toBe('today');
  });

  it('returns the earliest start when today is before the whole span (future tasks)', () => {
    const tasks = [T('2026-09-01', '2026-09-10'), T('2026-08-20', '2026-08-25')];
    expect(computeInitialScroll(tasks, new Date('2026-06-17'))).toBe('2026-08-20');
  });

  it('returns the earliest start when today is after the whole span (past tasks)', () => {
    const tasks = [T('2026-01-05', '2026-01-20'), T('2026-02-01', '2026-02-10')];
    expect(computeInitialScroll(tasks, new Date('2026-06-17'))).toBe('2026-01-05');
  });

  it('uses span boundaries inclusively (today == earliest start)', () => {
    const tasks = [T('2026-06-17', '2026-06-20')];
    expect(computeInitialScroll(tasks, new Date('2026-06-17'))).toBe('today');
  });
});
