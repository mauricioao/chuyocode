// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { NORMAL_RATE, stopAllSpeech, useSpeech, KEEP_ALIVE_INTERVAL_MS } from './useSpeech';
import type { VoiceLike } from './pickEnglishVoice';

/** A minimal stand-in for `SpeechSynthesisUtterance` — jsdom ships neither it nor `speechSynthesis`. */
class FakeUtterance {
  text: string;
  lang = '';
  rate = 1;
  pitch = 1;
  voice: unknown = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}

function installSynth(voices: VoiceLike[] = [], opts: { speaking?: boolean } = {}) {
  const listeners: Record<string, Array<() => void>> = {};
  const synth = {
    getVoices: vi.fn(() => voices),
    speak: vi.fn(),
    cancel: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    speaking: opts.speaking ?? true,
    addEventListener: vi.fn((event: string, cb: () => void) => {
      (listeners[event] ??= []).push(cb);
    }),
    removeEventListener: vi.fn(),
  };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, writable: true, configurable: true });
  Object.defineProperty(window, 'SpeechSynthesisUtterance', {
    value: FakeUtterance,
    writable: true,
    configurable: true,
  });
  return { synth, listeners };
}

function uninstallSynth() {
  Reflect.deleteProperty(window, 'speechSynthesis');
  Reflect.deleteProperty(window, 'SpeechSynthesisUtterance');
}

const CHROME_DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const SAFARI_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';

