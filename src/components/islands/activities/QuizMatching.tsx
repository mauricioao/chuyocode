/**
 * QuizMatching — "Parejas" (D1's matching game), the other alternate game a
 * `quiz` block's own questions can be replayed as (`gameModes.ts`'s
 * `deriveGameItems`). Two columns — prompts (left, authored order) and
 * shuffled answers (right) — select one from each side to attempt a pair;
 * a correct pair locks green, a wrong one flashes red and resets.
 *
 * SELF-CONTAINED, NOT WIRED INTO THE PAGE'S SCORE — same posture as
 * `QuizFlashcards`'s own header: a "Parejas" round is local component state,
 * gone on unmount, and never touches `quizResponses`/`quizResults`. The
 * page's Comprobar keeps grading Preguntas-mode answers only
 * (`ActivityPracticeIsland`'s own footer hint says so while this mode is
 * active).
 *
 * The right column is shuffled with `shuffleWithSeed` so the pairing is not
 * a positional giveaway; "Reiniciar" reshuffles it again (a fresh seed) so a
 * repeat play is not just memorized layout.
 */
import { useEffect, useMemo, useState } from 'react';
import { UI_LABELS, type Lang } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { formatElapsed, tick, TICK_MS } from '@/lib/exerciseStopwatch';
import { seedFromString, shuffleWithSeed, type GameItem } from '@/lib/activities/gameModes';

export interface QuizMatchingProps {
  lang: Lang;
  items: readonly GameItem[];
  /** Stable per-block seed (the block id) — `shuffleWithSeed`'s own input for the right column and "Reiniciar". */
  seed: string;
}

/** How long a wrong attempt stays flagged before both tiles reset (ms). */
const WRONG_FLASH_MS = 600;

type Selection = { side: 'prompt' | 'answer'; id: string } | null;

function shuffledRight(items: readonly GameItem[], seed: string, round: number): string[] {
  return shuffleWithSeed(
    items.map((item) => item.id),
    seedFromString(`${seed}:match:${round}`),
  );
}

export default function QuizMatching({ lang, items, seed }: QuizMatchingProps) {
  const t = UI_LABELS[lang].activities.gameModes;
  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  const [round, setRound] = useState(0);
  const [rightOrder, setRightOrder] = useState<string[]>(() => shuffledRight(items, seed, 0));
  const [selected, setSelected] = useState<Selection>(null);
  const [matched, setMatched] = useState<ReadonlySet<string>>(new Set());
  const [wrongPair, setWrongPair] = useState<{ promptId: string; answerId: string } | null>(null);
  const [elapsed, setElapsed] = useState(0);

  // A different block (or its own item list changed) — start a fresh round.
  useEffect(() => {
    setRound(0);
    setRightOrder(shuffledRight(items, seed, 0));
    setSelected(null);
    setMatched(new Set());
    setWrongPair(null);
    setElapsed(0);
    // Deliberately keyed on `items` alone, not `seed`: a different block
    // always brings a different item list too, so `items` changing already
    // covers every real navigation without re-running this on an unrelated
    // parent re-render.
  }, [items]);

  const total = items.length;
  const completed = total > 0 && matched.size === total;

  // The clock stops the moment every pair is locked — same one stop
  // condition `exerciseStopwatch.ts`'s own `shouldTick` uses, applied here
  // to "every pair matched" instead of "fully graded".
  useEffect(() => {
    if (completed) return;
    const id = setInterval(() => setElapsed(tick), TICK_MS);
    return () => clearInterval(id);
  }, [completed]);

  // A wrong attempt flashes both tiles red, then both reset on their own.
  useEffect(() => {
    if (!wrongPair) return;
    const id = setTimeout(() => setWrongPair(null), WRONG_FLASH_MS);
    return () => clearTimeout(id);
  }, [wrongPair]);

  function handleReset() {
    const nextRound = round + 1;
    setRound(nextRound);
    setRightOrder(shuffledRight(items, seed, nextRound));
    setSelected(null);
    setMatched(new Set());
    setWrongPair(null);
    setElapsed(0);
  }

  function handleTile(side: 'prompt' | 'answer', id: string) {
    if (matched.has(id) || wrongPair) return;

    if (!selected) {
      setSelected({ side, id });
      return;
    }
    if (selected.side === side) {
      setSelected(selected.id === id ? null : { side, id });
      return;
    }
    if (selected.id === id) {
      setMatched((prev) => new Set(prev).add(id));
      setSelected(null);
      return;
    }
    const promptId = side === 'prompt' ? id : selected.id;
    const answerId = side === 'answer' ? id : selected.id;
    setWrongPair({ promptId, answerId });
    setSelected(null);
  }

  function tileClass(side: 'prompt' | 'answer', id: string): string {
    const isMatched = matched.has(id);
    const isSelected = selected?.side === side && selected.id === id;
    const isWrong = (side === 'prompt' && wrongPair?.promptId === id) || (side === 'answer' && wrongPair?.answerId === id);
    return cn(
      'min-h-11 w-full rounded-md border-2 px-3 py-2.5 text-left text-sm font-medium transition-colors sm:text-base',
      isMatched && 'border-emerald-500 bg-emerald-500/10 text-emerald-300',
      isWrong && 'animate-pulse border-destructive bg-destructive/10 text-destructive motion-reduce:animate-none',
      !isMatched && !isWrong && isSelected && 'border-accent-ink bg-accent/10 text-zinc-100',
      !isMatched && !isWrong && !isSelected && 'border-border bg-surface-soft text-zinc-100 hover:border-accent-ink/60',
    );
  }

  if (total === 0) return null;

  return (
    <div data-testid="quiz-matching" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span data-testid="matching-pairs" className="tabular-nums">
          {t.matchPairs}: {matched.size} / {total}
        </span>
        <div className="flex items-center gap-3">
          <span data-testid="matching-timer" className="tabular-nums">
            {formatElapsed(elapsed)}
          </span>
          <Button type="button" variant="outline" size="sm" data-testid="matching-reset" onClick={handleReset}>
            {t.matchReset}
          </Button>
        </div>
      </div>

      {completed ? (
        <p data-testid="matching-completed" className="text-center text-lg font-medium text-emerald-300">
          {t.matchCompletedPrefix} {formatElapsed(elapsed)}!
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                data-testid={`matching-prompt-${item.id}`}
                disabled={matched.has(item.id)}
                onClick={() => handleTile('prompt', item.id)}
                className={tileClass('prompt', item.id)}
              >
                {item.prompt}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            {rightOrder.map((id) => {
              const item = byId.get(id);
              if (!item) return null;
              return (
                <button
                  key={id}
                  type="button"
                  data-testid={`matching-answer-${id}`}
                  disabled={matched.has(id)}
                  onClick={() => handleTile('answer', id)}
                  className={tileClass('answer', id)}
                >
                  {item.answer}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
