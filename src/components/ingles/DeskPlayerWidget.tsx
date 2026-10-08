/**
 * DeskPlayerWidget — the desk hub's "Frase del día" player ("desktop"
 * redesign PART 4, approved mockup's `.player`: a red squircle cover with
 * the headphone emoji, title, phrase + meaning, prev/play/next, a thin
 * progress track).
 *
 * A REACT ISLAND (`client:load`, mounted from `index.astro`), unlike the
 * clock/calendar/weather widgets' plain vanilla-JS DOM wiring: this is the
 * ONE widget the owner wants ready to become the SHARED player for future
 * audio exercises, and `useSpeech` (the hook every other speech control in
 * this codebase already composes through) is a React hook — a vanilla DOM
 * module would have to reimplement it. `DeskPlayerWidget` itself still owns
 * nothing exercise-specific: it only reads `DAILY_PHRASES`/`pickPhraseIndex`
 * and renders controls around `useSpeech`, so lifting its control/progress
 * UI into a shared `<AudioPlayer phraseEn={...} onPrev={...} .../>` later is
 * a prop-shape change, not a rewrite.
 *
 * SSR/HYDRATION MISMATCH, same fix as `DeskClockWidget.astro`/
 * `DeskCalendarWidget.astro`: which phrase is "today's" depends on the
 * VISITOR's own browser `Date` — the server (and React's own first client
 * render, before hydration effects run) cannot know it without guessing
 * wrong for some visitor's timezone. So `index` starts `null` (a static,
 * locale-free loading shell, `aria-hidden`) and a `useEffect` resolves
 * today's real index exactly once on mount — no flash of the wrong phrase,
 * no hydration warning.
 *
 * PROGRESS IS ESTIMATED, not measured: `speechSynthesis` exposes no
 * duration or reliable per-word timing, so the track/remaining-time animate
 * against `estimateSpeechMs` (~130 words/minute) ticked by a 100ms
 * interval — see that module's own header. This is cosmetic, not a timing
 * guarantee.
 *
 * UNAVAILABLE: `useSpeech().supported` is `false` with no Web Speech API at
 * all (SSR included) — the play button is then rendered `disabled` with
 * `aria-disabled` and `labels.unavailable` as its accessible reason,
 * instead of silently doing nothing on click.
 */
import { useEffect, useRef, useState } from 'react';
import { PlayIcon } from '@phosphor-icons/react/dist/ssr/Play';
import { PauseIcon } from '@phosphor-icons/react/dist/ssr/Pause';
import { SkipBackIcon } from '@phosphor-icons/react/dist/ssr/SkipBack';
import { SkipForwardIcon } from '@phosphor-icons/react/dist/ssr/SkipForward';
import { Emoji } from '@/components/ui/Emoji';
import { cn } from '@/lib/utils';
import { DAILY_PHRASES, pickPhraseIndex } from '@/lib/dailyPhrases';
import { useSpeech, NORMAL_RATE } from '@/lib/speech/useSpeech';
import { estimateSpeechMs } from '@/lib/speech/estimateSpeechMs';

export interface DeskPlayerWidgetLabels {
  title: string;
  prev: string;
  next: string;
  play: string;
  pause: string;
  unavailable: string;
}

export interface DeskPlayerWidgetProps {
  labels: DeskPlayerWidgetLabels;
}

/** How often the estimated progress ticks forward while "speaking", ms. */
const TICK_MS = 100;

