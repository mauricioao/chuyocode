/**
 * PresentationIsland — Presentation mode v1 ("Preguntas", presentation mode
 * pass), `/[lang]/ingles/actividades/[id]/presentar`'s one and only island.
 *
 * Teachers project this on a 16:9 screen and drive it from the SAME wireless
 * presenter they already use for slides (PageDown/PageUp), so the whole
 * surface is built around that one constraint: every "next" press either
 * reveals an answer or advances — never both, and never nothing — so a
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
 * ONLY `quiz` ("Preguntas") BLOCKS EVER APPEAR HERE (`presentationSlides.ts`'s
 * own header) — a worksheet's own image/zones are out of scope for this
 * pass and the route never even sends them to this island.
 *
 * NOTHING IS STORED, NO REQUEST IS EVER MADE (owner spec, privacy): every
 * prop below is already-fetched, serializable data; the deck, the reducer,
 * and the stage fit are all pure client state that disappears on reload.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { CaretLeftIcon } from '@phosphor-icons/react/dist/ssr/CaretLeft';
import { CaretRightIcon } from '@phosphor-icons/react/dist/ssr/CaretRight';
import { EyeIcon } from '@phosphor-icons/react/dist/ssr/Eye';
import { ArrowsOutIcon } from '@phosphor-icons/react/dist/ssr/ArrowsOut';
import { ArrowsInIcon } from '@phosphor-icons/react/dist/ssr/ArrowsIn';
import { XIcon } from '@phosphor-icons/react/dist/ssr/X';
import { CheckCircleIcon } from '@phosphor-icons/react/dist/ssr/CheckCircle';
import { UI_LABELS, type Lang } from '@/lib/i18n';
import type { Level } from '@/lib/exerciseTaxonomy';
import type { QuizBlock } from '@/lib/activities/blocks';
import { getSlotItems, type Payload, type Slot } from '@/lib/exercisePayload';
import { segmentForInput } from '@/lib/quizQuestionType';
import { quizSlotAnswerSummary } from '@/lib/activities/moderationPreview';
import {
  collectPresentationQuestions,
  promptFontSize,
  type PresentationQuestion,
} from '@/lib/activities/presentationSlides';
import {
  fitStage,
  STAGE_WIDTH,
  STAGE_HEIGHT,
  STAGE_SAFE_AREA_X,
  STAGE_SAFE_AREA_Y,
  type StageFit,
} from '@/lib/activities/fitStage';
import {
  createPresentationState,
  presentationReducer,
  isCoverSlide,
  isQuestionSlide,
  isSummarySlide,
  questionNumber,
  questionProgress,
  type PresentationAction,
} from '@/lib/activities/presentationReducer';
import { cn } from '@/lib/utils';

export interface PresentationIslandProps {
  lang: Lang;
  title: string;
  level: Level | null;
  /** The activity's own practice page — Esc, "Exit", and a tap on the cover's QR all resolve here. */
  practiceUrl: string;
  /** Server-rendered QR markup for {@link practiceUrl} (`@lib/qr`), or `null` when it could not be encoded — see that module's own header. */
  qrSvg: string | null;
  /** Only the activity's OWN `quiz` blocks — see this file's own header. */
  quizBlocks: QuizBlock[];
}

type PresentCopy = (typeof UI_LABELS)[Lang]['activities']['present'];

/** How long the control bar stays up after the last pointer move/focus, before fading out (section 6: "hides after ~2s"). */
const IDLE_HIDE_MS = 2000;

/** A/B/C/D — uppercase, per the owner spec's own "large A/B/C/D cards". */
const OPTION_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** The game-mechanic accent set (`global.css`), cycled across one question's options. */
const OPTION_COLOR_CLASSES = ['bg-game-blue', 'bg-game-violet', 'bg-game-orange', 'bg-game-pink'] as const;

const CONTROL_BUTTON_CLASS =
  'flex h-11 w-11 flex-none items-center justify-center rounded-full text-foreground transition-colors hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-30';

