/**
 * `useSpeech` — the one hook every `SpeakButton` (and anything else that
 * wants to read English aloud) mounts against the browser's
 * `speechSynthesis` API (D4, "Escuchar/Listen"). Free: no server, no paid
 * API, nothing authored — it only reads whatever voices the browser ships,
 * ranked by `pickEnglishVoice` and steered by the user's own remembered
 * choice (`voicePreferenceStore`, set from `VoiceSettingsButton`).
 *
 * `supported`/voice loading are delegated to `useSpeechVoices` (shared with
 * `VoiceSettingsButton`'s own voice list) — see that file's own header for
 * the Chrome async-voice-list note.
 *
 * `speak()` always cancels whatever utterance is currently playing FIRST —
 * on this hook's own utterance and on any OTHER `SpeakButton`'s, since
 * `speechSynthesis` is one browser-wide queue. That is what satisfies "stop
 * speaking when another SpeakButton starts" without this hook needing to
 * know any other hook instance exists.
 *
 * DELIVERY QUALITY:
 *  - Rate defaults to {@link NORMAL_RATE} (0.95, a touch under the browser's
 *    own "1" default — slightly easier to follow than full native speed)
 *    unless the caller passes its own `rate` (`SpeakButton`'s slow control
 *    passes `SLOW_RATE`, 0.7). `pitch` is always 1 — no caller-configurable
 *    pitch, per the owner's spec.
 *  - Long text is split into sentence-sized chunks (`splitSentences`) and
 *    queued as separate utterances, each one's `onend` starting the next —
 *    Chrome cuts off (or stalls) a single utterance around ~15 seconds of
 *    speech, so keeping each chunk short avoids that ceiling for ordinary
 *    exercise-length prose while still reading as one continuous pass.
 *  - Chrome DESKTOP additionally has a standing bug where speech synthesis
 *    can pause mid-utterance even WITHIN that ~15s window on longer single
 *    sentences; the standard workaround is a periodic `pause()`/`resume()`
 *    "kick" while speech is in flight, which nudges the engine without any
 *    audible artifact. `isChromeDesktop()` gates this so no other
 *    browser/platform pays for a timer it does not need.
 *
 * Stops on unmount and on an Astro page swap (`astro:before-swap`, fired
 * before View Transitions replaces the DOM) — a learner navigating away
 * must never leave a stray utterance talking over the next page.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { pickEnglishVoice, type VoiceLike } from './pickEnglishVoice';
import { toSpeakableText } from './toSpeakableText';
import { splitSentences } from './splitSentences';
import { isChromeDesktop } from './isChromeDesktop';
import { useSpeechVoices, getSynth } from './useSpeechVoices';
import { useVoicePreference } from './voicePreferenceStore';

/** Default rate for the "normal" speak control — `speechSynthesis` scale (`1` = native default). */
export const NORMAL_RATE = 0.95;

/** How often (ms) `speak()` nudges Chrome desktop with `pause()`/`resume()` while speech is in flight — comfortably under the ~15s stall window. */
export const KEEP_ALIVE_INTERVAL_MS = 10_000;

export interface SpeakOptions {
  /** Playback rate, `speechSynthesis` scale. Defaults to {@link NORMAL_RATE}. */
  rate?: number;
}

export interface UseSpeechResult {
  /** `false` when this browser/render target has no Web Speech API at all. */
  supported: boolean;
  /** `true` while THIS hook's own utterance (or queued sentence) is playing. */
  speaking: boolean;
  /** Speak `text` (converted through `toSpeakableText`, then queued sentence by sentence). A no-op when unsupported or nothing is left to speak. */
  speak: (text: string, options?: SpeakOptions) => void;
  /** Cancel this hook's own in-flight utterance(s), if any. */
  stop: () => void;
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
  const { supported, voices } = useSpeechVoices();
  const [preference] = useVoicePreference();

  // The real SpeechSynthesis object this hook actually speaks/cancels
  // through — resolved once per mount, same as `useSpeechVoices`'s own.
  const [synth] = useState<SpeechSynthesis | null>(getSynth);

