/**
 * Aventura chiptune-ish "blip" — a tiny WebAudio bleep on each new character
 * revealed by the typewriter (owner's "optional chiptune-ish blips" ask).
 * OFF by default; `useAventuraMute` persists the visitor's choice.
 *
 * `playBlip` is a PURE function over an `AudioContext`-shaped object so it is
 * unit-testable with a fake one — no real audio hardware needed.
 */
import { useCallback, useEffect, useState } from 'react';

/** `localStorage` key for the mute preference — one fixed key, per-browser. */
export const MUTE_STORAGE_KEY = 'chuyocode:aventura-muted';

const BLIP_FREQUENCY_HZ = 660;
const BLIP_DURATION_S = 0.03;
const BLIP_GAIN = 0.05;

/** The minimal slice of the WebAudio API `playBlip` needs — real or faked in tests. */
export interface BlipAudioContext {
  currentTime: number;
  createOscillator(): OscillatorNode;
  createGain(): GainNode;
  destination: AudioDestinationNode;
}

/** Play one short square-wave blip through `ctx`. A no-op if `ctx` is `null`. */
export function playBlip(ctx: BlipAudioContext | null): void {
  if (!ctx) return;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = 'square';
  oscillator.frequency.setValueAtTime(BLIP_FREQUENCY_HZ, ctx.currentTime);
  gain.gain.setValueAtTime(BLIP_GAIN, ctx.currentTime);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(ctx.currentTime);
  oscillator.stop(ctx.currentTime + BLIP_DURATION_S);
}

function readStoredMuted(): boolean {
  try {
    // Missing/corrupted storage reads back as the documented default: OFF
    // (muted) — the owner's brief for the blips themselves.
    const raw = localStorage.getItem(MUTE_STORAGE_KEY);
    return raw === null ? true : raw === 'true';
  } catch {
    return true;
  }
}

function writeStoredMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_STORAGE_KEY, String(muted));
  } catch {
    // Private window / blocked storage: the toggle still works for this
    // render, it just will not survive a reload.
  }
}

export interface UseAventuraAudioResult {
  /** `true` by default (blips OFF) until the visitor opts in. */
  muted: boolean;
  toggleMuted: () => void;
  /** Plays a blip unless muted or the browser has no WebAudio API. */
  play: () => void;
}

/** `AudioContext`/`webkitAudioContext` — `null` in SSR or an unsupported browser. */
function getAudioContextCtor(): (new () => BlipAudioContext) | null {
  if (typeof window === 'undefined') return null;
  const w = window as typeof window & { webkitAudioContext?: new () => BlipAudioContext };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/**
 * Mute state persisted to `localStorage` (owner's ask: "OFF by default with a
 * mute toggle"). The `AudioContext` is created lazily, on the first actual
 * `play()` call — browsers block audio contexts created before any user
 * gesture, and this hook may mount long before the visitor un-mutes.
 */
export function useAventuraMute(): UseAventuraAudioResult {
  const [muted, setMuted] = useState(true);
  const [ctx, setCtx] = useState<BlipAudioContext | null>(null);

  useEffect(() => {
    setMuted(readStoredMuted());
  }, []);

  const toggleMuted = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      writeStoredMuted(next);
      return next;
    });
  }, []);

  const play = useCallback(() => {
    if (muted) return;
    let active = ctx;
    if (!active) {
      const Ctor = getAudioContextCtor();
      if (!Ctor) return;
      active = new Ctor();
      setCtx(active);
    }
    playBlip(active);
  }, [muted, ctx]);

  return { muted, toggleMuted, play };
}
