/**
 * presentationReducer — pure navigation state for Presentation mode v1
 * ("Preguntas", presentation mode pass).
 *
 * The deck is always exactly: one cover slide, then one slide per question
 * (in order, across every `quiz` block — see `presentationSlides.ts`), then
 * one summary slide. `questionCount` is fixed for the whole session (the
 * activity's own data never changes mid-presentation), so `index` alone
 * locates every slide:
 *
 *   index === 0                    -> the cover
 *   1 <= index <= questionCount    -> question slide `index`
 *   index === questionCount + 1    -> the summary
 *
 * THE TWO-STEP "next" (owner spec, section 6): on a question slide that is
 * not yet revealed, `next` reveals it instead of advancing — advancing is
 * the FOLLOWING `next`. This is what lets a presenter's own wireless
 * clicker (PageDown-only, no separate "reveal" button) run the whole class:
 * every press either shows the answer or moves on, never both at once.
 *
 * Zero DOM, zero I/O — same posture as `canvasViewport.ts`'s camera: the
 * island only translates keyboard/pointer events and `questionCount` (from
 * its own props) into actions here, so the actual state machine stays
 * unit-testable without mounting any component.
 */

export interface PresentationState {
  /** Fixed for the session — the number of question slides between the cover and the summary. */
  questionCount: number;
  /** `0` = cover; `1..questionCount` = that question; `questionCount + 1` = summary. */
  index: number;
  /** Whether the CURRENT question slide's answer is revealed. Always `false` on the cover/summary. */
  revealed: boolean;
}

export type PresentationAction =
  | { type: 'start' }
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'reveal' }
  | { type: 'restart' };

/** The initial state: the cover slide, nothing revealed. Used both as the `useReducer` lazy-init result (via `{ type: 'start' }`) and directly by tests. */
export function createPresentationState(questionCount: number): PresentationState {
  return { questionCount: Math.max(0, questionCount), index: 0, revealed: false };
}

/** Is `state` sitting on the cover slide? */
export function isCoverSlide(state: PresentationState): boolean {
  return state.index === 0;
}

/** Is `state` sitting on the final summary slide? */
export function isSummarySlide(state: PresentationState): boolean {
  return state.index === state.questionCount + 1;
}

/** Is `state` sitting on one of the question slides (neither cover nor summary)? */
export function isQuestionSlide(state: PresentationState): boolean {
  return state.index >= 1 && state.index <= state.questionCount;
}

/** The 1-based question number `state` is showing, or `null` off a question slide. */
export function questionNumber(state: PresentationState): number | null {
  return isQuestionSlide(state) ? state.index : null;
}

/**
 * How far through the questions the presentation has gotten, clamped to
 * `[0, questionCount]` — the "k / N" progress readout the control bar shows
 * on EVERY slide: `0` on the cover (nothing answered yet), the question
 * number while on one, `questionCount` on the summary (every question
 * shown).
 */
export function questionProgress(state: PresentationState): number {
  return Math.min(Math.max(state.index, 0), state.questionCount);
}

export function presentationReducer(
  state: PresentationState,
  action: PresentationAction,
): PresentationState {
  switch (action.type) {
    case 'start':
    case 'restart':
      return state.index === 0 && !state.revealed ? state : { ...state, index: 0, revealed: false };

    case 'reveal':
      if (!isQuestionSlide(state) || state.revealed) return state;
      return { ...state, revealed: true };

    case 'prev':
      if (state.index === 0) return state;
      return { ...state, index: state.index - 1, revealed: false };

    case 'next': {
      // The two-step reveal-then-advance (see this module's own header).
      if (isQuestionSlide(state) && !state.revealed) {
        return { ...state, revealed: true };
      }
      const summaryIndex = state.questionCount + 1;
      if (state.index >= summaryIndex) return state;
      return { ...state, index: state.index + 1, revealed: false };
    }

    default:
      return state;
  }
}
