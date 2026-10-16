/**
 * PresentationIsland — Presentation mode's one and only island, mounted
 * BOTH at `/[lang]/ingles/actividades/[id]/presentar` (the real route) AND,
 * full-screen, inside the editor's own "Ver como presentación" overlay
 * (`ActivityEditorIsland.tsx`, sprint week 3) — see `onExit`'s own doc below
 * for the one behavior difference between those two hosts.
 *
 * Teachers project this on a 16:9 screen and drive it from the SAME wireless
 * presenter they already use for slides (PageDown/PageUp), so the whole
 * surface is built around that one constraint: every "next" press either
 * reveals something or advances — never both, and never nothing — so a
 * presenter who never touches the keyboard can still run the entire class
 * (section 6, `presentationReducer.ts`'s own header).
 *
 * THE VIRTUAL STAGE (`fitStage.ts`): every slide is authored once, in FIXED
 * 1920x1080 pixels, then the whole stage is scaled+letterboxed to fit
 * whatever the teacher's actual screen reports — the exact `transform:
 * translate(...) scale(...)` shape `WorksheetZoneEditor.tsx`'s own camera
 * already uses, just without panning. The fit is measured off a REAL
 * element via `ResizeObserver` inside `useLayoutEffect`, never read during
 * the initial render/state initializer (React #418 —
 * `src/testSupport/hydrationHarness.tsx`'s own header): the first paint
 * (server AND client, before hydration) always uses the neutral `{ scale:
 * 1, offsetX: 0, offsetY: 0 }` default, corrected the instant the real
 * viewport is measured.
 *
 * THE DECK (`presentationSlides.ts`'s own `buildPresentationSlides`): every
 * `quiz` question AND every presentable `worksheet` page's own
 * overview+zone slides, interleaved in exactly the activity's authored
 * block order — the worksheet zoom tour (sprint week 3) extending v1's
 * quiz-only deck. A worksheet slide renders in its OWN absolutely
 * positioned layer (`presentation-worksheet-viewport`, sized to the stage's
 * safe area) rather than the common flex-centered wrapper the cover/
 * question/summary slides share, since its own camera math
 * (`presentationCamera.ts`) already computes an exact pixel position/scale
 * within that box.
 *
 * NOTHING IS STORED, NO REQUEST IS EVER MADE (owner spec, privacy): every
 * prop below is already-fetched, serializable data; the deck, the reducer,
 * and the stage fit are all pure client state that disappears on reload.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { toast } from 'sonner';
import { CaretLeftIcon } from '@phosphor-icons/react/dist/ssr/CaretLeft';
import { CaretRightIcon } from '@phosphor-icons/react/dist/ssr/CaretRight';
import { ArrowsOutIcon } from '@phosphor-icons/react/dist/ssr/ArrowsOut';
import { ArrowsInIcon } from '@phosphor-icons/react/dist/ssr/ArrowsIn';
import { XIcon } from '@phosphor-icons/react/dist/ssr/X';
import { CheckCircleIcon } from '@phosphor-icons/react/dist/ssr/CheckCircle';
import { ListIcon } from '@phosphor-icons/react/dist/ssr/List';
import { ClockIcon } from '@phosphor-icons/react/dist/ssr/Clock';
import { SpeakerHighIcon } from '@phosphor-icons/react/dist/ssr/SpeakerHigh';
import { SpeakerSlashIcon } from '@phosphor-icons/react/dist/ssr/SpeakerSlash';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { Emoji } from '@/components/ui/Emoji';
import { UI_LABELS, type Lang } from '@/lib/i18n';
import type { Level } from '@/lib/exerciseTaxonomy';
import type { Block, Zone } from '@/lib/activities/blocks';
import { imagePreviewUrl, audioPreviewUrl } from '@/lib/activities/paths';
import { useAudioMarkerPlayback } from '@/lib/activities/useAudioMarkerPlayback';
import AudioMarkerButton from './AudioMarkerButton';
import { rotatedSize } from '@/lib/activities/canvasViewport';
import { zoneAnswerSummary, quizSlotAnswerSummary } from '@/lib/activities/moderationPreview';
import { getSlotItems, type Payload, type Slot, type PoolItem } from '@/lib/exercisePayload';
import { segmentForInput } from '@/lib/quizQuestionType';
import { useGameSound } from '@/lib/activities/gameSounds';
import { optionColorClass } from '@/components/islands/mechanics/palette';
import {
  createPresentationQuizState,
  presentationQuizReducer,
  isAnswerLocked,
  formatElapsed,
  type QuizAnswerState,
} from '@/lib/activities/presentationQuiz';
import {
  collectPresentationQuestions,
  collectPresentationWorksheets,
  buildPresentationSlides,
  revealableSlides,
  promptFontSize,
  type PresentationSlide,
} from '@/lib/activities/presentationSlides';
import {
  fitStage,
  STAGE_WIDTH,
  STAGE_HEIGHT,
  STAGE_SAFE_AREA_X,
  STAGE_SAFE_AREA_Y,
  STAGE_SAFE_WIDTH,
  STAGE_SAFE_HEIGHT,
  type StageFit,
} from '@/lib/activities/fitStage';
import { cameraForPage, cameraForZone, type Size } from '@/lib/activities/presentationCamera';
import {
  createPresentationState,
  presentationReducer,
  isCoverSlide,
  isContentSlide,
  isSummarySlide,
  slideNumber,
  slideProgress,
  type PresentationAction,
} from '@/lib/activities/presentationReducer';
import { cn } from '@/lib/utils';

export interface PresentationIslandProps {
  lang: Lang;
  title: string;
  level: Level | null;
  /** The activity's own blocks, in authored order — both quiz and worksheet; see this file's own header. */
  blocks: Block[];
  /**
   * The activity's own practice page — Esc, "Exit", and a tap on the
   * cover's QR all resolve here. Omitted for the editor's in-editor
   * preview, which has no real published URL to send the author to — see
   * {@link onExit}.
   */
  practiceUrl?: string;
  /** Server-rendered QR markup for {@link practiceUrl} (`@lib/qr`), or `null`/absent when it could not be encoded, or there is none (the editor preview). */
  qrSvg?: string | null;
  /**
   * The editor's own "Ver como presentación" overlay (sprint week 3): when
   * given, Esc/"Exit"/the cover's QR tap call THIS instead of navigating to
   * {@link practiceUrl} — the overlay has nothing to navigate away to, it
   * only needs to close itself and hand focus back to the button that
   * opened it (the caller's own job, not this component's).
   */
  onExit?: () => void;
  /**
   * N7 (join by QR from the start, "¡Listo!" next step): the final slide's
   * new PRIMARY action — the community catalog, filtered by this
   * activity's own level, SAME URL logic as the practice page's own
   * `nextActivityHref` (`[id].astro`'s own header). Omitted for the
   * editor's in-editor preview (no real published activity to send a
   * visitor browsing from), same gate `practiceUrl`/`qrSvg` already use.
   */
  nextActivityHref?: string;
  /**
   * Author preview (R1, owner decision 2026-10-12): the activity is not
   * published yet, so its join QR would 404 for a student — the `"Q"`
   * shortcut stays reachable (`toggleQrOverlay` below), it just shows THIS
   * message via toast instead of ever opening the overlay. Callers pass
   * `qrSvg={null}` alongside this — belt-and-suspenders, since the real code
   * must never even reach this component on that path. Omitted (every other
   * caller) keeps today's behaviour unchanged.
   */
  qrBlockedMessage?: string;
}

type PresentCopy = (typeof UI_LABELS)[Lang]['activities']['present'];

/** How long the control bar stays up after the last pointer move/focus, before fading out (section 6: "hides after ~2s"). */
const IDLE_HIDE_MS = 2000;

/**
 * ~1.2s after a multiple-choice tile is marked, before the deck auto-advances
 * (owner spec, P1 "live quiz rhythm" — UX-INGLES.md section 13). Instant
 * (`0`) under `prefers-reduced-motion`: the owner spec only asks to skip the
 * ANIMATION, the advance itself still happens — see `goNext`'s own caller
 * below.
 */
