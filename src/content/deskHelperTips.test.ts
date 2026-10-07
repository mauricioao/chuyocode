import { describe, expect, it, vi } from 'vitest';
import { CHARACTERS } from './characters';
import { DESK_HELPER_TIPS, pickRandomTipIndex } from './deskHelperTips';

describe('DESK_HELPER_TIPS', () => {
  it('ships exactly the 100 reviewed tips', () => {
    expect(DESK_HELPER_TIPS.length).toBe(100);
  });

  it('gives every one of the five characters exactly 20 tips', () => {
    const counts: Record<string, number> = {};
    for (const tip of DESK_HELPER_TIPS) {
      counts[tip.character] = (counts[tip.character] ?? 0) + 1;
    }
    expect(counts).toEqual({ bruno: 20, luna: 20, mia: 20, paco: 20, tobi: 20 });
  });

  it('assigns every tip a character that exists in the registry', () => {
    for (const tip of DESK_HELPER_TIPS) {
      expect(CHARACTERS[tip.character]).toBeDefined();
    }
  });

  it('gives every tip non-empty Spanish AND English copy, plus a topic and level', () => {
    for (const tip of DESK_HELPER_TIPS) {
      expect(tip.es.length).toBeGreaterThan(0);
      expect(tip.en.length).toBeGreaterThan(0);
      expect(tip.topic.length).toBeGreaterThan(0);
      expect(tip.level.length).toBeGreaterThan(0);
    }
  });

  it('highlights at least one English term per tip, in both languages, already converted to <em>', () => {
    for (const tip of DESK_HELPER_TIPS) {
      expect(tip.es).toContain('<em>');
      expect(tip.en).toContain('<em>');
      // The raw `*term*` authoring markup never leaks through unconverted.
      expect(tip.es).not.toContain('*');
      expect(tip.en).not.toContain('*');
    }
  });

  it('never reuses an id', () => {
    const ids = DESK_HELPER_TIPS.map((tip) => tip.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('pickRandomTipIndex', () => {
  it('stays within [0, length) across the random range', () => {
    const length = DESK_HELPER_TIPS.length;
    for (const roll of [0, 0.25, 0.5, 0.75, 0.999999]) {
      const index = pickRandomTipIndex(length, () => roll);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(length);
    }
  });

  it('uses the injected random source deterministically', () => {
    expect(pickRandomTipIndex(100, () => 0)).toBe(0);
    expect(pickRandomTipIndex(100, () => 0.99)).toBe(99);
  });

  it('defaults to the global Math.random when no source is injected', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    expect(pickRandomTipIndex(10)).toBe(5);
    spy.mockRestore();
  });

  it('degrades to 0 for a zero-length list instead of dividing by zero', () => {
    expect(pickRandomTipIndex(0)).toBe(0);
  });
});
