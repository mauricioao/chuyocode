/**
 * "Actividad del día" — the deterministic daily highlight at the top of the
 * community feed (`/[lang]/ingles/actividades`, page 1, no filters).
 *
 * PURE SELECTION ONLY. This module owns no I/O: the caller already narrowed
 * the candidate pool to the top 20 live activities by `heart_count desc,
 * published_at desc` (the same order `activities_heart_count_published_idx`,
 * `0014_activity_discovery.sql`, backs) — this function's only job is to
 * pick ONE of them, the SAME one for every visitor on the SAME calendar day.
 *
 * DETERMINISTIC PER CALENDAR DAY, AMERICA/LIMA — not per visitor, per
 * request, or per server timezone. The day boundary is computed with
 * `Intl.DateTimeFormat`'s `timeZone` option (no extra date library needed:
 * both Node and every evergreen browser ship IANA tz data), so "today" means
 * the same thing to every visitor regardless of where they or the server
 * physically are.
 *
 * The pick is `hash(dateKey) % candidates.length` — a stable hash of the
 * date string, not `Date.now()` or `Math.random()`, so the SAME day always
 * lands on the SAME index for the SAME candidate list. It varies from day to
 * day because the date string changes, and from list to list because a
 * changed candidate pool (a new activity entering the top 20, one leaving
 * it) changes both the modulus and the ordering the index is read against —
 * accepted drift, not a bug: this is a daily spotlight, not a stable id
 * lookup.
 */

/** `YYYY-MM-DD` for `date` in the America/Lima calendar — the "day" this pick is keyed on. */
function limaDateKey(date: Date): string {
  // `en-CA` is the one common locale whose default date format is already
  // `YYYY-MM-DD`, which sidesteps hand-parsing `Intl.DateTimeFormat`'s
  // locale-shaped output.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** A small, stable string hash (FNV-1a-shaped). Deterministic across runs and platforms — no `Math.random`, no `Date.now`. */
function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  // Unsigned: `Math.imul` returns a signed 32-bit int, and a negative left
  // operand to `%` would make the index negative too.
  return hash >>> 0;
}

/**
 * Pick one candidate for `date`'s America/Lima calendar day, or `null` when
 * `candidates` is empty (the caller hides the card in that case — see
 * `[lang]/ingles/actividades/index.astro`).
 *
 * `date` defaults to `new Date()` (the real "now") — a parameter only so
 * tests can pin it without mocking global time.
 */
export function pickDailyActivity<T>(candidates: readonly T[], date: Date = new Date()): T | null {
  if (candidates.length === 0) return null;
  const key = limaDateKey(date);
  const index = hashString(key) % candidates.length;
  return candidates[index];
}
