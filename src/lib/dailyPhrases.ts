/**
 * dailyPhrases — the desk hub player's curated list of common English
 * expressions ("desktop" redesign PART 4, "Frase del día" widget, approved
 * mockup's `.player`). Each entry pairs the English phrase with its SPANISH
 * MEANING, not a literal word-for-word gloss where the two diverge (most of
 * these are idioms) — the same posture the mockup's own entry already takes
 * ("Break a leg!" — ¡Mucha suerte!, not "¡Rómpete una pierna!").
 *
 * Deliberately NOT sourced from Sanity or the activities DB: this is a
 * small, fixed, maintainer-curated list, not editorial content — adding or
 * editing a phrase is a code change, same posture as `skillIcons.ts`'s own
 * `SKILL_ICON_PATHS`.
 *
 * `pickPhraseIndex` is what makes "today's" phrase deterministic without a
 * server round trip: the day-of-year, modulo the list length, in whatever
 * timezone the caller's own `Date` already carries — see
 * `DeskPlayerWidget.tsx`'s own header for why that caller is always the
 * BROWSER's `Date`, never the server's.
 */

export interface DailyPhrase {
  en: string;
  es: string;
}

/** ~30 common English expressions, in no particular order (the daily pick does not depend on list order beyond being stable). */
export const DAILY_PHRASES: readonly DailyPhrase[] = [
  { en: 'Break a leg!', es: 'Mucha suerte.' },
  { en: "It's raining cats and dogs.", es: 'Está lloviendo a cántaros.' },
  { en: "It's a piece of cake.", es: 'Es pan comido.' },
  { en: 'Better late than never.', es: 'Más vale tarde que nunca.' },
  { en: 'Once in a blue moon.', es: 'De vez en cuando, muy raramente.' },
  { en: 'The ball is in your court.', es: 'La decisión es tuya ahora.' },
  { en: 'You hit the nail on the head.', es: 'Diste en el clavo.' },
  { en: 'She let the cat out of the bag.', es: 'Reveló un secreto.' },
  { en: "I'm feeling a bit under the weather.", es: 'Me siento un poco mal, indispuesto.' },
  { en: 'That cost an arm and a leg.', es: 'Eso costó un ojo de la cara.' },
  { en: 'Speak of the devil!', es: 'Hablando del rey de Roma.' },
  { en: 'That was the last straw.', es: 'Esa fue la gota que colmó el vaso.' },
  { en: 'It kills two birds with one stone.', es: 'Mata dos pájaros de un tiro.' },
  { en: 'We just have to bite the bullet.', es: 'Solo tenemos que aguantar, afrontarlo.' },
  { en: "Let's call it a day.", es: 'Demos por terminado el trabajo de hoy.' },
  { en: 'Please stop cutting corners.', es: 'Por favor deja de hacer las cosas mal por ahorrar tiempo.' },
  { en: 'The party got out of hand.', es: 'La fiesta se salió de control.' },
  { en: 'Hang in there!', es: 'Aguanta, no te rindas.' },
  { en: 'We arrived in the nick of time.', es: 'Llegamos justo a tiempo.' },
  { en: "It's a small world.", es: 'El mundo es un pañuelo.' },
  { en: "Don't miss the boat on this one.", es: 'No pierdas esta oportunidad.' },
  { en: "We're finally on the same page.", es: 'Por fin estamos de acuerdo.' },
  { en: "I'm over the moon about the news.", es: 'Estoy encantado con la noticia.' },
  { en: 'They see eye to eye on most things.', es: 'Están de acuerdo en casi todo.' },
  { en: "Stop sitting on the fence.", es: 'Deja de quedarte neutral, decide.' },
  { en: 'He spilled the beans by accident.', es: 'Reveló el secreto sin querer.' },
  { en: 'Take that rumor with a grain of salt.', es: 'No te creas del todo ese rumor.' },
  { en: 'The early bird catches the worm.', es: 'Al que madruga, Dios lo ayuda.' },
  { en: 'Time flies when you are having fun.', es: 'El tiempo vuela cuando te diviertes.' },
  { en: 'You can say that again.', es: 'Tienes toda la razón.' },
] as const;

/**
 * A deterministic index into {@link DAILY_PHRASES} for `date` — the day of
 * the YEAR (in whichever timezone `date` already carries), modulo `length`.
 * Stable across every call made on the same calendar day, advances once a
 * day, and wraps the list (never a negative index, never past the end).
 *
 * `length` is a parameter (not read from `DAILY_PHRASES.length` directly)
 * so the prev/next cycling in `DeskPlayerWidget.tsx` can reuse the exact
 * same wrap-around math for `(index ± 1) mod length`.
 */
export function pickPhraseIndex(date: Date, length: number): number {
  if (length <= 0) return 0;
  const startOfYear = new Date(date.getFullYear(), 0, 0);
  const msPerDay = 24 * 60 * 60 * 1000;
  const dayOfYear = Math.floor((date.getTime() - startOfYear.getTime()) / msPerDay);
  return ((dayOfYear % length) + length) % length;
}
