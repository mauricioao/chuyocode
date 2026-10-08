/**
 * gameSounds — five short synthesized Web Audio cues for the game-feel
 * engine (owner ask: "sonidos al levantar la ficha... la suavidad del
 * movimiento"): pick-up, drop, correct, wrong, finish. Pure scheduling
 * functions over a minimal `GameAudioContext`-shaped interface — same
 * posture as `aventura/audio.ts`'s `playBlip` — so they are unit-testable
 * with a fake context and no real audio hardware.
 *
 * `useGameSound` wires these to a mute toggle persisted in `localStorage`
 * (SOUND ON BY DEFAULT — unlike `aventura`'s ambient blips, these are
 * functional feedback for a game the learner is actively playing) and
 * lazily creates the real `AudioContext` on the first actual `play()` call
 * made while unmuted — never before an actual user gesture, since browsers
 * block an audio context created any earlier.
 */
import { useCallback, useEffect, useState } from 'react';

/** `localStorage` key for the mute preference — one fixed key, per-browser, shared by every game template. */
export const GAME_SOUND_MUTE_KEY = 'chuyocode:game-sound-muted';

/** The minimal slice of the WebAudio API these cues need — real or faked in tests. */
export interface GameAudioContext {
  currentTime: number;
  createOscillator(): OscillatorNode;
  createGain(): GainNode;
  destination: AudioDestinationNode;
}

type ToneType = 'sine' | 'square' | 'triangle' | 'sawtooth';

interface ToneSpec {
  /** Seconds after `ctx.currentTime` this note starts. */
  offset: number;
  frequencyHz: number;
  durationS: number;
  type: ToneType;
  /** Peak gain (linear, 0-1) — kept low across every cue so none of them is jarring. */
  gain: number;
}

/**
 * Schedule one short tone with a soft linear attack/release envelope, so a
 * cue never clicks at its edges the way `aventura`'s single hard-edged blip
 * can get away with at its much shorter duration.
 */
function scheduleTone(ctx: GameAudioContext, tone: ToneSpec): void {
  const start = ctx.currentTime + tone.offset;
  const end = start + tone.durationS;
  const attackEnd = start + Math.min(0.01, tone.durationS / 4);

  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = tone.type;
  oscillator.frequency.setValueAtTime(tone.frequencyHz, start);
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(tone.gain, attackEnd);
  gain.gain.linearRampToValueAtTime(0, end);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(end);
}

function scheduleSequence(ctx: GameAudioContext | null, tones: readonly ToneSpec[]): void {
  if (!ctx) return;
  for (const tone of tones) scheduleTone(ctx, tone);
}

/** Pick-up: a soft, quick pop — read as "something left the surface". */
export function playPickUp(ctx: GameAudioContext | null): void {
  scheduleSequence(ctx, [{ offset: 0, frequencyHz: 420, durationS: 0.06, type: 'triangle', gain: 0.06 }]);
}

/** Drop: a soft tick — shorter and higher than pick-up, read as "something landed". */
export function playDrop(ctx: GameAudioContext | null): void {
  scheduleSequence(ctx, [{ offset: 0, frequencyHz: 540, durationS: 0.035, type: 'square', gain: 0.04 }]);
}

/** Correct: a bright two-note rise (a quick major third, G5 -> B5). */
export function playCorrect(ctx: GameAudioContext | null): void {
  scheduleSequence(ctx, [
    { offset: 0, frequencyHz: 784.0, durationS: 0.09, type: 'sine', gain: 0.07 },
    { offset: 0.08, frequencyHz: 987.77, durationS: 0.12, type: 'sine', gain: 0.07 },
  ]);
}

/** Wrong: one low, soft tone — a gentle "not quite", never harsh or punitive. */
export function playWrong(ctx: GameAudioContext | null): void {
  scheduleSequence(ctx, [{ offset: 0, frequencyHz: 196.0, durationS: 0.16, type: 'sine', gain: 0.06 }]);
}

/** Finish: a short four-note ascending arpeggio (C6-E6-G6-C7), the calm "round over" flourish. */
export function playFinish(ctx: GameAudioContext | null): void {
  scheduleSequence(ctx, [
    { offset: 0, frequencyHz: 1046.5, durationS: 0.09, type: 'triangle', gain: 0.06 },
    { offset: 0.09, frequencyHz: 1318.51, durationS: 0.09, type: 'triangle', gain: 0.06 },
    { offset: 0.18, frequencyHz: 1567.98, durationS: 0.09, type: 'triangle', gain: 0.06 },
    { offset: 0.27, frequencyHz: 2093.0, durationS: 0.18, type: 'triangle', gain: 0.07 },
  ]);
}

export type GameCue = 'pickUp' | 'drop' | 'correct' | 'wrong' | 'finish';

const CUE_PLAYERS: Record<GameCue, (ctx: GameAudioContext | null) => void> = {
  pickUp: playPickUp,
  drop: playDrop,
  correct: playCorrect,
  wrong: playWrong,
  finish: playFinish,
};

function readStoredMuted(): boolean {
  try {
    // Missing/corrupted storage reads back as the documented default: OFF
    // (sound ON) — unlike the aventura blips, these cues are ON by default.
    return localStorage.getItem(GAME_SOUND_MUTE_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeStoredMuted(muted: boolean): void {
  try {
    localStorage.setItem(GAME_SOUND_MUTE_KEY, String(muted));
  } catch {
    // Private window / blocked storage: the toggle still works for this
    // render, it just will not survive a reload.
  }
}

/** `AudioContext`/`webkitAudioContext` — `null` in SSR or an unsupported browser. */
function getAudioContextCtor(): (new () => GameAudioContext) | null {
  if (typeof window === 'undefined') return null;
  const w = window as typeof window & { webkitAudioContext?: new () => GameAudioContext };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

export interface UseGameSoundResult {
  /** `false` by default (sound ON) until the player mutes it. */
  muted: boolean;
  toggleMuted: () => void;
  /** Play one cue. A no-op while muted or without a WebAudio-capable browser. */
  play: (cue: GameCue) => void;
}

/**
 * Mute state persisted to `localStorage` and shared by every drag-based game
 * template. The `AudioContext` itself is created lazily on the first actual
 * `play()` call made while unmuted, so this hook can mount long before the
 * player's first gesture without tripping browsers' autoplay-policy block.
 */
export function useGameSound(): UseGameSoundResult {
  const [muted, setMuted] = useState(false);
  const [ctx, setCtx] = useState<GameAudioContext | null>(null);

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

  const play = useCallback(
    (cue: GameCue) => {
      if (muted) return;
      let active = ctx;
      if (!active) {
        const Ctor = getAudioContextCtor();
        if (!Ctor) return;
        active = new Ctor();
        setCtx(active);
      }
      CUE_PLAYERS[cue](active);
    },
    [muted, ctx],
  );

  return { muted, toggleMuted, play };
}
