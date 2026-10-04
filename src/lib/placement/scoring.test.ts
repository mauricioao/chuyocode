/**
 * Scoring logic for the placement-test draft — pure, zero-I/O (see
 * `./scoring.ts`'s own header). Written FIRST, against the not-yet-written
 * module, so this file is expected to fail until `scoring.ts` exists.
 */
import { describe, it, expect } from 'vitest';
import {
  PLACEMENT_LEVEL_ORDER,
  PASS_RATIO,
  scoreBreakdown,
  estimateLevel,
  recommendLevel,
  scorePlacement,
  type PlacementAnswers,
  type LevelBreakdown,
} from './scoring';
import { PLACEMENT_ITEMS, type PlacementItem, type PlacementLevel } from '@/content/placement/items';

/** `count` throwaway fixture items at `level` — only `level`/`id`/`correctIndex` matter for scoring. */
function levelFixture(level: PlacementLevel, count: number): PlacementItem[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${level}-fixture-${i}`,
    level,
    skill: 'grammar',
    prompt: `Fixture item ${i}`,
    options: ['a', 'b', 'c', 'd'],
    correctIndex: 0,
    explanationEs: 'Fixture.',
  }));
}

/** Answers the first `correctCount` items correctly and the rest wrong. */
function answerN(items: PlacementItem[], correctCount: number): PlacementAnswers {
  const answers: Record<string, number | null> = {};
  items.forEach((item, i) => {
    answers[item.id] = i < correctCount ? item.correctIndex : 1;
  });
  return answers;
}

describe('PLACEMENT_LEVEL_ORDER', () => {
  it('is A1 -> A2 -> B1 -> B2', () => {
    expect(PLACEMENT_LEVEL_ORDER).toEqual(['A1', 'A2', 'B1', 'B2']);
  });
});

describe('PASS_RATIO', () => {
  it('is 0.6 (60%)', () => {
    expect(PASS_RATIO).toBe(0.6);
  });
});

describe('scoreBreakdown — pass/fail ratio (>= 0.6)', () => {
  it('passes a level at exactly the 0.6 boundary (3 of 5)', () => {
    const items = levelFixture('A1', 5);
    const breakdown = scoreBreakdown(items, answerN(items, 3));
    expect(breakdown[0]).toEqual({ level: 'A1', correct: 3, total: 5, passed: true });
  });

  it('fails a level just below the 0.6 boundary (2 of 5)', () => {
    const items = levelFixture('A1', 5);
    expect(scoreBreakdown(items, answerN(items, 2))[0].passed).toBe(false);
  });

  // The real bank's own shapes: A1/A2 have 8 items, B1/B2 have 7 — the ratio
  // must derive "5 of 8" and "5 of 7" from 0.6, never hardcode either count.
  it('passes an 8-item level (A1/A2 shape) at 5 of 8, fails at 4 of 8', () => {
    const items = levelFixture('A2', 8);
    expect(scoreBreakdown(items, answerN(items, 5))[0].passed).toBe(true);
    expect(scoreBreakdown(items, answerN(items, 4))[0].passed).toBe(false);
  });

  it('passes a 7-item level (B1/B2 shape) at 5 of 7, fails at 4 of 7', () => {
    const items = levelFixture('B1', 7);
    expect(scoreBreakdown(items, answerN(items, 5))[0].passed).toBe(true);
    expect(scoreBreakdown(items, answerN(items, 4))[0].passed).toBe(false);
  });

  it('treats an explicit null answer ("No lo sé") as wrong, not excluded', () => {
    const items = levelFixture('A1', 5);
    const answers: PlacementAnswers = {
      [items[0]!.id]: null,
      [items[1]!.id]: items[1]!.correctIndex,
      [items[2]!.id]: items[2]!.correctIndex,
      [items[3]!.id]: items[3]!.correctIndex,
      [items[4]!.id]: null,
    };
    expect(scoreBreakdown(items, answers)[0]).toEqual({ level: 'A1', correct: 3, total: 5, passed: true });
  });

  it('treats a missing (unanswered) item the same as an explicit null', () => {
    const items = levelFixture('A1', 5);
    const answers: PlacementAnswers = {
      [items[1]!.id]: items[1]!.correctIndex,
      [items[2]!.id]: items[2]!.correctIndex,
      [items[3]!.id]: items[3]!.correctIndex,
      // item 0 and item 4 are simply absent from the map.
    };
    expect(scoreBreakdown(items, answers)[0]).toEqual({ level: 'A1', correct: 3, total: 5, passed: true });
  });

  it('only reports levels actually present in `items`', () => {
    const items = levelFixture('B1', 7);
    const breakdown = scoreBreakdown(items, {});
    expect(breakdown.map((b) => b.level)).toEqual(['B1']);
  });
});

describe('estimateLevel — consecutive rule', () => {
  it('is null when A1 is not passed', () => {
    const breakdown: LevelBreakdown[] = [
      { level: 'A1', correct: 0, total: 8, passed: false },
      { level: 'A2', correct: 8, total: 8, passed: true },
    ];
    expect(estimateLevel(breakdown)).toBeNull();
  });

  it('is the highest level where it AND every level below it passed (a gap stops it)', () => {
    const breakdown: LevelBreakdown[] = [
      { level: 'A1', correct: 8, total: 8, passed: true },
      { level: 'A2', correct: 0, total: 8, passed: false },
      { level: 'B1', correct: 7, total: 7, passed: true },
      { level: 'B2', correct: 7, total: 7, passed: true },
    ];
    expect(estimateLevel(breakdown)).toBe('A1');
  });

  it('is the top level when every level passed', () => {
    const breakdown: LevelBreakdown[] = [
      { level: 'A1', correct: 8, total: 8, passed: true },
      { level: 'A2', correct: 8, total: 8, passed: true },
      { level: 'B1', correct: 7, total: 7, passed: true },
      { level: 'B2', correct: 7, total: 7, passed: true },
    ];
    expect(estimateLevel(breakdown)).toBe('B2');
  });
});

describe('recommendLevel', () => {
  it('is A1 when none passed', () => {
    const breakdown: LevelBreakdown[] = [
      { level: 'A1', correct: 0, total: 8, passed: false },
      { level: 'A2', correct: 0, total: 8, passed: false },
    ];
    expect(recommendLevel(breakdown)).toBe('A1');
  });

  it('is the first level not passed (the gap case)', () => {
    const breakdown: LevelBreakdown[] = [
      { level: 'A1', correct: 8, total: 8, passed: true },
      { level: 'A2', correct: 0, total: 8, passed: false },
      { level: 'B1', correct: 7, total: 7, passed: true },
      { level: 'B2', correct: 7, total: 7, passed: true },
    ];
    expect(recommendLevel(breakdown)).toBe('A2');
  });

  it('is B2 when every level passed', () => {
    const breakdown: LevelBreakdown[] = [
      { level: 'A1', correct: 8, total: 8, passed: true },
      { level: 'A2', correct: 8, total: 8, passed: true },
      { level: 'B1', correct: 7, total: 7, passed: true },
      { level: 'B2', correct: 7, total: 7, passed: true },
    ];
    expect(recommendLevel(breakdown)).toBe('B2');
  });
});

describe('scorePlacement — end to end against the real item bank', () => {
  it('answering every item correctly estimates B2 and recommends B2', () => {
    const answers: Record<string, number> = {};
    for (const item of PLACEMENT_ITEMS) answers[item.id] = item.correctIndex;

    const result = scorePlacement(PLACEMENT_ITEMS, answers);
    expect(result.estimatedLevel).toBe('B2');
    expect(result.recommendedLevel).toBe('B2');
    expect(result.breakdown.every((b) => b.passed)).toBe(true);
  });

  it('answering nothing estimates null and recommends A1', () => {
    const result = scorePlacement(PLACEMENT_ITEMS, {});
    expect(result.estimatedLevel).toBeNull();
    expect(result.recommendedLevel).toBe('A1');
    expect(result.breakdown.every((b) => !b.passed)).toBe(true);
  });

  it('covers every level present in the real bank, in order', () => {
    const result = scorePlacement(PLACEMENT_ITEMS, {});
    expect(result.breakdown.map((b) => b.level)).toEqual(['A1', 'A2', 'B1', 'B2']);
  });
});
