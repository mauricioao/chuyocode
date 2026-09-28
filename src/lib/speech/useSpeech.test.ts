// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { stopAllSpeech, useSpeech } from './useSpeech';
import type { VoiceLike } from './pickEnglishVoice';

/** A minimal stand-in for `SpeechSynthesisUtterance` — jsdom ships neither it nor `speechSynthesis`. */
class FakeUtterance {
  text: string;
  lang = '';
  rate = 1;
  voice: unknown = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}

function installSynth(voices: VoiceLike[] = []) {
  const listeners: Record<string, Array<() => void>> = {};
  const synth = {
    getVoices: vi.fn(() => voices),
    speak: vi.fn(),
    cancel: vi.fn(),
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

describe('useSpeech', () => {
  afterEach(() => {
    uninstallSynth();
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

  it('applies the given rate, defaulting to 1', () => {
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
