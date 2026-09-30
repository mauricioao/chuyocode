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
  // Resolved once per mount: whether the API exists cannot change over a
  // component's lifetime in any real browser.
  const [synth] = useState<SpeechSynthesis | null>(getSynth);
  const supported = synth !== null;

  const [voices, setVoices] = useState<VoiceLike[]>([]);

  useEffect(() => {
    if (!synth) return undefined;
    function loadVoices() {
      setVoices(synth!.getVoices());
    }
    loadVoices();
    synth.addEventListener('voiceschanged', loadVoices);
    return () => synth.removeEventListener('voiceschanged', loadVoices);
  }, [synth]);

  return { supported, voices };
}
