/**
 * QuizChoose — "Elegir la respuesta" (the `choose` template's game): one
 * multiple-choice question per screen, in big type, with big numbered option
 * cards. Built from the approved maquette
 * `ChuyoCode_others/propuestas/elegir-respuesta/` (screens A–F), which
 * derives from the presentation's own question slide (`PresentationIsland`'s
 * `QuestionSlide`): the same prompt scale (`promptFontSize`), the same
 * position-coloured cards (`palette.ts`), the same score/elapsed reducer
 * (`presentationQuiz.ts`), on the templates' white sheet. Its sizes live in
 * `global.css` (`.choose-*`), scaled by the sheet's own size.
 *
 * THE RHYTHM: a pick is graded at once — ✓ and a mint ring on a right card,
 * score +1, the blanks fill in, and it moves on by itself after ~1.2 s. A
 * wrong card gets ✕ and a red ring, the right one gets ✓, the blanks fill
 * with the right answer, and it moves on after ~2 s — unless the author
 * wrote a "¿Por qué?", which then shows with a "Siguiente" button and waits.
 * The flow is linear: no back/next arrows. Reduced motion drops the
 * transitions but keeps those reading delays.
 *
 * SELF-CHECKING (`gameModes.ts`'s `SELF_CHECKING_GAME_MODES`): the page
 * shows no "Comprobar" of its own next to this board.
 *
 * Options are shuffled on every play. The first render (server and
 * hydration) cannot use a random order without a hydration mismatch, so the
 * cards stay invisible until the client picks this play's random seed —
 * they never visibly reorder.
 */
import { useEffect, useEffectEvent, useMemo, useReducer, useRef, useState, type CSSProperties } from 'react';
import { ArrowRightIcon } from '@phosphor-icons/react/dist/ssr/ArrowRight';
import { CheckIcon } from '@phosphor-icons/react/dist/ssr/Check';
import { LightbulbIcon } from '@phosphor-icons/react/dist/ssr/Lightbulb';
import { TimerIcon } from '@phosphor-icons/react/dist/ssr/Timer';
import { XIcon } from '@phosphor-icons/react/dist/ssr/X';
import { UI_LABELS, type Lang } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { Payload } from '@/lib/exercisePayload';
import type { PromptImageRef } from '@/lib/activities/blocks';
import { imagePreviewUrl } from '@/lib/activities/paths';
import {
  deriveChooseQuestions,
  sentenceParts,
  shuffleOptions,
  type ChooseOption,
  type ChooseQuestion,
} from '@/lib/activities/chooseQuestion';
import { seededRandom, seedFromString } from '@/lib/activities/gameModes';
import { createPresentationQuizState, formatElapsed, presentationQuizReducer } from '@/lib/activities/presentationQuiz';
import { promptFontSize } from '@/lib/activities/presentationSlides';
import { useGameSound, type UseGameSoundResult } from '@/lib/activities/gameSounds';
import { optionColorClass } from '@/components/islands/mechanics/palette';
import { ACTIVITY_SHEET_CLASS } from '@/components/islands/mechanics/chip';
import { GameSoundToggle } from '@/components/islands/mechanics/gameFeel';
import GameResult, { type GameResultGuestInvite } from '@/components/islands/mechanics/GameResult';

export interface QuizChooseProps {
  lang: Lang;
  /** The block's own payload — one Básico multiple-choice slot per question (`chooseQuestion.ts`). */
  payload: Payload;
  /** The block's own per-question context images (`QuizBlock.promptImages`), keyed by slot id. */
  promptImages?: Record<string, PromptImageRef>;
  /** Stable per-block seed (the block id) — the server render's card order, before this play's random one. */
  seed: string;
  /** Threaded straight through to `GameResult` — set only by the practice page (build item N1). */
  nextHref?: string;
  /** Threaded straight through to `GameResult` — set only by the practice page, for an anonymous visitor. */
  guest?: GameResultGuestInvite;
}

/** How long a right pick stays on screen before the next question (owner spec, same as the presentation's own). */
const CORRECT_ADVANCE_MS = 1200;

/** How long a wrong pick (with no "¿Por qué?") stays on screen — longer, to read the right answer. */
const WRONG_ADVANCE_MS = 2000;

/** The timer pill counts whole seconds. */
const TICK_MS = 1000;

type GameCopy = (typeof UI_LABELS)[Lang]['activities']['gameModes'];

