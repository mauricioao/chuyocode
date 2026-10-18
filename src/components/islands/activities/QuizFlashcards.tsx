/**
 * QuizFlashcards — "Tarjetas" (D1's flashcard game), one of the alternate
 * games a `quiz` block's own questions can be replayed as
 * (`gameModes.ts`'s `deriveGameItems`). One card at a time: front = the
 * question's prompt (with `SpeakButton`), tap/click/Space flips it to the
 * answer (+ explanation if the slot has one).
 *
 * SELF-CONTAINED, NOT WIRED INTO THE PAGE'S SCORE: unlike quiz-mode answers
 * (`quizResponses`/`quizResults`, lifted to `ActivityPracticeIsland`), a
 * learner's "La sabía"/"Repasar" judgment here is local component state,
 * gone the moment this component unmounts — matching `QuizBlockPractice`'s
 * own header ("Answers are NEVER stored") and the design brief ("Not part of
 * the combined score").
 *
 * The "Repasar" pile is a queue of item ids the learner flagged, replayable
 * once the deck runs out — a second, shorter pass over just what still needs
 * work, not a second combined score.
 */
import { useEffect, useMemo, useState } from 'react';
import { UI_LABELS, type Lang } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import SpeakButton from '@/lib/speech/SpeakButton';
import { seedFromString, shuffleWithSeed, type GameItem } from '@/lib/activities/gameModes';
import type { PromptImageRef } from '@/lib/activities/blocks';
import PromptImage from '@/components/islands/mechanics/PromptImage';
import {
  AnswerExplanation,
  SINGLE_CARD,
  SINGLE_CARD_META,
  SINGLE_CARD_PROMPT,
} from '@/components/islands/mechanics/singleCard';

export interface QuizFlashcardsProps {
  lang: Lang;
  items: readonly GameItem[];
  /** Stable per-block seed (the block id) — `shuffleWithSeed`'s own input for "Barajar". */
  seed: string;
  /** This block's own `promptImages` map (owner decision 2026-10-16 follow-up), keyed by slot id — `undefined` = no question images authored, the common case. Display-only; see `PromptImage`'s own header. */
  promptImages?: Record<string, PromptImageRef>;
}

/** Order a deck by item id, from the current item list — the authored order until "Barajar" runs once. */
function authoredOrder(items: readonly GameItem[]): string[] {
  return items.map((item) => item.id);
}

