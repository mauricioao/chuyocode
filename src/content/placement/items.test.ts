/**
 * Item-bank invariants for the placement-test draft (`@/content/placement/items`).
 *
 * These are the properties the bank must keep no matter how its content
 * changes: the right shape per level, no accidental duplicate/ambiguous
 * item, and the standing neutral-Spanish rule applied to the explanations.
 */
import { describe, it, expect } from 'vitest';
import { findVoseo } from '@/lib/neutralSpanish';
import { PLACEMENT_ITEMS, PLACEMENT_LEVEL_ORDER, type PlacementLevel } from './items';

const EXPECTED_COUNTS: Record<PlacementLevel, number> = {
  A1: 8,
  A2: 8,
  B1: 7,
  B2: 7,
};

describe('PLACEMENT_ITEMS — item bank invariants', () => {
  it('has exactly 30 items', () => {
    expect(PLACEMENT_ITEMS.length).toBe(30);
  });

  it('has the expected count per level (A1/A2 x8, B1/B2 x7)', () => {
    for (const level of PLACEMENT_LEVEL_ORDER) {
      const count = PLACEMENT_ITEMS.filter((item) => item.level === level).length;
      expect(count).toBe(EXPECTED_COUNTS[level]);
    }
  });

  it('gives every item a unique id', () => {
    const ids = PLACEMENT_ITEMS.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every item exactly 4 distinct, non-empty options', () => {
    for (const item of PLACEMENT_ITEMS) {
      expect(item.options.length).toBe(4);
      for (const option of item.options) {
        expect(option.trim().length).toBeGreaterThan(0);
      }
      expect(new Set(item.options).size).toBe(4);
    }
  });

  it('gives every item a correctIndex that points at a real option', () => {
    for (const item of PLACEMENT_ITEMS) {
      expect(Number.isInteger(item.correctIndex)).toBe(true);
      expect(item.correctIndex).toBeGreaterThanOrEqual(0);
      expect(item.correctIndex).toBeLessThan(item.options.length);
    }
  });

  it('gives every item a non-empty Spanish explanation', () => {
    for (const item of PLACEMENT_ITEMS) {
      expect(item.explanationEs.trim().length).toBeGreaterThan(0);
    }
  });

  it('mixes at least 2 skills per level, and always includes a reading item', () => {
    for (const level of PLACEMENT_LEVEL_ORDER) {
      const levelItems = PLACEMENT_ITEMS.filter((item) => item.level === level);
      const skills = new Set(levelItems.map((item) => item.skill));
      expect(skills.size).toBeGreaterThanOrEqual(2);
      expect(levelItems.some((item) => item.skill === 'reading')).toBe(true);
    }
  });

  it('is ordered easy to hard: the level never regresses once the bank moves on', () => {
    const rank: Record<PlacementLevel, number> = { A1: 0, A2: 1, B1: 2, B2: 3 };
    const ranks = PLACEMENT_ITEMS.map((item) => rank[item.level]);
    for (let i = 1; i < ranks.length; i++) {
      expect(ranks[i]).toBeGreaterThanOrEqual(ranks[i - 1]);
    }
  });

  it('never repeats the same prompt text', () => {
    const prompts = PLACEMENT_ITEMS.map((item) => item.prompt);
    expect(new Set(prompts).size).toBe(prompts.length);
  });

  it('writes every Spanish explanation in neutral Spanish (no voseo)', () => {
    expect(findVoseo(PLACEMENT_ITEMS.map((item) => item.explanationEs))).toEqual([]);
  });
});
