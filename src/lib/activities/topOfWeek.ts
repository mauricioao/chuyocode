/**
 * Most-hearted activity published in the last 7 days — the second half of
 * the English hub's "Para ti hoy" strip (`/[lang]/ingles`), sitting next to
 * `pickDailyActivity`'s deterministic daily spotlight (`dailyPick.ts`).
 *
 * PURE SELECTION ONLY, same posture as `dailyPick.ts`: the caller already
 * queried the candidate pool ordered by `heart_count desc, published_at
 * desc` (`getPublishedActivities({ orden: 'gustadas' })`) — this function's
 * only job is to return the FIRST candidate published within the last 7
 * days, which is therefore the most-hearted one in that window. `null` when
 * no candidate qualifies (a brand-new community, or every candidate
 * published more than a week ago) — the caller hides the card in that case
 * (`[lang]/ingles/index.astro`).
 */

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * `candidate` published within the 7 days up to and including `now`.
 *
 * `now` defaults to `new Date()` (the real "now") — a parameter only so
 * tests can pin it without mocking global time.
 */
export function topActivityOfWeek<T extends { publishedAt: string | null }>(
  candidates: readonly T[],
  now: Date = new Date(),
): T | null {
  const cutoff = now.getTime() - WEEK_MS;

  for (const candidate of candidates) {
    if (!candidate.publishedAt) continue;
    const publishedAt = new Date(candidate.publishedAt).getTime();
    if (Number.isFinite(publishedAt) && publishedAt >= cutoff && publishedAt <= now.getTime()) {
      return candidate;
    }
  }
  return null;
}
