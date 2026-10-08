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
 * questions grade together into a single score, shown in a plain FOOTER row
 * (never a sticky/floating bar — the whole card already fits the screen at
 * `lg:`, so nothing needs to float above scrolled-past content).
 *
 * ZOOM CONTROLS LIVE IN THE FOOTER'S OWN LEFT SIDE (owner feedback: they used
 * to live in the tab row, which forced an empty tab bar to stay mounted for a
 * single-block activity just to host them), only for a worksheet tab:
 * `zoomSlot` is a plain DOM node this component renders as part of its
 * footer; `WorksheetPracticePlayer` PORTALS its own −/Ajustar/+/Mano buttons
 * into it — see that file's own header for why camera ownership stays there
 * instead of here. The slot itself stays mounted across every tab (as long as
 * SOME block in the activity is a worksheet) so switching to/from a quiz tab
 * never jumps the footer's height — it simply has nothing portaled into it
 * while a quiz tab is active, since only the active worksheet's own
 * `WorksheetPracticePlayer` ever portals into it.
 *
 * Grading itself is delegated entirely to the pure `src/lib/activities/grading.ts`
 * (worksheet zones) and `src/lib/exerciseGrading.ts` (quiz slots, routed
 * through `comparatorForRenderable` so a slot can only be graded by a
 * mechanic that was actually drawn — same rule `ExerciseIsland` follows);
 * this component only wires state to them and back. Answers are NEVER
 * stored — every piece of state below is plain component state, gone the
 * moment this island unmounts.
 *
 * "MODO ENFOQUE" (full-screen exercise mode, owner spec 2026-10-07): a
 * SEPARATE, borderless view of the same active block — no window chrome, no
 * tab row, just the exercise and a minimal bottom bar (page nav + the final
 * Comprobar). Toggled from a plain `<button>` this component does not
 * render itself (`[id].astro`'s own title-bar actions, a different
 * hydration island — wired by id, see `FOCUS_MODE_TOGGLE_ID`). Portaled
 * straight to `document.body` (see that block's own header for why), using
 * the real Fullscreen API where available and a `position: fixed` overlay
 * otherwise. Shares every bit of state with the normal view (`values`,
 * `quizResponses`, `results`, `activeTab`) — nothing resets on enter/exit.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ImageIcon } from '@phosphor-icons/react/dist/ssr/Image';
import { ListChecksIcon } from '@phosphor-icons/react/dist/ssr/ListChecks';
import { CheckCircleIcon } from '@phosphor-icons/react/dist/ssr/CheckCircle';
import { CaretLeftIcon } from '@phosphor-icons/react/dist/ssr/CaretLeft';
import { CaretRightIcon } from '@phosphor-icons/react/dist/ssr/CaretRight';
import { XIcon } from '@phosphor-icons/react/dist/ssr/X';
import { UI_LABELS, type Lang } from '@/lib/i18n';
import { stopAllSpeech } from '@/lib/speech/useSpeech';
import type { Block, ImageRef, QuizBlock, WorksheetBlock } from '@/lib/activities/blocks';
import { imagePreviewUrl, audioPreviewUrl } from '@/lib/activities/paths';
import { gradeZones, type GradableZone } from '@/lib/activities/grading';
import { check, type GradeResult } from '@/lib/exerciseGrading';
import { comparatorForRenderable } from '@/components/islands/mechanics/registry';
import type { ExerciseResponse } from '@/lib/exercisePayload';
import { deriveGameItems, initialGameMode, SELF_CHECKING_GAME_MODES, type GameMode } from '@/lib/activities/gameModes';
import { Button } from '@/components/ui/button';
import { Emoji } from '@/components/ui/Emoji';
import { cn } from '@/lib/utils';
import { ROW_PADDING_X } from '@/lib/ui/layout';
import { STAGE_CONTAINER_SIZE } from '@/components/islands/mechanics/scale';
import WorksheetPracticePlayer from './WorksheetPracticePlayer';
import QuizBlockPractice from './QuizBlockPractice';

export interface ActivityPracticeIslandProps {
  lang: Lang;
  blocks: Block[];
}

/**
 * "Modo enfoque" button's own id (owner spec 2026-10-07, full-screen
 * exercise mode) — a plain, server-rendered `<button>` in `[id].astro`'s
 * title-bar actions, a SEPARATE hydration island from this one. Wired here
 * by `id`, same thin-DOM posture `ActivityEditorIsland.tsx`'s own
 * `DESK_WINDOW_TITLE_ID` sync uses — two islands cannot otherwise share one
 * React state.
 */
