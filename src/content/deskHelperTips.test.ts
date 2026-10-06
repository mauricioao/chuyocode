import { describe, expect, it } from 'vitest';
import { CHARACTERS, type CharacterSlug } from './characters';
import { DESK_HELPER_TIPS, pickDailyTipIndex } from './deskHelperTips';

describe('DESK_HELPER_TIPS', () => {
  it('ships at least 20 tips', () => {
    expect(DESK_HELPER_TIPS.length).toBeGreaterThanOrEqual(20);
  });

  it('uses all five characters at least once', () => {
    const used = new Set(DESK_HELPER_TIPS.map((tip) => tip.character));
    expect([...used].sort()).toEqual((Object.keys(CHARACTERS) as CharacterSlug[]).sort());
  });

  it('assigns every tip a character that exists in the registry', () => {
    for (const tip of DESK_HELPER_TIPS) {
      expect(CHARACTERS[tip.character]).toBeDefined();
    }
  });

  it('gives every tip non-empty Spanish AND English copy', () => {
    for (const tip of DESK_HELPER_TIPS) {
      expect(tip.es.length).toBeGreaterThan(0);
      expect(tip.en.length).toBeGreaterThan(0);
    }
  });

  it('highlights at least one English term per tip, in both languages', () => {
    for (const tip of DESK_HELPER_TIPS) {
      expect(tip.es).toContain('<em>');
      expect(tip.en).toContain('<em>');
    }
  });

  it('never reuses an id', () => {
    const ids = DESK_HELPER_TIPS.map((tip) => tip.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('pickDailyTipIndex', () => {
  it('stays within [0, length) for a range of real dates', () => {
    const dates = [
      new Date(2026, 0, 1),
      new Date(2026, 5, 15),
      new Date(2026, 11, 31),
      new Date(2027, 1, 28),
    ];
    for (const date of dates) {
      const index = pickDailyTipIndex(date, DESK_HELPER_TIPS.length);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(DESK_HELPER_TIPS.length);
    }
  });

  it('is deterministic: the same date always picks the same index', () => {
    const date = new Date(2026, 9, 6);
    expect(pickDailyTipIndex(date, DESK_HELPER_TIPS.length)).toBe(
      pickDailyTipIndex(new Date(2026, 9, 6), DESK_HELPER_TIPS.length),
    );
  });

  it('changes as the calendar day changes (not stuck on one tip)', () => {
    const length = DESK_HELPER_TIPS.length;
    const indexes = new Set<number>();
    for (let day = 1; day <= length; day++) {
      indexes.add(pickDailyTipIndex(new Date(2026, 0, day), length));
    }
    expect(indexes.size).toBeGreaterThan(1);
  });

  it('degrades to 0 for a zero-length list instead of dividing by zero', () => {
    expect(pickDailyTipIndex(new Date(2026, 0, 1), 0)).toBe(0);
  });
});
