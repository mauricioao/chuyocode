/**
 * presentationQuiz — pure live-quiz-rhythm state for Presentation mode's
 * MULTIPLE-CHOICE content slides (P1, owner spec 2026-10-16, UX-INGLES.md
 * section 13: "la presentación no debería ser más ni menos... con ese
 * ritmo"): per-slide answer status/selection (the instant ✓/✕ on the
 * tapped tile, and the right one revealed too when the pick was wrong), the
 * running score (correct multiple-choice answers only — the owner spec's
 * own "✓ 6" never counts a typed/match/reorder/cloze/groupsort/worksheet
 * slide), the elapsed-time counter, and whether the question-list menu is
 * open.
 *
 * THIS MODULE STAYS CONTENT-AGNOSTIC, same posture as `presentationReducer.ts`:
 * it has no idea which slides even HAVE options — `PresentationIsland.tsx`
 * only ever dispatches `answer` for a `kind === 'question'` slide whose
 * `segmentForInput(slot.input) === 'choice'` (`presentationSlides.ts`'s own
 * `revealableSlides` already marks exactly those as non-revealable, for the
 * SAME reason: this reducer, not the shared `revealed` flag, now owns their
 * reveal). Every other slide kind simply never touches `answers[i]` for its
 * own content-slide index, which stays `'unanswered'` forever — harmless,
 * nothing reads it.
 *
 * Zero DOM, zero I/O, zero real timers — the component owns the actual
 * `setInterval` and only ever dispatches `tick` with a measured delta, so
 * the clock itself stays deterministic under fake timers in tests (same
 * posture `gameSounds.ts`'s own pure tone scheduling keeps for audio).
 */

export type QuizAnswerStatus = 'unanswered' | 'correct' | 'wrong';

export interface QuizAnswerState {
  status: QuizAnswerStatus;
  /** The tapped tile's own 0-based index, or `null` while unanswered. */
  selectedIndex: number | null;
}

export interface PresentationQuizState {
  /**
   * One entry per CONTENT slide (`presentationReducer.ts`'s own
   * `slideCount`), 0-based — `answers[i]` is content slide `i + 1`
   * (`presentationReducer.ts`'s `index` is 1-based for content slides).
   */
  answers: readonly QuizAnswerState[];
  /** Correct multiple-choice answers only — see this module's own header. */
  score: number;
  /** Milliseconds elapsed since the component started ticking (counts up from the first content slide, frozen on the cover/summary — the component's own job, this module just adds whatever delta it is given). */
  elapsedMs: number;
  /** The question-list menu (bottom-left "☰", owner spec) — the component pauses its own ticking (stops dispatching `tick`) while this is `true`. */
  menuOpen: boolean;
}

export type PresentationQuizAction =
  | { type: 'answer'; slideIndex: number; optionIndex: number; correct: boolean }
  | { type: 'tick'; deltaMs: number }
  | { type: 'openMenu' }
  | { type: 'closeMenu' }
  | { type: 'restart' };

const UNANSWERED: QuizAnswerState = { status: 'unanswered', selectedIndex: null };

export function createPresentationQuizState(slideCount: number): PresentationQuizState {
  const count = Math.max(0, slideCount);
  return {
    answers: Array.from({ length: count }, () => UNANSWERED),
    score: 0,
    elapsedMs: 0,
    menuOpen: false,
  };
}

export function presentationQuizReducer(
  state: PresentationQuizState,
  action: PresentationQuizAction,
): PresentationQuizState {
  switch (action.type) {
    case 'answer': {
      const { slideIndex, optionIndex, correct } = action;
      const existing = state.answers[slideIndex];
      // One answer per question (owner spec): a second tap on an
      // already-answered slide, or an out-of-range index, is a no-op — the
      // tiles are locked, this is the defense-in-depth twin of that lock.
      if (!existing || existing.status !== 'unanswered') return state;
      const answers = state.answers.slice();
      answers[slideIndex] = { status: correct ? 'correct' : 'wrong', selectedIndex: optionIndex };
      return { ...state, answers, score: correct ? state.score + 1 : state.score };
    }

    case 'tick':
      if (action.deltaMs <= 0) return state;
      return { ...state, elapsedMs: state.elapsedMs + action.deltaMs };

    case 'openMenu':
      return state.menuOpen ? state : { ...state, menuOpen: true };

    case 'closeMenu':
      return state.menuOpen ? { ...state, menuOpen: false } : state;

    // "Volver a empezar" (owner spec): every answer, the score, and the
    // timer reset together — the menu also closes, same fresh-start posture.
    case 'restart':
      return createPresentationQuizState(state.answers.length);

    default:
      return state;
  }
}

/** Is this content slide's own answer locked (already answered, right or wrong)? `false` for an out-of-range index — there is nothing to lock. */
export function isAnswerLocked(state: PresentationQuizState, slideIndex: number): boolean {
  const entry = state.answers[slideIndex];
  return entry != null && entry.status !== 'unanswered';
}

/**
 * `m:ss` (no leading zero on the minute — the owner's own reference
 * screenshot shows "2:30", not "02:30"), floored to the whole second. The
 * top-left timer readout.
 */
export function formatElapsed(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