  const [speaking, setSpeaking] = useState(false);
  // The utterance THIS hook most recently started, so `stop()`/unmount only
  // reports on (and `speaking` only tracks) this hook's own speech.
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  // Bumped on every speak()/stop()/unmount so a stale queued-sentence
  // `onend` (from an utterance that was since cancelled/superseded) can
  // recognize it is stale and do nothing, instead of speaking a leftover
  // sentence into a NEW utterance session or flipping `speaking` back on
  // after this hook already reported it stopped.
  const sessionRef = useRef(0);
  const keepAliveRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopKeepAlive = useCallback(() => {
    if (keepAliveRef.current !== null) {
      clearInterval(keepAliveRef.current);
      keepAliveRef.current = null;
    }
  }, []);

  const startKeepAlive = useCallback(
    (targetSynth: SpeechSynthesis) => {
      stopKeepAlive();
      if (!isChromeDesktop()) return;
      keepAliveRef.current = setInterval(() => {
        // Only while genuinely speaking — pausing/resuming an idle synth is
        // harmless but pointless, and speaking() reflects Chrome's own
        // notion of "an utterance is queued or playing".
        if (targetSynth.speaking) {
          targetSynth.pause();
          targetSynth.resume();
        }
      }, KEEP_ALIVE_INTERVAL_MS);
    },
    [stopKeepAlive],
  );

  const stop = useCallback(() => {
    sessionRef.current += 1;
    stopKeepAlive();
    if (!synth) return;
    synth.cancel();
    setSpeaking(false);
  }, [synth, stopKeepAlive]);

  // Unmount: never leave this hook's utterance(s) talking past its component.
  useEffect(() => {
    return () => {
      sessionRef.current += 1;
      stopKeepAlive();
      if (utteranceRef.current) synth?.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount-only cleanup
  }, [synth]);

  // Page navigation: Astro fires this before View Transitions swaps the DOM.
  useEffect(() => {
    if (!synth) return undefined;
    function onBeforeSwap() {
      sessionRef.current += 1;
      stopKeepAlive();
      synth!.cancel();
    }
    document.addEventListener('astro:before-swap', onBeforeSwap);
    return () => document.removeEventListener('astro:before-swap', onBeforeSwap);
  }, [synth, stopKeepAlive]);

  const speak = useCallback(
    (text: string, options?: SpeakOptions) => {
      if (!synth) return;
      const speakable = toSpeakableText(text);
      if (!speakable) return;

      // One browser-wide queue: cancelling here stops THIS hook's own
      // in-flight utterance AND any other `SpeakButton`'s, satisfying "a new
      // one cancels any current utterance" for both cases with one call.
      synth.cancel();

      const session = ++sessionRef.current;
      const sentences = splitSentences(speakable);
      const rate = options?.rate ?? NORMAL_RATE;
      const voice = pickEnglishVoice(voices, undefined, {
        accent: preference.accent,
        voiceURI: preference.voiceURI ?? undefined,
      });

      setSpeaking(true);
      startKeepAlive(synth);

      let index = 0;
      const speakNext = () => {
        // A stale callback from a superseded session (stop()/a new speak()
        // already ran): drop it silently rather than resurrecting playback.
        if (sessionRef.current !== session) return;

        if (index >= sentences.length) {
          setSpeaking(false);
          stopKeepAlive();
          return;
        }

        const utterance = new window.SpeechSynthesisUtterance(sentences[index]);
        index += 1;

        if (voice) {
          // `pickEnglishVoice` only reads the shared `VoiceLike` shape, so the
          // real `SpeechSynthesisVoice` it was called with is cast back here.
          utterance.voice = voice as unknown as SpeechSynthesisVoice;
          utterance.lang = (voice as VoiceLike).lang;
        } else {
          // No English voice on this device at all: still ask for English
          // rather than silently falling back to the OS/browser default
          // language, which could read the sentence in the wrong language.
          utterance.lang = 'en-US';
        }
        utterance.rate = rate;
        utterance.pitch = 1;

        utterance.onend = () => {
          if (sessionRef.current === session) speakNext();
        };
        utterance.onerror = () => {
          if (sessionRef.current === session) {
            setSpeaking(false);
            stopKeepAlive();
          }
        };

        utteranceRef.current = utterance;
        synth.speak(utterance);
      };

      speakNext();
    },
    [synth, voices, preference, startKeepAlive, stopKeepAlive],
  );

  return { supported, speaking, speak, stop };
}
