// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { getSynth, useSpeechVoices } from './useSpeechVoices';
import type { VoiceLike } from './pickEnglishVoice';

function installSynth(voices: VoiceLike[] = []) {
  const listeners: Record<string, Array<() => void>> = {};
  const synth = {
    getVoices: vi.fn(() => voices),
    addEventListener: vi.fn((event: string, cb: () => void) => {
      (listeners[event] ??= []).push(cb);
    }),
    removeEventListener: vi.fn(),
  };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, writable: true, configurable: true });
  Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: function () {}, writable: true, configurable: true });
  return { synth, listeners };
}

function uninstallSynth() {
  Reflect.deleteProperty(window, 'speechSynthesis');
  Reflect.deleteProperty(window, 'SpeechSynthesisUtterance');
}

describe('getSynth', () => {
  afterEach(uninstallSynth);

  it('returns null when speechSynthesis is unsupported', () => {
    uninstallSynth();
    expect(getSynth()).toBeNull();
  });

  it('returns the synth when supported', () => {
    const { synth } = installSynth();
    expect(getSynth()).toBe(synth);
  });
});

describe('useSpeechVoices', () => {
  afterEach(uninstallSynth);

  it('is unsupported when the browser has no speechSynthesis API', () => {
    uninstallSynth();
    const { result } = renderHook(() => useSpeechVoices());
    expect(result.current.supported).toBe(false);
    expect(result.current.voices).toEqual([]);
  });

  it('loads the initial voice list on mount', () => {
    installSynth([{ name: 'US', lang: 'en-US' }]);
    const { result } = renderHook(() => useSpeechVoices());
    expect(result.current.supported).toBe(true);
    expect(result.current.voices).toEqual([{ name: 'US', lang: 'en-US' }]);
  });

  it('re-reads voices on the voiceschanged event (Chrome async voice load)', () => {
    const { synth, listeners } = installSynth([]);
    const { result } = renderHook(() => useSpeechVoices());
    expect(result.current.voices).toEqual([]);

    synth.getVoices.mockReturnValue([{ name: 'US', lang: 'en-US' }]);
    act(() => {
      for (const cb of listeners.voiceschanged ?? []) cb();
    });
    expect(result.current.voices).toEqual([{ name: 'US', lang: 'en-US' }]);
  });
});