describe('useSpeech', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    uninstallSynth();
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('is unsupported when the browser has no speechSynthesis API', () => {
    uninstallSynth();
    const { result } = renderHook(() => useSpeech());
    expect(result.current.supported).toBe(false);
    expect(result.current.speaking).toBe(false);
  });

  it('is supported when the API is present', () => {
    installSynth();
    const { result } = renderHook(() => useSpeech());
    expect(result.current.supported).toBe(true);
  });

  it('speak() calls speechSynthesis.speak with an utterance and marks speaking true', () => {
    const { synth } = installSynth([{ name: 'US', lang: 'en-US' }]);
    const { result } = renderHook(() => useSpeech());

    act(() => result.current.speak('Hello world'));

    expect(synth.speak).toHaveBeenCalledTimes(1);
    const utterance = synth.speak.mock.calls[0][0] as FakeUtterance;
    expect(utterance.text).toBe('Hello world');
    expect(result.current.speaking).toBe(true);
  });

  it('speak() is a no-op when unsupported', () => {
    uninstallSynth();
    const { result } = renderHook(() => useSpeech());
    act(() => result.current.speak('Hello'));
    expect(result.current.speaking).toBe(false);
  });

  it('speak() is a no-op for text with nothing speakable', () => {
    const { synth } = installSynth();
    const { result } = renderHook(() => useSpeech());
    act(() => result.current.speak('   '));
    expect(synth.speak).not.toHaveBeenCalled();
  });

  it('speak() cancels any current utterance before starting a new one', () => {
    const { synth } = installSynth();
    const { result } = renderHook(() => useSpeech());

    act(() => result.current.speak('First'));
    expect(synth.cancel).toHaveBeenCalledTimes(1); // called once even for the first speak

    act(() => result.current.speak('Second'));
    expect(synth.cancel).toHaveBeenCalledTimes(2);
    expect(synth.speak).toHaveBeenCalledTimes(2);
  });

  it('defaults to NORMAL_RATE (0.95) and pitch 1', () => {
    const { synth } = installSynth();
    const { result } = renderHook(() => useSpeech());

    act(() => result.current.speak('Hello'));
    const utterance = synth.speak.mock.calls[0][0] as FakeUtterance;
    expect(utterance.rate).toBe(NORMAL_RATE);
    expect(utterance.pitch).toBe(1);
  });

  it('applies a given rate, overriding the default', () => {
    const { synth } = installSynth();
    const { result } = renderHook(() => useSpeech());

    act(() => result.current.speak('Slow', { rate: 0.7 }));
    const utterance = synth.speak.mock.calls[0][0] as FakeUtterance;
    expect(utterance.rate).toBe(0.7);
  });

  it('flips speaking back to false once the utterance ends', () => {
    const { synth } = installSynth();
    const { result } = renderHook(() => useSpeech());

    act(() => result.current.speak('Hello'));
    expect(result.current.speaking).toBe(true);

    const utterance = synth.speak.mock.calls[0][0] as FakeUtterance;
    act(() => utterance.onend?.());
    expect(result.current.speaking).toBe(false);
  });

  it('stop() cancels the current utterance and marks speaking false', () => {
    const { synth } = installSynth();
    const { result } = renderHook(() => useSpeech());

    act(() => result.current.speak('Hello'));
    act(() => result.current.stop());

    expect(synth.cancel).toHaveBeenCalled();
    expect(result.current.speaking).toBe(false);
  });

  it('re-reads voices on the voiceschanged event (Chrome async voice load)', () => {
    const { synth, listeners } = installSynth([]);
    renderHook(() => useSpeech());

    const callsBeforeEvent = synth.getVoices.mock.calls.length;
    act(() => {
      for (const cb of listeners.voiceschanged ?? []) cb();
    });
    expect(synth.getVoices.mock.calls.length).toBeGreaterThan(callsBeforeEvent);
  });

  it('cancels speech on unmount', () => {
    const { synth } = installSynth();
    const { result, unmount } = renderHook(() => useSpeech());

    act(() => result.current.speak('Hello'));
    synth.cancel.mockClear();
    unmount();

    expect(synth.cancel).toHaveBeenCalled();
  });

  it('cancels speech on astro:before-swap (page navigation)', () => {
    const { synth } = installSynth();
    const { result } = renderHook(() => useSpeech());

    act(() => result.current.speak('Hello'));
    synth.cancel.mockClear();
    act(() => {
      document.dispatchEvent(new Event('astro:before-swap'));
    });

    expect(synth.cancel).toHaveBeenCalled();
  });

  describe('sentence queueing', () => {
    it('queues one utterance per sentence, speaking only the first immediately', () => {
      const { synth } = installSynth();
      const { result } = renderHook(() => useSpeech());

      act(() => result.current.speak('First sentence. Second sentence.'));

      expect(synth.speak).toHaveBeenCalledTimes(1);
      const first = synth.speak.mock.calls[0][0] as FakeUtterance;
      expect(first.text).toBe('First sentence.');
    });

    it('speaks the next sentence once the previous one ends, staying "speaking" throughout', () => {
      const { synth } = installSynth();
      const { result } = renderHook(() => useSpeech());

      act(() => result.current.speak('First sentence. Second sentence.'));
      const first = synth.speak.mock.calls[0][0] as FakeUtterance;

      act(() => first.onend?.());
      expect(result.current.speaking).toBe(true); // still mid-queue
      expect(synth.speak).toHaveBeenCalledTimes(2);
      const second = synth.speak.mock.calls[1][0] as FakeUtterance;
      expect(second.text).toBe('Second sentence.');

      act(() => second.onend?.());
      expect(result.current.speaking).toBe(false); // queue exhausted
    });

    it('stop() mid-queue prevents the remaining sentences from ever being spoken', () => {
      const { synth } = installSynth();
      const { result } = renderHook(() => useSpeech());

      act(() => result.current.speak('First sentence. Second sentence.'));
      const first = synth.speak.mock.calls[0][0] as FakeUtterance;

      act(() => result.current.stop());
      // A stale onend firing after stop() (the real engine can still fire it) must not resurrect the queue.
      act(() => first.onend?.());

      expect(synth.speak).toHaveBeenCalledTimes(1); // the second sentence never went out
      expect(result.current.speaking).toBe(false);
    });

    it('a new speak() mid-queue supersedes the old one instead of interleaving', () => {
      const { synth } = installSynth();
      const { result } = renderHook(() => useSpeech());

      act(() => result.current.speak('First sentence. Second sentence.'));
      const first = synth.speak.mock.calls[0][0] as FakeUtterance;

      act(() => result.current.speak('Replacement.'));
      // The stale onend from the superseded utterance must not queue "Second sentence." after the replacement.
      act(() => first.onend?.());

      const texts = synth.speak.mock.calls.map((call) => (call[0] as FakeUtterance).text);
      expect(texts).toEqual(['First sentence.', 'Replacement.']);
    });
  });

  describe('Chrome desktop keep-alive', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('nudges pause()/resume() on an interval while speaking on Chrome desktop', () => {
      vi.stubGlobal('navigator', { userAgent: CHROME_DESKTOP_UA });
      const { synth } = installSynth([], { speaking: true });
      const { result } = renderHook(() => useSpeech());

      act(() => result.current.speak('Hello'));
      expect(synth.pause).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(KEEP_ALIVE_INTERVAL_MS);
      });
      expect(synth.pause).toHaveBeenCalledTimes(1);
      expect(synth.resume).toHaveBeenCalledTimes(1);

      act(() => {
        vi.advanceTimersByTime(KEEP_ALIVE_INTERVAL_MS);
      });
      expect(synth.pause).toHaveBeenCalledTimes(2);
    });

    it('stops nudging once speech ends', () => {
      vi.stubGlobal('navigator', { userAgent: CHROME_DESKTOP_UA });
      const { synth } = installSynth([], { speaking: true });
      const { result } = renderHook(() => useSpeech());

      act(() => result.current.speak('Hello'));
      const utterance = synth.speak.mock.calls[0][0] as FakeUtterance;
      act(() => utterance.onend?.());

      act(() => {
        vi.advanceTimersByTime(KEEP_ALIVE_INTERVAL_MS * 3);
      });
      expect(synth.pause).not.toHaveBeenCalled();
    });

    it('never nudges on a non-Chrome-desktop browser', () => {
      vi.stubGlobal('navigator', { userAgent: SAFARI_UA });
      const { synth } = installSynth([], { speaking: true });
      const { result } = renderHook(() => useSpeech());

      act(() => result.current.speak('Hello'));
      act(() => {
        vi.advanceTimersByTime(KEEP_ALIVE_INTERVAL_MS * 3);
      });
      expect(synth.pause).not.toHaveBeenCalled();
    });
  });

  describe('voice preference', () => {
    it('picks a voice honouring the stored accent preference', () => {
      window.localStorage.setItem(
        'chuyocode:speech-voice-preference',
        JSON.stringify({ accent: 'GB', voiceURI: null }),
      );
      const gb: VoiceLike = { name: 'Plain', lang: 'en-GB', voiceURI: 'gb-1' };
      const us: VoiceLike = { name: 'Plain', lang: 'en-US', voiceURI: 'us-1' };
      const { synth } = installSynth([us, gb]);
      const { result } = renderHook(() => useSpeech());

      act(() => result.current.speak('Hello'));
      const utterance = synth.speak.mock.calls[0][0] as FakeUtterance;
      expect((utterance.voice as VoiceLike).voiceURI).toBe('gb-1');
    });

    it('honours an explicit remembered voiceURI over accent/quality scoring', () => {
      window.localStorage.setItem(
        'chuyocode:speech-voice-preference',
        JSON.stringify({ accent: 'US', voiceURI: 'chosen' }),
      );
      const natural: VoiceLike = { name: 'Microsoft Aria Online (Natural)', lang: 'en-US', voiceURI: 'natural' };
      const chosen: VoiceLike = { name: 'Chosen Voice', lang: 'en-GB', voiceURI: 'chosen' };
      const { synth } = installSynth([natural, chosen]);
      const { result } = renderHook(() => useSpeech());

      act(() => result.current.speak('Hello'));
      const utterance = synth.speak.mock.calls[0][0] as FakeUtterance;
      expect((utterance.voice as VoiceLike).voiceURI).toBe('chosen');
    });
  });
});

describe('stopAllSpeech', () => {
  afterEach(() => {
    uninstallSynth();
  });

  it('cancels speech via the global synth', () => {
    const { synth } = installSynth();
    stopAllSpeech();
    expect(synth.cancel).toHaveBeenCalled();
  });

  it('is a no-op when unsupported', () => {
    uninstallSynth();
    expect(() => stopAllSpeech()).not.toThrow();
  });

  it("flips a hook's own speaking state back to false (one shared queue)", () => {
    const { synth } = installSynth();
    const { result } = renderHook(() => useSpeech());

    act(() => result.current.speak('Hello'));
    expect(result.current.speaking).toBe(true);

    const utterance = synth.speak.mock.calls[0][0] as FakeUtterance;
    act(() => {
      stopAllSpeech();
      // jsdom has no real speechSynthesis engine to fire this automatically —
      // simulate the browser's own "cancel -> error" contract for the
      // utterance that was in flight.
      utterance.onerror?.();
    });
    expect(result.current.speaking).toBe(false);
  });
});