interface RoundResult {
  correct: number;
  total: number;
  elapsedMs: number;
  /** The questions this round missed, for "Repasar las que fallé". */
  missedIds: string[];
}

/** A fresh 32-bit seed for one play — client only (never during render). */
function randomPlaySeed(): number {
  return Math.floor(Math.random() * 2 ** 32);
}

/**
 * The card grid's column count (maquette `.p-tiles.n2/.n3/.n4`): 2 and 3
 * options run in one row; 4 run 2x2 beside an image, or in one row with the
 * full width. The phone layout (`global.css`) always uses 2 columns.
 */
function columnsFor(count: number, hasMedia: boolean): number {
  if (count === 2) return 2;
  if (count === 4) return hasMedia ? 2 : 4;
  return 3;
}

/** A keyboard event typed into a text field, not meant for the board. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/**
 * Is this board the one the learner sees? "Modo enfoque"
 * (`ActivityPracticeIsland`) mounts a SECOND board in its full-screen
 * overlay while the window's own stays mounted underneath — both listen to
 * the number keys, and only the uncovered one may answer. Without layout
 * (no box, or no `elementFromPoint`, as in jsdom) there is nothing to
 * compare, so the board counts as visible.
 */
function isBoardOnTop(root: HTMLElement | null): boolean {
  if (!root) return false;
  const rect = root.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0 || typeof document.elementFromPoint !== 'function') return true;
  const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
  return hit === null || root.contains(hit);
}

export default function QuizChoose({ lang, payload, promptImages, seed, nextHref, guest }: QuizChooseProps) {
  const t = UI_LABELS[lang].activities.gameModes;
  const sound = useGameSound();
  const allQuestions = useMemo(() => deriveChooseQuestions(payload), [payload]);

  const [round, setRound] = useState(0);
  /** `null` = every question; otherwise the ids "Repasar las que fallé" replays. */
  const [roundIds, setRoundIds] = useState<readonly string[] | null>(null);
  const [result, setResult] = useState<RoundResult | null>(null);
  /** This play's random seed — `null` until the client picks one (see the file header). */
  const [playSeed, setPlaySeed] = useState<number | null>(null);
  /** A round started from the result screen takes focus; the first one, on page load, never does. */
  const [focusNewRound, setFocusNewRound] = useState(false);

  useEffect(() => {
    setPlaySeed(randomPlaySeed());
  }, []);

  // New content (the author edited it) starts a fresh play of every question.
  const lastPayload = useRef(payload);
  useEffect(() => {
    if (lastPayload.current === payload) return;
    lastPayload.current = payload;
    setRoundIds(null);
    setResult(null);
    setFocusNewRound(false);
    setRound((r) => r + 1);
  }, [payload]);

  const questions = useMemo(
    () => (roundIds ? allQuestions.filter((q) => roundIds.includes(q.id)) : allQuestions),
    [allQuestions, roundIds],
  );

  const orders = useMemo(() => {
    const base = `${playSeed ?? seed}:${round}`;
    return questions.map((q) => shuffleOptions(q.options, seededRandom(seedFromString(`${base}:${q.id}`))));
  }, [questions, playSeed, seed, round]);

  function startRound(ids: readonly string[] | null) {
    setPlaySeed(randomPlaySeed());
    setRoundIds(ids);
    setResult(null);
    setFocusNewRound(true);
    setRound((r) => r + 1);
  }

  if (questions.length === 0) return null;

  if (result) {
    return (
      <div data-testid="quiz-choose" className="flex min-h-0 flex-1 flex-col">
        <GameResult
          lang={lang}
          correct={result.correct}
          total={result.total}
          elapsedMs={result.elapsedMs}
          elapsedFormat="clock"
          onPlayAgain={() => startRound(null)}
          onReviewWrong={result.missedIds.length > 0 ? () => startRound(result.missedIds) : undefined}
          nextHref={nextHref}
          guest={guest}
        />
      </div>
    );
  }

  return (
    <div data-testid="quiz-choose" className="flex min-h-0 flex-1 flex-col">
      <div data-testid="activity-sheet" className={cn(ACTIVITY_SHEET_CLASS, 'choose-sheet')}>
        <ChooseRound
          key={round}
          t={t}
          questions={questions}
          orders={orders}
          ready={playSeed !== null}
          promptImages={promptImages}
          sound={sound}
          focusOnMount={focusNewRound}
          onFinish={setResult}
        />
      </div>
    </div>
  );
}

