/**
 * ActivityPracticeIsland — the practice page's own interactive body
 * (`/[lang]/ingles/actividades/[id]`, PR D "Activities practice"; rebuilt as
 * the "practice player" in the "practice player redesign" pass). Owns the
 * card's TAB BAR, the currently active block's body, and the footer's
 * Comprobar/Reintentar/score row — the header above it (back button, title,
 * meta line, heart/report) is static Astro markup, owned by `[id].astro`.
 *
 * ONE BLOCK VISIBLE AT A TIME (redesign, replacing the old "every block
 * stacked" layout): a tab per block — its own name or a positional default,
 * a Phosphor icon for its type, and — once graded — its OWN "N/M" result,
 * a green check once every gradable item in it is correct. The tab bar is
 * hidden entirely with a single block (nothing to switch between). Only the
 * ACTIVE block's body actually mounts (`key={activeTab}` on the wrapper),
 * which is also what gives the worksheet camera "starts in FIT … on every
 * tab switch" for free — see `WorksheetPracticePlayer.tsx`'s own header.
 *
 * ANSWERS SURVIVE A TAB SWITCH regardless: `values`/`results` (worksheet
 * zones) and `quizResponses`/`quizResults` (quiz questions) all live HERE,
 * never inside whichever block body happens to be mounted — switching tabs
 * only unmounts/remounts the VIEW, not this state.
 *
 * ONE combined Comprobar/Reintentar pair for the WHOLE activity, not one per
 * block/tab — unchanged from before this redesign: worksheet zones AND quiz
 * questions grade together into a single score, now shown in a plain FOOTER
 * row (never a sticky/floating bar — the whole card already fits the
 * screen at `lg:`, so nothing needs to float above scrolled-past content).
 *
 * ZOOM CONTROLS LIVE IN THE TAB BAR'S OWN RIGHT SIDE (owner-approved
 * design), only for a worksheet tab: `zoomSlot` is a plain DOM node this
 * component renders as part of its tab row; `WorksheetPracticePlayer`
 * PORTALS its own −/Ajustar/+/Mano buttons into it — see that file's own
 * header for why camera ownership stays there instead of here.
 *
 * Grading itself is delegated entirely to the pure `src/lib/activities/grading.ts`
 * (worksheet zones) and `src/lib/exerciseGrading.ts` (quiz slots, routed
 * through `comparatorForRenderable` so a slot can only be graded by a
 * mechanic that was actually drawn — same rule `ExerciseIsland` follows);
 * this component only wires state to them and back. Answers are NEVER
 * stored — every piece of state below is plain component state, gone the
 * moment this island unmounts.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { ImageIcon } from '@phosphor-icons/react/dist/ssr/Image';
import { ListChecksIcon } from '@phosphor-icons/react/dist/ssr/ListChecks';
import { CheckCircleIcon } from '@phosphor-icons/react/dist/ssr/CheckCircle';
import { UI_LABELS, type Lang } from '@/lib/i18n';
import { stopAllSpeech } from '@/lib/speech/useSpeech';
import type { Block, QuizBlock, WorksheetBlock } from '@/lib/activities/blocks';
import { imagePreviewUrl } from '@/lib/activities/paths';
import { gradeZones, type GradableZone } from '@/lib/activities/grading';
import { check, type GradeResult } from '@/lib/exerciseGrading';
import { comparatorForRenderable } from '@/components/islands/mechanics/registry';
import type { ExerciseResponse } from '@/lib/exercisePayload';
import type { GameMode } from '@/lib/activities/gameModes';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import WorksheetPracticePlayer from './WorksheetPracticePlayer';
import QuizBlockPractice from './QuizBlockPractice';

export interface ActivityPracticeIslandProps {
  lang: Lang;
  blocks: Block[];
}

/** This tab's own default name — the author's own `block.name`, or a positional/type default (owner-approved design: "Hoja N" for a worksheet, "Preguntas" for a quiz). */
function tabLabel(
  block: Block,
  worksheetPosition: number,
  t: { blockDefaultNamePrefix: string; quizLabel: string },
): string {
  if (block.name) return block.name;
  return block.type === 'worksheet' ? `${t.blockDefaultNamePrefix} ${worksheetPosition + 1}` : t.quizLabel;
}

