/**
 * estimateSpeechMs — a rough playback-duration estimate for a piece of
 * English text read at a given `speechSynthesis` rate.
 *
 * Why an ESTIMATE at all: the Web Speech API exposes no duration, and no
 * reliable per-word timing callback either (`onboundary` support is
 * inconsistent across browsers) — so anything that wants to show playback
 * progress (`DeskPlayerWidget`'s own progress bar/remaining time) has
 * nothing to measure against except a guess. 130 words/minute is a
 * deliberately plain, average spoken-English rate; this is cosmetic
 * (a progress bar that is a few hundred ms off never matters), not a timing
 * guarantee anything else depends on.
 *
 * Pure and zero-I/O so `DeskPlayerWidget.test.tsx` and this file's own test
 * can both exercise it without mounting React or a fake `speechSynthesis`.
 */

/** Average spoken-English rate this estimate is built from, at `rate = 1` (`speechSynthesis` scale). */
const BASE_WORDS_PER_MINUTE = 130;

/** Never estimate below this — a one-word phrase should still get a visible, not-instant progress animation. */
const MIN_MS = 900;

export function estimateSpeechMs(text: string, rate = 1): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const safeRate = rate > 0 ? rate : 1;
  const wordsPerMinute = BASE_WORDS_PER_MINUTE * safeRate;
  const ms = (words / wordsPerMinute) * 60_000;
  return Math.max(MIN_MS, Math.round(ms));
}
