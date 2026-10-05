/**
 * Scoring for the placement-test draft — pure, zero-I/O, so it is testable
 * without a browser or a stored result (`@/content/placement/items` for the
 * bank, `./storage.ts` for what gets persisted).
 *
 * Rules (owner brief):
 *  - A level is PASSED when correct/total for that level >= {@link PASS_RATIO}
 *    (0.6) — derived from the ratio, never a hardcoded "5 of 8"/"5 of 7"
 *    count, so a bank with a different item count per level still scores
 *    correctly.
 *  - `estimatedLevel` is the highest level such that it AND every level below
 *    it passed (the "consecutive rule") — `null` if A1 itself is not passed.
 *  - `recommendedLevel` is the first level not passed, in order (A1 if none
 *    passed); if every level passed, it is the last one in
 *    {@link PLACEMENT_LEVEL_ORDER} (B2) — the UI reads that as "B2 o
 *    superior"/"B2 or higher".
 *  - "No lo sé" and a simply unanswered item both count as WRONG, never
 *    excluded from the level's total — {@link PlacementAnswers} is a lookup
 *    by item id, and a missing key is treated exactly like an explicit
 *    `null`.
 */
import { PLACEMENT_LEVEL_ORDER, type PlacementItem, type PlacementLevel } from '@/content/placement/items';

export { PLACEMENT_LEVEL_ORDER };

/** The learner's answer to one item: the chosen option index, or `null` for "No lo sé" / unanswered. */
export type PlacementAnswer = number | null;

/** Lookup by item id. A missing key counts exactly like an explicit `null` (wrong, not excluded). */
export type PlacementAnswers = Readonly<Record<string, PlacementAnswer>>;

/** The learner passes a level at correct/total >= this ratio (60%). */
export const PASS_RATIO = 0.6;

export interface LevelBreakdown {
  level: PlacementLevel;
  correct: number;
  total: number;
  passed: boolean;
}

export interface PlacementResult {
  estimatedLevel: PlacementLevel | null;
  recommendedLevel: PlacementLevel;
  breakdown: LevelBreakdown[];
}

function isPassed(correct: number, total: number): boolean {
  return total > 0 && correct / total >= PASS_RATIO;
}

/**
 * Per-level correct/total/passed, in {@link PLACEMENT_LEVEL_ORDER}. Only
 * levels actually present in `items` are included, so a partial fixture (or
 * a future bank that drops a level) never reports a bogus 0-of-0 entry.
 */
export function scoreBreakdown(items: readonly PlacementItem[], answers: PlacementAnswers): LevelBreakdown[] {
  const breakdown: LevelBreakdown[] = [];

  for (const level of PLACEMENT_LEVEL_ORDER) {
    const levelItems = items.filter((item) => item.level === level);
    if (levelItems.length === 0) continue;

    const total = levelItems.length;
    const correct = levelItems.filter((item) => answers[item.id] === item.correctIndex).length;
    breakdown.push({ level, correct, total, passed: isPassed(correct, total) });
  }

  return breakdown;
}

/** Highest level such that it AND every level below it passed — `null` if A1 did not pass. */
export function estimateLevel(breakdown: readonly LevelBreakdown[]): PlacementLevel | null {
  let estimated: PlacementLevel | null = null;
  for (const entry of breakdown) {
    if (!entry.passed) break;
    estimated = entry.level;
  }
  return estimated;
}

/** First level not passed, in order — or the last level in `breakdown` when every level passed. */
export function recommendLevel(breakdown: readonly LevelBreakdown[]): PlacementLevel {
  const firstNotPassed = breakdown.find((entry) => !entry.passed);
  if (firstNotPassed) return firstNotPassed.level;
  return breakdown[breakdown.length - 1]?.level ?? PLACEMENT_LEVEL_ORDER[0];
}

export function scorePlacement(items: readonly PlacementItem[], answers: PlacementAnswers): PlacementResult {
  const breakdown = scoreBreakdown(items, answers);
  return {
    estimatedLevel: estimateLevel(breakdown),
    recommendedLevel: recommendLevel(breakdown),
    breakdown,
  };
}