interface TabResult {
  correct: number;
  total: number;
}

export default function ActivityPracticeIsland({ lang, blocks }: ActivityPracticeIslandProps) {
  const t = UI_LABELS[lang].activities.practice;
  const tEditor = UI_LABELS[lang].activities.editor;
  const tGameModes = UI_LABELS[lang].activities.gameModes;

  const [values, setValues] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, boolean> | undefined>(undefined);
  const [quizResponses, setQuizResponses] = useState<Record<string, ExerciseResponse>>({});
  const [quizResults, setQuizResults] = useState<Record<string, GradeResult> | undefined>(undefined);
  // D1 "Una actividad, muchos juegos": each quiz block's own active game mode
  // (Preguntas/Tarjetas/Parejas), remembered per block id while this island
  // stays mounted — never persisted, and never reset by Reintentar (a mode
  // choice is not an answer). Missing entry = `'quiz'`, same default
  // `QuizBlockPractice`'s own `mode` prop already falls back to.
  const [quizModes, setQuizModes] = useState<Record<string, GameMode>>({});
  const [activeTab, setActiveTab] = useState<string>(() => blocks[0]?.id ?? '');
  const [zoomSlot, setZoomSlot] = useState<HTMLDivElement | null>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

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

  const handleQuizModeChange = useCallback((blockId: string, mode: GameMode) => {
    setQuizModes((prev) => ({ ...prev, [blockId]: mode }));
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

  // Each block's OWN result, once graded — undefined before Comprobar (no
  // tab badge yet) or for a block with nothing gradable in it at all.
  const tabResult = useCallback(
    (block: Block): TabResult | undefined => {
      if (block.type === 'worksheet') {
        if (!results || block.zones.length === 0) return undefined;
        return { correct: block.zones.filter((z) => results[z.id]).length, total: block.zones.length };
      }
      const total = quizGradableCounts[block.id] ?? 0;
      const blockResult = quizResults?.[block.id];
      if (!blockResult || total === 0) return undefined;
      const correct = Object.values(blockResult.slots).filter((o) => o === 'correct').length;
      return { correct, total };
    },
    [results, quizResults, quizGradableCounts],
  );

  const activeBlock = blocks.find((b) => b.id === activeTab) ?? blocks[0];
  const showTabs = blocks.length > 1;
  const showControlRow = showTabs || activeBlock?.type === 'worksheet';
  // D1: while the active tab's quiz block sits in Tarjetas/Parejas, Comprobar
  // still only grades that block's Preguntas-mode answers — the footer says
  // so rather than leaving the learner to guess why an ungraded game did
  // nothing when they pressed it.
  const activeQuizModeHint =
    activeBlock?.type === 'quiz' && (quizModes[activeBlock.id] ?? 'quiz') !== 'quiz';

  const activateByIndex = useCallback(
    (index: number) => {
      const target = blocks[index];
      if (!target) return;
      setActiveTab(target.id);
      tabRefs.current[target.id]?.focus();
    },
    [blocks],
  );

  const handleTabKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        activateByIndex((index + 1) % blocks.length);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        activateByIndex((index - 1 + blocks.length) % blocks.length);
      } else if (e.key === 'Home') {
        e.preventDefault();
        activateByIndex(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        activateByIndex(blocks.length - 1);
      }
    },
    [activateByIndex, blocks.length],
  );

  let worksheetPosition = -1;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {showControlRow && (
        <div
          data-testid="practice-tab-row"
          role={showTabs ? 'tablist' : undefined}
          aria-label={showTabs ? tEditor.blockIndexTitle : undefined}
          className="flex flex-none flex-wrap items-center gap-1 border-b border-border px-2 py-1"
        >
          {showTabs &&
            blocks.map((block, index) => {
              if (block.type === 'worksheet') worksheetPosition += 1;
              const isActive = block.id === activeTab;
              const label = tabLabel(block, worksheetPosition, tEditor);
              const result = tabResult(block);
              const allCorrect = result !== undefined && result.total > 0 && result.correct === result.total;
              const Icon = block.type === 'worksheet' ? ImageIcon : ListChecksIcon;

              return (
                <button
                  key={block.id}
                  type="button"
                  role="tab"
                  id={`practice-tab-${block.id}`}
                  data-testid={`practice-tab-${block.id}`}
                  aria-selected={isActive}
                  aria-controls={`practice-tabpanel-${block.id}`}
                  tabIndex={isActive ? 0 : -1}
                  ref={(el) => {
                    tabRefs.current[block.id] = el;
                  }}
                  onClick={() => setActiveTab(block.id)}
                  onKeyDown={(e) => handleTabKeyDown(e, index)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  <Icon aria-hidden="true" />
                  <span>{label}</span>
                  {result && (
                    <span
                      data-testid={`practice-tab-result-${block.id}`}
                      className={cn('flex items-center gap-0.5 tabular-nums', allCorrect && 'text-emerald-400')}
                    >
                      {result.correct}/{result.total}
                      {allCorrect && <CheckCircleIcon aria-hidden="true" weight="fill" />}
                    </span>
                  )}
                </button>
              );
            })}

          {activeBlock?.type === 'worksheet' && (
            <div
              ref={setZoomSlot}
              data-testid="worksheet-zoom-slot"
              className="ml-auto hidden shrink-0 items-center gap-1 lg:flex"
            />
          )}
        </div>
      )}

      {activeBlock && (
        <div
          key={activeBlock.id}
          role={showTabs ? 'tabpanel' : undefined}
          id={showTabs ? `practice-tabpanel-${activeBlock.id}` : undefined}
          aria-labelledby={showTabs ? `practice-tab-${activeBlock.id}` : undefined}
          className="flex min-h-0 flex-1 flex-col"
        >
          {activeBlock.type === 'worksheet' ? (
            <WorksheetPracticePlayer
              lang={lang}
              block={activeBlock as WorksheetBlock}
              imageUrl={imagePreviewUrl((activeBlock as WorksheetBlock).image.path)}
              practice={{ values, onChange: handleChange, results, disabled: graded }}
              toolbarSlot={zoomSlot}
            />
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <QuizBlockPractice
                lang={lang}
                block={activeBlock as QuizBlock}
                response={quizResponses[activeBlock.id] ?? {}}
                onChange={(slotId, value) => handleQuizChange(activeBlock.id, slotId, value)}
                outcomes={quizResults?.[activeBlock.id]?.slots}
                disabled={graded}
                mode={quizModes[activeBlock.id] ?? 'quiz'}
                onModeChange={(mode) => handleQuizModeChange(activeBlock.id, mode)}
              />
            </div>
          )}
        </div>
      )}

      {hasGradableContent && (
        <div
          data-testid="practice-footer"
          className="flex flex-none flex-wrap items-center justify-between gap-3 border-t border-border p-3"
        >
          {graded ? (
            <p data-testid="practice-score" aria-live="polite" className="text-sm font-medium text-foreground">
              {t.score}: {correctCount} / {totalCount}
            </p>
          ) : activeQuizModeHint ? (
            <p data-testid="practice-quiz-mode-hint" className="text-sm text-muted-foreground">
              {tGameModes.gradesQuizModeHint}
            </p>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            {!graded ? (
              <Button type="button" data-testid="practice-check-button" onClick={handleCheck}>
                {t.check}
              </Button>
            ) : (
              <Button type="button" variant="outline" data-testid="practice-retry-button" onClick={handleRetry}>
                {t.retry}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
