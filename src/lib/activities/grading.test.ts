import { describe, it, expect } from 'vitest';
import { normalizeTextAnswer, gradeZone, gradeZones, type GradableZone } from './grading';

describe('normalizeTextAnswer', () => {
  it('trims leading/trailing whitespace', () => {
    expect(normalizeTextAnswer('  cat  ')).toBe('cat');
  });

  it('lowercases', () => {
    expect(normalizeTextAnswer('CAT')).toBe('cat');
    expect(normalizeTextAnswer('Big Ben')).toBe('big ben');
  });

  it('collapses inner whitespace to a single space', () => {
    expect(normalizeTextAnswer('big    ben')).toBe('big ben');
    expect(normalizeTextAnswer('big\tben')).toBe('big ben');
    expect(normalizeTextAnswer('big\n\nben')).toBe('big ben');
  });

  it('combines all three rules', () => {
    expect(normalizeTextAnswer('  BIG   BEN  ')).toBe('big ben');
  });

  it('leaves an empty string empty', () => {
    expect(normalizeTextAnswer('')).toBe('');
    expect(normalizeTextAnswer('   ')).toBe('');
  });
});

describe('gradeZone — text', () => {
  const zone: GradableZone = { id: 'z1', kind: 'text', answers: ['cat', 'kitten'] };

  it('accepts an exact match', () => {
    expect(gradeZone(zone, 'cat')).toBe(true);
  });

  it('accepts a case-insensitive match', () => {
    expect(gradeZone(zone, 'CAT')).toBe(true);
    expect(gradeZone(zone, 'Cat')).toBe(true);
  });

  it('accepts a match with surrounding whitespace trimmed', () => {
    expect(gradeZone(zone, '  cat  ')).toBe(true);
  });

  it('accepts a match with inner whitespace collapsed', () => {
    const multiWord: GradableZone = { id: 'z2', kind: 'text', answers: ['big ben'] };
    expect(gradeZone(multiWord, 'big    ben')).toBe(true);
    expect(gradeZone(multiWord, 'BIG   Ben')).toBe(true);
  });

  it('accepts ANY of several accepted answers', () => {
    expect(gradeZone(zone, 'kitten')).toBe(true);
  });

  it('rejects a wrong answer', () => {
    expect(gradeZone(zone, 'dog')).toBe(false);
  });

  it('rejects an empty answer', () => {
    expect(gradeZone(zone, '')).toBe(false);
  });

  it('rejects a whitespace-only answer', () => {
    expect(gradeZone(zone, '   ')).toBe(false);
  });

  it('does not match a partial substring', () => {
    expect(gradeZone(zone, 'catnap')).toBe(false);
    expect(gradeZone(zone, 'ca')).toBe(false);
  });
});

describe('gradeZone — choice', () => {
  const zone: GradableZone = { id: 'z1', kind: 'choice', answers: ['blue'] };

  it('accepts the exact accepted option', () => {
    expect(gradeZone(zone, 'blue')).toBe(true);
  });

  it('rejects a different option', () => {
    expect(gradeZone(zone, 'red')).toBe(false);
  });

  it('is case-SENSITIVE, unlike text (options are a fixed closed set)', () => {
    expect(gradeZone(zone, 'Blue')).toBe(false);
    expect(gradeZone(zone, 'BLUE')).toBe(false);
  });

  it('rejects an empty selection', () => {
    expect(gradeZone(zone, '')).toBe(false);
  });

  it('accepts any of multiple accepted options', () => {
    const multi: GradableZone = { id: 'z2', kind: 'choice', answers: ['blue', 'green'] };
    expect(gradeZone(multi, 'blue')).toBe(true);
    expect(gradeZone(multi, 'green')).toBe(true);
    expect(gradeZone(multi, 'red')).toBe(false);
  });

  it('does not trim whitespace for choice (exact match only)', () => {
    expect(gradeZone(zone, ' blue')).toBe(false);
    expect(gradeZone(zone, 'blue ')).toBe(false);
  });
});

describe('gradeZones', () => {
  const zones: GradableZone[] = [
    { id: 'z1', kind: 'text', answers: ['cat'] },
    { id: 'z2', kind: 'choice', answers: ['blue'] },
    { id: 'z3', kind: 'text', answers: ['dog', 'puppy'] },
  ];

  it('grades every zone and returns per-zone results in the same order', () => {
    const summary = gradeZones(zones, { z1: 'cat', z2: 'blue', z3: 'wrong' });
    expect(summary.results).toEqual([
      { zoneId: 'z1', correct: true },
      { zoneId: 'z2', correct: true },
      { zoneId: 'z3', correct: false },
    ]);
  });

  it('computes correctCount and total', () => {
    const summary = gradeZones(zones, { z1: 'cat', z2: 'blue', z3: 'wrong' });
    expect(summary.correctCount).toBe(2);
    expect(summary.total).toBe(3);
  });

  it('treats a missing answer key as an empty (wrong) answer', () => {
    const summary = gradeZones(zones, { z1: 'cat' });
    expect(summary.results.find((r) => r.zoneId === 'z2')?.correct).toBe(false);
    expect(summary.results.find((r) => r.zoneId === 'z3')?.correct).toBe(false);
  });

  it('returns an empty summary for zero zones', () => {
    const summary = gradeZones([], {});
    expect(summary).toEqual({ results: [], total: 0, correctCount: 0 });
  });

  it('scores every zone correct when every answer matches', () => {
    const summary = gradeZones(zones, { z1: 'CAT', z2: 'blue', z3: 'Puppy' });
    expect(summary.correctCount).toBe(3);
    expect(summary.total).toBe(3);
  });

  it('scores every zone wrong when nothing matches', () => {
    const summary = gradeZones(zones, { z1: 'x', z2: 'y', z3: 'z' });
    expect(summary.correctCount).toBe(0);
  });
});
