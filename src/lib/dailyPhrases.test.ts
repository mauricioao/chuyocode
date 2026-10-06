import { describe, it, expect } from 'vitest';
import { DAILY_PHRASES, pickPhraseIndex } from './dailyPhrases';

describe('DAILY_PHRASES', () => {
  it('ships at least 25 curated phrases, each with an English phrase and a Spanish meaning', () => {
    expect(DAILY_PHRASES.length).toBeGreaterThanOrEqual(25);
    for (const phrase of DAILY_PHRASES) {
      expect(phrase.en.trim().length).toBeGreaterThan(0);
      expect(phrase.es.trim().length).toBeGreaterThan(0);
    }
  });
});

describe('pickPhraseIndex', () => {
  it('returns the same index for every date on the same calendar day', () => {
    const morning = new Date(2026, 9, 6, 1, 0, 0);
    const night = new Date(2026, 9, 6, 23, 59, 0);
    expect(pickPhraseIndex(morning, 30)).toBe(pickPhraseIndex(night, 30));
  });

  it('advances on the next calendar day', () => {
    const today = new Date(2026, 9, 6);
    const tomorrow = new Date(2026, 9, 7);
    const a = pickPhraseIndex(today, 30);
    const b = pickPhraseIndex(tomorrow, 30);
    expect(b).toBe((a + 1) % 30);
  });

  it('always stays within [0, length)', () => {
    for (let month = 0; month < 12; month += 1) {
      const index = pickPhraseIndex(new Date(2026, month, 15), 30);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(30);
    }
  });

  it('returns 0 for a non-positive length rather than dividing by zero', () => {
    expect(pickPhraseIndex(new Date(2026, 9, 6), 0)).toBe(0);
  });
});
