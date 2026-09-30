// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  DEFAULT_VOICE_PREFERENCE,
  getVoicePreference,
  parseVoicePreference,
  setVoicePreference,
  subscribeVoicePreference,
  useVoicePreference,
} from './voicePreferenceStore';

const STORAGE_KEY = 'chuyocode:speech-voice-preference';

describe('parseVoicePreference', () => {
  it('returns the default for null/missing input', () => {
    expect(parseVoicePreference(null)).toEqual(DEFAULT_VOICE_PREFERENCE);
  });

  it('returns the default for malformed JSON', () => {
    expect(parseVoicePreference('{not json')).toEqual(DEFAULT_VOICE_PREFERENCE);
  });

  it('returns the default for a non-object value', () => {
    expect(parseVoicePreference('42')).toEqual(DEFAULT_VOICE_PREFERENCE);
    expect(parseVoicePreference('"oops"')).toEqual(DEFAULT_VOICE_PREFERENCE);
  });

  it('falls back to the default accent when the stored accent is invalid', () => {
    expect(parseVoicePreference(JSON.stringify({ accent: 'FR', voiceURI: 'x' }))).toEqual({
      accent: 'US',
      voiceURI: 'x',
    });
  });

  it('normalizes an empty/missing voiceURI to null', () => {
    expect(parseVoicePreference(JSON.stringify({ accent: 'GB', voiceURI: '' }))).toEqual({
      accent: 'GB',
      voiceURI: null,
    });
    expect(parseVoicePreference(JSON.stringify({ accent: 'GB' }))).toEqual({ accent: 'GB', voiceURI: null });
  });

  it('parses a valid preference verbatim', () => {
    expect(parseVoicePreference(JSON.stringify({ accent: 'GB', voiceURI: 'v1' }))).toEqual({
      accent: 'GB',
      voiceURI: 'v1',
    });
  });
});

describe('getVoicePreference / setVoicePreference', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => window.localStorage.clear());

  it('returns the default when nothing is stored', () => {
    expect(getVoicePreference()).toEqual(DEFAULT_VOICE_PREFERENCE);
  });

  it('persists and reads back a preference', () => {
    setVoicePreference({ accent: 'GB', voiceURI: 'v1' });
    expect(getVoicePreference()).toEqual({ accent: 'GB', voiceURI: 'v1' });
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify({ accent: 'GB', voiceURI: 'v1' }));
  });

  it('never throws when localStorage.getItem throws', () => {
    const spy = vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => getVoicePreference()).not.toThrow();
    expect(getVoicePreference()).toEqual(DEFAULT_VOICE_PREFERENCE);
    spy.mockRestore();
  });

  it('never throws when localStorage.setItem throws', () => {
    const spy = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    expect(() => setVoicePreference({ accent: 'US', voiceURI: null })).not.toThrow();
    spy.mockRestore();
  });
});

describe('subscribeVoicePreference', () => {
  afterEach(() => window.localStorage.clear());

  it('notifies on the in-page change event dispatched by setVoicePreference', () => {
    const onChange = vi.fn();
    const unsubscribe = subscribeVoicePreference(onChange);
    setVoicePreference({ accent: 'GB', voiceURI: null });
    expect(onChange).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('notifies on a cross-tab storage event for the same key', () => {
    const onChange = vi.fn();
    const unsubscribe = subscribeVoicePreference(onChange);
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }));
    expect(onChange).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('ignores a storage event for an unrelated key', () => {
    const onChange = vi.fn();
    const unsubscribe = subscribeVoicePreference(onChange);
    window.dispatchEvent(new StorageEvent('storage', { key: 'some-other-key' }));
    expect(onChange).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('stops notifying after unsubscribe', () => {
    const onChange = vi.fn();
    const unsubscribe = subscribeVoicePreference(onChange);
    unsubscribe();
    setVoicePreference({ accent: 'GB', voiceURI: null });
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('useVoicePreference', () => {
  afterEach(() => window.localStorage.clear());

  it('reads the current preference and updates every subscriber on change', () => {
    const { result: a } = renderHook(() => useVoicePreference());
    const { result: b } = renderHook(() => useVoicePreference());

    expect(a.current[0]).toEqual(DEFAULT_VOICE_PREFERENCE);
    expect(b.current[0]).toEqual(DEFAULT_VOICE_PREFERENCE);

    act(() => {
      a.current[1]({ accent: 'GB', voiceURI: 'v2' });
    });

    expect(a.current[0]).toEqual({ accent: 'GB', voiceURI: 'v2' });
    expect(b.current[0]).toEqual({ accent: 'GB', voiceURI: 'v2' });
  });
});