const AUTO_ADVANCE_MS = 1200;

/**
 * One color PER TILE POSITION, never per correctness (UI mockup,
 * `propuestas/presentacion/index.html`: "Colour goes by tile POSITION...
 * never by correctness; red and green are reserved for the marks") — now the
 * SHARED palette (`mechanics/palette.ts`'s own `optionColorClass`/
 * `TILE_COLOR_CLASSES`), the same six `--color-tile-*` kit tokens the
 * big-stage drag chips' own colour-filled variant uses
 * (`mechanics/chip.ts`'s `stageChipColorClass`) — one palette, not a second
 * copy that could drift.
 */

const CONTROL_BUTTON_CLASS =
  'flex h-11 w-11 flex-none items-center justify-center rounded-full text-foreground transition-colors hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-30';

/** The worksheet camera's own stage — the safe area inside the 1920x1080 stage, same box every other slide already keeps clear on every edge (`fitStage.ts`'s own header). */
const WORKSHEET_STAGE: Size = { width: STAGE_SAFE_WIDTH, height: STAGE_SAFE_HEIGHT };

/** ~400ms (owner spec) — the worksheet camera's own transition duration, instant under `prefers-reduced-motion`. */
const CAMERA_TRANSITION_MS = 400;

export default function PresentationIsland({
  lang,
  title,
  level,
  blocks,
  practiceUrl,
  qrSvg,
  onExit,
  nextActivityHref,
  qrBlockedMessage,
}: PresentationIslandProps) {
  const t = UI_LABELS[lang].activities.present;
  const levelLabels = UI_LABELS[lang].english.levels;

  const blockById = useMemo(() => new Map(blocks.map((block) => [block.id, block] as const)), [blocks]);
  const questions = useMemo(() => collectPresentationQuestions(blocks), [blocks]);
  const worksheetPages = useMemo(() => collectPresentationWorksheets(blocks), [blocks]);
  const slides = useMemo(() => buildPresentationSlides(blocks), [blocks]);
  const revealable = useMemo(() => revealableSlides(slides), [slides]);
  // The score only means something once the deck actually HAS a
  // multiple-choice question to score (owner review: a match/worksheet/
  // typed-only deck showing "✓ 0" forever is noise, not information) — gates
  // both the top-bar pill and the final slide's own stats line below.
  const hasChoiceQuestions = useMemo(
    () => slides.some((slide) => slide.kind === 'question' && segmentForInput(slide.slot.input) === 'choice'),
    [slides],
  );

  // Opens directly on the first content slide (owner feedback 2026-10-06,
  // replacing the old "always the cover/QR screen") — the cover's title/
  // level/count screen is still reachable via `prev` from there, it just is
  // not where a presentation BEGINS anymore. See `presentationReducer.ts`'s
  // own header on `startIndex`.
  const [state, dispatch] = useReducer(
    presentationReducer,
    slides.length,
    (slideCount): ReturnType<typeof presentationReducer> =>
      presentationReducer(createPresentationState(slideCount, revealable, true), { type: 'start' }),
  );
  const currentSlide: PresentationSlide | undefined = isContentSlide(state) ? slides[state.index - 1] : undefined;
  // The current question's own context image (owner decision 2026-10-16,
  // `blocks.ts`'s `QuizBlock.promptImages`) — DISPLAY-ONLY, resolved through
  // the SAME preview endpoint a worksheet image uses, but never through the
  // worksheet camera/zoom/stage layer: `QuestionSlide`'s own `media` prop
  // already renders it in the structural `presentation-question-media` slot
  // (`d0fb3ad`) that was left unwired until this field existed.
  const currentQuestionMedia = useMemo(() => {
    if (!currentSlide || currentSlide.kind !== 'question') return undefined;
    const block = blockById.get(currentSlide.blockId);
    const image = block?.type === 'quiz' ? block.promptImages?.[currentSlide.slot.id] : undefined;
    return image ? imagePreviewUrl(image.path) : undefined;
  }, [currentSlide, blockById]);
  // 0-based index into `quizState.answers`/`presentationQuiz.ts` — content
  // slide `state.index` (1-based) is `answers[state.index - 1]`. `-1` off a
  // content slide (the cover/summary), same sentinel `getSlotItems` et al.
  // treat as "nothing to look up".
  const contentSlideIndex = isContentSlide(state) ? state.index - 1 : -1;

  // ---- Live-quiz rhythm (P1, owner spec 2026-10-16): per-tile answer
  // status, score, elapsed timer, and the question-list menu —
  // `presentationQuiz.ts`'s own header on why this stays a SEPARATE reducer
  // from `presentationReducer` (navigation) rather than folding into it. ----
  const [quizState, quizDispatch] = useReducer(presentationQuizReducer, slides.length, createPresentationQuizState);
  const sound = useGameSound();

  // ---- Virtual stage fit (resize) — see this file's own header. ----
  const viewportRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<StageFit>({ scale: 1, offsetX: 0, offsetY: 0 });
  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return undefined;
    const reconcile = () => {
      const box = el.getBoundingClientRect();
      setFit(fitStage(box.width, box.height));
    };
    reconcile();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(reconcile);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // ---- prefers-reduced-motion (worksheet camera transitions) — the shared
  // hook (`usePrefersReducedMotion.ts`'s own header: "new callers should use
  // this shared copy"); `false` on the server and the client's first paint,
  // corrected once mounted, same React #418 posture as `fit` above. ----
  const reducedMotion = usePrefersReducedMotion();

  // ---- Preload every option/answer image AND every worksheet page's own
  // image once, on open (owner spec, section 4; worksheets added sprint
  // week 3). ----
  useEffect(() => {
    const urls = new Set<string>();
    for (const question of questions) {
      for (const item of getSlotItems(question.payload, question.slot)) {
        if (item.media) urls.add(item.media);
      }
    }
    for (const page of worksheetPages) {
      urls.add(imagePreviewUrl(page.image.path));
    }
    for (const url of urls) {
      const img = new Image();
      img.src = url;
    }
  }, [questions, worksheetPages]);

  // ---- Fullscreen (Fullscreen API, guarded — section 6). ----
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    function onFullscreenChange() {
      setIsFullscreen(Boolean(document.fullscreenElement));
    }
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      if (typeof document.exitFullscreen === 'function') void document.exitFullscreen();
      return;
    }
    const el = viewportRef.current;
    if (el && typeof el.requestFullscreen === 'function') void el.requestFullscreen();
  }, []);

  // ---- Control bar idle-hide (section 6: hides after ~2s idle, reappears on
  // movement/focus). `hasFocusRef` is what keeps a KEYBOARD user's focused
  // control from being hidden out from under them the moment the 2s timer
  // elapses — `scheduleHide`'s own timeout checks it, and
  // `handleControlsBlur` only re-arms that timeout once focus has actually
  // LEFT the whole bar (`relatedTarget` outside it), not just moved from one
  // control to the next inside it. ----
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasFocusRef = useRef(false);
  const scheduleHide = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      if (!hasFocusRef.current) setControlsVisible(false);
    }, IDLE_HIDE_MS);
  }, []);
  const showControls = useCallback(() => {
    setControlsVisible(true);
    scheduleHide();
  }, [scheduleHide]);
  const handleControlsFocus = useCallback(() => {
    hasFocusRef.current = true;
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
  }, []);
  const handleControlsBlur = useCallback(
    (event: React.FocusEvent<HTMLDivElement>) => {
      if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
      hasFocusRef.current = false;
      scheduleHide();
    },
    [scheduleHide],
  );
  useEffect(() => {
    showControls();
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
    // Runs once, on mount — `showControls` is stable (`useCallback` with no changing deps).
  }, [showControls]);

  // ---- Exit — the practice page normally (Esc, and the control bar's own
  // "Exit"), or `onExit` for the editor's in-editor preview (see this
  // file's own header on that prop). ----
  const exit = useCallback(() => {
    if (onExit) {
      onExit();
      return;
    }
    if (practiceUrl) window.location.assign(practiceUrl);
  }, [onExit, practiceUrl]);

  // ---- QR overlay, on demand (owner feedback 2026-10-06, replacing the old
  // cover-only QR): "Mostrar QR" in the control bar, and the same `Q`
  // shortcut from any slide — the QR is still exactly one press away, it
  // just no longer gates what the presentation opens on. Only offered when
  // there IS a QR to show (`qrSvg`, absent for the editor's in-editor
  // preview, which has no real published URL to encode — same gate the old
  // cover slide used). ----
  //
  // N7 (join by QR from the start, owner spec): OPEN BY DEFAULT on mount —
  // the very first slide a class sees is now also the "scan to join"
  // screen — whenever there is a QR to show at all. `closeQrOnAdvance`
  // below is what takes it back down once the presenter actually starts
  // teaching; the toggle/`Q` key keep working exactly as before afterwards,
  // this only changes the INITIAL state.
  const [qrOverlayOpen, setQrOverlayOpen] = useState(Boolean(qrSvg) && !qrBlockedMessage);
  /**
   * Author preview (R1): blocked message takes priority — a toast instead
   * of ever opening the overlay, regardless of whether `qrSvg` happens to be
   * set (callers always pass `qrSvg={null}` alongside it, see this file's
   * own `qrBlockedMessage` doc, but this is the belt to that suspenders).
   */
  const toggleQrOverlay = useCallback(() => {
    if (qrBlockedMessage) {
      toast(qrBlockedMessage);
      return;
    }
    if (!qrSvg) return;
    setQrOverlayOpen((open) => !open);
  }, [qrSvg, qrBlockedMessage]);
  /** Closes the QR overlay, if open — every "next" press runs this first (see `goNext`/the keyboard map below), regardless of whether that press reveals or actually advances the slide. A no-op once it is already closed, so later manual re-opens (toggle/`Q`) are never fought by this. */
  const closeQrOnAdvance = useCallback(() => {
    setQrOverlayOpen(false);
  }, []);
  const goNext = useCallback(() => {
    closeQrOnAdvance();
    dispatch({ type: 'next' });
  }, [closeQrOnAdvance]);

  // ---- "Volver a empezar" (owner spec): resets navigation AND the live-quiz
  // state (every answer, the score, the timer) together — see
  // `presentationQuiz.ts`'s own `restart` case. ----
  const restart = useCallback(() => {
    dispatch({ type: 'restart' });
    quizDispatch({ type: 'restart' });
  }, []);

  // ---- The question-list menu (bottom-left "☰", owner spec): opening it
  // pauses the timer (the ticking effect below reads `quizState.menuOpen`);
  // jumping closes it and hands navigation straight to
  // `presentationReducer`'s own `jumpTo`. ----
  const openMenu = useCallback(() => quizDispatch({ type: 'openMenu' }), []);
  const closeMenu = useCallback(() => quizDispatch({ type: 'closeMenu' }), []);
  const jumpToSlide = useCallback((index: number) => {
    dispatch({ type: 'jumpTo', index });
    quizDispatch({ type: 'closeMenu' });
  }, []);

  // ---- Elapsed timer (owner spec: "un cronómetro arriba a la izquierda"):
  // ticks once a second while ON a content slide (frozen on the cover/
  // summary — "counting up from the first question") AND the menu is
  // closed ("pausa el cronómetro mientras el menú está abierto"). The
  // reducer itself knows nothing about pausing — see `presentationQuiz.ts`'s
  // own header — this effect simply never dispatches `tick` while either
  // condition fails, and restarting the interval on every toggle never
  // resets `elapsedMs` (only the `'restart'` action does). ----
  const timerRunning = isContentSlide(state) && !quizState.menuOpen;
  useEffect(() => {
    if (!timerRunning) return undefined;
    const interval = setInterval(() => {
      quizDispatch({ type: 'tick', deltaMs: 1000 });
    }, 1000);
    return () => clearInterval(interval);
  }, [timerRunning]);

  // ---- Answering a multiple-choice tile (P1, "live quiz rhythm"): marks
  // the tapped tile, plays the correct/wrong cue, and (via the auto-advance
  // effect right below, which watches the resulting answer status) moves on
  // after `AUTO_ADVANCE_MS`. A no-op off a choice question slide, or once
  // that slide is already locked (one answer per question) — both the tile
  // buttons themselves (`disabled`) and the keyboard digit map guard this
  // too; this is the one place that actually decides "correct", so it stays
  // the single source of truth regardless of which guard let a stray call
  // through. ----
  const answerCurrentQuestion = useCallback(
    (optionIndex: number) => {
      if (contentSlideIndex < 0 || !currentSlide || currentSlide.kind !== 'question') return;
      const { payload, slot } = currentSlide;
      if (segmentForInput(slot.input) !== 'choice') return;
      if (isAnswerLocked(quizState, contentSlideIndex)) return;
      const item = getSlotItems(payload, slot)[optionIndex];
      if (!item) return;
      const correct = slot.answer.includes(item.id);
      quizDispatch({ type: 'answer', slideIndex: contentSlideIndex, optionIndex, correct });
      sound.play(correct ? 'correct' : 'wrong');
    },
    [contentSlideIndex, currentSlide, quizState, sound],
  );

  // ---- Auto-advance (owner spec: "~1.2s... no auto-advance under
  // prefers-reduced-motion? — still advance, just without animation" — so
  // the DELAY drops to 0, the advance itself never skips). Keyed on the
  // CURRENT content slide's own answer status: the moment it flips away
  // from 'unanswered', this schedules exactly one `goNext()`; if the
  // presenter manually navigates away before it fires (`state.index`
  // changing, which also changes `currentAnswerStatus`'s own identity),
  // the cleanup clears it — never a stray double-advance. ----
  const currentAnswerStatus: QuizAnswerState['status'] | undefined =
    contentSlideIndex >= 0 ? quizState.answers[contentSlideIndex]?.status : undefined;
  useEffect(() => {
    if (currentAnswerStatus !== 'correct' && currentAnswerStatus !== 'wrong') return undefined;
    const delay = reducedMotion ? 0 : AUTO_ADVANCE_MS;
    const timer = setTimeout(goNext, delay);
    return () => clearTimeout(timer);
  }, [currentAnswerStatus, contentSlideIndex, reducedMotion, goNext]);

  // ---- Keyboard map (section 6) — global: a presenter's clicker sends
  // PageDown/PageUp with focus wherever it happens to land, so this listens
  // on the window rather than a specific element. ----
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      showControls();

      // One of this island's OWN control-bar buttons/links already handles
      // its own Enter/Space activation NATIVELY; dispatching the same
      // shortcut again here would fire it twice (once from the native
      // click, once from this listener). Every other key below has no such
      // native activation to collide with.
      const tag = (event.target as HTMLElement | null)?.tagName;
      if ((event.key === 'Enter' && (tag === 'BUTTON' || tag === 'A')) || (event.key === ' ' && tag === 'BUTTON')) {
        return;
      }

      // The question-list menu is a lightweight overlay, not a slide of its
      // own (same posture as the QR overlay) — while it is open, every key
      // except Escape (closes it) is swallowed, so arrows/digits/clicker
      // presses never navigate or answer a question hidden behind it.
      if (quizState.menuOpen) {
        if (event.key === 'Escape') {
          event.preventDefault();
          closeMenu();
        }
        return;
      }

      // 1-9 picks that multiple-choice tile (P1, "live quiz rhythm") — a
      // no-op off a choice question slide, or once it is already answered
      // (`answerCurrentQuestion`'s own guard).
      if (/^[1-9]$/.test(event.key)) {
        event.preventDefault();
        answerCurrentQuestion(Number(event.key) - 1);
        return;
      }

      let action: PresentationAction | undefined;
      switch (event.key) {
        case 'ArrowRight':
        case ' ':
        case 'PageDown':
        case 'Enter':
          action = { type: 'next' };
          break;
        case 'ArrowLeft':
        case 'PageUp':
          action = { type: 'prev' };
          break;
        case 'r':
        case 'R':
          action = { type: 'reveal' };
          break;
        case 'f':
        case 'F':
          toggleFullscreen();
          return;
        case 'q':
        case 'Q':
          toggleQrOverlay();
          return;
        case 'Escape':
          // The QR overlay is a lightweight on-demand layer, not a separate
          // slide — Escape closes IT first (same "undo the last thing you
          // opened" expectation as closing any other overlay), and only
          // exits the presentation once it is already closed.
          if (qrOverlayOpen) {
            setQrOverlayOpen(false);
            return;
          }
          exit();
          return;
        default:
          return;
      }
      event.preventDefault();
      // N7: a keyboard "next" press (clicker/arrow/space/enter) closes the
      // QR overlay too, same as the control bar's own `goNext` — see that
      // callback's own doc.
      if (action.type === 'next') closeQrOnAdvance();
      dispatch(action);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    toggleFullscreen,
    toggleQrOverlay,
    qrOverlayOpen,
    exit,
    showControls,
    closeQrOnAdvance,
    quizState.menuOpen,
    closeMenu,
    answerCurrentQuestion,
  ]);

  // ---- Accessibility: a polite live region announces every slide change
  // (section 7; generalized from "Pregunta" to "Diapositiva" once a slide
  // can also be a worksheet overview/zone — see `t.progressPrefix`'s own
  // i18n entry). ----
  const announcement = useMemo(() => {
    if (isCoverSlide(state)) return t.liveCover;
    if (isSummarySlide(state)) return t.liveSummary;
    const base = `${t.progressPrefix} ${slideNumber(state)} ${t.ofLabel} ${state.slideCount}`;
    if (currentSlide?.kind === 'worksheet-overview') return `${base} — ${t.liveWorksheetOverview}`;
    return state.revealed ? `${base} — ${t.liveRevealed}` : base;
  }, [state, t, currentSlide]);

  // The level's full display name already carries its own code (e.g. "Básico
  // A2" — i18n.ts's own "band + code" scheme), so this never prefixes it
  // with the bare code again.
  const levelLabel = level ? levelLabels[level] : t.noLevel;
  const countLabel = useMemo(() => {
    const parts: string[] = [];
    if (questions.length > 0) {
      parts.push(`${questions.length} ${questions.length === 1 ? t.questionsCountOne : t.questionsCountMany}`);
    }
    if (worksheetPages.length > 0) {
      parts.push(`${worksheetPages.length} ${worksheetPages.length === 1 ? t.worksheetCountOne : t.worksheetCountMany}`);
    }
    return parts.join(' · ');
  }, [questions.length, worksheetPages.length, t]);

  return (
    <div
      ref={viewportRef}
      data-testid="presentation-viewport"
      className="fixed inset-0 z-[60] overflow-hidden bg-black"
      onPointerMove={showControls}
    >
      <div aria-live="polite" role="status" className="sr-only" data-testid="presentation-live-region">
        {announcement}
      </div>

      <div
        data-testid="presentation-stage"
        className="absolute left-0 top-0 bg-background text-foreground"
        style={{
          width: STAGE_WIDTH,
          height: STAGE_HEIGHT,
          transform: `translate(${fit.offsetX}px, ${fit.offsetY}px) scale(${fit.scale})`,
          transformOrigin: '0 0',
        }}
      >
        {/* Top bar (owner spec: "un cronómetro arriba a la izquierda y los
            aciertos arriba a la derecha") — an informational layer over
            every slide, not a control, so it is never idle-hidden and never
            captures pointer events of its own. */}
        <div
          className="pointer-events-none absolute left-0 top-0 flex items-center justify-between"
          style={{ width: STAGE_WIDTH, padding: `${STAGE_SAFE_AREA_Y}px ${STAGE_SAFE_AREA_X}px` }}
        >
          <span
            data-testid="presentation-timer"
            aria-label={`${t.timerLabel} ${formatElapsed(quizState.elapsedMs)}`}
            style={{ fontSize: 28 }}
            className="flex items-center gap-2 rounded-pill bg-surface-soft px-5 py-2 font-bold tabular-nums text-foreground"
          >
            <ClockIcon aria-hidden="true" size={22} />
            {formatElapsed(quizState.elapsedMs)}
          </span>
          {hasChoiceQuestions && (
            <span
              data-testid="presentation-score"
              aria-label={`${t.scoreLabel} ${quizState.score}`}
              style={{ fontSize: 28 }}
              className="flex items-center gap-2 rounded-pill bg-primary px-5 py-2 font-bold tabular-nums text-primary-foreground"
            >
              <CheckCircleIcon aria-hidden="true" weight="fill" size={22} />
              {quizState.score}
            </span>
          )}
        </div>

        <div
          className="flex h-full w-full flex-col items-center justify-center overflow-hidden"
          style={{ padding: `${STAGE_SAFE_AREA_Y}px ${STAGE_SAFE_AREA_X}px` }}
        >
          {isCoverSlide(state) && <CoverSlide title={title} levelLabel={levelLabel} countLabel={countLabel} />}
          {currentSlide?.kind === 'question' && (
            <QuestionSlide
              question={currentSlide}
              revealed={state.revealed}
              answer={contentSlideIndex >= 0 ? quizState.answers[contentSlideIndex] : undefined}
              onAnswer={answerCurrentQuestion}
              media={currentQuestionMedia}
              t={t}
            />
          )}
          {currentSlide?.kind === 'match' && <MatchSlide slide={currentSlide} revealed={state.revealed} t={t} />}
          {currentSlide?.kind === 'reorder' && <ReorderSlide slide={currentSlide} revealed={state.revealed} t={t} />}
          {currentSlide?.kind === 'cloze' && <ClozeSlide slide={currentSlide} revealed={state.revealed} t={t} />}
          {currentSlide?.kind === 'groupsort' && (
            <GroupSortSlide slide={currentSlide} revealed={state.revealed} t={t} />
          )}
          {isSummarySlide(state) && (
            <SummarySlide
              countLabel={countLabel}
              score={hasChoiceQuestions ? quizState.score : undefined}
              elapsedMs={quizState.elapsedMs}
              t={t}
              onRestart={restart}
              nextActivityHref={nextActivityHref}
            />
          )}
        </div>

        {(currentSlide?.kind === 'worksheet-overview' || currentSlide?.kind === 'worksheet-zone') && (
          <div
            data-testid="presentation-worksheet-viewport"
            className="absolute overflow-hidden"
            style={{
              left: STAGE_SAFE_AREA_X,
              top: STAGE_SAFE_AREA_Y,
              width: STAGE_SAFE_WIDTH,
              height: STAGE_SAFE_HEIGHT,
            }}
          >
            <WorksheetStageLayer slide={currentSlide} revealed={state.revealed} reducedMotion={reducedMotion} t={t} />
          </div>
        )}

        {/* QR overlay, on demand (owner feedback 2026-10-06) — see this
            file's own `toggleQrOverlay` for why it is a layer over whatever
            slide is current, not a slide of its own. Sized to the stage's
            own virtual pixels (`STAGE_WIDTH`/`STAGE_HEIGHT`), same
            coordinate space every other absolutely-positioned stage layer
            above uses. */}
        {qrOverlayOpen && qrSvg && (
          <div
            data-testid="presentation-qr-overlay"
            role="dialog"
            aria-label={t.showQr}
            className="absolute left-0 top-0 flex flex-col items-center justify-center gap-10 bg-black/85"
            style={{ width: STAGE_WIDTH, height: STAGE_HEIGHT }}
          >
            <div
              role="img"
              aria-label={t.qrAlt}
              data-testid="presentation-qr-overlay-image"
              className="rounded-xl bg-white p-6 shadow-elevation-2 [&>svg]:h-72 [&>svg]:w-72"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
            <p style={{ fontSize: 28 }} className="text-white/90">
              {t.scanHint}
            </p>
            <button
              type="button"
              data-testid="presentation-qr-overlay-close"
              onClick={toggleQrOverlay}
              style={{ fontSize: 24 }}
              className="rounded-full bg-white/10 px-8 py-3 text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t.hideQr}
            </button>
          </div>
        )}

        {/* The question-list menu (owner spec, bottom-left "☰") — same
            on-demand-layer posture as the QR overlay above, not a slide of
            its own. Lists every CONTENT slide (1-based, same numbering the
            bottom bar's own "N de M" uses); a multiple-choice question
            already answered shows its ✓/✕, every other slide (still
            unanswered, or a non-choice kind this reducer never touches)
            shows neither. */}
        {quizState.menuOpen && (
          <div
            data-testid="presentation-menu-panel"
            role="dialog"
            aria-label={t.menuLabel}
            className="absolute left-0 top-0 flex flex-col items-center gap-8 overflow-y-auto bg-black/85 py-16"
            style={{ width: STAGE_WIDTH, height: STAGE_HEIGHT }}
          >
            <h2 style={{ fontSize: 36 }} className="font-display font-bold text-white">
              {t.menuLabel}
            </h2>
            <ol className="grid w-full max-w-4xl grid-cols-2 gap-4 px-10 sm:grid-cols-4">
              {Array.from({ length: slides.length }, (_, i) => i + 1).map((slideIndex) => {
                const answer = quizState.answers[slideIndex - 1];
                return (
                  <li key={slideIndex}>
                    <button
                      type="button"
                      data-testid={`presentation-menu-item-${slideIndex}`}
                      data-state={answer?.status ?? 'unanswered'}
                      onClick={() => jumpToSlide(slideIndex)}
                      aria-label={`${t.progressPrefix} ${slideIndex} ${
                        answer?.status === 'correct' ? `— ${t.correctBadge}` : answer?.status === 'wrong' ? `— ${t.wrongBadge}` : ''
                      }`}
                      style={{ fontSize: 24 }}
                      className={cn(
                        'flex items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-4 font-bold text-white transition-colors hover:bg-white/20',
                        answer?.status === 'correct' && 'bg-accent-ink/80',
                        answer?.status === 'wrong' && 'bg-destructive/80',
                      )}
                    >
                      {slideIndex}
                      {answer?.status === 'correct' && <CheckCircleIcon aria-hidden="true" weight="fill" />}
                      {answer?.status === 'wrong' && <XIcon aria-hidden="true" />}
                    </button>
                  </li>
                );
              })}
            </ol>
            <button
              type="button"
              data-testid="presentation-menu-close"
              onClick={closeMenu}
              style={{ fontSize: 24 }}
              className="rounded-full bg-white/10 px-8 py-3 text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t.menuClose}
            </button>
          </div>
        )}
      </div>

      <ControlBar
        visible={controlsVisible}
        onFocus={handleControlsFocus}
        onBlur={handleControlsBlur}
        menuOpen={quizState.menuOpen}
        onToggleMenu={quizState.menuOpen ? closeMenu : openMenu}
        onPrev={() => dispatch({ type: 'prev' })}
        onNext={goNext}
        muted={sound.muted}
        onToggleSound={sound.toggleMuted}
        onFullscreen={toggleFullscreen}
        isFullscreen={isFullscreen}
        progress={slideProgress(state)}
        total={slides.length}
        exitHref={practiceUrl}
        onExit={onExit}
        t={t}
      />
    </div>
  );
}

