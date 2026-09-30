import { describe, it, expect } from 'vitest';
import { topActivityOfWeek } from './topOfWeek';

const NOW = new Date('2026-09-30T12:00:00Z');

function activity(id: string, publishedAt: string | null) {
  return { id, publishedAt };
}

describe('topActivityOfWeek', () => {
  it('returns null for an empty candidate list', () => {
    expect(topActivityOfWeek([], NOW)).toBeNull();
  });

  it('returns the first candidate published within the last 7 days', () => {
    // Candidates already arrive ordered by heart_count desc — the first one
    // that qualifies by date IS the most-hearted one in the window.
    const candidates = [
      activity('most-hearted-old', '2026-09-01T00:00:00Z'), // outside the window
      activity('runner-up-recent', '2026-09-25T00:00:00Z'), // inside the window
      activity('third-recent', '2026-09-24T00:00:00Z'),
    ];
    expect(topActivityOfWeek(candidates, NOW)).toEqual(activity('runner-up-recent', '2026-09-25T00:00:00Z'));
  });

  it('returns null when every candidate is older than 7 days', () => {
    const candidates = [activity('a1', '2026-09-01T00:00:00Z'), activity('a2', '2026-08-15T00:00:00Z')];
    expect(topActivityOfWeek(candidates, NOW)).toBeNull();
  });

  it('returns null when every candidate has no published date', () => {
    expect(topActivityOfWeek([activity('a1', null), activity('a2', null)], NOW)).toBeNull();
  });

  it('skips an unparseable published date rather than throwing', () => {
    const candidates = [activity('bad', 'not-a-date'), activity('good', '2026-09-29T00:00:00Z')];
    expect(topActivityOfWeek(candidates, NOW)).toEqual(activity('good', '2026-09-29T00:00:00Z'));
  });

  it('includes a candidate published exactly at the 7-day boundary', () => {
    const boundary = new Date(NOW.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    expect(topActivityOfWeek([activity('edge', boundary)], NOW)).toEqual(activity('edge', boundary));
  });

  it('excludes a candidate published in the future relative to now', () => {
    const future = new Date(NOW.getTime() + 60_000).toISOString();
    expect(topActivityOfWeek([activity('future', future)], NOW)).toBeNull();
  });

  it('defaults to the real current time when no date is passed', () => {
    const recent = new Date().toISOString();
    expect(topActivityOfWeek([activity('a1', recent)])).toEqual(activity('a1', recent));
  });
});
