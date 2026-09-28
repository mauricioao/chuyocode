/**
 * Slug utilities for the authoring publish flow (slice 17, design.md §8
 * "Slug collisions").
 *
 * Zero I/O, pure — same posture as `exercisePayload.ts` and
 * `exerciseValidator.ts`.
 *
 * `slugify` turns free text into the shape `exerciseValidator.ts`'s
 * `SLUG_PATTERN` accepts (`^[a-z0-9]+(-[a-z0-9]+)*$`): lowercase, ASCII,
 * hyphen-separated, no leading/trailing/duplicate hyphens.
 *
 * `withCollisionSuffix` appends a RANDOM 4-character base-36 suffix on a
 * `23505` unique-constraint collision (`UNIQUE(level, focus, slug)`,
 * `supabase/migrations/0003_exercises.sql`). Random, not a deterministic
 * `-2`: the retry budget in `guardar.ts` is exactly one attempt, and a
 * deterministic suffix can collide again for the same structural reason the
 * first slug did (e.g. two drafts both already ending in `-2`), which burns
 * the whole retry budget on a suffix a random draw would not have produced.
 */

/** Any run of characters that is not `a-z`/`0-9`, collapsed to one hyphen. */
const NON_SLUG_CHARS = /[^a-z0-9]+/g;
const EDGE_HYPHENS = /^-+|-+$/g;

/** How many random characters the collision suffix carries. */
const SUFFIX_LENGTH = 4;
const BASE36 = 36;

/**
 * Free text -> a `SLUG_PATTERN`-shaped slug. Degrades to the empty string
 * for input with no alphanumeric characters at all — callers that need a
 * non-empty slug (e.g. a fallback for an untitled draft) check the result,
 * this function does not invent content.
 */
export function slugify(text: string): string {
  return text.toLowerCase().trim().replace(NON_SLUG_CHARS, '-').replace(EDGE_HYPHENS, '');
}

/** One random base-36 digit, `0`-`9` or `a`-`z`. */
function randomBase36Char(): string {
  return Math.floor(Math.random() * BASE36).toString(BASE36);
}

/**
 * `slug` plus a random 4-character base-36 suffix, e.g.
 * `ordering-coffee-4f2a`. Called exactly once, on the first `23505` a save
 * attempt hits (`guardar.ts`'s one-retry budget).
 */
export function withCollisionSuffix(slug: string): string {
  let suffix = '';
  for (let i = 0; i < SUFFIX_LENGTH; i += 1) {
    suffix += randomBase36Char();
  }
  return `${slug}-${suffix}`;
}
