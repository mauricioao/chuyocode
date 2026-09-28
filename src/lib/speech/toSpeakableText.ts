/**
 * `toSpeakableText` — turns authored English exercise text into something
 * worth handing to `speechSynthesis.speak()` (D4, "Escuchar/Listen").
 *
 * Three rules, in order:
 *  1. A gap marker (`___`, 3+ underscores — the same marker
 *     `splitLabelAtBlank` in `exercisePayload.ts` looks for) reads as the
 *     word "blank", so "The cat ___ on the mat" is spoken as "The cat blank
 *     on the mat" instead of trailing off into silence or a string of
 *     underscores.
 *  2. Remaining markup-ish characters (`* _ ~ \` # < >` — none of which are
 *     ever meant to be SPOKEN, only to format the printed sentence) are
 *     dropped, and any whitespace the removals leave behind collapses to a
 *     single space.
 *  3. The result is capped at {@link MAX_SPEAKABLE_LENGTH} characters, so a
 *     misauthored zone/prose block can never hand the browser an
 *     unboundedly long utterance.
 *
 * Zero I/O, no `window`/`speechSynthesis` reference — safe to import from
 * anywhere, including at SSR time; only `useSpeech` actually touches the
 * browser API.
 */

/** 3 or more consecutive underscores — the authored "fill in the blank" marker. */
const BLANK_MARKER_RE = /_{3,}/g;

/** Characters authors use for emphasis/markup in printed text, never meant to be spoken aloud. */
const MARKUP_CHARS_RE = /[*_~`#<>]/g;

const WHITESPACE_RE = /\s+/g;

/** An utterance longer than this is capped — see the file header. */
export const MAX_SPEAKABLE_LENGTH = 300;

/**
 * Convert authored text into speakable text, or `''` for nothing worth
 * speaking (a missing/blank/whitespace-only input).
 */
export function toSpeakableText(text: string | null | undefined): string {
  if (!text) return '';

  const withBlanks = text.replace(BLANK_MARKER_RE, ' blank ');
  const withoutMarkup = withBlanks.replace(MARKUP_CHARS_RE, ' ');
  const collapsed = withoutMarkup.replace(WHITESPACE_RE, ' ').trim();

  if (collapsed.length <= MAX_SPEAKABLE_LENGTH) return collapsed;
  // Cap at a word boundary when one is available nearby, so the cut does not
  // land mid-word for a plausible authored sentence length.
  const slice = collapsed.slice(0, MAX_SPEAKABLE_LENGTH);
  const lastSpace = slice.lastIndexOf(' ');
  return (lastSpace > MAX_SPEAKABLE_LENGTH - 30 ? slice.slice(0, lastSpace) : slice).trim();
}
