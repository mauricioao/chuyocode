/**
 * exerciseCopy — pure presentation helpers for the English section.
 *
 * Zero I/O, zero dependencies, no locale awareness. Two jobs:
 *
 *  - pick one of several phrasings for a heading WITHOUT `Math.random()`, so
 *    the same URL always reads the same way;
 *  - turn an exercise slug into a human title, for the cards that must not
 *    lead with the exercise prompt.
 *
 * Both live here rather than inline in an `.astro` template for one reason:
 * `AstroContainer` cannot render the React island on the detail route
 * (`src/pages/[lang]/libros/libros.test.ts:47` is `it.skip`'d), so the page
 * tests assert status codes and nothing else. Logic in a template is logic no
 * test can see.
 */

/**
 * A stable index into an array of `length`, derived from `seed`.
 *
 * WHY NOT `Math.random()`. This runs on the SSR render path. A random pick
 * would give the same exercise a different heading on every reload, which
 * reads as a glitch rather than as variety — the same reasoning that made the
 * related-exercise ORDER deterministic instead of leaving it to Postgres.
 *
 * The hash is the classic `h * 31 + charCode` over UTF-16 code units, kept in
 * unsigned 32-bit range by `>>> 0`. It is not cryptographic and does not need
 * to be: the only requirement is that different slugs land on different
 * buckets and that a given slug never moves.
 *
 * Returns `0` for a `length` it cannot divide by. `x % 0` is `NaN`, and `NaN`
 * as an array index reads `undefined`, which renders as an empty heading with
 * nothing thrown and nothing logged.
 */
export function stableIndex(seed: string, length: number): number {
  if (!Number.isInteger(length) || length <= 0) return 0;

  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return hash % length;
}

/**
 * One entry of `options`, chosen deterministically from `seed`.
 *
 * Returns `''` — never `undefined` — when there is nothing to pick. Astro
 * renders `undefined` as the literal word "undefined"; an empty string renders
 * as nothing, which is the honest degradation.
 */
export function pickStable(options: readonly string[], seed: string): string {
  if (options.length === 0) return '';
  return options[stableIndex(seed, options.length)] ?? '';
}

/**
 * An exercise slug read as an English phrase: `review-comments` -> `Review
 * comments`.
 *
 * Slugs are English and permanent (they are in the URL and in every published
 * row), which makes them a usable title once the separators are gone — and
 * unlike the first slot's prompt, a slug gives nothing away about the answer.
 *
 * Sentence case, matching `TOPIC_LABELS`: only the first word is capitalized,
 * because these are labels rather than titles.
 */
export function humanizeSlug(slug: string): string {
  const words = slug.split(/[-_\s]+/).filter((word) => word.length > 0);
  if (words.length === 0) return '';

  const [first, ...rest] = words;
  return [first[0].toUpperCase() + first.slice(1), ...rest].join(' ');
}
