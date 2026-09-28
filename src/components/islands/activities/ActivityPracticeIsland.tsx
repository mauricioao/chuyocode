/**
 * ActivityPracticeIsland — the practice page's own interactive body
 * (`/[lang]/ingles/actividades/[id]`, PR D "Activities practice"; quiz
 * blocks ship in PR C "Preguntas (quiz) block"). Renders EVERY block in
 * order: a `worksheet` block through `WorksheetPracticePlayer` (zoom +
 * gradable inputs); a `quiz` block through {@link QuizBlockPractice} (every
 * question visible at once, via the same mechanic renderers `ExerciseIsland`
 * uses per step).
 *
 * ONE combined Comprobar/Reintentar pair for the WHOLE activity, not one per
 * block: worksheet zones AND quiz questions grade together into a single
 * score. `values`/`results` (worksheet zones) and `quizResponses`/
 * `quizResults` (quiz questions, keyed by block id since two quiz blocks may
 * mint the same slot id independently) all live here; `handleCheck` grades
 * both and folds them into one "N / M".
 *
 * Answers are NEVER stored — every piece of state above is plain component
 * state, gone the moment this island unmounts. Grading itself is delegated
 * entirely to the pure `src/lib/activities/grading.ts` (worksheet zones) and
 * `src/lib/exerciseGrading.ts` (quiz slots, routed through
 * `comparatorForRenderable` so a slot can only be graded by a mechanic that
 * was actually drawn — same rule `ExerciseIsland` follows); this component
 * only wires state to them and back.
 */
import { useCallback, useMemo, useState } from 'react';
import { UI_LABELS, type Lang } from '@/lib/i18n';
import { stopAllSpeech } from '@/lib/speech/useSpeech';
import type { Block, QuizBlock } from '@/lib/activities/blocks';
import { gradeZones, type GradableZone } from '@/lib/activities/grading';
import { check, type GradeResult } from '@/lib/exerciseGrading';
import { comparatorForRenderable } from '@/components/islands/mechanics/registry';
import type { ExerciseResponse } from '@/lib/exercisePayload';
import { Button } from '@/components/ui/button';
import WorksheetPracticePlayer from './WorksheetPracticePlayer';
import QuizBlockPractice from './QuizBlockPractice';

export interface ActivityPracticeIslandProps {
  lang: Lang;
  blocks: Block[];
  /** Resolves a stored `image.path` to a browser-loadable URL — same contract as the editor's own `resolveImageUrl`. */
  resolveImageUrl: (path: string) => string;
}

export default function ActivityPracticeIsland({ lang, blocks, resolveImageUrl }: ActivityPracticeIslandProps) {
  const t = UI_LABELS[lang].activities.practice;

  const [values, setValues] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, boolean> | undefined>(undefined);
  const [quizResponses, setQuizResponses] = useState<Record<string, ExerciseResponse>>({});
  const [quizResults, setQuizResults] = useState<Record<string, GradeResult> | undefined>(undefined);

  const quizBlocks = useMemo(() => blocks.filter((b): b is QuizBlock => b.type === 'quiz'), [blocks]);

  // Every worksheet zone across every block, flattened — one half of the
  // grading unit for the page's single combined score.
  const allZones = useMemo<GradableZone[]>(
    () =>
      blocks.flatMap((block) =>
        block.type === 'worksheet'
          ? block.zones.map((zone) => ({ id: zone.id, kind: zone.kind, answers: zone.answers }))
          : [],
      ),
    [blocks],
  );

  // Every quiz slot whose mechanic actually has a shipped renderer — the
  // other half. Static per block (independent of the learner's answers), so
  // it is the denominator both before and after grading.
  const quizGradableCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const block of quizBlocks) {
      counts[block.id] = block.payload.slots.filter((slot) => comparatorForRenderable(slot.input) !== null).length;
    }
    return counts;
  }, [quizBlocks]);
  const quizGradableTotal = useMemo(
    () => Object.values(quizGradableCounts).reduce((sum, n) => sum + n, 0),
    [quizGradableCounts],
  );

  const handleChange = useCallback((zoneId: string, value: string) => {
    setValues((prev) => ({ ...prev, [zoneId]: value }));
  }, []);

  const handleQuizChange = useCallback((blockId: string, slotId: string, value: string[]) => {
    setQuizResponses((prev) => ({
      ...prev,
      [blockId]: { ...(prev[blockId] ?? {}), [slotId]: value },
    }));
  }, []);

  const handleCheck = useCallback(() => {
    stopAllSpeech();
    const summary = gradeZones(allZones, values);
    const nextResults: Record<string, boolean> = {};
    for (const result of summary.results) nextResults[result.zoneId] = result.correct;
    setResults(nextResults);

    const nextQuizResults: Record<string, GradeResult> = {};
    for (const block of quizBlocks) {
      nextQuizResults[block.id] = check(block.payload, quizResponses[block.id] ?? {}, comparatorForRenderable);
    }
    setQuizResults(nextQuizResults);
  }, [allZones, values, quizBlocks, quizResponses]);

  const handleRetry = useCallback(() => {
    stopAllSpeech();
    setValues({});
    setResults(undefined);
    setQuizResponses({});
    setQuizResults(undefined);
  }, []);

  const graded = results !== undefined;
  const worksheetCorrectCount = graded ? allZones.filter((zone) => results![zone.id]).length : 0;
  const quizCorrectCount = quizResults
    ? Object.values(quizResults).reduce(
        (sum, result) => sum + Object.values(result.slots).filter((outcome) => outcome === 'correct').length,
        0,
      )
    : 0;
  const correctCount = worksheetCorrectCount + quizCorrectCount;
  const totalCount = allZones.length + quizGradableTotal;
  const hasGradableContent = totalCount > 0;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-6">
        {blocks.map((block) =>
          block.type === 'worksheet' ? (
            <WorksheetPracticePlayer
              key={block.id}
              lang={lang}
              block={block}
              imageUrl={resolveImageUrl(block.image.path)}
              practice={{ values, onChange: handleChange, results, disabled: graded }}
            />
          ) : (
            <QuizBlockPractice
              key={block.id}
              lang={lang}
              block={block}
              response={quizResponses[block.id] ?? {}}
              onChange={(slotId, value) => handleQuizChange(block.id, slotId, value)}
              outcomes={quizResults?.[block.id]?.slots}
              disabled={graded}
            />
          ),
        )}
      </div>

      {hasGradableContent && (
        <div
          data-testid="practice-controls"
          // Mobile layout pass: below `lg`, the bar respects the home
          // indicator/gesture-bar safe area (`env(safe-area-inset-bottom)`)
          // AND clears the global `ScrollToTop` button — which floats
          // `fixed right-4 bottom-6` (see that component's own header) and
          // would otherwise sit right on top of this card's right edge on a
          // narrow screen. `lg:bottom-4` restores the exact original
          // desktop position, unchanged.
          className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-20 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card/95 p-4 shadow-lg backdrop-blur-sm lg:bottom-4"
        >
          {!graded ? (
            <Button type="button" data-testid="practice-check-button" onClick={handleCheck}>
              {t.check}
            </Button>
          ) : (
            <Button type="button" variant="outline" data-testid="practice-retry-button" onClick={handleRetry}>
              {t.retry}
            </Button>
          )}
          {graded && (
            <p data-testid="practice-score" aria-live="polite" className="text-sm font-medium text-foreground">
              {t.score}: {correctCount} / {totalCount}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