const FOCUS_MODE_TOGGLE_ID = 'activity-focus-mode-toggle';

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
  // (Básico/Tarjetas/Parejas), remembered per block id while this island
  // stays mounted — never persisted, and never reset by Reintentar (a mode
  // choice is not an answer). A missing entry falls back to the block's own
  // TEMPLATE default (`quizModeFor` below, template plumbing build item 2)
  // rather than a hardcoded `'quiz'`, so a "Une las parejas" activity opens
  // straight into Parejas when eligible.
  const [quizModes, setQuizModes] = useState<Record<string, GameMode>>({});
  const [activeTab, setActiveTab] = useState<string>(() => blocks[0]?.id ?? '');
  const [zoomSlot, setZoomSlot] = useState<HTMLDivElement | null>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const quizBlocks = useMemo(() => blocks.filter((b): b is QuizBlock => b.type === 'quiz'), [blocks]);
  // Whether the footer's zoom slot needs to exist at all — see this file's
  // own header on why it stays mounted across every tab once true, rather
  // than only while a worksheet tab happens to be active.
  const hasWorksheetBlock = useMemo(() => blocks.some((block) => block.type === 'worksheet'), [blocks]);

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

  /** This block's current (or, before any switch, its template's own default) game mode. */
  const quizModeFor = useCallback(
    (block: QuizBlock): GameMode =>
      quizModes[block.id] ?? initialGameMode(block.template, deriveGameItems(block.payload), block.payload),
    [quizModes],
  );

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

  // ONE "COMPROBAR" (build item 2): a self-checking game (today: `match`)
  // already has its own board-level Comprobar/Reintentar — showing the
  // page-level combined pair too, right next to it, is confusing and (for a
  // match-only activity) grades nothing real anyway, since the Básico
  // inputs it would check are never even rendered while that mode is
  // active. When EVERY quiz block in the activity sits in a self-checking
  // mode AND there is no worksheet content to grade, the combined footer
  // has nothing useful left to do, so it hides entirely and each block's
  // own board is the only Comprobar on screen. Any other mix (a worksheet
  // present, or at least one quiz block still in Básico/another
  // page-graded mode) keeps the footer exactly as before.
  const allQuizBlocksSelfChecking = useMemo(
    () => quizBlocks.length > 0 && quizBlocks.every((block) => SELF_CHECKING_GAME_MODES.has(quizModeFor(block))),
    [quizBlocks, quizModeFor],
  );
  const showCombinedFooter = hasGradableContent && !(allZones.length === 0 && allQuizBlocksSelfChecking);

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
  // D1: while the active tab's quiz block sits in Tarjetas/Parejas, Comprobar
  // still only grades that block's Básico-mode answers — the footer says so
  // rather than leaving the learner to guess why an ungraded game did
  // nothing when they pressed it. Also true from the very first render of a
  // "Une las parejas" activity, which starts in Parejas (its own template
  // default), not Básico.
  const activeQuizModeHint = activeBlock?.type === 'quiz' && quizModeFor(activeBlock as QuizBlock) !== 'quiz';

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

  // "Modo enfoque" — full-screen exercise mode (owner spec 2026-10-07:
  // "quiero uno de pantalla completa que solo muestre el ejercicio sin
  // bordes y abajo los botones mínimos para pasar página... y con su
  // comprobación final").
  //
  // THE HOST IS A DEDICATED NODE APPENDED STRAIGHT TO `document.body`, never
  // nested inside this island's own tree — two real constraints forced this:
  //   1. The window can be DRAGGED (`deskWindowDrag.ts`), which sets a CSS
  //      `translate` on it; `translate`/`transform`/`scale`/`rotate`, whenever
  //      not `none`, establish a new containing block for any `position:
  //      fixed` DESCENDANT — so a `fixed inset-0` div nested inside a dragged
  //      window would only ever cover that window's own box, never the real
  //      viewport, breaking "pantalla completa" the moment the window had
  //      been moved even once.
  //   2. `Element.requestFullscreen()` itself has no such problem, but using
  //      the SAME host for both the real Fullscreen API AND its fallback
  //      keeps one code path instead of two.
  // A real `<WorksheetPracticePlayer>`/`<QuizBlockPractice>` instance is
  // mounted FRESH here (not the same instance portaled over from the normal
  // view) — simpler than keeping one instance alive across two possible
  // parents, and the only thing that resets is a worksheet's own camera
  // pan/zoom (arguably desirable: entering a bigger viewport, it should
  // re-fit rather than keep a zoom level calibrated for the small window).
  // The answers themselves (`values`/`quizResponses`) and results
  // never reset — they already live in THIS component's own state, read by
  // both the normal and focus-mode views alike (owner requirement: "las
  // respuestas... son el mismo estado que la vista normal").
  const [focusModeActive, setFocusModeActive] = useState(false);
  const [focusModeHost] = useState<HTMLDivElement | null>(() =>
    typeof document === 'undefined' ? null : document.createElement('div'),
  );

  useEffect(() => {
    if (!focusModeHost) return undefined;
    document.body.appendChild(focusModeHost);
    return () => {
      document.body.removeChild(focusModeHost);
    };
  }, [focusModeHost]);

  const exitFocusMode = useCallback(() => {
    if (focusModeHost && document.fullscreenElement === focusModeHost) {
      void document.exitFullscreen?.().catch(() => {
        // Nothing left to do — the CSS fallback below (`focusModeActive`
        // going false) still visually exits either way.
      });
    }
    setFocusModeActive(false);
  }, [focusModeHost]);

  const toggleFocusMode = useCallback(() => {
    if (focusModeActive) {
      exitFocusMode();
      return;
    }
    setFocusModeActive(true);
    if (focusModeHost && typeof focusModeHost.requestFullscreen === 'function') {
      // Best-effort: rejected inside e.g. an iframe with no
      // `allow="fullscreen"` (the next stage adds that attribute) — the
      // fixed-overlay CSS below still makes this look/behave full screen
      // either way, see this block's own header.
      void focusModeHost.requestFullscreen().catch(() => {});
    }
  }, [focusModeActive, focusModeHost]);

  // External exits this component did not itself trigger (the browser's own
  // fullscreen UI, or the OS) — keep the toggle button's `aria-pressed` and
  // this state in sync either way.
  useEffect(() => {
    if (!focusModeHost) return undefined;
    function onFullScreenChange() {
      if (document.fullscreenElement !== focusModeHost) setFocusModeActive(false);
    }
    document.addEventListener('fullscreenchange', onFullScreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullScreenChange);
  }, [focusModeHost]);

  // The title bar's own plain `<button>` (`[id].astro`) — a separate
  // hydration island, wired here by id (see `FOCUS_MODE_TOGGLE_ID`'s own
  // header).
  useEffect(() => {
    const button = document.getElementById(FOCUS_MODE_TOGGLE_ID);
    if (!button) return undefined;
    button.addEventListener('click', toggleFocusMode);
    return () => button.removeEventListener('click', toggleFocusMode);
  }, [toggleFocusMode]);

  useEffect(() => {
    const button = document.getElementById(FOCUS_MODE_TOGGLE_ID);
    button?.setAttribute('aria-pressed', String(focusModeActive));
  }, [focusModeActive]);

  const activeIndex = Math.max(
    0,
    blocks.findIndex((b) => b.id === activeTab),
  );
  const isLastPage = activeIndex === blocks.length - 1;

  // Esc (both the native exit AND the CSS fallback, which has no native exit
  // of its own to rely on) and ←/→ to change page — document-level so it
  // works no matter what currently has focus, EXCEPT inside an editable
  // field (a worksheet/quiz text answer): arrow keys there must keep moving
  // the text cursor, never the page.
  useEffect(() => {
    if (!focusModeActive) return undefined;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        exitFocusMode();
        return;
      }
      const target = event.target;
      const isEditable =
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (isEditable || blocks.length <= 1) return;
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        activateByIndex((activeIndex + 1) % blocks.length);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        activateByIndex((activeIndex - 1 + blocks.length) % blocks.length);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [focusModeActive, exitFocusMode, activateByIndex, activeIndex, blocks.length]);

  let worksheetPosition = -1;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {showTabs && (
        <div
          data-testid="practice-tab-row"
          role="tablist"
          aria-label={tEditor.blockIndexTitle}
          // `ROW_PADDING_X`: the same horizontal inset as this card's own
          // header row (`[id].astro`) and its footer below — before this
          // pass this row alone used `px-2`, one size off both neighbors.
          className={cn('flex flex-none flex-wrap items-center gap-1 border-b border-border py-2', ROW_PADDING_X)}
        >
          {blocks.map((block, index) => {
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
                    className={cn('flex items-center gap-0.5 tabular-nums', allCorrect && 'text-success')}
                  >
                    {result.correct}/{result.total}
                    {allCorrect && <CheckCircleIcon aria-hidden="true" weight="fill" />}
                  </span>
                )}
              </button>
            );
          })}
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
              // A live activity's worksheet always has a real image
              // ('submit' mode never parses one without it) — see
              // `WorksheetPracticePlayer.tsx`'s own `SubmittedWorksheetBlock`.
              block={activeBlock as WorksheetBlock & { image: ImageRef }}
              imageUrl={imagePreviewUrl((activeBlock as WorksheetBlock & { image: ImageRef }).image.path)}
              practice={{ values, onChange: handleChange, results, disabled: graded }}
              toolbarSlot={zoomSlot}
              resolveAudioUrl={audioPreviewUrl}
            />
          ) : (
            // `flex flex-col` (visual-polish-2 pass, owner bug: a big-stage
            // game's own "Comprobar" was unreachable without scrolling the
            // WHOLE page in the normal, non-"modo enfoque" view): without
            // it, this div never becomes a flex container of its own, so
            // `QuizBlockPractice`'s `min-h-0 flex-1` on a big-stage game
            // below has no flex parent to size against and silently does
            // nothing — the game then renders at its full natural height
            // instead of shrinking to fit, and overflow lands on THIS div's
            // `overflow-y-auto` instead of the game's own internal one,
            // scrolling its chrome (tabs, Reiniciar) out of view along with
            // it. "Modo enfoque"'s own stage wrapper already carries `flex
            // flex-col` for exactly this reason — this view is the one that
            // was missing it.
            <div className={cn('flex min-h-0 flex-1 flex-col overflow-y-auto p-3', STAGE_CONTAINER_SIZE)}>
              <QuizBlockPractice
                lang={lang}
                block={activeBlock as QuizBlock}
                response={quizResponses[activeBlock.id] ?? {}}
                onChange={(slotId, value) => handleQuizChange(activeBlock.id, slotId, value)}
                outcomes={quizResults?.[activeBlock.id]?.slots}
                disabled={graded}
                mode={quizModeFor(activeBlock as QuizBlock)}
                onModeChange={(mode) => handleQuizModeChange(activeBlock.id, mode)}
              />
            </div>
          )}
        </div>
      )}

      {showCombinedFooter && (
        <div
          data-testid="practice-footer"
          className={cn('flex flex-none flex-wrap items-center gap-3 border-t border-border py-3', ROW_PADDING_X)}
        >
          {/* Zoom, left — only for worksheet tabs, but mounted for the whole
              activity's lifetime (see this file's own header) so toggling
              to/from a quiz tab never changes the footer's own height. */}
          {hasWorksheetBlock && (
            <div
              ref={setZoomSlot}
              data-testid="worksheet-zoom-slot"
              className="hidden shrink-0 items-center gap-1 lg:flex"
            />
          )}

          {/* Score + Comprobar/Reintentar, right (owner feedback: "same row
              as Comprobar/Reintentar, which stay on the right; the score
              sits … next to the buttons"). */}
          <div className="ml-auto flex flex-wrap items-center gap-3">
            {graded ? (
              <p
                data-testid="practice-score"
                aria-live="polite"
                className="flex items-center gap-2 text-sm font-medium text-foreground"
              >
                <span>
                  {t.score}: {correctCount} / {totalCount}
                </span>
                {/* Emoji sticker accent (visual-identity decision, 2026-10-04):
                    party popper once every gradable item is correct, a
                    thinking face otherwise — purely decorative, next to the
                    already-accessible score text above, so grading/copy stay
                    unchanged. Hidden entirely when there is nothing gradable
                    (totalCount === 0 never reaches this branch regardless,
                    since `hasGradableContent` already gates the whole footer). */}
                {totalCount > 0 && (
                  <Emoji
                    data-testid="practice-result-emoji"
                    name={correctCount === totalCount ? 'party-popper' : 'thinking-face'}
                    size={32}
                  />
                )}
              </p>
            ) : activeQuizModeHint ? (
              <p data-testid="practice-quiz-mode-hint" className="text-sm text-muted-foreground">
                {tGameModes.gradesQuizModeHint}
              </p>
            ) : null}
            <div className="flex items-center gap-2">
              {!graded ? (
                <Button type="button" data-testid="practice-check-button" className="min-h-11" onClick={handleCheck}>
                  {t.check}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  data-testid="practice-retry-button"
                  className="min-h-11"
                  onClick={handleRetry}
                >
                  {t.retry}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* "Modo enfoque" (full-screen exercise mode) — portaled straight to
          `document.body`, never rendered in place; see this file's own
          header on `focusModeHost` for why. Calm and borderless on purpose
          (owner spec: "sin bordes... mantenlo simple, sin decoración
          nueva") — no transition/animation of its own either way, so there
          is nothing extra `prefers-reduced-motion: reduce` needs to turn
          off here. */}
      {focusModeActive &&
        focusModeHost &&
        activeBlock &&
        createPortal(
          <div
            data-testid="practice-focus-mode"
            className="fixed inset-0 z-[80] flex flex-col bg-background"
          >
            <button
              type="button"
              data-testid="practice-focus-mode-exit"
              aria-label={t.focusModeExit}
              onClick={exitFocusMode}
              className="absolute right-3 top-3 z-10 inline-flex size-9 items-center justify-center rounded-full border border-border bg-background/80 text-muted-foreground backdrop-blur transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <XIcon aria-hidden="true" size={18} />
            </button>

            <div className={cn('flex min-h-0 flex-1 flex-col items-stretch justify-center overflow-y-auto p-4 lg:p-10', STAGE_CONTAINER_SIZE)}>
              {activeBlock.type === 'worksheet' ? (
                <WorksheetPracticePlayer
                  lang={lang}
                  block={activeBlock as WorksheetBlock & { image: ImageRef }}
                  imageUrl={imagePreviewUrl((activeBlock as WorksheetBlock & { image: ImageRef }).image.path)}
                  practice={{ values, onChange: handleChange, results, disabled: graded }}
                  toolbarSlot={null}
                  resolveAudioUrl={audioPreviewUrl}
                />
              ) : (
                <QuizBlockPractice
                  lang={lang}
                  block={activeBlock as QuizBlock}
                  response={quizResponses[activeBlock.id] ?? {}}
                  onChange={(slotId, value) => handleQuizChange(activeBlock.id, slotId, value)}
                  outcomes={quizResults?.[activeBlock.id]?.slots}
                  disabled={graded}
                  mode={quizModeFor(activeBlock as QuizBlock)}
                  onModeChange={(mode) => handleQuizModeChange(activeBlock.id, mode)}
                />
              )}
            </div>

            {/* Minimal bottom bar (owner spec): page nav only when there is
                more than one page, the final Comprobar/Reintentar only on
                the last page — always, for a single-page activity. */}
            <div
              data-testid="practice-focus-mode-bar"
              className={cn('flex flex-none flex-wrap items-center gap-3 border-t border-border py-3', ROW_PADDING_X)}
            >
              {blocks.length > 1 && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    data-testid="practice-focus-mode-prev"
                    aria-label={t.focusModePrev}
                    onClick={() => activateByIndex((activeIndex - 1 + blocks.length) % blocks.length)}
                    className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <CaretLeftIcon aria-hidden="true" size={18} />
                  </button>
                  <span data-testid="practice-focus-mode-page" className="min-w-[3.5rem] text-center text-sm tabular-nums text-muted-foreground">
                    {activeIndex + 1} / {blocks.length}
                  </span>
                  <button
                    type="button"
                    data-testid="practice-focus-mode-next"
                    aria-label={t.focusModeNext}
                    onClick={() => activateByIndex((activeIndex + 1) % blocks.length)}
                    className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <CaretRightIcon aria-hidden="true" size={18} />
                  </button>
                </div>
              )}

              {showCombinedFooter && isLastPage && (
                <div className="ml-auto flex flex-wrap items-center gap-3">
                  {graded && (
                    <p data-testid="practice-focus-mode-score" className="text-sm font-medium text-foreground">
                      {t.score}: {correctCount} / {totalCount}
                    </p>
                  )}
                  {!graded ? (
                    <Button type="button" data-testid="practice-focus-mode-check" className="min-h-11" onClick={handleCheck}>
                      {t.check}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      data-testid="practice-focus-mode-retry"
                      className="min-h-11"
                      onClick={handleRetry}
                    >
                      {t.retry}
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>,
          focusModeHost,
        )}
    </div>
  );
}