/**
 * The title/level/count "title card" — no longer where a presentation
 * OPENS (owner feedback 2026-10-06, `PresentationIsland`'s own header on
 * `startIndex`), but still reachable via `prev` from the first content
 * slide. Its QR moved to the on-demand overlay (`toggleQrOverlay`,
 * reachable from ANY slide including this one) — rendering it here too
 * would just be a second, redundant QR UI.
 */
function CoverSlide({
  title,
  levelLabel,
  countLabel,
}: {
  title: string;
  levelLabel: string;
  countLabel: string;
}) {
  return (
    <div
      data-testid="presentation-slide-cover"
      className="flex w-full max-w-5xl flex-1 flex-col items-center justify-center gap-12 text-center"
    >
      <div className="flex flex-col gap-4">
        <h1
          style={{ fontSize: promptFontSize(title) }}
          className="font-display font-bold leading-tight text-foreground"
        >
          {title}
        </h1>
        <p style={{ fontSize: 32 }} className="text-muted-foreground">
          {levelLabel} · {countLabel}
        </p>
      </div>
    </div>
  );
}

/** The first resolved answer's own image, if its pool item carries one — mirrors `quizSlotAnswerSummary`'s own resolution (`moderationPreview.ts`), for the picture instead of the text. `undefined` for a non-pooled (plain typed-text) slot, or once resolved, an item with no `media`. */
function resolvedAnswerImage(payload: Payload, slot: Slot): string | undefined {
  if (!slot.pool) return undefined;
  const pool = payload.pools[slot.pool] ?? [];
  const firstAnswerId = slot.answer[0];
  return pool.find((item) => item.id === firstAnswerId)?.media;
}

