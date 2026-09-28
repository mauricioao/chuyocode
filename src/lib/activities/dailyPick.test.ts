import { describe, it, expect } from 'vitest';
import { pickDailyActivity } from './dailyPick';

const CANDIDATES = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7'];

describe('pickDailyActivity', () => {
  it('returns null for an empty candidate list', () => {
    expect(pickDailyActivity([], new Date('2026-09-28T12:00:00Z'))).toBeNull();
  });

  it('returns one of the candidates, never something outside the list', () => {
    const pick = pickDailyActivity(CANDIDATES, new Date('2026-09-28T12:00:00Z'));
    expect(CANDIDATES).toContain(pick);
  });

  it('picks the same candidate for the same America/Lima calendar day, regardless of UTC time-of-day', () => {
    // Both timestamps fall within 2026-09-28 in America/Lima (UTC-5): the
    // first is late evening the day before in UTC, the second is morning —
    // if the pick used the server's own local day (or raw UTC) instead of
    // America/Lima, these two would disagree.
    const early = pickDailyActivity(CANDIDATES, new Date('2026-09-28T05:30:00Z'));
    const late = pickDailyActivity(CANDIDATES, new Date('2026-09-29T04:30:00Z'));
    expect(early).toBe(late);
  });

  it('is deterministic — calling it twice with the same inputs agrees', () => {
    const date = new Date('2026-09-28T12:00:00Z');
    expect(pickDailyActivity(CANDIDATES, date)).toBe(pickDailyActivity(CANDIDATES, date));
  });

  it('varies across different days', () => {
    const picks = new Set<string | null>();
    for (let day = 1; day <= 28; day++) {
      const date = new Date(Date.UTC(2026, 0, day, 12, 0, 0));
      picks.add(pickDailyActivity(CANDIDATES, date));
    }
    // Not every one of 28 days can land on the same candidate out of 7,
    // unless the hash were degenerate — this would fail for a constant or
    // broken hash without pinning the picker to one specific day/index pair.
    expect(picks.size).toBeGreaterThan(1);
  });

  it('returns the single candidate when there is exactly one', () => {
    expect(pickDailyActivity(['only'], new Date('2026-09-28T12:00:00Z'))).toBe('only');
  });

  it('defaults to the real current time when no date is passed', () => {
    expect(CANDIDATES).toContain(pickDailyActivity(CANDIDATES));
  });
});
