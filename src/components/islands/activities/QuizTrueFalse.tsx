/**
 * QuizTrueFalse — "Verdadero o falso" (batch 1's Wordwall "True or false"),
 * one of the alternate games a `quiz` block's own questions can be replayed
 * as. Only slots with BOTH a gap to fill AND a pool option to use as a wrong
 * filler survive `gameModes.ts`'s `deriveTrueFalseItems` (this component
 * trusts its caller already derived them — see `QuizBlockPractice`); a
 * statement is the slot's own label with that gap filled by either its
 * correct answer or a random wrong option, seeded 50/50.
 *
 * One statement at a time: tap "Verdadero"/"Falso", get immediate feedback
 * (both buttons recolor — the TAPPED one and, on a miss, the actually-correct
 * one too), then auto-advance after a short read pause. A stopwatch (the
 * SAME `exerciseStopwatch.ts` primitives `QuizMatching` already uses) runs
 * until every statement is answered, then the final score+time screen shows.
 *
 * SELF-CONTAINED, NOT WIRED INTO THE PAGE'S SCORE — same posture as every
 * sibling in this file's family, even though this mode itself keeps an
 * internal score: that score is this ROUND's, never `quizResponses`/
 * `quizResults`.
 */
import { useEffect, useState } from 'react';
import { UI_LABELS, type Lang } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { formatElapsed, tick, TICK_MS } from '@/lib/exerciseStopwatch';
import type { TrueFalseItem } from '@/lib/activities/gameModes';

export interface QuizTrueFalseProps {
  lang: Lang;
  /** Already derived through `deriveTrueFalseItems` by the caller. */
  items: readonly TrueFalseItem[];
}

/** How long the tapped/correct feedback stays up before auto-advancing (ms). */
const ADVANCE_MS = 900;

type Feedback = 'idle' | 'correct' | 'wrong';

export default function QuizTrueFalse({ lang, items }: QuizTrueFalseProps) {
  const t = UI_LABELS[lang].activities.gameModes;

  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState<Feedback>('idle');
  const [given, setGiven] = useState<boolean | undefined>(undefined);
  const [elapsed, setElapsed] = useState(0);

  const total = items.length;
  const current = items[index];
  const completed = total > 0 && index >= total;

  // A different block (or its own eligible-item list changed) — start over.
  useEffect(() => {
    setIndex(0);
    setScore(0);
    setFeedback('idle');
    setGiven(undefined);
    setElapsed(0);
  }, [items]);

  // Same one stop condition `QuizMatching` already uses: the clock runs
  // until every statement is answered.
  useEffect(() => {
    if (completed || total === 0) return;
    const id = setInterval(() => setElapsed(tick), TICK_MS);
    return () => clearInterval(id);
  }, [completed, total]);

  // Feedback auto-advances to the next statement after a short read pause.
  useEffect(() => {
    if (feedback === 'idle') return;
    const id = setTimeout(() => {
      setFeedback('idle');
      setGiven(undefined);
      setIndex((prev) => prev + 1);
    }, ADVANCE_MS);
    return () => clearTimeout(id);
  }, [feedback]);

  function handleAnswer(answerTrue: boolean) {
    if (feedback !== 'idle' || !current) return;
    const isCorrect = answerTrue === current.isTrue;
    if (isCorrect) setScore((prev) => prev + 1);
    setGiven(answerTrue);
    setFeedback(isCorrect ? 'correct' : 'wrong');
  }

  function handlePlayAgain() {
    setIndex(0);
    setScore(0);
    setFeedback('idle');
    setGiven(undefined);
    setElapsed(0);
  }

  if (total === 0) return null;

  if (completed) {
    return (
      <div data-testid="truefalse-done" className="flex flex-col items-center gap-3 py-8 text-center">
        <p data-testid="truefalse-score" className="text-lg font-medium text-foreground">
          {t.tfScorePrefix}: {score} / {total} — {formatElapsed(elapsed)}
        </p>
        <Button type="button" data-testid="truefalse-play-again" onClick={handlePlayAgain}>
          {t.tfPlayAgain}
        </Button>
      </div>
    );
  }

  if (!current) return null;

  function buttonClass(isTrueButton: boolean): string {
    if (feedback === 'idle' || given === undefined) {
      return 'border-border bg-surface-soft text-foreground hover:border-accent-ink/60';
    }
    const isCorrectAnswer = isTrueButton === current!.isTrue;
    const isTappedButton = isTrueButton === given;
    if (isCorrectAnswer) return 'border-success-strong bg-success-strong/10 text-success-strong-foreground';
    if (isTappedButton) return 'border-destructive bg-destructive/10 text-destructive';
    return 'border-border bg-surface-soft text-foreground opacity-60';
  }

  return (
    <div data-testid="quiz-truefalse" className="flex flex-col items-center gap-4">
      <div aria-live="polite" role="status" className="sr-only" data-testid="truefalse-live-region">
        {feedback === 'correct' ? t.tfCorrect : feedback === 'wrong' ? t.tfWrong : ''}
      </div>

      <div className="flex w-full max-w-md items-center justify-between text-sm text-muted-foreground">
        <span data-testid="truefalse-counter" className="tabular-nums">
          {t.tfCounterPrefix} {index + 1} {t.tfCounterOf} {total}
        </span>
        <span data-testid="truefalse-timer" className="tabular-nums">
          {formatElapsed(elapsed)}
        </span>
      </div>

      <p
        data-testid="truefalse-statement"
        className="w-full max-w-md rounded-lg border-2 border-border bg-surface-soft p-6 text-center text-lg font-semibold text-foreground"
      >
        {current.statement}
      </p>

      <div className="flex w-full max-w-md items-center justify-center gap-3">
        <Button
          type="button"
          variant="outline"
          data-testid="truefalse-true"
          disabled={feedback !== 'idle'}
          onClick={() => handleAnswer(true)}
          className={cn('h-11 flex-1 border-2 sm:h-8', buttonClass(true))}
        >
          {t.tfTrue}
        </Button>
        <Button
          type="button"
          variant="outline"
          data-testid="truefalse-false"
          disabled={feedback !== 'idle'}
          onClick={() => handleAnswer(false)}
          className={cn('h-11 flex-1 border-2 sm:h-8', buttonClass(false))}
        >
          {t.tfFalse}
        </Button>
      </div>
    </div>
  );
}
