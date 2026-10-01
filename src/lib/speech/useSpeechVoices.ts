/**
 * `useSpeechVoices` — the shared "what English voices does this browser
 * have" hook. `useSpeech` (actual playback) and `VoiceSettingsButton` (the
 * voice picker) both mount it independently rather than one owning state the
 * other reads: `speechSynthesis.getVoices()` is a cheap, synchronous,
 * side-effect-free browser call, so there is nothing to coordinate.
 *
 * `supported` is `false` whenever `window`/`speechSynthesis`/
 * `SpeechSynthesisUtterance` do not exist — SSR (no `window` at all) and
 * every browser without the API. Callers render NOTHING in that case rather
 * than a broken control (see `SpeakButton`/`VoiceSettingsButton`'s own
 * headers).
 *
 * VOICES LOAD ASYNCHRONOUSLY IN CHROME: `getVoices()` can return `[]` on the
 * very first call, with the real list arriving later via the
 * `voiceschanged` event — this hook re-reads the list on that event so a
 * consumer mounted early still ends up with the full list once it exists.
 *
 * SSR CONTRACT (Bug 1, React error #418): `supported` is `false` on the
 * server AND on the very first CLIENT render (hydration) — resolving
 * `getSynth()` synchronously in a lazy `useState` initializer (the previous
 * shape) reads a real browser API on the client's first render, before
 * hydration's own markup comparison runs; on any browser that actually ships
 * Web Speech (virtually every desktop/mobile browser in real use), that
 * returned the real `SpeechSynthesis` object, flipping `supported` to `true`
 * on that very first client render while the server — which never has
 * `window` at all — always rendered the `false`/nothing branch. Every
 * `SpeakButton`/`VoiceSettingsButton` mounted anywhere (the practice page's
 * worksheet zones and quiz questions included) hit this on literally every
 * real visit, which is what produced the duplicated #418 in production.
 * Fixed the same way `useIsDesktop`/`usePrefersReducedMotion` already handle
 * every other browser-only read in this codebase: resolve it in an effect,
 * after the first (hydration-matching) commit, then update.
 */
import { useEffect, useState } from 'react';
import type { VoiceLike } from './pickEnglishVoice';

export interface UseSpeechVoicesResult {
  /** `false` when this browser/render target has no Web Speech API at all. */
  supported: boolean;
  /** Every voice the platform reports (not filtered to English — callers that only want English already run `pickEnglishVoice`/`rankEnglishVoices` on this). */
  voices: VoiceLike[];
}

/** Resolve the synthesis API once, `null` when the browser has none (or during SSR, where `window` itself is absent). */
export function getSynth(): SpeechSynthesis | null {
  if (typeof window === 'undefined') return null;
  if (!('speechSynthesis' in window) || typeof window.SpeechSynthesisUtterance !== 'function') return null;
  return window.speechSynthesis;
}

export function useSpeechVoices(): UseSpeechVoicesResult {
  // `null` on the server AND on the very first client render (hydration) —
  // see the file header's SSR CONTRACT. Resolved for real in the effect
  // below, once per mount (whether the API exists cannot change over a
  // component's lifetime in any real browser), the same tick voices first
  // load.
  const [synth, setSynth] = useState<SpeechSynthesis | null>(null);
  const supported = synth !== null;

  const [voices, setVoices] = useState<VoiceLike[]>([]);

  useEffect(() => {
    const resolved = getSynth();
    setSynth(resolved);
    if (!resolved) return undefined;
    function loadVoices() {
      setVoices(resolved!.getVoices());
    }
    loadVoices();
    resolved.addEventListener('voiceschanged', loadVoices);
    return () => resolved.removeEventListener('voiceschanged', loadVoices);
  }, []);

  return { supported, voices };
}
