// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { playBlip, useAventuraMute, MUTE_STORAGE_KEY, type BlipAudioContext } from './audio';

function fakeOscillator() {
  return {
    type: '',
    frequency: { setValueAtTime: vi.fn() },
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  };
}

function fakeGain() {
  return { gain: { setValueAtTime: vi.fn() }, connect: vi.fn() };
}

function fakeContext(): BlipAudioContext & { _oscillator: ReturnType<typeof fakeOscillator>; _gain: ReturnType<typeof fakeGain> } {
  const oscillator = fakeOscillator();
  const gain = fakeGain();
  return {
    currentTime: 1.5,
    createOscillator: () => oscillator as unknown as OscillatorNode,
    createGain: () => gain as unknown as GainNode,
    destination: {} as AudioDestinationNode,
    _oscillator: oscillator,
    _gain: gain,
  };
}

describe('playBlip', () => {
  it('is a no-op when given no context', () => {
    expect(() => playBlip(null)).not.toThrow();
  });

  it('wires a square oscillator through a gain node to the destination and starts/stops it', () => {
    const ctx = fakeContext();
    playBlip(ctx);

    expect(ctx._oscillator.type).toBe('square');
    expect(ctx._oscillator.frequency.setValueAtTime).toHaveBeenCalledWith(660, 1.5);
    expect(ctx._oscillator.connect).toHaveBeenCalledWith(ctx._gain);
    expect(ctx._gain.connect).toHaveBeenCalledWith(ctx.destination);
    expect(ctx._oscillator.start).toHaveBeenCalledWith(1.5);
    expect(ctx._oscillator.stop).toHaveBeenCalled();
  });
});

describe('useAventuraMute', () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('defaults to muted when nothing is stored', () => {
    const { result } = renderHook(() => useAventuraMute());
    expect(result.current.muted).toBe(true);
  });

  it('toggleMuted flips the state and persists it', () => {
    const { result } = renderHook(() => useAventuraMute());
    act(() => result.current.toggleMuted());
    expect(result.current.muted).toBe(false);
    expect(localStorage.getItem(MUTE_STORAGE_KEY)).toBe('false');
  });

  it('reads a previously-stored unmuted preference on mount', () => {
    localStorage.setItem(MUTE_STORAGE_KEY, 'false');
    const { result } = renderHook(() => useAventuraMute());
    expect(result.current.muted).toBe(false);
  });

  it('degrades to the muted default when localStorage throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { result } = renderHook(() => useAventuraMute());
    expect(result.current.muted).toBe(true);
    spy.mockRestore();
  });

  it('play() does nothing while muted', () => {
    const { result } = renderHook(() => useAventuraMute());
    expect(() => act(() => result.current.play())).not.toThrow();
  });
});