interface ChooseRoundProps {
  t: GameCopy;
  questions: readonly ChooseQuestion[];
  /** Each question's options in this play's shuffled order, index-aligned with `questions`. */
  orders: readonly ChooseOption[][];
  /** `false` until this play's random order exists — the cards stay invisible meanwhile. */
  ready: boolean;
  promptImages?: Record<string, PromptImageRef>;
  sound: UseGameSoundResult;
  focusOnMount: boolean;
  onFinish: (result: RoundResult) => void;
}

/** One play through `questions` — remounted (`key`) for every new round, so its state always starts fresh. */
function ChooseRound({ t, questions, orders, ready, promptImages, sound, focusOnMount, onFinish }: ChooseRoundProps) {
  const [index, setIndex] = useState(0);
  const [quiz, dispatch] = useReducer(presentationQuizReducer, questions.length, createPresentationQuizState);
  const [announcement, setAnnouncement] = useState('');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const sentenceRef = useRef<HTMLParagraphElement | null>(null);
  const nextRef = useRef<HTMLButtonElement | null>(null);
  const isFirstQuestion = useRef(true);

  const question = questions[index] ?? questions[0];
  const order = orders[index] ?? orders[0] ?? [];
  const answer = quiz.answers[index];
  const status = answer?.status ?? 'unanswered';
  const locked = status !== 'unanswered';
  const waitsForNext = status === 'wrong' && Boolean(question?.explanation);
  const correctText = question?.options.find((o) => o.id === question.correctId)?.text ?? '';

  // The count-up timer, for the whole play: this round unmounts the moment
  // it finishes, which stops it.
  useEffect(() => {
    const interval = setInterval(() => dispatch({ type: 'tick', deltaMs: TICK_MS }), TICK_MS);
    return () => clearInterval(interval);
  }, []);

  // Focus follows the play: the new sentence on every new question (and on
  // a round started from the result screen), "Siguiente" once it appears.
  // Keyed on `index` alone: `focusOnMount` only matters for the first one.
  useEffect(() => {
    if (isFirstQuestion.current) {
      isFirstQuestion.current = false;
      if (!focusOnMount) return;
    }
    sentenceRef.current?.focus({ preventScroll: true });
  }, [index]);

  useEffect(() => {
    if (waitsForNext) nextRef.current?.focus({ preventScroll: true });
  }, [waitsForNext]);

  function goNext() {
    if (index + 1 < questions.length) {
      setIndex(index + 1);
      setAnnouncement('');
      sound.play('next');
      return;
    }
    sound.play('finish');
    onFinish({
      correct: quiz.score,
      total: questions.length,
      elapsedMs: quiz.elapsedMs,
      missedIds: questions.filter((_, i) => quiz.answers[i]?.status !== 'correct').map((q) => q.id),
    });
  }

  const advance = useEffectEvent(goNext);
  useEffect(() => {
    if (status === 'unanswered' || waitsForNext) return undefined;
    const timer = setTimeout(advance, status === 'correct' ? CORRECT_ADVANCE_MS : WRONG_ADVANCE_MS);
    return () => clearTimeout(timer);
  }, [status, waitsForNext, index]);

  function pick(optionIndex: number) {
    if (!question || !ready || locked) return;
    const option = order[optionIndex];
    if (!option) return;
    const correct = option.id === question.correctId;
    dispatch({ type: 'answer', slideIndex: index, optionIndex, correct });
    sound.play(correct ? 'correct' : 'wrong');
    setAnnouncement(correct ? t.chooseAnnounceCorrect : `${t.chooseAnnounceWrong} ${correctText}`);
  }

  // Keys 1–9 pick the card at that position — anywhere on the page, except
  // while typing into a field, and only on the board that is on top.
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
    if (isTypingTarget(event.target)) return;
    if (!/^[1-9]$/.test(event.key)) return;
    const optionIndex = Number(event.key) - 1;
    if (optionIndex >= order.length || locked || !isBoardOnTop(rootRef.current)) return;
    event.preventDefault();
    pick(optionIndex);
  });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKeyDown(event);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  if (!question) return null;

  const image = promptImages?.[question.id];
  const parts = sentenceParts(question.sentence, locked ? correctText : undefined);
  const explanationId = `choose-why-${question.id}`;
  const correctId = question.correctId;

  /** `correct`/`wrong` on the picked card, `reveal` (✓) on the right one after a miss, nothing on the rest. */
  function markFor(option: ChooseOption, optionIndex: number): 'correct' | 'wrong' | 'reveal' | undefined {
    if (!locked || !answer) return undefined;
    if (optionIndex === answer.selectedIndex) return status === 'correct' ? 'correct' : 'wrong';
    return option.id === correctId ? 'reveal' : undefined;
  }

  return (
    <div
      ref={rootRef}
      data-testid="choose-player"
      className="choose-player"
      style={{ '--choose-prompt': promptFontSize(question.sentence) } as CSSProperties}
    >
      <div aria-live="polite" role="status" className="sr-only" data-testid="choose-live-region">
        {announcement}
      </div>

      <div className="choose-top">
        <span data-testid="choose-timer" role="timer" className="choose-pill choose-pill--timer">
          <TimerIcon aria-hidden="true" weight="bold" />
          <span className="sr-only">{t.chooseTimerLabel} </span>
          {formatElapsed(quiz.elapsedMs)}
        </span>
        <span data-testid="choose-score" className="choose-pill choose-pill--score">
          <CheckIcon aria-hidden="true" weight="bold" />
          <span className="sr-only">{t.chooseScoreLabel} </span>
          {quiz.score}
        </span>
      </div>

      <div className="choose-prompt">
        <p ref={sentenceRef} tabIndex={-1} data-testid="choose-sentence">
          {parts.map((part, i) =>
            part.kind === 'text' ? (
              <span key={i}>{part.text}</span>
            ) : (
              <span
                key={i}
                data-testid="choose-blank"
                data-filled={part.fill !== null ? '' : undefined}
                data-tight={part.tight ? '' : undefined}
                className="choose-blank"
              >
                {part.fill ?? <span className="sr-only">{t.chooseBlank}</span>}
              </span>
            ),
          )}
        </p>
      </div>

      <div className="choose-content" data-has-media={image ? '' : undefined}>
        {/* A plain <img>, not `FadeImage`: that one fades in on React's
            `onLoad`, which never fires for an image the browser already
            loaded from the server HTML before hydration — it stayed
            invisible. Display-only context, so `alt=""`. */}
        {image && (
          <figure className="choose-media">
            <img data-testid="choose-image" src={imagePreviewUrl(image.path)} alt="" decoding="async" />
          </figure>
        )}
        <div
          role="group"
          aria-label={t.chooseOptionsLabel}
          className="choose-tiles"
          data-count={order.length}
          data-cols={columnsFor(order.length, Boolean(image))}
          data-answered={locked ? '' : undefined}
          style={ready ? undefined : { visibility: 'hidden' }}
        >
          {order.map((option, i) => {
            const mark = markFor(option, i);
            return (
              <button
                key={option.id}
                type="button"
                data-testid="choose-option"
                data-position={i + 1}
                data-mark={mark}
                disabled={locked}
                onClick={() => pick(i)}
                className={cn('choose-tile', optionColorClass(i))}
              >
                <span aria-hidden="true" className="choose-key">
                  {i + 1}
                </span>
                <span data-option-label="">{option.text}</span>
                {mark && (
                  <span data-testid="choose-mark" className="choose-mark">
                    {mark === 'wrong' ? (
                      <XIcon aria-hidden="true" weight="bold" />
                    ) : (
                      <CheckIcon aria-hidden="true" weight="bold" />
                    )}
                    <span className="sr-only">{mark === 'wrong' ? t.chooseWrongMark : t.chooseCorrectMark}</span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {waitsForNext && (
        <div data-testid="choose-why" className="choose-why">
          <span aria-hidden="true" className="choose-why-icon">
            <LightbulbIcon weight="fill" />
          </span>
          <p id={explanationId} className="choose-why-text">
            <b>{t.chooseWhy}</b>
            {question.explanation}
          </p>
          <button
            ref={nextRef}
            type="button"
            aria-describedby={explanationId}
            className="choose-next"
            onClick={goNext}
          >
            {t.chooseNext}
            <ArrowRightIcon aria-hidden="true" weight="bold" />
          </button>
        </div>
      )}

      <div className="choose-bottom">
        <span />
        <p data-testid="choose-position" className="choose-count">
          {index + 1} <span>{t.chooseOf}</span> {questions.length}
        </p>
        <GameSoundToggle
          muted={sound.muted}
          onToggle={sound.toggleMuted}
          labelMute={t.chooseSoundMute}
          labelUnmute={t.chooseSoundUnmute}
          className="choose-icon-btn"
        />
      </div>
    </div>
  );
}
