/**
 * Exercise taxonomy — the closed vocabularies of the English section.
 *
 * Zero I/O, zero dependencies. These are the values that appear in URLs
 * (`/[lang]/ingles/[level]/[topic]/[slug]`) and in the `exercises` table, so
 * they are effectively PERMANENT: renaming one orphans every published row that
 * references it (docs/exercise-model.md, "Changing a taxonomy value").
 *
 * The guards exist so a route can reject an unknown segment BEFORE touching the
 * database — a 404 the user understands instead of a query that finds nothing.
 */

/** CEFR proficiency levels, lowest to highest. */
export const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;

/** Union of the supported CEFR levels. */
export type Level = (typeof LEVELS)[number];

/**
 * Confirmed topic slugs. Half are everyday English, half are the workplace
 * situations a developer actually lands in.
 */
export const TOPICS = [
  'daily-life',
  'travel',
  'food',
  'family-and-friends',
  'code-review',
  'daily-standup',
  'technical-documentation',
  'job-interview',
] as const;

/** Union of the supported topic slugs. */
export type Topic = (typeof TOPICS)[number];

/**
 * Skill filter labels. This is a UI filter, NEVER a dispatch key: "listening"
 * is an audio stimulus layered on any answer mechanic, not an exercise type
 * (docs/exercise-model.md, "The two axes").
 */
export const SKILLS = ['writing', 'listening', 'reading'] as const;

/** Union of the supported skill labels. */
export type Skill = (typeof SKILLS)[number];

/** Type guard: is `value` a CEFR level? Matched exactly — `b1` is not `B1`. */
export function isLevel(value: unknown): value is Level {
  return (
    typeof value === 'string' && (LEVELS as readonly string[]).includes(value)
  );
}

/** Type guard: is `value` a confirmed topic slug? */
export function isTopic(value: unknown): value is Topic {
  return (
    typeof value === 'string' && (TOPICS as readonly string[]).includes(value)
  );
}

/** Type guard: is `value` a supported skill filter label? */
export function isSkill(value: unknown): value is Skill {
  return (
    typeof value === 'string' && (SKILLS as readonly string[]).includes(value)
  );
}