export default function PresentationIsland({
  lang,
  title,
  level,
  practiceUrl,
  qrSvg,
  quizBlocks,
}: PresentationIslandProps) {
  const t = UI_LABELS[lang].activities.present;
  const levelLabels = UI_LABELS[lang].english.levels;

  const questions = useMemo(() => collectPresentationQuestions(quizBlocks), [quizBlocks]);
  const [state, dispatch] = useReducer(
    presentationReducer,
    questions.length,
    (questionCount): ReturnType<typeof presentationReducer> =>
      presentationReducer(createPresentationState(questionCount), { type: 'start' }),
  );

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

  // ---- Preload every option/answer image once, on open (owner spec, section 4). ----
  useEffect(() => {
    const urls = new Set<string>();
    for (const question of questions) {
      for (const item of getSlotItems(question.payload, question.slot)) {
        if (item.media) urls.add(item.media);
      }
    }
    for (const url of urls) {
      const img = new Image();
      img.src = url;
    }
  }, [questions]);

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

  // ---- Exit to the practice page (Esc, and the control bar's own "Exit"). ----
  const exit = useCallback(() => {
    window.location.assign(practiceUrl);
  }, [practiceUrl]);

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
        case 'Escape':
          exit();
          return;
        default:
          return;
      }
      event.preventDefault();
      dispatch(action);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggleFullscreen, exit, showControls]);

  // ---- Accessibility: a polite live region announces every slide change (section 7). ----
  const announcement = useMemo(() => {
    if (isCoverSlide(state)) return t.liveCover;
    if (isSummarySlide(state)) return t.liveSummary;
    const base = `${t.progressPrefix} ${questionNumber(state)} ${t.ofLabel} ${state.questionCount}`;
    return state.revealed ? `${base} — ${t.liveRevealed}` : base;
  }, [state, t]);

  const levelLabel = level ? `${level} · ${levelLabels[level]}` : t.noLevel;
  const questionCountLabel = `${questions.length} ${questions.length === 1 ? t.questionsCountOne : t.questionsCountMany}`;
  const currentQuestion = isQuestionSlide(state) ? questions[state.index - 1] : undefined;

  return (
    <div
      ref={viewportRef}
      data-testid="presentation-viewport"
      className="fixed inset-0 overflow-hidden bg-black"
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
        <div
          className="flex h-full w-full flex-col items-center justify-center overflow-hidden"
          style={{ padding: `${STAGE_SAFE_AREA_Y}px ${STAGE_SAFE_AREA_X}px` }}
        >
          {isCoverSlide(state) && (
            <CoverSlide
              title={title}
              levelLabel={levelLabel}
              questionCountLabel={questionCountLabel}
              qrSvg={qrSvg}
              t={t}
            />
          )}
          {currentQuestion && (
            <QuestionSlide question={currentQuestion} revealed={state.revealed} t={t} />
          )}
          {isSummarySlide(state) && (
            <SummarySlide
              questionCountLabel={questionCountLabel}
              t={t}
              onRestart={() => dispatch({ type: 'restart' })}
            />
          )}
        </div>
      </div>

      <ControlBar
        visible={controlsVisible}
        onFocus={handleControlsFocus}
        onBlur={handleControlsBlur}
        onPrev={() => dispatch({ type: 'prev' })}
        onNext={() => dispatch({ type: 'next' })}
        onReveal={() => dispatch({ type: 'reveal' })}
        revealDisabled={!isQuestionSlide(state)}
        onFullscreen={toggleFullscreen}
        isFullscreen={isFullscreen}
        exitHref={practiceUrl}
        progress={questionProgress(state)}
        total={questions.length}
        t={t}
      />
    </div>
  );
}

