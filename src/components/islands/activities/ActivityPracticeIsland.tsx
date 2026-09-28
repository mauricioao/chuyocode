/**
 * ActivityPracticeIsland — the practice page's own interactive body
 * (`/[lang]/ingles/actividades/[id]`, PR D "Activities practice"). Renders
 * EVERY block in order: a `worksheet` block through `WorksheetPracticePlayer`
 * (zoom + gradable inputs); a `quiz` block as a "Próximamente"/"Coming soon"
 * placeholder — quiz players are PR C, not built here.
 *
 * ONE combined Comprobar/Reintentar pair for the WHOLE activity, not one per
 * worksheet block: the answer state (`values`) and the graded state
 * (`results`) both live here, flattened across every worksheet zone on the
 * page, so "7 / 10" is the score across every worksheet the activity has,
 * exactly as the task describes it ("grades every zone... shows the score").
 *
 * Answers are NEVER stored — `values`/`results` are plain component state,
 * gone the moment this island unmounts. Grading itself is delegated
 * entirely to the pure `src/lib/activities/grading.ts` (its own thorough
 * tests cover every comparison rule); this component only wires state to
 * it and back.
 */
import { useCallback, useMemo, useState } from 'react';
import { UI_LABELS, type Lang } from '@/lib/i18n';
import type { Block } from '@/lib/activities/blocks';
import { gradeZones, type GradableZone } from '@/lib/activities/grading';
import { Button } from '@/components/ui/button';
import WorksheetPracticePlayer from './WorksheetPracticePlayer';

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

  // Every worksheet zone across every block, flattened — the grading unit
  // for the page's single combined score.
  const allZones = useMemo<GradableZone[]>(
    () =>
      blocks.flatMap((block) =>
        block.type === 'worksheet'
          ? block.zones.map((zone) => ({ id: zone.id, kind: zone.kind, answers: zone.answers }))
          : [],
      ),
    [blocks],
  );

  const handleChange = useCallback((zoneId: string, value: string) => {
    setValues((prev) => ({ ...prev, [zoneId]: value }));
  }, []);

  const handleCheck = useCallback(() => {
    const summary = gradeZones(allZones, values);
    const nextResults: Record<string, boolean> = {};
    for (const result of summary.results) nextResults[result.zoneId] = result.correct;
    setResults(nextResults);
  }, [allZones, values]);

  const handleRetry = useCallback(() => {
    setValues({});
    setResults(undefined);
  }, []);

  const graded = results !== undefined;
  const correctCount = graded ? allZones.filter((zone) => results![zone.id]).length : 0;
  const hasGradableContent = allZones.length > 0;

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
            <div
              key={block.id}
              data-testid={`quiz-coming-soon-${block.id}`}
              className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border p-8 text-center"
            >
              <span className="text-lg font-semibold text-zinc-200">{t.quizComingSoonTitle}</span>
              <p className="text-sm text-zinc-400">{t.quizComingSoonBody}</p>
            </div>
          ),
        )}
      </div>

      {hasGradableContent && (
        <div
          data-testid="practice-controls"
          className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card/95 p-4 shadow-lg backdrop-blur-sm"
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
              {t.score}: {correctCount} / {allZones.length}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