/**
 * One multiple-choice tile's own `data-mark` (UI mockup,
 * `propuestas/presentacion/index.html`): `'correct'`/`'wrong'` on the TILE
 * THE PLAYER ACTUALLY TAPPED, `'reveal'` on the right one when the tap was
 * wrong (owner spec: "si está mal, también se marca ✓ la correcta"), and
 * `undefined` on the plain locked ones. `undefined` (idle) while the
 * question is not answered at all yet.
 */
function tileMark(item: PoolItem, index: number, slot: Slot, answer: QuizAnswerState | undefined) {
  if (!answer || answer.status === 'unanswered') return undefined;
  const isCorrectItem = slot.answer.includes(item.id);
  if (index === answer.selectedIndex) return answer.status === 'correct' ? 'correct' : 'wrong';
  if (isCorrectItem) return 'reveal';
  return undefined;
}

function QuestionSlide({
  question,
  revealed,
  answer,
  onAnswer,
  media,
  t,
}: {
  question: { blockId: string; payload: Payload; slot: Slot };
  revealed: boolean;
  /** This content slide's own live-quiz answer state (`presentationQuiz.ts`) — `undefined`/`'unanswered'` off a choice question, or a choice question not yet tapped. */
  answer?: QuizAnswerState;
  /** Taps (or presses the 1-based number key for) tile `optionIndex` (0-based) — a no-op the caller itself guards once locked. */
  onAnswer: (optionIndex: number) => void;
  /**
   * The question's OWN context image (owner decision 2026-10-16,
   * `blocks.ts`'s `QuizBlock.promptImages` — the section 13 "una imagen
   * opcional" this prop was originally stubbed for), as opposed to a
   * per-OPTION image (`PoolItem.media`, already wired below). DISPLAY-ONLY:
   * `alt=""` below is deliberate, the prompt text carries the meaning.
   * Resolved by the caller (`currentQuestionMedia`) from `block.promptImages`,
   * never through the worksheet camera/zoom/stage layer.
   */
  media?: string;
  t: PresentCopy;
}) {
  const { payload, slot } = question;
  const kind = segmentForInput(slot.input);
  const isChoice = kind === 'choice';
  const items = isChoice ? getSlotItems(payload, slot) : [];
  const answerText = !isChoice ? quizSlotAnswerSummary(payload, slot) : '';
  const answerImage = !isChoice ? resolvedAnswerImage(payload, slot) : undefined;
  const locked = isChoice && answer != null && answer.status !== 'unanswered';
  const hasMedia = Boolean(media);

  return (
    <div
      data-testid={`presentation-question-${slot.id}`}
      className="flex w-full max-w-5xl flex-1 flex-col items-center justify-center gap-10"
    >
      <p
        data-testid="presentation-question-prompt"
        style={{ fontSize: promptFontSize(slot.label) }}
        className="text-center font-display font-bold leading-tight text-foreground"
      >
        {slot.label}
      </p>

      {isChoice && (
        <div
          data-testid="presentation-content-row"
          data-has-media={hasMedia ? '' : undefined}
          className={cn('grid w-full gap-8', hasMedia ? 'sm:grid-cols-[0.82fr_1.18fr]' : 'grid-cols-1')}
        >
          {media && (
            <div data-testid="presentation-question-media" className="overflow-hidden rounded-2xl shadow-elevation-2">
              <img src={media} alt="" className="h-full w-full object-cover" />
            </div>
          )}
          <div
            role="list"
            aria-label={slot.label}
            data-testid="presentation-tiles"
            data-count={items.length}
            data-answered={locked ? '' : undefined}
            className="grid w-full grid-cols-1 gap-6 sm:grid-cols-2"
          >
            {items.map((item, index) => {
              const idx = index + 1; // 1-based — same number the keyboard "1-9" map and `.key` badge use.
              const mark = tileMark(item, index, slot, answer);
              return (
                <button
                  type="button"
                  key={item.id}
                  role="listitem"
                  data-testid={`presentation-tile-${idx}`}
                  data-index={idx}
                  data-mark={mark}
                  disabled={locked}
                  aria-label={item.text ?? item.id}
                  onClick={() => onAnswer(index)}
                  style={{ fontSize: 40 }}
                  className={cn(
                    'relative flex items-center gap-4 rounded-2xl p-6 font-semibold text-white transition-opacity duration-300 disabled:cursor-default',
                    optionColorClass(index),
                    locked && !mark && 'opacity-40',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="flex h-14 w-14 flex-none items-center justify-center rounded-full bg-white/25 text-[28px]"
                  >
                    {idx}
                  </span>
                  {item.media && <img src={item.media} alt="" className="h-20 w-20 flex-none object-contain" />}
                  <span className="flex-1 text-left">{item.text ?? item.id}</span>
                  {mark && (
                    <span
                      data-testid="presentation-tile-mark"
                      className="flex flex-none items-center gap-1.5 text-[28px]"
                    >
                      {mark === 'wrong' ? (
                        <XIcon aria-hidden="true" weight="bold" />
                      ) : (
                        <CheckCircleIcon aria-hidden="true" weight="fill" />
                      )}
                      <span className="sr-only">{mark === 'wrong' ? t.wrongBadge : t.correctBadge}</span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {!isChoice && revealed && (
        <div
          data-testid="presentation-answer-reveal"
          className="flex flex-col items-center gap-3 text-center"
        >
          <span
            style={{ fontSize: 24 }}
            className="font-semibold text-muted-foreground"
          >
            {t.answerLabel}
          </span>
          {answerImage && <img src={answerImage} alt="" className="h-40 w-40 object-contain" />}
          {answerText && (
            <p style={{ fontSize: 48 }} className="font-bold text-accent-ink">
              {answerText}
            </p>
          )}
        </div>
      )}

      {revealed && slot.explanation && (
        <p
          data-testid="presentation-explanation"
          style={{ fontSize: 28 }}
          className="max-w-3xl text-center text-muted-foreground"
        >
          <span className="font-semibold text-foreground">{t.explanationLabel}:</span>{' '}
          {slot.explanation}
        </p>
      )}
    </div>
  );
}

/**
 * "Une las parejas" in presentation mode (build item 5, "Match in
 * presentation") — ONE slide for the whole pair list, not one per pair
 * (unlike Básico's `QuestionSlide`, one per question): every prompt listed
 * at once in a calm, large-type column; "Mostrar respuesta" reveals every
 * answer at once, right beside its own prompt. The simplest shape that
 * still runs well on a projector (owner build item 5) — no drag gesture in
 * front of a class, and it reuses the exact `GameItem`s the practice board
 * itself derives, so a pair can never read differently here.
 */
function MatchSlide({
  slide,
  revealed,
  t,
}: {
  slide: Extract<PresentationSlide, { kind: 'match' }>;
  revealed: boolean;
  t: PresentCopy;
}) {
  return (
    <div
      data-testid={`presentation-match-${slide.blockId}`}
      className="flex w-full max-w-6xl flex-1 flex-col items-center justify-center gap-8 overflow-y-auto py-6"
    >
      <p
        style={{ fontSize: 64 }}
        className="text-center font-display font-bold leading-tight text-foreground"
      >
        {t.matchTitle}
      </p>
      <ul className="flex w-full flex-col gap-4">
        {slide.pairs.map((pair) => (
          <li
            key={pair.id}
            data-testid={`presentation-match-pair-${pair.id}`}
            className="flex items-center justify-between gap-8 rounded-2xl bg-surface-soft px-8 py-6"
          >
            <span style={{ fontSize: 44 }} className="font-semibold text-foreground">
              {pair.prompt}
            </span>
            {revealed && (
              <span
                data-testid={`presentation-match-answer-${pair.id}`}
                style={{ fontSize: 44 }}
                className="font-bold text-accent-ink"
              >
                {pair.answer}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * "Reordenar" in presentation mode — ONE SLIDE PER SENTENCE (unlike
 * `MatchSlide`'s single combined slide, see `presentationSlides.ts`'s own
 * doc): the sentence's own words, already pre-shuffled and fixed by
 * `buildPresentationSlides`, shown as large static tiles; "Mostrar
 * respuesta" swaps them for the sentence in its correct order. Large type,
 * generous spacing (owner feedback on the match stage, "scale the match and
 * reorder slides' content up to use the stage") — same scale `MatchSlide`
 * now uses above.
 */
function ReorderSlide({
  slide,
  revealed,
  t,
}: {
  slide: Extract<PresentationSlide, { kind: 'reorder' }>;
  revealed: boolean;
  t: PresentCopy;
}) {
  return (
    <div
      data-testid={`presentation-reorder-${slide.slotId}`}
      className="flex w-full max-w-6xl flex-1 flex-col items-center justify-center gap-10 overflow-y-auto py-6"
    >
      <p
        style={{ fontSize: 64 }}
        className="text-center font-display font-bold leading-tight text-foreground"
      >
        {t.reorderTitle}
      </p>
      {revealed ? (
        <p
          data-testid="presentation-reorder-answer"
          style={{ fontSize: 56 }}
          className="max-w-5xl text-center font-bold leading-snug text-accent-ink"
        >
          {slide.sentence}
        </p>
      ) : (
        <div className="flex flex-wrap items-center justify-center gap-4">
          {slide.words.map((word, i) => (
            <span
              key={`${slide.slotId}-${i}`}
              style={{ fontSize: 44 }}
              className="rounded-2xl bg-surface-soft px-8 py-5 font-semibold text-foreground"
            >
              {word}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * "Completar la frase" in presentation mode — ONE SLIDE PER SENTENCE, same
 * posture as `ReorderSlide` above: the sentence's own text runs at large
 * type, each blank unrevealed shown as an empty underline, revealed shown
 * filled with its own correct word.
 */
function ClozeSlide({
  slide,
  revealed,
  t,
}: {
  slide: Extract<PresentationSlide, { kind: 'cloze' }>;
  revealed: boolean;
  t: PresentCopy;
}) {
  return (
    <div
      data-testid={`presentation-cloze-${slide.blockId}-${slide.seq}`}
      className="flex w-full max-w-6xl flex-1 flex-col items-center justify-center gap-10 overflow-y-auto py-6"
    >
      <p style={{ fontSize: 64 }} className="text-center font-display font-bold leading-tight text-foreground">
        {t.clozeTitle}
      </p>
      <p style={{ fontSize: 44 }} className="max-w-5xl text-center font-semibold leading-relaxed text-foreground">
        {slide.segments.map((seg, i) =>
          seg.kind === 'text' ? (
            <span key={i}>{seg.text}</span>
          ) : (
            <span
              key={seg.slotId ?? i}
              data-testid={`presentation-cloze-blank-${seg.slotId}`}
              className={cn(
                'mx-2 inline-block min-w-32 border-b-4 border-foreground/40 px-2 text-center align-bottom',
                revealed && 'border-accent-ink text-accent-ink',
              )}
            >
              {revealed ? seg.text : ' '}
            </span>
          ),
        )}
      </p>
    </div>
  );
}

/**
 * "Ordenar por grupos" in presentation mode — ONE combined slide for the
 * whole board, same posture as `MatchSlide` above: every group's own name
 * listed as a large labelled column; "Mostrar respuesta" fills each column
 * with its items at once, right under its own name — no drag gesture needed
 * in front of a class.
 */
function GroupSortSlide({
  slide,
  revealed,
  t,
}: {
  slide: Extract<PresentationSlide, { kind: 'groupsort' }>;
  revealed: boolean;
  t: PresentCopy;
}) {
  return (
    <div
      data-testid={`presentation-groupsort-${slide.blockId}`}
      className="flex w-full max-w-6xl flex-1 flex-col items-center justify-center gap-8 overflow-y-auto py-6"
    >
      <p style={{ fontSize: 64 }} className="text-center font-display font-bold leading-tight text-foreground">
        {t.groupSortTitle}
      </p>
      <div className="flex w-full flex-col gap-6 sm:flex-row sm:flex-wrap sm:justify-center">
        {slide.groups.map((group) => (
          <div
            key={group.id}
            data-testid={`presentation-groupsort-group-${group.id}`}
            className="flex min-w-56 flex-1 flex-col gap-3 rounded-2xl bg-surface-soft px-8 py-6"
          >
            <span style={{ fontSize: 44 }} className="text-center font-semibold text-foreground">
              {group.label}
            </span>
            {revealed && (
              <ul className="flex flex-col items-center gap-2">
                {group.items.map((item, i) => (
                  <li
                    key={`${group.id}-${i}`}
                    data-testid={`presentation-groupsort-item-${group.id}-${i}`}
                    style={{ fontSize: 32 }}
                    className="font-bold text-accent-ink"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The worksheet zoom tour's own stage layer (sprint week 3) — renders the
 * page image at its own native/rotated pixel size, transformed by whichever
 * camera the current slide calls for (`cameraForPage` for the overview,
 * `cameraForZone` for one zone), with that zone's own overlay on top:
 * every zone numbered on the overview, or one highlighted blank/reveal on a
 * zone slide. One component for both kinds since they share every bit of
 * the image+camera rendering, differing only in which overlay they draw.
 */
function WorksheetStageLayer({
  slide,
  revealed,
  reducedMotion,
  t,
}: {
  slide: Extract<PresentationSlide, { kind: 'worksheet-overview' | 'worksheet-zone' }>;
  revealed: boolean;
  reducedMotion: boolean;
  t: PresentCopy;
}) {
  const page = rotatedSize(slide.image, slide.rotation);
  const camera =
    slide.kind === 'worksheet-overview'
      ? cameraForPage(page, WORKSHEET_STAGE)
      : cameraForZone(slide.zone, page, WORKSHEET_STAGE);
  const imageUrl = imagePreviewUrl(slide.image.path);
  // "Colocar un audio propio": played only from the overview slide (never
  // on a zoomed-into per-zone slide — see `PresentationSlide`'s own
  // `audio` doc). The hook itself is harmless to mount unconditionally (a
  // zone slide's `audio` is simply `undefined`, so nothing renders).
  const { playingId, toggle } = useAudioMarkerPlayback(audioPreviewUrl);

  return (
    <div
      data-testid="presentation-worksheet-camera"
      className="absolute left-0 top-0"
      style={{
        width: page.width,
        height: page.height,
        transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`,
        transformOrigin: '0 0',
        transitionProperty: 'transform',
        transitionDuration: reducedMotion ? '0ms' : `${CAMERA_TRANSITION_MS}ms`,
        transitionTimingFunction: 'ease-out',
      }}
    >
      <img
        src={imageUrl}
        alt=""
        className="pointer-events-none absolute object-contain"
        style={{
          top: '50%',
          left: '50%',
          width: slide.image.width,
          height: slide.image.height,
          // Rotation is a pure CSS transform around the image's own center
          // — the outer layer above is already sized to the ROTATED
          // dimensions (`page`), so the rotated image exactly fills it. The
          // camera's own scale/translate lives on that OUTER layer, so this
          // transform stays rotation-only — same split `WorksheetZoneEditor.tsx`'s
          // own canvas uses (not imported from it — see this module's own
          // header on `presentationCamera.ts`).
          transform: `translate(-50%, -50%) rotate(${slide.rotation}deg)`,
        }}
      />
      {slide.kind === 'worksheet-overview' ? (
        <>
          {slide.zones.map((zone, i) => (
            <WorksheetOverviewZoneBadge key={zone.id} zone={zone} number={i + 1} t={t} />
          ))}
          {slide.audio?.map((marker) => (
            <AudioMarkerButton
              key={marker.id}
              x={marker.x}
              y={marker.y}
              playing={playingId === marker.id}
              label={playingId === marker.id ? t.audioPause : t.audioPlay}
              data-testid={`presentation-overview-audio-${marker.id}`}
              onToggle={() => toggle(marker.id, marker.path)}
            />
          ))}
        </>
      ) : (
        <WorksheetZoneHighlight zone={slide.zone} revealed={revealed} t={t} />
      )}
    </div>
  );
}

/** One numbered zone outline on the overview slide — see this file's own header. */
function WorksheetOverviewZoneBadge({ zone, number, t }: { zone: Zone; number: number; t: PresentCopy }) {
  const style = {
    left: `${zone.x * 100}%`,
    top: `${zone.y * 100}%`,
    width: `${zone.w * 100}%`,
    height: `${zone.h * 100}%`,
  };
  return (
    <div
      data-testid={`presentation-overview-zone-${zone.id}`}
      className="absolute rounded-md border-4 border-primary bg-primary/10"
      style={style}
    >
      <span
        aria-label={`${t.zoneLabel} ${number}`}
        className="absolute -left-3 -top-3 flex h-9 w-9 items-center justify-center rounded-full bg-primary text-base font-bold text-primary-foreground shadow-elevation-2"
      >
        {number}
      </span>
    </div>
  );
}

/** One zone's own tour slide: an empty highlighted blank, or — once revealed — the expected answer plus its "¿Por qué?" explanation (D5) if it has one. */
function WorksheetZoneHighlight({
  zone,
  revealed,
  t,
}: {
  zone: Zone;
  revealed: boolean;
  t: PresentCopy;
}) {
  const style = {
    left: `${zone.x * 100}%`,
    top: `${zone.y * 100}%`,
    width: `${zone.w * 100}%`,
    height: `${zone.h * 100}%`,
  };
  const answerText = zoneAnswerSummary(zone);

  return (
    <div data-testid={`presentation-zone-${zone.id}`} className="absolute" style={style}>
      <div
        data-testid={`presentation-zone-blank-${zone.id}`}
        className={cn(
          'absolute inset-0 rounded-md border-4 bg-primary/15 transition-colors',
          revealed ? 'border-accent-ink' : 'border-primary',
        )}
      />
      {revealed && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2" style={{ maxWidth: 640 }}>
            <span
              style={{ fontSize: 24 }}
              className="rounded-md bg-background/90 px-3 py-1 font-semibold text-muted-foreground shadow-elevation-1"
            >
              {t.answerLabel}
            </span>
            {answerText && (
              <span
                data-testid={`presentation-zone-answer-${zone.id}`}
                style={{ fontSize: promptFontSize(answerText) }}
                className="rounded-xl bg-background px-6 py-3 text-center font-bold text-accent-ink shadow-elevation-2"
              >
                {answerText}
              </span>
            )}
            {zone.explanation && (
              <p
                data-testid={`presentation-zone-explanation-${zone.id}`}
                style={{ fontSize: 24 }}
                className="rounded-lg bg-background/90 px-4 py-2 text-center text-muted-foreground shadow-elevation-1"
              >
                <span className="font-semibold text-foreground">{t.explanationLabel}:</span> {zone.explanation}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * N7 (next step at the end): "Otra actividad" — the SAME community catalog,
 * filtered by this activity's own level, that the practice page's own
 * `GameResult` already offers as its primary action, is now ALSO the
 * primary action here, pushing "Volver a empezar" down to secondary.
 * Omitted entirely when the host supplies no `nextActivityHref` (the
 * editor's in-editor preview — see that prop's own doc on
 * `PresentationIslandProps`), which keeps exactly today's one-button
 * screen there.
 *
 * STYLING (owner review, same reasoning `GameResult.tsx`'s own header
 * documents): the filled pill (`bg-primary`/`text-primary-foreground`) is
 * what "Volver a empezar" used to look like ALONE — fine for a solid
 * button (readable regardless of the `ingles` theme's light-yellow
 * `--color-primary`, since the TEXT itself is `text-primary-foreground`,
 * not `text-primary`), so "Otra actividad" simply inherits it verbatim.
 * "Volver a empezar" moves to the kit's own secondary treatment instead —
 * `text-accent-ink` on a plain, unfilled control — never `text-primary`
 * (which GameResult's own header calls out as unreadable on white: light
 * yellow text with no filled background behind it).
 */
function SummarySlide({
  countLabel,
  score,
  elapsedMs,
  t,
  onRestart,
  nextActivityHref,
}: {
  countLabel: string;
  /**
   * Correct multiple-choice answers (owner spec P1: "la diapositiva final
   * también muestra los aciertos y el tiempo") — `undefined` when the deck
   * has no multiple-choice question at all (owner review: "✓ 0" forever is
   * noise, not information), which drops the score from this line entirely
   * and keeps only the time.
   */
  score?: number;
  elapsedMs: number;
  t: PresentCopy;
  onRestart: () => void;
  nextActivityHref?: string;
}) {
  return (
    <div
      data-testid="presentation-slide-summary"
      className="flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-10 text-center"
    >
      {/* Emoji sticker accent (visual-identity decision, 2026-10-04) — purely
          decorative, next to the already-accessible "¡Listo!" heading below. */}
      <Emoji data-testid="presentation-summary-emoji" name="trophy" size={64} />
      <h2 style={{ fontSize: 80 }} className="font-display font-bold text-foreground">
        {t.summaryTitle} {countLabel}
      </h2>
      <p
        data-testid="presentation-summary-stats"
        style={{ fontSize: 28 }}
        className="font-semibold text-muted-foreground"
      >
        {score != null && `${t.scoreLabel} ${score} · `}
        {t.timeLabel} {formatElapsed(elapsedMs)}
      </p>
      <div className="flex flex-col items-center gap-3">
        {nextActivityHref ? (
          <a
            href={nextActivityHref}
            data-testid="presentation-next-activity"
            style={{ fontSize: 32 }}
            className="rounded-full bg-primary px-10 py-4 font-semibold text-primary-foreground shadow-elevation-2 transition-colors hover:bg-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {t.nextActivity}
          </a>
        ) : (
          <button
            type="button"
            data-testid="presentation-restart"
            onClick={onRestart}
            style={{ fontSize: 32 }}
            className="rounded-full bg-primary px-10 py-4 font-semibold text-primary-foreground shadow-elevation-2 transition-colors hover:bg-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {t.restart}
          </button>
        )}
        {nextActivityHref && (
          <button
            type="button"
            data-testid="presentation-restart"
            onClick={onRestart}
            style={{ fontSize: 24 }}
            className="rounded-full px-4 py-2 font-semibold text-accent-ink transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t.restart}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * The bottom bar — restructured for the live-quiz rhythm (P1, owner spec,
 * matching the UI mockup `propuestas/presentacion/index.html`'s own
 * `.bottombar`): menu (bottom-left) · ◁ prev / count / next ▷ (centred) ·
 * sound + fullscreen + exit (bottom-right). The old standalone "reveal"/
 * QR-toggle buttons are gone from here — reveal-then-advance already
 * happens on a bare "next" press (no separate button needed), and the join
 * QR still opens itself automatically on the FIRST slide only (unchanged —
 * see this file's own `qrOverlayOpen` initial state) — both keep working
 * exactly as before (plus the `R`/`Q` shortcuts), only their OWN bar button
 * is gone.
 * Exit stays, unlike those two: it has no automatic replacement, so a
 * mouse/touch-only presenter still needs it (owner invariant, "no más ni
 * menos" — never REMOVE reachable behaviour, even where the UI mockup's own
 * icon set stops at six).
 */
function ControlBar({
  visible,
  onFocus,
  onBlur,
  menuOpen,
  onToggleMenu,
  onPrev,
  onNext,
  muted,
  onToggleSound,
  onFullscreen,
  isFullscreen,
  progress,
  total,
  exitHref,
  onExit,
  t,
}: {
  visible: boolean;
  onFocus: () => void;
  onBlur: (event: React.FocusEvent<HTMLDivElement>) => void;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onPrev: () => void;
  onNext: () => void;
  muted: boolean;
  onToggleSound: () => void;
  onFullscreen: () => void;
  isFullscreen: boolean;
  progress: number;
  total: number;
  /**
   * Exit (owner invariant, "no más ni menos" — existing scope, kept):
   * unlike the old "reveal"/QR-toggle buttons, THIS has no automatic
   * replacement (reveal already happens on a bare "next", the QR now opens
   * itself) — a mouse/touch-only presenter still needs a click to leave,
   * so it stays in the bar even though the UI mockup's own icon set omits
   * it. The real practice page to exit to, when there is one.
   */
  exitHref?: string;
  /** The editor overlay's own close callback — takes priority over `exitHref` when given. See `PresentationIslandProps.onExit`. */
  onExit?: () => void;
  t: PresentCopy;
}) {
  return (
    <div
      data-testid="presentation-controls"
      onFocus={onFocus}
      onBlur={onBlur}
      className={cn(
        'glass-floating fixed bottom-8 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-pill px-3 py-2 shadow-floating transition-opacity duration-300',
        visible ? 'opacity-100' : 'pointer-events-none opacity-0',
      )}
    >
      <button
        type="button"
        aria-label={t.menuLabel}
        aria-pressed={menuOpen}
        data-testid="presentation-menu"
        onClick={onToggleMenu}
        className={cn(CONTROL_BUTTON_CLASS, menuOpen && 'bg-foreground/15')}
      >
        <ListIcon aria-hidden="true" size={22} />
      </button>
      <button type="button" aria-label={t.prev} data-testid="presentation-prev" onClick={onPrev} className={CONTROL_BUTTON_CLASS}>
        <CaretLeftIcon aria-hidden="true" size={22} />
      </button>
      <span
        data-testid="presentation-count"
        aria-label={`${t.progressPrefix} ${progress} ${t.ofLabel} ${total}`}
        className="min-w-16 px-2 text-center text-sm font-medium tabular-nums text-foreground"
      >
        {progress} {t.ofLabel} {total}
      </span>
      <button type="button" aria-label={t.next} data-testid="presentation-next" onClick={onNext} className={CONTROL_BUTTON_CLASS}>
        <CaretRightIcon aria-hidden="true" size={22} />
      </button>
      <button
        type="button"
        aria-label={muted ? t.soundUnmute : t.soundMute}
        aria-pressed={muted}
        data-testid="presentation-sound"
        onClick={onToggleSound}
        className={CONTROL_BUTTON_CLASS}
      >
        {muted ? <SpeakerSlashIcon aria-hidden="true" size={22} /> : <SpeakerHighIcon aria-hidden="true" size={22} />}
      </button>
      <button
        type="button"
        aria-label={isFullscreen ? t.fullscreenExit : t.fullscreenEnter}
        data-testid="presentation-fullscreen"
        onClick={onFullscreen}
        className={CONTROL_BUTTON_CLASS}
      >
        {isFullscreen ? <ArrowsInIcon aria-hidden="true" size={22} /> : <ArrowsOutIcon aria-hidden="true" size={22} />}
      </button>
      {onExit ? (
        <button
          type="button"
          aria-label={t.exit}
          data-testid="presentation-exit"
          onClick={onExit}
          className={CONTROL_BUTTON_CLASS}
        >
          <XIcon aria-hidden="true" size={22} />
        </button>
      ) : (
        <a href={exitHref} aria-label={t.exit} data-testid="presentation-exit" className={CONTROL_BUTTON_CLASS}>
          <XIcon aria-hidden="true" size={22} />
        </a>
      )}
    </div>
  );
}