function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export default function DeskPlayerWidget({ labels }: DeskPlayerWidgetProps) {
  const { supported, speaking, speak, stop } = useSpeech();

  // `null` until the post-hydration effect below resolves it — see the file header.
  const [index, setIndex] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setIndex(pickPhraseIndex(new Date(), DAILY_PHRASES.length));
  }, []);

  const phrase = index === null ? null : DAILY_PHRASES[index];
  const durationMs = phrase ? estimateSpeechMs(phrase.en, NORMAL_RATE) : 0;

  const clearTicker = () => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  // Drives the estimated progress bar while THIS widget's own utterance is
  // playing; resets to 0 the moment it stops (ended, cancelled, or a
  // prev/next switch called `stop()`).
  useEffect(() => {
    if (!speaking) {
      clearTicker();
      setElapsedMs(0);
      return undefined;
    }
    intervalRef.current = setInterval(() => {
      setElapsedMs((prev) => Math.min(durationMs, prev + TICK_MS));
    }, TICK_MS);
    return clearTicker;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- durationMs is read fresh inside the tick closure via the outer `phrase`/`index` it was captured with when `speak()` started; re-running the effect on every durationMs recompute would restart the interval needlessly.
  }, [speaking]);

  useEffect(() => clearTicker, []);

  function go(delta: 1 | -1) {
    stop();
    setIndex((current) => {
      const length = DAILY_PHRASES.length;
      const base = current ?? 0;
      return ((base + delta) % length + length) % length;
    });
  }

  function togglePlay() {
    if (!supported || !phrase) return;
    if (speaking) {
      stop();
      return;
    }
    setElapsedMs(0);
    speak(phrase.en, { rate: NORMAL_RATE });
  }

  const progressPct = durationMs > 0 ? Math.min(100, (elapsedMs / durationMs) * 100) : 0;
  const remainingMs = Math.max(0, durationMs - elapsedMs);

  return (
    <div
      id="desk-player"
      aria-label={labels.title}
      aria-busy={index === null}
      className="ingles-glass grid w-full max-w-[320px] grid-cols-[72px_1fr] items-center gap-x-3.5 gap-y-2 p-4 desk:w-[320px]"
    >
      <div className="grid h-[72px] w-[72px] place-items-center rounded-[18px] bg-gradient-to-br from-[#f0664c] to-[#e24a32] shadow-[0_1px_2px_rgb(28_28_30_/_0.12),0_4px_10px_-2px_rgb(226_74_50_/_0.35)]">
        <Emoji name="headphone" size={42} />
      </div>

      <div className="min-w-0">
        <h3 className="m-0 text-sm font-semibold text-foreground">{labels.title}</h3>
        <p className="mt-0.5 mb-2 line-clamp-2 text-xs leading-snug text-muted-foreground" aria-live="polite">
          {phrase ? (
            <>
              <span className="font-medium text-foreground">&ldquo;{phrase.en}&rdquo;</span> — {phrase.es}
            </>
          ) : (
            '…'
          )}
        </p>

        <div className="flex items-center gap-3.5">
          <button
            type="button"
            aria-label={labels.prev}
            onClick={() => go(-1)}
            disabled={index === null}
            className="grid place-items-center p-1 text-foreground disabled:opacity-40"
          >
            <SkipBackIcon size={16} weight="fill" aria-hidden="true" />
          </button>

          <button
            type="button"
            aria-label={speaking ? labels.pause : labels.play}
            aria-pressed={speaking}
            aria-disabled={!supported || index === null}
            title={!supported ? labels.unavailable : undefined}
            onClick={togglePlay}
            disabled={!supported || index === null}
            className="grid place-items-center p-1 text-foreground disabled:opacity-40"
          >
            {speaking ? (
              <PauseIcon size={20} weight="fill" aria-hidden="true" />
            ) : (
              <PlayIcon size={20} weight="fill" aria-hidden="true" />
            )}
          </button>

          <button
            type="button"
            aria-label={labels.next}
            onClick={() => go(1)}
            disabled={index === null}
            className="grid place-items-center p-1 text-foreground disabled:opacity-40"
          >
            <SkipForwardIcon size={16} weight="fill" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="col-span-2 h-[3px] overflow-hidden rounded-[3px] bg-foreground/10">
        <i
          data-testid="player-progress"
          className={cn('block h-full bg-foreground', !speaking && 'transition-none')}
          style={{ width: `${progressPct}%`, transitionDuration: speaking ? `${TICK_MS}ms` : undefined }}
        />
      </div>
      <div className="col-span-2 -mt-1 flex justify-between text-[9.5px] text-muted-foreground tabular-nums">
        <span>{formatClock(elapsedMs)}</span>
        <span>-{formatClock(remainingMs)}</span>
      </div>
    </div>
  );
}
