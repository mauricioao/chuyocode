/**
 * timeInWords — English time-in-words ("quarter past nine"), for the desk
 * hub's iOS-style clock widget ("desktop" redesign PART 3,
 * `DeskClockWidget.astro`). Pure/zero-I/O, same vocabulary as the approved
 * mockup's own inline script (`ChuyoCode_others/propuestas/ingles-escritorio/
 * index.html`'s `timeInWords`), ported here so it is unit-testable and
 * shared with the widget's hover tooltip / `aria-label`.
 *
 * Minutes round to the nearest 5 — the mockup's own vocabulary only names
 * five/ten/quarter/twenty/twenty-five/half, never an exact minute count — so
 * `08:58` reads as "nine o'clock", not "two minutes to nine".
 */

/** Hour names, 0-indexed (`0` = "twelve", matching a 12-hour clock face). */
const HOUR_WORDS = [
  'twelve',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
] as const;

/** Minute-offset names, keyed by the rounded 5-minute value (5-30). */
const MINUTE_WORDS: Record<number, string> = {
  5: 'five',
  10: 'ten',
  15: 'quarter',
  20: 'twenty',
  25: 'twenty-five',
  30: 'half',
};

/**
 * `hour` is 0-23 (as `Date#getHours` returns); `minute` is 0-59. Returns a
 * full sentence fragment like `"quarter past nine"`, `"half past nine"`,
 * `"twenty to ten"` or `"nine o'clock"` — never capitalized and never
 * punctuated, so a caller composes it into its own sentence (e.g. `` `It's
 * ${timeInWords(h, m)}.` ``).
 */
export function timeInWords(hour: number, minute: number): string {
  const rounded = Math.round(minute / 5) * 5;

  if (rounded === 0 || rounded === 60) {
    const effectiveHour = rounded === 60 ? hour + 1 : hour;
    return `${HOUR_WORDS[effectiveHour % 12]} o'clock`;
  }
  if (rounded <= 30) {
    return `${MINUTE_WORDS[rounded]} past ${HOUR_WORDS[hour % 12]}`;
  }
  return `${MINUTE_WORDS[60 - rounded]} to ${HOUR_WORDS[(hour + 1) % 12]}`;
}
