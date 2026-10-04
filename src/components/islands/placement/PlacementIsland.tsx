/**
 * PlacementIsland — the whole client-side placement-test draft: an intro
 * screen (start, or "welcome back" with the last result), one question per
 * screen with a progress indicator, and a result screen with the estimated
 * level, the recommended level, and a per-level breakdown.
 *
 * EVERYTHING RUNS ON THE DEVICE. `@/content/placement/items` is a static
 * import (no fetch), scoring is pure (`@/lib/placement/scoring`), and the
 * only persistence is `@/lib/placement/storage` (`localStorage`, try/catch
 * end to end). This component never calls `fetch` — there is nothing to send
 * to the server, Supabase included.
 *
 * HYDRATION-SAFE BY CONSTRUCTION: the previously-stored result is read ONLY
 * inside a mount `useEffect`, never in a `useState` initializer or during
 * render, so the server render and the client's first paint both start at
 * "no previous result" — same rule this repo's own `useFirstRunTips` and
 * `AventuraIsland` panel prefs already follow (a React #418 hydration
 * mismatch bit this codebase before).
 */
import { useEffect, useState } from 'react';
import type { Lang } from '@/lib/i18n';
import { UI_LABELS } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { TaskProgress } from '@/components/ui/task-progress';
import { Emoji } from '@/components/ui/Emoji';
import { PLACEMENT_ITEMS } from '@/content/placement/items';
import { scorePlacement, type PlacementAnswers, type PlacementResult } from '@/lib/placement/scoring';
import {
  readStoredPlacementResult,
  writeStoredPlacementResult,
  type StoredPlacementResult,
} from '@/lib/placement/storage';

export interface PlacementIslandProps {
  lang: Lang;
}

type Phase = 'intro' | 'quiz' | 'result';

const TOTAL = PLACEMENT_ITEMS.length;

/** `YYYY-MM-DD` from an ISO timestamp — deterministic and locale-free, unlike `toLocaleDateString`. */
function formatDate(iso: string): string {
  return iso.slice(0, 10);
}

const ACTION_BUTTON = 'h-11 px-6'; // >= 44px tap target (mobile gotcha, this repo's own house rule).

