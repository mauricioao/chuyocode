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
 * The LANGUAGE POINT an exercise practises — the section's PRIMARY axis.
 *
 * This is what a learner or a teacher searches for first: "I need conditionals",
 * not "I need something set in an airport". {@link TOPICS} answers a different
 * question — where the language happens — and is the SECONDARY axis
 * (`supabase/migrations/0004_exercises_focus.sql` carries the full rationale).
 *
 * DELIBERATELY A FLAT LIST, NOT A MAP KEYED BY LEVEL. A focus is genuinely
 * practised at more than one level: `present-simple` is an A1 introduction and
 * again a B1 contrast against the present continuous; `modal-verbs` runs from
 * A2 politeness to C1 hedging. The level lives on the ROW, where it can differ
 * per exercise. A `focus -> level` map would make that ordinary case
 * unrepresentable and would need editing every time a point is reused.
 *
 * The ORDER is roughly ascending difficulty — the CEFR bands the vocabulary was
 * drawn from — because it is what the entry screen renders in. That is a
 * DISPLAY convenience only; nothing reads a level out of a position here.
 *
 * Like every value in this file, these sit in URLs and in published rows, so
 * they are permanent (docs/exercise-model.md, "Changing a taxonomy value").
 */
export const FOCUSES = [
  // Roughly A1
  'present-simple',
  'verb-to-be',
  'articles',
  'plurals',
  'possessives',
  'prepositions',
  'question-forms',
  // Roughly A2
  'present-continuous',
  'past-simple',
  'comparatives',
  'quantifiers',
  'future-forms',
  'adverbs-of-frequency',
  'modal-verbs',
  // Roughly B1
  'present-perfect',
  'past-continuous',
  'first-conditional',
  'second-conditional',
  'passive-voice',
  'reported-speech',
  'gerunds-infinitives',
  'relative-clauses',
  'phrasal-verbs',
  // Roughly B2
  'past-perfect',
  'third-conditional',
  'present-perfect-continuous',
  'modals-of-deduction',
  'linking-words',
  // Roughly C1/C2
  'inversion',
  'cleft-sentences',
  'unreal-past',
  'collocations',
  'idioms',
] as const;

/** Union of the supported language-point slugs. */
export type Focus = (typeof FOCUSES)[number];

/**
 * Confirmed topic slugs — the CONTEXT a language point is practised in, not the
 * subject of the exercise. Half are everyday English, half are the workplace
 * situations a developer actually lands in.
 *
 * SECONDARY to {@link FOCUSES}, and OPTIONAL on a row: a pure grammar drill has
 * no natural setting, and forcing one would make authors invent fake contexts.
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
 * Display labels for the language points. English in every locale, for exactly
 * the same reasons as {@link TOPIC_LABELS} — and more strongly here, because a
 * focus names the grammar the learner is here to acquire. Printing "Presente
 * perfecto" over an English exercise translates the one term they need to be
 * able to read in English.
 *
 * Sentence case, like the other two maps.
 */
export const FOCUS_LABELS: Record<Focus, string> = {
  'present-simple': 'Present simple',
  'verb-to-be': 'Verb to be',
  articles: 'Articles',
  plurals: 'Plurals',
  possessives: 'Possessives',
  prepositions: 'Prepositions',
  'question-forms': 'Question forms',
  'present-continuous': 'Present continuous',
  'past-simple': 'Past simple',
  comparatives: 'Comparatives',
  quantifiers: 'Quantifiers',
  'future-forms': 'Future forms',
  'adverbs-of-frequency': 'Adverbs of frequency',
  'modal-verbs': 'Modal verbs',
  'present-perfect': 'Present perfect',
  'past-continuous': 'Past continuous',
  'first-conditional': 'First conditional',
  'second-conditional': 'Second conditional',
  'passive-voice': 'Passive voice',
  'reported-speech': 'Reported speech',
  'gerunds-infinitives': 'Gerunds and infinitives',
  'relative-clauses': 'Relative clauses',
  'phrasal-verbs': 'Phrasal verbs',
  'past-perfect': 'Past perfect',
  'third-conditional': 'Third conditional',
  'present-perfect-continuous': 'Present perfect continuous',
  'modals-of-deduction': 'Modals of deduction',
  'linking-words': 'Linking words',
  inversion: 'Inversion',
  'cleft-sentences': 'Cleft sentences',
  'unreal-past': 'Unreal past',
  collocations: 'Collocations',
  idioms: 'Idioms',
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

/**
 * Type guard: is `value` a language point in the taxonomy?
 *
 * Also the reason `'unassigned'` was chosen as the sentinel in
 * `0004_exercises_focus.sql`: a row the migration could not classify fails this
 * guard, so it is discarded from the facets and 404s on the route instead of
 * being filed under a real but wrong language point.
 */
export function isFocus(value: unknown): value is Focus {
  return (
    typeof value === 'string' && (FOCUSES as readonly string[]).includes(value)
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
