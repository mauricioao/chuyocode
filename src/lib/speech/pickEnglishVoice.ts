/**
 * `pickEnglishVoice` — picks the best `SpeechSynthesisVoice` for reading
 * English exercise content aloud (D4, "Escuchar/Listen").
 *
 * Pure and framework-free: takes whatever `speechSynthesis.getVoices()`
 * happened to return (which arrives ASYNCHRONOUSLY in Chrome — see
 * `useSpeechVoices`'s own header) and picks one, or `null` if the
 * device/browser ships no English voice at all — the caller's honest signal
 * to fall back to the browser's own default language rather than force
 * English speech.
 *
 * QUALITY SCORING, highest signal first (see `qualityTier`):
 *  1. Known neural/natural voices by name — Edge's "... Online (Natural)"
 *     voices (Aria, Jenny, Guy, Ava, Andrew, Emma, Brian, Sonia, Ryan, …) and
 *     Apple's "(Enhanced)"/"(Premium)" variants.
 *  2. Other named voices known to sound good without a quality suffix
 *     (Apple's Samantha, Ava, Allison, Susan, Daniel, Serena, Karen, Moira,
 *     Tessa; Google's "Google US/UK English …").
 *  3. Known low-quality/novelty voices (old desktop SAPI voices, Apple's
 *     novelty pack) are actively AVOIDED — scored below even a plain,
 *     unnamed local voice — unless nothing else is available.
 *  4. A network voice (`localService === false`) over an unnamed local one:
 *     in practice the natural-sounding voices above are also the ones a
 *     browser streams rather than ships offline, so this is the right
 *     default for whatever wasn't already sorted into 1–3 above.
 *
 * `preferredLang` (unchanged from before) restricts the CANDIDATE POOL to an
 * exact `lang` match before quality-scoring it — still useful for pinning a
 * specific BCP 47 tag. `options.voiceURI`, when given and present among the
 * English voices, is honoured directly over every other signal: it is an
 * explicit, remembered user choice (the settings popover), not a guess.
 * `options.accent` ('US' | 'GB', default 'US') is applied last, as a pure
 * tie-breaker between voices the quality score alone cannot separate —
 * never strong enough to make a lower-quality matching-accent voice beat a
 * higher-quality voice in the other accent.
 */

/** The subset of `SpeechSynthesisVoice` this module actually reads — lets tests build plain objects instead of the real (constructor-less) browser type. */
export interface VoiceLike {
  name: string;
  lang: string;
  default?: boolean;
  localService?: boolean;
  voiceURI?: string;
}

export interface PickEnglishVoiceOptions {
  /** Tie-breaker only, applied after quality scoring. Defaults to `'US'`. */
  accent?: 'US' | 'GB';
  /** An exact `voiceURI` to use when present among the English voices — a remembered user choice, honoured over every other signal. */
  voiceURI?: string;
}

function isEnglish(voice: VoiceLike): boolean {
  return voice.lang.toLowerCase().startsWith('en');
}

function isLang(voice: VoiceLike, lang: string): boolean {
  return voice.lang.toLowerCase() === lang.toLowerCase();
}

/** Edge's neural voices ship with this literal suffix, e.g. "Microsoft Aria Online (Natural)". */
const EDGE_NATURAL_RE = /Online \(Natural\)/i;

/** Apple's higher-quality variants append one of these, e.g. "Samantha (Enhanced)", "Ava (Premium)". */
const APPLE_QUALITY_SUFFIX_RE = /\((Enhanced|Premium)\)/i;

/** Named voices known to sound good even without an explicit quality suffix (Edge/Apple first names, Google's own web voices). */
const KNOWN_GOOD_NAME_RE =
  /\b(Samantha|Ava|Allison|Susan|Daniel|Serena|Karen|Moira|Tessa|Aria|Jenny|Guy|Andrew|Emma|Brian|Sonia|Ryan)\b/i;
const GOOGLE_VOICE_RE = /^Google (US|UK) English/i;

/** Known low-quality/novelty voices, actively avoided unless nothing else is available. */
const AVOID_NAME_RE =
  /\b(David|Zira|Mark|Bad News|Bells|Bubbles|Cellos|Good News|Jester|Organ|Superstar|Trinoids|Whisper|Zarvox|Albert|Bahh|Boing|Wobble|Junior|Ralph|Fred)\b/i;

/** Quality tier, highest first — see the file header for the ordered signal list. Dominates every other factor in {@link score}. */
function qualityTier(voice: VoiceLike): number {
  if (EDGE_NATURAL_RE.test(voice.name) || APPLE_QUALITY_SUFFIX_RE.test(voice.name)) return 4;
  if (KNOWN_GOOD_NAME_RE.test(voice.name) || GOOGLE_VOICE_RE.test(voice.name)) return 3;
  if (AVOID_NAME_RE.test(voice.name)) return 0;
  if (voice.localService === false) return 2;
  return 1;
}

/** Small tie-break bonus toward the preferred accent — never large enough to outweigh a `qualityTier` difference. */
function accentBonus(voice: VoiceLike, accent: 'US' | 'GB'): number {
  const lang = voice.lang.toLowerCase();
  const preferred = accent === 'US' ? 'en-us' : 'en-gb';
  const secondary = accent === 'US' ? 'en-gb' : 'en-us';
  if (lang === preferred) return 2;
  if (lang === secondary) return 1;
  return 0;
}

/** Overall rank: quality tier first (weighted well above the tie-breakers), then accent, then the platform `default` flag. */
function score(voice: VoiceLike, accent: 'US' | 'GB'): number {
  return qualityTier(voice) * 10 + accentBonus(voice, accent) * 2 + (voice.default ? 1 : 0);
}

/** The best-ranked voice in a (possibly empty) list, or `null`. Stable: the first max-scoring voice wins ties. */
function bestOf<T extends VoiceLike>(voices: T[], accent: 'US' | 'GB'): T | null {
  if (voices.length === 0) return null;
  return voices.reduce((best, candidate) => (score(candidate, accent) > score(best, accent) ? candidate : best));
}

export function pickEnglishVoice<T extends VoiceLike>(
  voices: readonly T[],
  preferredLang?: string,
  options?: PickEnglishVoiceOptions,
): T | null {
  const english = voices.filter(isEnglish);
  if (english.length === 0) return null;

  if (options?.voiceURI) {
    const exact = english.find((v) => v.voiceURI === options.voiceURI);
    if (exact) return exact;
  }

  const accent = options?.accent ?? 'US';

  if (preferredLang) {
    const matches = english.filter((v) => isLang(v, preferredLang));
    if (matches.length > 0) return bestOf(matches, accent);
  }

  return bestOf(english, accent);
}

/**
 * Every English voice, best-scored first (same scoring `pickEnglishVoice`
 * itself uses) — for the settings popover's voice list, where the top entry
 * is marked "Recomendada"/"Recommended".
 */
export function rankEnglishVoices<T extends VoiceLike>(
  voices: readonly T[],
  options?: Pick<PickEnglishVoiceOptions, 'accent'>,
): T[] {
  const accent = options?.accent ?? 'US';
  return voices.filter(isEnglish).sort((a, b) => score(b, accent) - score(a, accent));
}
