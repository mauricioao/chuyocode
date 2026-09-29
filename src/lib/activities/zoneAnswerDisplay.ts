/**
 * zoneAnswerDisplay — pure sizing for the practice page's mobile per-zone
 * bottom sheet (mobile layout pass): once a zone becomes a TAP TARGET
 * showing the learner's own typed/chosen answer instead of an inline input
 * (see `WorksheetPlayer.tsx`'s `onZoneTap`), a long answer must still fit
 * inside a zone that can be as small as `MIN_ZONE_SIZE` of the image — an
 * "auto-shrinking font" (mobile layout brief) rather than clipping or
 * overflowing the zone's own box.
 *
 * `zoneInputFontSizePx`/`shouldShowZonePlaceholder` below are a SEPARATE
 * pair (practice player redesign, "clean zones"): the desktop/editor INLINE
 * input's own font size and placeholder visibility, both driven by the
 * zone's actual RENDERED pixel box (measured via `getBoundingClientRect` —
 * `WorksheetPlayer.tsx`'s own container measurement) rather than by the
 * answer text's length, since an empty zone has no text to measure yet and
 * still needs to read cleanly at any drawn size.
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

/** The smallest a zone's inline input font ever renders at (px) — practice player redesign, "clean zones". */
export const MIN_ZONE_INPUT_FONT_PX = 11;

/** The largest a zone's inline input font ever renders at (px). */
export const MAX_ZONE_INPUT_FONT_PX = 20;

/**
 * The inline input/select's own font size (px) inside a worksheet zone,
 * scaled linearly with the zone's ACTUAL RENDERED HEIGHT (a fraction of the
 * image's own rendered box — `WorksheetPlayer.tsx`'s `containerRef`
 * measurement), clamped to `[MIN_ZONE_INPUT_FONT_PX, MAX_ZONE_INPUT_FONT_PX]`.
 * A non-positive/unmeasured height (jsdom, or before the first layout pass)
 * falls back to the floor rather than a `NaN`/negative size.
 */
export function zoneInputFontSizePx(heightPx: number): number {
  if (!Number.isFinite(heightPx) || heightPx <= 0) return MIN_ZONE_INPUT_FONT_PX;
  return Math.min(MAX_ZONE_INPUT_FONT_PX, Math.max(MIN_ZONE_INPUT_FONT_PX, heightPx));
}

/**
 * Below this rendered width (px), a zone is too narrow for placeholder
 * copy ("Escribir la respuesta"/"Elegir una opción") to read as anything but
 * clipped noise — the input instead shows a subtle empty state with no
 * placeholder text at all (`WorksheetPlayer.tsx`'s own render). An
 * unmeasured (`0`) width — jsdom, or before the first layout pass — is
 * treated as narrow (fails safe toward the emptier, less noisy state).
 */
export const ZONE_PLACEHOLDER_MIN_WIDTH_PX = 120;

/** Whether a zone this wide (px) is wide enough to show placeholder copy inline — see {@link ZONE_PLACEHOLDER_MIN_WIDTH_PX}. */
export function shouldShowZonePlaceholder(widthPx: number): boolean {
  return widthPx >= ZONE_PLACEHOLDER_MIN_WIDTH_PX;
}