export default function QuizFlashcards({ lang, items, seed, promptImages }: QuizFlashcardsProps) {
  const t = UI_LABELS[lang].activities.gameModes;
  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  const [order, setOrder] = useState<string[]>(() => authoredOrder(items));
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [reviewPile, setReviewPile] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const [shuffleCount, setShuffleCount] = useState(0);

  // The item list itself changed (a different block, or its slot count
  // changed) — start a fresh deck rather than indexing into a now-stale
  // order.
  useEffect(() => {
    setOrder(authoredOrder(items));
    setIndex(0);
    setFlipped(false);
    setReviewPile([]);
    setDone(false);
    setShuffleCount(0);
  }, [items]);

  const total = order.length;
  const currentId = order[index];
  const current = currentId ? byId.get(currentId) : undefined;

  function goTo(nextIndex: number) {
    if (nextIndex >= total) {
      setDone(true);
      return;
    }
    setIndex(Math.max(0, nextIndex));
    setFlipped(false);
  }

  function handlePrev() {
    if (index > 0) goTo(index - 1);
  }

  function handleNext() {
    goTo(index + 1);
  }

  function handleFlip() {
    setFlipped((prev) => !prev);
  }

  function handleShuffle() {
    const nextCount = shuffleCount + 1;
    setShuffleCount(nextCount);
    setOrder((prev) => shuffleWithSeed(prev, seedFromString(`${seed}:cards:${nextCount}`)));
    setIndex(0);
    setFlipped(false);
  }

  function markKnew() {
    if (!currentId) return;
    setReviewPile((prev) => prev.filter((id) => id !== currentId));
    goTo(index + 1);
  }

  function markReview() {
    if (!currentId) return;
    setReviewPile((prev) => (prev.includes(currentId) ? prev : [...prev, currentId]));
    goTo(index + 1);
  }

  function replayReview() {
    setOrder(reviewPile);
    setReviewPile([]);
    setIndex(0);
    setFlipped(false);
    setDone(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      handleNext();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      handlePrev();
    } else if (e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();
      handleFlip();
    }
  }

  if (done || !current) {
    return (
      <div data-testid="flashcards-done" className="flex flex-col items-center gap-4 py-8 text-center">
        <p className="text-xl font-semibold text-foreground">{t.cardsDone}</p>
        {reviewPile.length > 0 && (
          <Button type="button" data-testid="flashcards-replay-review" onClick={replayReview}>
            {t.cardReplayReview} ({reviewPile.length})
          </Button>
        )}
      </div>
    );
  }

  const inReview = reviewPile.includes(current.id);

  return (
    <div data-testid="quiz-flashcards" className="flex flex-col items-center gap-4">
      <div className="flex w-full max-w-xl items-center justify-between">
        <span data-testid="flashcards-progress" className={SINGLE_CARD_META}>
          {index + 1} / {total}
        </span>
        <Button type="button" variant="outline" size="sm" data-testid="flashcards-shuffle" onClick={handleShuffle}>
          {t.cardShuffle}
        </Button>
      </div>

      <div
        role="button"
        tabIndex={0}
        aria-pressed={flipped}
        aria-label={t.cardFlipHint}
        data-testid="flashcard"
        onClick={handleFlip}
        onKeyDown={handleKeyDown}
        className="w-full max-w-xl cursor-pointer rounded-[26px] [perspective:1000px] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <div
          data-testid="flashcard-inner"
          data-flipped={flipped}
          // ONE grid cell for both faces (`[grid-area:1/1]` below), never
          // `absolute inset-0` over a fixed `min-h-*`: the card then grows
          // to its taller face, so a prompt image plus the prompt never
          // spill out of a box sized for text alone.
          className={cn(
            'grid min-h-64 w-full [transform-style:preserve-3d] transition-transform duration-500 motion-reduce:transition-none motion-reduce:duration-0',
            flipped && '[transform:rotateY(180deg)]',
          )}
        >
          <div
            data-testid="flashcard-front"
            aria-hidden={flipped}
            className={cn(SINGLE_CARD, 'max-w-none [grid-area:1/1] [backface-visibility:hidden]')}
          >
            <PromptImage image={promptImages?.[current.id]} />
            <p className={SINGLE_CARD_PROMPT}>{current.prompt}</p>
          </div>
          <div
            data-testid="flashcard-back"
            aria-hidden={!flipped}
            // The answer side: the same card, tinted the kit's pale sky
            // (the shared answer-well tone, `singleCard.tsx`'s own
            // `AnswerReveal`) so a flipped card reads as "the other side"
            // at a glance — never the old yellow accent wash.
            className={cn(
              SINGLE_CARD,
              'max-w-none bg-pop-sky/15 [grid-area:1/1] [backface-visibility:hidden] [transform:rotateY(180deg)]',
            )}
          >
            <p className={SINGLE_CARD_PROMPT}>{current.answer}</p>
            {current.explanation && <AnswerExplanation text={current.explanation} />}
          </div>
        </div>
      </div>

      <SpeakButton text={current.prompt} lang={lang} />

      <div className="flex w-full flex-wrap items-center justify-center gap-2">
        <Button
          type="button"
          variant="outline"
          data-testid="flashcards-prev"
          onClick={handlePrev}
          disabled={index === 0}
          className="h-11 sm:h-8"
        >
          {t.cardPrev}
        </Button>
        <Button
          type="button"
          variant={inReview ? 'default' : 'outline'}
          data-testid="flashcards-review"
          onClick={markReview}
          className="h-11 sm:h-8"
        >
          {t.cardReviewIt}
        </Button>
        <Button type="button" data-testid="flashcards-knew" onClick={markKnew} className="h-11 sm:h-8">
          {t.cardKnewIt}
        </Button>
        <Button
          type="button"
          variant="outline"
          data-testid="flashcards-next"
          onClick={handleNext}
          className="h-11 sm:h-8"
        >
          {t.cardNext}
        </Button>
      </div>
    </div>
  );
}