function CoverSlide({
  title,
  levelLabel,
  questionCountLabel,
  qrSvg,
  t,
}: {
  title: string;
  levelLabel: string;
  questionCountLabel: string;
  qrSvg: string | null;
  t: PresentCopy;
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
          {levelLabel} · {questionCountLabel}
        </p>
      </div>
      {qrSvg && (
        <div className="flex flex-col items-center gap-4">
          <div
            role="img"
            aria-label={t.qrAlt}
            data-testid="presentation-cover-qr"
            className="rounded-xl bg-white p-4 shadow-elevation-2 [&>svg]:h-56 [&>svg]:w-56"
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
          <p style={{ fontSize: 24 }} className="text-muted-foreground">
            {t.scanHint}
          </p>
        </div>
      )}
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

function QuestionSlide({
  question,
  revealed,
  t,
}: {
  question: PresentationQuestion;
  revealed: boolean;
  t: PresentCopy;
}) {
  const { payload, slot } = question;
  const kind = segmentForInput(slot.input);
  const isChoice = kind === 'choice';
  const items = isChoice ? getSlotItems(payload, slot) : [];
  const answerText = !isChoice ? quizSlotAnswerSummary(payload, slot) : '';
  const answerImage = !isChoice ? resolvedAnswerImage(payload, slot) : undefined;

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
          role="list"
          aria-label={slot.label}
          className="grid w-full grid-cols-1 gap-6 sm:grid-cols-2"
        >
          {items.map((item, index) => {
            const correct = slot.answer.includes(item.id);
            const highlight = revealed && correct;
            const dim = revealed && !correct;
            return (
              <div
                key={item.id}
                role="listitem"
                data-testid={`presentation-option-${item.id}`}
                data-correct={highlight ? 'true' : undefined}
                style={{ fontSize: 40 }}
                className={cn(
                  'flex items-center gap-4 rounded-2xl p-6 font-semibold text-white transition-opacity duration-300',
                  OPTION_COLOR_CLASSES[index % OPTION_COLOR_CLASSES.length],
                  dim && 'opacity-40',
                )}
              >
                <span
                  aria-hidden="true"
                  className="flex h-14 w-14 flex-none items-center justify-center rounded-full bg-white/25 text-[28px]"
                >
                  {OPTION_LETTERS[index] ?? index + 1}
                </span>
                {item.media && (
                  <img src={item.media} alt="" className="h-20 w-20 flex-none object-contain" />
                )}
                <span className="flex-1 text-left">{item.text ?? item.id}</span>
                {highlight && (
                  <span
                    data-testid={`presentation-option-correct-${item.id}`}
                    className="flex flex-none items-center gap-1.5 text-[28px]"
                  >
                    <CheckCircleIcon aria-hidden="true" weight="fill" />
                    {t.correctBadge}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!isChoice && revealed && (
        <div
          data-testid="presentation-answer-reveal"
          className="flex flex-col items-center gap-3 text-center"
        >
          <span
            style={{ fontSize: 24 }}
            className="font-semibold uppercase tracking-wide text-muted-foreground"
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

function SummarySlide({
  questionCountLabel,
  t,
  onRestart,
}: {
  questionCountLabel: string;
  t: PresentCopy;
  onRestart: () => void;
}) {
  return (
    <div
      data-testid="presentation-slide-summary"
      className="flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-10 text-center"
    >
      <h2 style={{ fontSize: 80 }} className="font-display font-bold text-foreground">
        {t.summaryTitle} {questionCountLabel}
      </h2>
      <button
        type="button"
        data-testid="presentation-restart"
        onClick={onRestart}
        style={{ fontSize: 32 }}
        className="rounded-full bg-primary px-10 py-4 font-semibold text-primary-foreground shadow-elevation-2 transition-colors hover:bg-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {t.restart}
      </button>
    </div>
  );
}

function ControlBar({
  visible,
  onFocus,
  onBlur,
  onPrev,
  onNext,
  onReveal,
  revealDisabled,
  onFullscreen,
  isFullscreen,
  exitHref,
  progress,
  total,
  t,
}: {
  visible: boolean;
  onFocus: () => void;
  onBlur: (event: React.FocusEvent<HTMLDivElement>) => void;
  onPrev: () => void;
  onNext: () => void;
  onReveal: () => void;
  revealDisabled: boolean;
  onFullscreen: () => void;
  isFullscreen: boolean;
  exitHref: string;
  progress: number;
  total: number;
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
      <button type="button" aria-label={t.prev} data-testid="presentation-prev" onClick={onPrev} className={CONTROL_BUTTON_CLASS}>
        <CaretLeftIcon aria-hidden="true" size={22} />
      </button>
      <button
        type="button"
        aria-label={t.reveal}
        data-testid="presentation-reveal"
        onClick={onReveal}
        disabled={revealDisabled}
        className={CONTROL_BUTTON_CLASS}
      >
        <EyeIcon aria-hidden="true" size={22} />
      </button>
      <button type="button" aria-label={t.next} data-testid="presentation-next" onClick={onNext} className={CONTROL_BUTTON_CLASS}>
        <CaretRightIcon aria-hidden="true" size={22} />
      </button>
      <span
        data-testid="presentation-progress"
        aria-label={`${t.progressPrefix} ${progress} ${t.ofLabel} ${total}`}
        className="min-w-16 px-2 text-center text-sm font-medium tabular-nums text-foreground"
      >
        {progress} / {total}
      </span>
      <button
        type="button"
        aria-label={isFullscreen ? t.fullscreenExit : t.fullscreenEnter}
        data-testid="presentation-fullscreen"
        onClick={onFullscreen}
        className={CONTROL_BUTTON_CLASS}
      >
        {isFullscreen ? <ArrowsInIcon aria-hidden="true" size={22} /> : <ArrowsOutIcon aria-hidden="true" size={22} />}
      </button>
      <a href={exitHref} aria-label={t.exit} data-testid="presentation-exit" className={CONTROL_BUTTON_CLASS}>
        <XIcon aria-hidden="true" size={22} />
      </a>
    </div>
  );
}