export default function PlacementIsland({ lang }: PlacementIslandProps) {
  const t = UI_LABELS[lang].english.placement;
  const levels = UI_LABELS[lang].english.levels;

  const [phase, setPhase] = useState<Phase>('intro');
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Record<string, number | null>>({});
  const [result, setResult] = useState<PlacementResult | null>(null);
  const [previousResult, setPreviousResult] = useState<StoredPlacementResult | null>(null);

  // Mount-only read — see this file's own header on why this cannot move
  // into a `useState` initializer.
  useEffect(() => {
    setPreviousResult(readStoredPlacementResult());
  }, []);

  function startQuiz() {
    setIndex(0);
    setAnswers({});
    setSelected(null);
    setResult(null);
    setPhase('quiz');
  }

  function commitAnswer(answer: number | null) {
    const item = PLACEMENT_ITEMS[index]!;
    const nextAnswers: PlacementAnswers = { ...answers, [item.id]: answer };
    setAnswers(nextAnswers);

    if (index === TOTAL - 1) {
      const scored = scorePlacement(PLACEMENT_ITEMS, nextAnswers);
      const stored: StoredPlacementResult = {
        version: 1,
        estimatedLevel: scored.estimatedLevel,
        recommendedLevel: scored.recommendedLevel,
        takenAt: new Date().toISOString(),
      };
      writeStoredPlacementResult(stored);
      setPreviousResult(stored);
      setResult(scored);
      setPhase('result');
      return;
    }

    setIndex(index + 1);
    setSelected(null);
  }

  // ---------------------------------------------------------------- intro
  if (phase === 'intro') {
    return (
      <div
        data-testid="placement-intro"
        className="flex flex-col items-start gap-4 rounded-lg border border-border bg-card p-6"
      >
        <h2 className="text-xl font-semibold text-foreground">{t.intro.title}</h2>
        <p className="text-muted-foreground">{t.intro.description}</p>

        {previousResult && (
          <p data-testid="placement-last-result" className="text-sm text-muted-foreground">
            {t.intro.lastResultPrefix}{' '}
            <span className="font-semibold text-foreground">
              {previousResult.estimatedLevel
                ? `${previousResult.estimatedLevel} · ${levels[previousResult.estimatedLevel]}`
                : t.result.estimatedNone}
            </span>{' '}
            ({formatDate(previousResult.takenAt)})
          </p>
        )}

        <Button type="button" className={ACTION_BUTTON} data-testid="placement-start" onClick={startQuiz}>
          {previousResult ? t.result.retry : t.intro.start}
        </Button>
      </div>
    );
  }

  // ----------------------------------------------------------------- quiz
  if (phase === 'quiz') {
    const item = PLACEMENT_ITEMS[index]!;

    return (
      <div className="flex flex-col gap-6">
        <TaskProgress
          label={`${t.progressPrefix} ${index + 1} ${t.progressOf} ${TOTAL}`}
          progress={index / TOTAL}
        />

        <fieldset className="flex flex-col gap-4" data-testid="placement-question">
          <legend data-testid="placement-prompt" className="text-lg font-semibold text-foreground">
            {item.prompt}
          </legend>

          <RadioGroup
            value={selected === null ? '' : String(selected)}
            onValueChange={(next) => setSelected(Number(next))}
            aria-label={item.prompt}
          >
            {item.options.map((option, i) => {
              const inputId = `placement-option-${item.id}-${i}`;
              return (
                <div
                  key={inputId}
                  className={cn(
                    'flex min-h-11 items-center gap-3 rounded-lg border border-border bg-surface-soft p-3',
                    'has-data-[state=checked]:border-accent-ink has-data-[state=checked]:bg-accent/10',
                  )}
                >
                  <RadioGroupItem id={inputId} value={String(i)} data-testid={`placement-option-${i}`} />
                  <Label htmlFor={inputId} className="flex-1 cursor-pointer text-foreground">
                    {option}
                  </Label>
                </div>
              );
            })}
          </RadioGroup>
        </fieldset>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            className={ACTION_BUTTON}
            data-testid="placement-dontknow"
            onClick={() => commitAnswer(null)}
          >
            {t.dontKnow}
          </Button>
          <Button
            type="button"
            className={ACTION_BUTTON}
            data-testid="placement-next"
            disabled={selected === null}
            onClick={() => {
              if (selected === null) return;
              commitAnswer(selected);
            }}
          >
            {t.next}
          </Button>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------- result
  const r = result!;
  const allPassed = r.breakdown.every((entry) => entry.passed);
  const practiceHref = `/${lang}/ingles/propuestos?nivel=${r.recommendedLevel}`;

  return (
    <div
      data-testid="placement-result"
      className="flex flex-col gap-6 rounded-lg border border-border bg-card p-6"
    >
      <div className="flex items-center gap-3">
        <Emoji name={r.estimatedLevel ? 'trophy' : 'thinking-face'} size={48} />
        <h2 className="text-xl font-semibold text-foreground">{t.result.title}</h2>
      </div>

      <div>
        <p className="text-sm text-muted-foreground">{t.result.estimatedLabel}</p>
        <p data-testid="placement-result-level" className="text-2xl font-bold text-accent-ink">
          {r.estimatedLevel ? `${r.estimatedLevel} · ${levels[r.estimatedLevel]}` : t.result.estimatedNone}
        </p>
      </div>

      <div>
        <p className="text-sm text-muted-foreground">{t.result.recommendedLabel}</p>
        <p data-testid="placement-result-recommended" className="text-lg font-semibold text-foreground">
          {allPassed ? t.result.recommendedAboveB2 : `${r.recommendedLevel} · ${levels[r.recommendedLevel]}`}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-foreground">{t.result.breakdownTitle}</h3>
        <ul className="flex flex-col gap-1">
          {r.breakdown.map((entry) => (
            <li
              key={entry.level}
              data-testid={`placement-breakdown-${entry.level}`}
              className={cn(
                'flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm',
                entry.passed ? 'text-success' : 'text-muted-foreground',
              )}
            >
              <span>
                {entry.level} · {levels[entry.level]}
              </span>
              <span className="tabular-nums">
                {entry.correct}/{entry.total}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button type="button" className={ACTION_BUTTON} data-testid="placement-retry" onClick={startQuiz}>
          {t.result.retry}
        </Button>
        <Button asChild variant="outline" className={ACTION_BUTTON}>
          <a href={practiceHref} data-testid="placement-practice-link">
            {t.result.practiceCta}
          </a>
        </Button>
      </div>
    </div>
  );
}
