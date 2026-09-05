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

/**
 * Display labels for the topic slugs — **English in every locale**.
 *
 * `topic` and `skill` are exercise DATA, not site chrome. Exercise content is
 * English-only by contract (docs/exercise-model.md, "Authoring rules"), and the
 * whole point of the section is to read English: a card that announces
 * "Escritura" over an English prompt localizes the one thing the learner came
 * here to practise, and makes the same row read differently depending on the
 * URL prefix it was reached through.
 *
 * That is why this map lives HERE, beside the slugs, and not in `UI_LABELS` —
 * `UI_LABELS` is keyed by locale, and putting a locale-independent value inside
 * it is what produced the translated badges in the first place.
 *
 * The CEFR `level` is different and stays in `UI_LABELS`: "A2" is not a
 * translatable word, but the surrounding "Nivel"/"Level" is chrome.
 *
 * Sentence case on purpose. "Code Review" reads as a proper noun; these are
 * labels, not titles.
 */
export const TOPIC_LABELS: Record<Topic, string> = {
  'daily-life': 'Daily life',
  travel: 'Travel',
  food: 'Food',
  'family-and-friends': 'Family and friends',
  'code-review': 'Code review',
  'daily-standup': 'Daily standup',
  'technical-documentation': 'Technical documentation',
  'job-interview': 'Job interview',
};

/**
 * Display labels for the skill filter. English in every locale, for the same
 * reason as {@link TOPIC_LABELS}.
 */
export const SKILL_LABELS: Record<Skill, string> = {
  writing: 'Writing',
  listening: 'Listening',
  reading: 'Reading',
};

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
