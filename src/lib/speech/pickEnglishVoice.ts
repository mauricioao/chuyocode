/**
 * `pickEnglishVoice` — picks the best `SpeechSynthesisVoice` for reading
 * English exercise content aloud (D4, "Escuchar/Listen").
 *
 * Pure and framework-free: takes whatever `speechSynthesis.getVoices()`
 * happened to return (which arrives ASYNCHRONOUSLY in Chrome — see
 * `useSpeech`'s own header) and picks one, or `null` if the device/browser
 * ships no English voice at all — the caller's honest signal to fall back to
 * the browser's own default language rather than force English speech.
 *
 * PREFERENCE ORDER:
 *  1. `preferredLang`, if given and an exact (case-insensitive) match exists
 *     — lets a caller pin a specific `BCP 47` tag (e.g. a remembered choice).
 *  2. en-US
 *  3. en-GB
 *  4. any other `en-*` voice.
 *
 * Within a tier, a voice the platform marks `default: true` wins, then one
 * marked `localService: true` (an offline voice — installed rather than
 * streamed, which in practice tends to be the more consistently "natural"
 * one available on that device), otherwise the first voice `getVoices()`
 * returned for that tier.
 */

/** The subset of `SpeechSynthesisVoice` this module actually reads — lets tests build plain objects instead of the real (constructor-less) browser type. */
export interface VoiceLike {
  name: string;
  lang: string;
  default?: boolean;
  localService?: boolean;
}

function isEnglish(voice: VoiceLike): boolean {
  return voice.lang.toLowerCase().startsWith('en');
}

function isLang(voice: VoiceLike, lang: string): boolean {
  return voice.lang.toLowerCase() === lang.toLowerCase();
}

/** Rank within a tier: default > local (offline) > neither. Higher wins. */
function score(voice: VoiceLike): number {
  return (voice.default ? 2 : 0) + (voice.localService ? 1 : 0);
}

/** The best-ranked voice in a (possibly empty) tier, or `null`. */
function bestOf<T extends VoiceLike>(voices: T[]): T | null {
  if (voices.length === 0) return null;
  return voices.reduce((best, candidate) => (score(candidate) > score(best) ? candidate : best));
}

export function pickEnglishVoice<T extends VoiceLike>(
  voices: readonly T[],
  preferredLang?: string,
): T | null {
  const english = voices.filter(isEnglish);
  if (english.length === 0) return null;

  if (preferredLang) {
    const exact = bestOf(english.filter((v) => isLang(v, preferredLang)));
    if (exact) return exact;
  }

  const us = bestOf(english.filter((v) => isLang(v, 'en-US')));
  if (us) return us;

  const gb = bestOf(english.filter((v) => isLang(v, 'en-GB')));
  if (gb) return gb;

  return bestOf(english);
}
