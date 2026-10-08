// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import {
  GAME_SOUND_MUTE_KEY,
  playCorrect,
  playDrop,
  playFinish,
  playPickUp,
  playWrong,
  useGameSound,
  type GameAudioContext,
} from './gameSounds';

afterEach(cleanup);

interface RecordedGain {
  setValueAtTime: ReturnType<typeof vi.fn>;
  linearRampToValueAtTime: ReturnType<typeof vi.fn>;
}

interface RecordedOscillator {
  type: string;
  frequency: { setValueAtTime: ReturnType<typeof vi.fn> };
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
}

function fakeContext() {
  const oscillators: RecordedOscillator[] = [];
  const gains: RecordedGain[] = [];
  const ctx: GameAudioContext = {
    currentTime: 10,
    createOscillator: vi.fn(() => {
      const osc: RecordedOscillator = {
        type: '',
        frequency: { setValueAtTime: vi.fn() },
        start: vi.fn(),
        stop: vi.fn(),
        connect: vi.fn(),
      };
      oscillators.push(osc);
      return osc as unknown as OscillatorNode;
    }),
    createGain: vi.fn(() => {
      const gain: RecordedGain = { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() };
      gains.push(gain);
      return { gain, connect: vi.fn() } as unknown as GainNode;
    }),
    destination: {} as AudioDestinationNode,
  };
  return { ctx, oscillators, gains };
}

describe('gameSounds — pure cue scheduling', () => {
  it('playPickUp schedules exactly one short tone', () => {
    const { ctx, oscillators } = fakeContext();
    playPickUp(ctx);
    expect(oscillators).toHaveLength(1);
    expect(oscillators[0]!.start).toHaveBeenCalledWith(10);
    expect(oscillators[0]!.frequency.setValueAtTime).toHaveBeenCalledWith(420, 10);
  });

  it('playDrop schedules exactly one short, high tone', () => {
    const { ctx, oscillators } = fakeContext();
    playDrop(ctx);
    expect(oscillators).toHaveLength(1);
    expect(oscillators[0]!.frequency.setValueAtTime).toHaveBeenCalledWith(540, 10);
  });

  it('playCorrect schedules a two-note rise, the second note after the first', () => {
    const { ctx, oscillators } = fakeContext();
    playCorrect(ctx);
    expect(oscillators).toHaveLength(2);
    const [first, second] = oscillators;
    expect(first!.start).toHaveBeenCalledWith(10);
    expect(second!.start).toHaveBeenCalledWith(10.08);
    const firstFreq = first!.frequency.setValueAtTime.mock.calls[0]![0] as number;
    const secondFreq = second!.frequency.setValueAtTime.mock.calls[0]![0] as number;
    expect(secondFreq).toBeGreaterThan(firstFreq);
  });

  it('playWrong schedules one low tone', () => {
    const { ctx, oscillators } = fakeContext();
    playWrong(ctx);
    expect(oscillators).toHaveLength(1);
    expect(oscillators[0]!.frequency.setValueAtTime).toHaveBeenCalledWith(196, 10);
  });

  it('playFinish schedules a four-note ascending arpeggio', () => {
    const { ctx, oscillators } = fakeContext();
    playFinish(ctx);
    expect(oscillators).toHaveLength(4);
    const freqs = oscillators.map((o) => o.frequency.setValueAtTime.mock.calls[0]![0] as number);
    expect(freqs).toEqual([...freqs].sort((a, b) => a - b));
    const starts = oscillators.map((o) => o.start.mock.calls[0]![0] as number);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });

  it('every scheduled tone ramps its gain up then back down to silence before it stops', () => {
    const { ctx, gains, oscillators } = fakeContext();
    playCorrect(ctx);
    for (const gain of gains) {
      expect(gain.setValueAtTime).toHaveBeenCalledWith(0, expect.any(Number));
      expect(gain.linearRampToValueAtTime).toHaveBeenCalledTimes(2);
      const [, finalCall] = gain.linearRampToValueAtTime.mock.calls;
      expect(finalCall![0]).toBe(0);
    }
    for (const osc of oscillators) {
      const startTime = osc.start.mock.calls[0]![0] as number;
      const stopTime = osc.stop.mock.calls[0]![0] as number;
      expect(stopTime).toBeGreaterThan(startTime);
    }
  });

  it('is a no-op with a null context', () => {
    expect(() => playFinish(null)).not.toThrow();
  });
});

describe('useGameSound', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('is unmuted by default', () => {
    const { result } = renderHook(() => useGameSound());
    expect(result.current.muted).toBe(false);
  });

  it('reads a previously stored muted preference on mount', () => {
    localStorage.setItem(GAME_SOUND_MUTE_KEY, 'true');
    const { result } = renderHook(() => useGameSound());
    expect(result.current.muted).toBe(true);
  });

  it('toggling mute persists the new preference', () => {
    const { result } = renderHook(() => useGameSound());
    act(() => result.current.toggleMuted());
    expect(result.current.muted).toBe(true);
    expect(localStorage.getItem(GAME_SOUND_MUTE_KEY)).toBe('true');

    act(() => result.current.toggleMuted());
    expect(result.current.muted).toBe(false);
    expect(localStorage.getItem(GAME_SOUND_MUTE_KEY)).toBe('false');
  });

  it('never constructs an AudioContext before the first unmuted play() call', () => {
    const ctor = vi.fn(() => ({}) as unknown as AudioContext);
    vi.stubGlobal('AudioContext', ctor);
    renderHook(() => useGameSound());
    expect(ctor).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('play() is a no-op while muted, and never constructs an AudioContext', () => {
    const ctor = vi.fn(() => ({}) as unknown as AudioContext);
    vi.stubGlobal('AudioContext', ctor);
    const { result } = renderHook(() => useGameSound());
    act(() => result.current.toggleMuted()); // now muted
    act(() => result.current.play('pickUp'));
    expect(ctor).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('play() lazily creates the AudioContext on first call, then reuses it', () => {
    const fakeAudioContext = {
      currentTime: 0,
      createOscillator: vi.fn(() => ({
        type: '',
        frequency: { setValueAtTime: vi.fn() },
        start: vi.fn(),
        stop: vi.fn(),
        connect: vi.fn(),
      })),
      createGain: vi.fn(() => ({
        gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
        connect: vi.fn(),
      })),
      destination: {},
    };
    const ctor = vi.fn(function FakeAudioContext() {
      return fakeAudioContext as unknown as AudioContext;
    });
    vi.stubGlobal('AudioContext', ctor);

    const { result } = renderHook(() => useGameSound());
    act(() => result.current.play('drop'));
    act(() => result.current.play('drop'));

    expect(ctor).toHaveBeenCalledTimes(1);
    expect(fakeAudioContext.createOscillator).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });
});
