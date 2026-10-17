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
import type { PromptImageRef } from '@/lib/activities/blocks';
import PromptImage from '@/components/islands/mechanics/PromptImage';
import { stageChipColorClass } from '@/components/islands/mechanics/chip';
import { GradeMark, type GradeState } from '@/components/islands/mechanics/CheckMark';
import { SINGLE_CARD, SINGLE_CARD_META, SINGLE_CARD_PROMPT } from '@/components/islands/mechanics/singleCard';

export interface QuizTrueFalseProps {
  lang: Lang;
  /** Already derived through `deriveTrueFalseItems` by the caller. */
  items: readonly TrueFalseItem[];
  /** This block's own `promptImages` map (owner decision 2026-10-16 follow-up), keyed by slot id — `TrueFalseItem.id` IS the slot id, same as every other `GameItem`-derived mode. `undefined` = no question images authored, the common case. Display-only; see `PromptImage`'s own header. */
  promptImages?: Record<string, PromptImageRef>;
}

/** How long the tapped/correct feedback stays up before auto-advancing (ms). */
const ADVANCE_MS = 900;

type Feedback = 'idle' | 'correct' | 'wrong';

export default function QuizTrueFalse({ lang, items, promptImages }: QuizTrueFalseProps) {
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
        <p data-testid="truefalse-score" className="text-xl font-semibold text-foreground tabular-nums">
          {t.tfScorePrefix}: {score} / {total} — {formatElapsed(elapsed)}
        </p>
        <Button type="button" data-testid="truefalse-play-again" onClick={handlePlayAgain}>
          {t.tfPlayAgain}
        </Button>
      </div>
    );
  }

  if (!current) return null;

  /** Which ✓/✕ badge (if any) a button shows — the same `GradeMark` the drag games use. */
  function buttonGrade(isTrueButton: boolean): GradeState | undefined {
    if (feedback === 'idle' || given === undefined) return undefined;
    if (isTrueButton === current!.isTrue) return 'correct';
    if (isTrueButton === given) return 'wrong';
    return undefined;
  }

  // The two answers are the drag games' own colour capsules
  // (`chip.ts`'s `stageChipColorClass`, by position: "Verdadero" first,
  // "Falso" second — never green/red for true/false, those stay reserved
  // for the ✓/✕ feedback below). Feedback swaps the fill for the
  // semantic tint plus the shared ✓/✕ badge; `disabled:opacity-100` keeps
  // a graded button fully legible while both are disabled for the read
  // pause, and only the uninvolved one fades.
  function buttonClass(isTrueButton: boolean): string {
    const base = cn(stageChipColorClass(isTrueButton ? 0 : 1), 'relative min-w-36 disabled:cursor-default sm:min-w-44');
    const grade = buttonGrade(isTrueButton);
    if (feedback === 'idle' || given === undefined) {
      return cn(base, 'transition-[translate] hover:-translate-y-0.5 motion-reduce:transition-none');
    }
    if (grade === 'correct') {
      return cn(
        base,
        'border-2 border-success-strong bg-success-strong/10 text-success-strong-foreground shadow-none disabled:opacity-100',
      );
    }
    if (grade === 'wrong') {
      return cn(base, 'border-2 border-destructive bg-destructive/10 text-destructive shadow-none disabled:opacity-100');
    }
    return cn(base, 'disabled:opacity-40');
  }

  return (
    <div data-testid="quiz-truefalse" className="flex flex-col items-center gap-4">
      <div aria-live="polite" role="status" className="sr-only" data-testid="truefalse-live-region">
        {feedback === 'correct' ? t.tfCorrect : feedback === 'wrong' ? t.tfWrong : ''}
      </div>

      <div className="flex w-full max-w-xl items-center justify-between">
        <span data-testid="truefalse-counter" className={SINGLE_CARD_META}>
          {t.tfCounterPrefix} {index + 1} {t.tfCounterOf} {total}
        </span>
        <span data-testid="truefalse-timer" className={SINGLE_CARD_META}>
          {formatElapsed(elapsed)}
        </span>
      </div>

      <div className={cn(SINGLE_CARD, 'min-h-48')}>
        <PromptImage image={promptImages?.[current.id]} />
        <p data-testid="truefalse-statement" className={SINGLE_CARD_PROMPT}>
          {current.statement}
        </p>
      </div>

      {/* Plain `<button>`s, not the shared `Button`: the Inglés button kit
          (`global.css`) pins every `data-slot="button"` to a 34px action
          capsule, and these two are answer CHIPS, sized like the drag
          games' own (`chip.ts`). */}
      <div className="flex w-full max-w-xl flex-wrap items-center justify-center gap-4">
        <button
          type="button"
          data-testid="truefalse-true"
          disabled={feedback !== 'idle'}
          onClick={() => handleAnswer(true)}
          className={buttonClass(true)}
        >
          {t.tfTrue}
          {buttonGrade(true) && <GradeMark state={buttonGrade(true)!} />}
        </button>
        <button
          type="button"
          data-testid="truefalse-false"
          disabled={feedback !== 'idle'}
          onClick={() => handleAnswer(false)}
          className={buttonClass(false)}
        >
          {t.tfFalse}
          {buttonGrade(false) && <GradeMark state={buttonGrade(false)!} />}
        </button>
      </div>
    </div>
  );
}
