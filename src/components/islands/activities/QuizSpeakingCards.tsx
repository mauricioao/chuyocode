/**
 * QuizSpeakingCards — "Cartas" (batch 1's Wordwall "Speaking cards"), one of
 * the alternate games a `quiz` block's own questions can be replayed as
 * (`gameModes.ts`'s `deriveGameItems`). A shuffled deck is dealt ONE card at
 * a time — "Repartir" deals the first, "Siguiente carta" deals the next —
 * each card showing its question (with `SpeakButton`, since these are meant
 * to be spoken out loud) behind a "Ver respuesta" reveal.
 *
 * SELF-CONTAINED, NOT WIRED INTO THE PAGE'S SCORE — same posture as
 * `QuizFlashcards`/`QuizMatching`: no answer here is ever stored, and this
 * mode never touches `quizResponses`/`quizResults`.
 *
 * The entrance animation (a card sliding + rotating onto the table) is pure
 * CSS: each dealt card remounts (`key={currentId}`), and its `starting:*`
 * classes (the `@starting-style` variant) give the browser the FROM state to
 * transition away from on insert — no JS timer, no `requestAnimationFrame`.
 * `motion-reduce:*` collapses both the duration and the starting offset so a
 * learner who asked for less motion sees the card appear instantly, exactly
 * `QuizFlashcards`'s own `motion-reduce:duration-0` pattern for its flip.
 */
import { useEffect, useMemo, useState } from 'react';
import { LightbulbIcon } from '@phosphor-icons/react/dist/ssr/Lightbulb';
import { UI_LABELS, type Lang } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import SpeakButton from '@/lib/speech/SpeakButton';
import { seedFromString, shuffleWithSeed, type GameItem } from '@/lib/activities/gameModes';

export interface QuizSpeakingCardsProps {
  lang: Lang;
  items: readonly GameItem[];
  /** Stable per-block seed (the block id) — `shuffleWithSeed`'s own input for the deck order and reshuffles. */
  seed: string;
}

function freshOrder(items: readonly GameItem[], seed: string, round: number): string[] {
  return shuffleWithSeed(
    items.map((item) => item.id),
    seedFromString(`${seed}:speak:${round}`),
  );
}

export default function QuizSpeakingCards({ lang, items, seed }: QuizSpeakingCardsProps) {
  const t = UI_LABELS[lang].activities.gameModes;
  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  const [round, setRound] = useState(0);
  const [order, setOrder] = useState<string[]>(() => freshOrder(items, seed, 0));
  const [dealtCount, setDealtCount] = useState(0);
  const [revealed, setRevealed] = useState(false);

  // A different block (or its own item list changed) — start a fresh deck.
  useEffect(() => {
    setRound(0);
    setOrder(freshOrder(items, seed, 0));
    setDealtCount(0);
    setRevealed(false);
    // Deliberately keyed on `items` alone — same rule `QuizMatching` already
    // documents: a different block always brings a different item list too.
  }, [items]);

  const total = order.length;
  const currentId = dealtCount > 0 ? order[dealtCount - 1] : undefined;
  const current = currentId ? byId.get(currentId) : undefined;
  const deckEmpty = dealtCount >= total;

  function handleDeal() {
    setDealtCount(1);
    setRevealed(false);
  }

  function handleNext() {
    setDealtCount((prev) => Math.min(prev + 1, total));
    setRevealed(false);
  }

  function handleReveal() {
    setRevealed(true);
  }

  function handleReshuffle() {
    const nextRound = round + 1;
    setRound(nextRound);
    setOrder(freshOrder(items, seed, nextRound));
    setDealtCount(0);
    setRevealed(false);
  }

  if (total === 0) return null;

  if (!current) {
    // Nothing dealt yet: the deck visual (a small stack of angled backs) plus "Repartir".
    return (
      <div data-testid="speaking-cards" className="flex flex-col items-center gap-4">
        <div data-testid="speaking-deck" className="relative h-40 w-28" aria-hidden="true">
          <div className="absolute inset-0 -rotate-6 rounded-lg border-2 border-border bg-surface-soft" />
          <div className="absolute inset-0 rotate-3 rounded-lg border-2 border-border bg-surface-soft" />
          <div className="absolute inset-0 rounded-lg border-2 border-accent bg-accent/10" />
        </div>
        <Button type="button" data-testid="speaking-deal" onClick={handleDeal} className="h-11 sm:h-8">
          {t.speakDeal}
        </Button>
      </div>
    );
  }

  return (
    <div data-testid="speaking-cards" className="flex flex-col items-center gap-4">
      <span data-testid="speaking-counter" className="text-sm text-muted-foreground tabular-nums">
        {t.speakCounterPrefix} {dealtCount} {t.speakCounterOf} {total}
      </span>

      <div
        key={currentId}
        data-testid="speaking-card"
        className="flex min-h-56 w-full max-w-md flex-col items-center justify-center gap-3 rounded-lg border-2 border-border bg-surface-soft p-6 text-center transition-all duration-[350ms] ease-out starting:-translate-x-10 starting:rotate-6 starting:opacity-0 motion-reduce:transition-none motion-reduce:duration-0 motion-reduce:starting:translate-x-0 motion-reduce:starting:rotate-0"
      >
        <p className="text-lg font-semibold text-zinc-100 sm:text-xl">{current.prompt}</p>
        <SpeakButton text={current.prompt} lang={lang} />

        {revealed ? (
          <div data-testid="speaking-answer" className="flex flex-col items-center gap-2 rounded-md border border-accent bg-accent/10 p-3">
            <p className="text-lg font-semibold text-zinc-100">{current.answer}</p>
            {current.explanation && (
              <div className="flex items-start gap-1.5 text-left text-sm text-foreground">
                <LightbulbIcon aria-hidden="true" weight="fill" className="mt-0.5 shrink-0 text-amber-400" />
                <p>{current.explanation}</p>
              </div>
            )}
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            data-testid="speaking-reveal"
            onClick={handleReveal}
            className="h-11 sm:h-8"
          >
            {t.speakReveal}
          </Button>
        )}
      </div>

      {deckEmpty ? (
        <Button type="button" data-testid="speaking-reshuffle" onClick={handleReshuffle} className="h-11 sm:h-8">
          {t.speakReshuffle}
        </Button>
      ) : (
        <Button type="button" variant="outline" data-testid="speaking-next" onClick={handleNext} className="h-11 sm:h-8">
          {t.speakNext}
        </Button>
      )}
    </div>
  );
}
