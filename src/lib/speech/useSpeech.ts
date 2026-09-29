/**
 * `useSpeech` — the one hook every `SpeakButton` (and anything else that
 * wants to read English aloud) mounts against the browser's
 * `speechSynthesis` API (D4, "Escuchar/Listen"). Free: no server, no paid
 * API, nothing authored — it only reads whatever voices the browser ships.
 *
 * `supported` is `false` whenever `window`/`speechSynthesis`/
 * `SpeechSynthesisUtterance` do not exist — SSR (no `window` at all) and
 * every browser without the API. Callers render NOTHING rather than a
 * broken button in that case (see `SpeakButton`'s own header).
 *
 * VOICES LOAD ASYNCHRONOUSLY IN CHROME: `getVoices()` can return `[]` on the
 * very first call, with the real list arriving later via the
 * `voiceschanged` event — this hook re-reads the list on that event so a
 * `speak()` call made after the page has settled still finds a voice.
 *
 * `speak()` always cancels whatever utterance is currently playing FIRST —
 * on this hook's own utterance and on any OTHER `SpeakButton`'s, since
 * `speechSynthesis` is one browser-wide queue. That is what satisfies "stop
 * speaking when another SpeakButton starts" without this hook needing to
 * know any other hook instance exists.
 *
 * Stops on unmount and on an Astro page swap (`astro:before-swap`, fired
 * before View Transitions replaces the DOM) — a learner navigating away
 * must never leave a stray utterance talking over the next page.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { pickEnglishVoice, type VoiceLike } from './pickEnglishVoice';
import { toSpeakableText } from './toSpeakableText';

export interface SpeakOptions {
  /** Playback rate, `speechSynthesis` scale (`1` = normal). Defaults to `1`. */
  rate?: number;
}

export interface UseSpeechResult {
  /** `false` when this browser/render target has no Web Speech API at all. */
  supported: boolean;
  /** `true` while THIS hook's own utterance is playing. */
  speaking: boolean;
  /** Speak `text` (converted through `toSpeakableText`). A no-op when unsupported or nothing is left to speak. */
  speak: (text: string, options?: SpeakOptions) => void;
  /** Cancel this hook's own in-flight utterance, if any. */
  stop: () => void;
}

/** Resolve the synthesis API once, `null` when the browser has none (or during SSR, where `window` itself is absent). */
function getSynth(): SpeechSynthesis | null {
  if (typeof window === 'undefined') return null;
  if (!('speechSynthesis' in window) || typeof window.SpeechSynthesisUtterance !== 'function') return null;
  return window.speechSynthesis;
}

/**
 * Stop any speech currently in flight, without needing a `useSpeech()` hook
 * instance of your own.
 *
 * For a caller that must silence speech coming from SOME OTHER component's
 * `SpeakButton` — "Comprobar"/"Reintentar" stopping whichever question was
 * being read aloud (D4's own rule) — rather than owning playback itself.
 * `speechSynthesis` is one browser-wide queue, so cancelling it here reaches
 * every `useSpeech()` instance's own utterance the same way one
 * `SpeakButton` starting speech already stops another's (see `speak()`'s own
 * header): the cancelled utterance fires its `onerror`, which is what flips
 * that OTHER hook's `speaking` back to `false`.
 *
 * A no-op wherever the API does not exist (SSR, an unsupported browser).
 */
export function stopAllSpeech(): void {
  getSynth()?.cancel();
}

export function useSpeech(): UseSpeechResult {
  // Resolved once per mount: whether the API exists cannot change over a
  // component's lifetime in any real browser, and computing it lazily here
  // (rather than a render-time `typeof window` check) still keeps SSR safe —
  // `getSynth()` itself already guards `typeof window`.
  const [synth] = useState<SpeechSynthesis | null>(getSynth);
  const supported = synth !== null;

  // Populated by the mount effect below (and kept fresh via `voiceschanged`)
  // rather than read here: an initial empty array is fine either way since
  // `speak()` degrades to the `en-US` lang fallback with no voice picked,
  // and starting empty avoids one redundant `getVoices()` call on mount.
  const [voices, setVoices] = useState<VoiceLike[]>([]);
  const [speaking, setSpeaking] = useState(false);
  // The utterance THIS hook started, so `stop()`/unmount only reports on
  // (and `speaking` only tracks) this hook's own speech — a cancellation
  // triggered by some OTHER SpeakButton still fires this utterance's own
  // `onend`/`onerror`, which is what flips `speaking` back to false here too.
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    if (!synth) return undefined;
    function loadVoices() {
      setVoices(synth!.getVoices());
    }
    loadVoices();
    synth.addEventListener('voiceschanged', loadVoices);
    return () => synth.removeEventListener('voiceschanged', loadVoices);
  }, [synth]);

  const stop = useCallback(() => {
    if (!synth) return;
    synth.cancel();
    setSpeaking(false);
  }, [synth]);

  // Unmount: never leave this hook's utterance talking past its component.
  useEffect(() => {
    return () => {
      if (utteranceRef.current) synth?.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount-only cleanup
  }, [synth]);

  // Page navigation: Astro fires this before View Transitions swaps the DOM.
  useEffect(() => {
    if (!synth) return undefined;
    function onBeforeSwap() {
      synth!.cancel();
    }
    document.addEventListener('astro:before-swap', onBeforeSwap);
    return () => document.removeEventListener('astro:before-swap', onBeforeSwap);
  }, [synth]);

  const speak = useCallback(
    (text: string, options?: SpeakOptions) => {
      if (!synth) return;
      const speakable = toSpeakableText(text);
      if (!speakable) return;

      // One browser-wide queue: cancelling here stops THIS hook's own
      // in-flight utterance AND any other `SpeakButton`'s, satisfying "a new
      // one cancels any current utterance" for both cases with one call.
      synth.cancel();

      const utterance = new window.SpeechSynthesisUtterance(speakable);
      const voice = pickEnglishVoice(voices);
      if (voice) {
        // `pickEnglishVoice` only reads the shared `VoiceLike` shape, so the
        // real `SpeechSynthesisVoice` it was called with is cast back here.
        utterance.voice = voice as unknown as SpeechSynthesisVoice;
        utterance.lang = voice.lang;
      } else {
        // No English voice on this device at all: still ask for English
        // rather than silently falling back to the OS/browser default
        // language, which could read the sentence in the wrong language.
        utterance.lang = 'en-US';
      }
      utterance.rate = options?.rate ?? 1;

      utterance.onend = () => {
        if (utteranceRef.current === utterance) setSpeaking(false);
      };
      utterance.onerror = () => {
        if (utteranceRef.current === utterance) setSpeaking(false);
      };

      utteranceRef.current = utterance;
      setSpeaking(true);
      synth.speak(utterance);
    },
    [synth, voices],
  );

  return { supported, speaking, speak, stop };
}
