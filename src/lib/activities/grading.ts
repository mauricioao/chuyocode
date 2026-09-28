/**
 * Client-side grading for the practice page (`/[lang]/ingles/actividades/[id]`,
 * PR D "Activities practice"). Zero I/O, pure functions — answers are NEVER
 * stored (task contract), so grading exists only to turn a learner's
 * in-memory answers into a per-zone correct/incorrect verdict and a score,
 * for exactly as long as the page stays open.
 *
 * Rules, per `Zone.kind` (`src/lib/activities/blocks.ts`):
 *  - `text`: trimmed, case-insensitive, inner whitespace collapsed to a
 *    single space, compared against ANY of `zone.answers` (normalized the
 *    same way) — "Big   Ben" matches "big ben" and " BIG BEN ".
 *  - `choice`: EXACT match against `zone.answers` — the offered options are
 *    a closed, author-picked set (`parseZone`'s own contract: every answer
 *    is guaranteed to be one of `zone.options`), so there is no free-text
 *    fuzziness to account for.
 *
 * An empty/untouched answer is always wrong, never a false positive against
 * some author-picked answer that happens to be empty — `parseZone` already
 * rejects empty answers, so this is defensive, not load-bearing.
 */
import type { Zone } from './blocks';

/** The only fields grading needs from a {@link Zone} — id, kind, accepted answers. */
export type GradableZone = Pick<Zone, 'id' | 'kind' | 'answers'>;

export interface ZoneResult {
  zoneId: string;
  correct: boolean;
}

export interface GradeSummary {
  results: ZoneResult[];
  /** Also `results.length` — kept alongside it so a caller never recomputes it. */
  total: number;
  correctCount: number;
}

/** Trim, lowercase, and collapse inner whitespace to one space — the `text` comparison key. */
export function normalizeTextAnswer(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Grade one zone's given answer against its accepted answers. */
export function gradeZone(zone: GradableZone, given: string): boolean {
  if (zone.kind === 'text') {
    const normalizedGiven = normalizeTextAnswer(given);
    if (normalizedGiven.length === 0) return false;
    return zone.answers.some((answer) => normalizeTextAnswer(answer) === normalizedGiven);
  }
  // 'choice': exact match, no normalization — see file header.
  if (given.length === 0) return false;
  return zone.answers.includes(given);
}

/**
 * Grade every zone in `zones` against `given` (zone id -> the learner's
 * current answer; a missing key is the same as an empty string). Order of
 * `results` mirrors `zones`.
 */
export function gradeZones(zones: GradableZone[], given: Record<string, string>): GradeSummary {
  const results: ZoneResult[] = zones.map((zone) => ({
    zoneId: zone.id,
    correct: gradeZone(zone, given[zone.id] ?? ''),
  }));
  const correctCount = results.filter((r) => r.correct).length;
  return { results, total: results.length, correctCount };
}
