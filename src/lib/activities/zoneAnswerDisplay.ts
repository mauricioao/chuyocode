/**
 * zoneAnswerDisplay — pure sizing for the practice page's mobile per-zone
 * bottom sheet (mobile layout pass): once a zone becomes a TAP TARGET
 * showing the learner's own typed/chosen answer instead of an inline input
 * (see `WorksheetPlayer.tsx`'s `onZoneTap`), a long answer must still fit
 * inside a zone that can be as small as `MIN_ZONE_SIZE` of the image — an
 * "auto-shrinking font" (mobile layout brief) rather than clipping or
 * overflowing the zone's own box.
 */

/** The largest a zone's answer text ever renders at (rem) — matches the inline input's own `text-xs`. */
export const MAX_ZONE_FONT_REM = 0.75;

/** The smallest a zone's answer text may shrink to (rem) before it would stop being legible. */
export const MIN_ZONE_FONT_REM = 0.5;

/** Text at or under this length renders at the full {@link MAX_ZONE_FONT_REM} — no shrinking needed. */
const COMFORTABLE_LENGTH = 6;

/**
 * The font size (rem) for `text` inside a zone's tap-target overlay: full
 * size up to {@link COMFORTABLE_LENGTH} characters, shrinking roughly in
 * proportion to length past it, floored at {@link MIN_ZONE_FONT_REM} so a
 * very long answer stays a fixed (if small) size rather than vanishing.
 * Empty text (an unanswered zone, showing only its placeholder dash) always
 * renders at full size.
 */
export function zoneAnswerFontSize(text: string): number {
  const length = text.trim().length;
  if (length <= COMFORTABLE_LENGTH) return MAX_ZONE_FONT_REM;
  const scale = COMFORTABLE_LENGTH / length;
  return Math.max(MIN_ZONE_FONT_REM, MAX_ZONE_FONT_REM * scale);
}
