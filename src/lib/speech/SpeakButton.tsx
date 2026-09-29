/**
 * SpeakButton — reads `text` aloud with the browser's Web Speech API (D4,
 * "Escuchar/Listen"). Free, no server involved: `useSpeech` is the only
 * thing this component talks to.
 *
 * Renders a normal-rate button (Phosphor `SpeakerHigh`) plus a small "slow"
 * secondary button (rate {@link SLOW_RATE}) — unless `compact`, which keeps
 * only the normal-rate icon for a spot too small for a pair of buttons (the
 * worksheet zone tap-target affordance; see `WorksheetPlayer.tsx`).
 *
 * Phosphor ships no `Turtle` icon in the version this repo pins
 * (`@phosphor-icons/react` 2.1.10) — `PersonSimpleWalk` stands in for "read
 * this slowly" instead.
 *
 * RENDERS NOTHING when unsupported (`useSpeech().supported === false`, e.g.
 * SSR or a browser with no `speechSynthesis`) or when `text` has nothing
 * worth speaking — callers mount this unconditionally next to a
 * question/zone/prose block and simply get no button when there is nothing
 * to press, never a broken one.
 *
 * Never auto-plays: only `onClick` ever calls `speak()`.
 *
 * Copy is a LOCAL map, not `UI_LABELS`: this component is mounted from BOTH
 * the `ExerciseIsland`/mechanics tree (which deliberately keeps the
 * Astro-side i18n module out of its bundle — see that file's own header)
 * and the activities tree (which does import `UI_LABELS`) — staying local
 * keeps it usable, byte-identically, from either one.
 */
import { useEffect, useState } from 'react';
import { SpeakerHighIcon } from '@phosphor-icons/react/dist/ssr/SpeakerHigh';
import { PersonSimpleWalkIcon } from '@phosphor-icons/react/dist/ssr/PersonSimpleWalk';
import { cn } from '@/lib/utils';
import { useSpeech } from './useSpeech';

/** The "slow" button's rate, `speechSynthesis` scale (`1` = normal). */
export const SLOW_RATE = 0.7;

interface Copy {
  speak: string;
  speakSlow: string;
}

/**
 * REGISTER (standing project rule): neutral Spanish, no voseo — see
 * `ExerciseIsland.COPY`'s own note. Exported for the same reason that map
 * is: so a neutral-Spanish guard test can read it.
 */
export const COPY: Record<'es' | 'en', Copy> = {
  es: { speak: 'Escuchar', speakSlow: 'Escuchar lento' },
  en: { speak: 'Listen', speakSlow: 'Listen slowly' },
};

/** Resolve copy for a locale, defaulting to English — same rule every local COPY map in this codebase follows. */
function copyFor(lang: string | undefined): Copy {
  return lang === 'es' ? COPY.es : COPY.en;
}

export interface SpeakButtonProps {
  /** The English text to read aloud (run through `toSpeakableText` inside `useSpeech`). */
  text: string | null | undefined;
  /** Active locale, for the button's own chrome copy only — it never changes what gets spoken (always English). */
  lang?: string;
  /**
   * Icon-only, normal rate alone, no secondary "slow" button — for a spot
   * too small to fit a pair (the worksheet zone tap-target affordance).
   * Defaults to `false` (the full two-button form).
   */
  compact?: boolean;
  className?: string;
}

const ICON_BUTTON =
  'inline-flex shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50';

/** 44px, the touch-target floor on a phone; a plain 32px icon button from `sm` up, where a pointer is precise. */
const NORMAL_SIZE = 'h-11 w-11 sm:h-8 sm:w-8';
/** Small and fixed — this variant only ever sits inside something already tiny (a drawn worksheet zone). */
const COMPACT_SIZE = 'h-6 w-6';

/** Subtle "currently speaking" animation on the pressed icon; reduced motion drops it entirely. */
const SPEAKING_ICON = 'animate-pulse motion-reduce:animate-none';

export default function SpeakButton({ text, lang, compact = false, className }: SpeakButtonProps) {
  const { supported, speaking, speak } = useSpeech();
  // Which of THIS button's two controls started the utterance currently
  // playing, if any — `useSpeech`'s own `speaking` is one boolean shared by
  // both, so this is what lets each one carry its own `aria-pressed`.
  const [active, setActive] = useState<'normal' | 'slow' | null>(null);

  // `speaking` flips false on its own once the utterance ends/errors/gets
  // cancelled by another SpeakButton starting — follow it back to "neither
  // button is pressed" rather than tracking that separately.
  useEffect(() => {
    if (!speaking) setActive(null);
  }, [speaking]);

  if (!supported) return null;
  if (!text || text.trim().length === 0) return null;

  function press(rate: number, variant: 'normal' | 'slow') {
    setActive(variant);
    speak(text!, { rate });
  }

  const t = copyFor(lang);
  const size = compact ? COMPACT_SIZE : NORMAL_SIZE;

  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      <button
        type="button"
        data-testid="speak-button"
        aria-label={t.speak}
        aria-pressed={active === 'normal'}
        onClick={() => press(1, 'normal')}
        className={cn(ICON_BUTTON, size)}
      >
        <SpeakerHighIcon aria-hidden="true" className={cn(active === 'normal' && SPEAKING_ICON)} />
      </button>

      {!compact && (
        <button
          type="button"
          data-testid="speak-button-slow"
          aria-label={t.speakSlow}
          aria-pressed={active === 'slow'}
          onClick={() => press(SLOW_RATE, 'slow')}
          className={cn(ICON_BUTTON, size)}
        >
          <PersonSimpleWalkIcon aria-hidden="true" className={cn(active === 'slow' && SPEAKING_ICON)} />
        </button>
      )}
    </span>
  );
}
