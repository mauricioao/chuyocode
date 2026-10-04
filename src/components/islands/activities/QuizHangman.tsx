/**
 * QuizHangman — "Ahorcado" (batch 1's Wordwall "Hangman"), one of the
 * alternate games a `quiz` block's own questions can be replayed as. Only
 * items whose answer is a single letters-only word survive
 * `gameModes.ts`'s `hangmanEligible` filter (this component trusts its
 * caller already applied it — see `QuizBlockPractice`).
 *
 * One word at a time, guessed letter by letter (on-screen A–Z keyboard AND
 * physical keydown) against six lives — drawn as a row of balloons instead
 * of the traditional gallows figure, per the product brief ("no violent
 * imagery"): a wrong guess pops one, the SAME idea a health/lives meter
 * elsewhere in this codebase already uses a friendlier icon than damage bars
 * for (`hearts.ts`). A loss reveals the full word immediately; a win or a
 * loss both offer "Siguiente palabra".
 *
 * SELF-CONTAINED, NOT WIRED INTO THE PAGE'S SCORE — same posture as every
 * sibling in this file's family.
 */
import { useEffect, useMemo, useState } from 'react';
import { BalloonIcon } from '@phosphor-icons/react/dist/ssr/Balloon';
import { UI_LABELS, type Lang } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import SpeakButton from '@/lib/speech/SpeakButton';
import type { GameItem } from '@/lib/activities/gameModes';

export interface QuizHangmanProps {
  lang: Lang;
  /** Already filtered through `hangmanEligible` by the caller. */
  items: readonly GameItem[];
}

/** Lives — six balloons, matching the design brief's own count. */
const MAX_LIVES = 6;

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export default function QuizHangman({ lang, items }: QuizHangmanProps) {
  const t = UI_LABELS[lang].activities.gameModes;

  const [wordIndex, setWordIndex] = useState(0);
  const [guessed, setGuessed] = useState<ReadonlySet<string>>(new Set());
  const [wrongCount, setWrongCount] = useState(0);

  const current = items[wordIndex];
  const word = useMemo(() => (current ? current.answer.trim().toUpperCase() : ''), [current]);
  const letters = useMemo(() => new Set(word.split('')), [word]);

  // A different block (or its own eligible-item list changed) — start over.
  useEffect(() => {
    setWordIndex(0);
    setGuessed(new Set());
    setWrongCount(0);
  }, [items]);

  const won = word.length > 0 && [...letters].every((letter) => guessed.has(letter));
  const lost = wrongCount >= MAX_LIVES;
  const status: 'playing' | 'won' | 'lost' = lost ? 'lost' : won ? 'won' : 'playing';
  const livesLeft = Math.max(0, MAX_LIVES - wrongCount);

  function handleGuess(letter: string) {
    if (status !== 'playing' || guessed.has(letter)) return;
    setGuessed((prev) => new Set(prev).add(letter));
    if (!letters.has(letter)) setWrongCount((prev) => prev + 1);
  }

  function handleNextWord() {
    setWordIndex((prev) => prev + 1);
    setGuessed(new Set());
    setWrongCount(0);
  }

  function handlePlayAgain() {
    setWordIndex(0);
    setGuessed(new Set());
    setWrongCount(0);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (status !== 'playing') return;
    if (e.key.length === 1 && /[a-zA-Z]/.test(e.key)) {
      e.preventDefault();
      handleGuess(e.key.toUpperCase());
    }
  }

  if (items.length === 0) return null;

  if (!current) {
    return (
      <div data-testid="hangman-done" className="flex flex-col items-center gap-4 py-8 text-center">
        <p className="text-lg font-medium text-foreground">{t.hangmanDone}</p>
        <Button type="button" data-testid="hangman-play-again" onClick={handlePlayAgain}>
          {t.hangmanPlayAgain}
        </Button>
      </div>
    );
  }

  const revealed = status === 'lost';

  return (
    <div
      data-testid="quiz-hangman"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="flex flex-col items-center gap-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <div aria-live="polite" role="status" className="sr-only" data-testid="hangman-live-region">
        {status === 'won' ? t.hangmanWon : status === 'lost' ? t.hangmanLost : ''}
      </div>

      <span data-testid="hangman-counter" className="text-sm text-muted-foreground tabular-nums">
        {t.hangmanCounterPrefix} {wordIndex + 1} {t.hangmanCounterOf} {items.length}
      </span>

      <div
        data-testid="hangman-lives"
        role="img"
        aria-label={`${t.hangmanLivesLabel}: ${livesLeft} / ${MAX_LIVES}`}
        className="flex items-center gap-1"
      >
        {Array.from({ length: MAX_LIVES }, (_, i) => (
          <BalloonIcon
            key={i}
            weight="fill"
            aria-hidden="true"
            className={cn('size-6', i < livesLeft ? 'text-accent-ink' : 'text-muted opacity-30')}
          />
        ))}
      </div>

      <p className="flex items-center gap-2 text-center text-base text-zinc-100">
        {current.prompt}
        <SpeakButton text={current.prompt} lang={lang} compact />
      </p>

      <div data-testid="hangman-word" className="flex flex-wrap justify-center gap-2 text-2xl font-bold tracking-widest tabular-nums">
        {word.split('').map((letter, index) => (
          <span
            key={index}
            data-testid={`hangman-letter-${index}`}
            className={cn(
              'flex size-9 items-center justify-center border-b-2',
              guessed.has(letter) || revealed ? 'border-accent-ink text-zinc-100' : 'border-border text-transparent',
            )}
          >
            {guessed.has(letter) || revealed ? letter : '_'}
          </span>
        ))}
      </div>

      {status === 'won' && <p className="text-lg font-medium text-emerald-300">{t.hangmanWon}</p>}
      {status === 'lost' && <p className="text-lg font-medium text-destructive">{t.hangmanLost}</p>}

      <div data-testid="hangman-keyboard" className="flex flex-wrap justify-center gap-1">
        {ALPHABET.map((letter) => {
          const isGuessed = guessed.has(letter);
          const isHit = isGuessed && letters.has(letter);
          const isMiss = isGuessed && !letters.has(letter);
          return (
            <button
              key={letter}
              type="button"
              data-testid={`hangman-key-${letter}`}
              disabled={isGuessed || status !== 'playing'}
              onClick={() => handleGuess(letter)}
              className={cn(
                'flex size-9 items-center justify-center rounded-md border-2 text-sm font-bold uppercase',
                isHit && 'border-emerald-500 bg-emerald-500/10 text-emerald-300',
                isMiss && 'border-destructive bg-destructive/10 text-destructive',
                !isGuessed && 'border-border bg-surface-soft text-zinc-100 hover:border-accent-ink/60',
              )}
            >
              {letter}
            </button>
          );
        })}
      </div>

      {status !== 'playing' && (
        <Button type="button" data-testid="hangman-next" onClick={handleNextWord} className="h-11 sm:h-8">
          {t.hangmanNext}
        </Button>
      )}
    </div>
  );
}
