/**
 * presentationReducer — pure navigation state for Presentation mode
 * ("Preguntas", presentation mode pass; extended for the worksheet zoom
 * tour, sprint week 3).
 *
 * The deck is always exactly: one cover slide, then `slideCount` CONTENT
 * slides (in order — `presentationSlides.ts`'s own `buildPresentationSlides`,
 * every quiz question AND every worksheet overview/zone, interleaved exactly
 * as authored), then one summary slide. `slideCount` is fixed for the whole
 * session (the activity's own data never changes mid-presentation), so
 * `index` alone locates every slide:
 *
 *   index === 0                 -> the cover
 *   1 <= index <= slideCount    -> content slide `index`
 *   index === slideCount + 1    -> the summary
 *
 * THIS MODULE STAYS CONTENT-AGNOSTIC: it has no idea a "question" or a
 * "worksheet zone" exists — `presentationSlides.ts` owns what each slide
 * actually IS, this module only needs to know how MANY content slides there
 * are and which ones are "revealable" at all ({@link PresentationState.revealable},
 * one flag per content slide — `presentationSlides.ts`'s own `revealableSlides`).
 * A worksheet OVERVIEW slide is the one kind that is never revealable (a
 * plain glance at the whole page, not a question) — every other kind
 * (a quiz question, a worksheet zone) is.
 *
 * THE TWO-STEP "next" (owner spec, section 6, unchanged by the worksheet
 * extension): on a REVEALABLE content slide that is not yet revealed, `next`
 * reveals it instead of advancing — advancing is the FOLLOWING `next`. On a
 * NON-revealable one (a worksheet overview), `next` advances straight away —
 * there is nothing to reveal. This is what lets a presenter's own wireless
 * clicker (PageDown-only, no separate "reveal" button) run the whole class:
 * every press either shows something or moves on, never both at once.
 *
 * Zero DOM, zero I/O — same posture as `canvasViewport.ts`'s camera: the
 * island only translates keyboard/pointer events and the deck's own shape
 * (from its own props) into actions here, so the actual state machine stays
 * unit-testable without mounting any component.
 */

export interface PresentationState {
  /** Fixed for the session — the number of content slides between the cover and the summary. */
  slideCount: number;
  /** Parallel to the content slides (`length === slideCount`): whether that slide supports "reveal" at all. See this module's own header. */
  revealable: readonly boolean[];
  /** `0` = cover; `1..slideCount` = that content slide; `slideCount + 1` = summary. */
  index: number;
  /** Whether the CURRENT content slide's reveal is showing. Always `false` on the cover/summary, and never flips true on a non-revealable slide. */
  revealed: boolean;
}

export type PresentationAction =
  | { type: 'start' }
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'reveal' }
  | { type: 'restart' };

/**
 * The initial state: the cover slide, nothing revealed. Used both as the
 * `useReducer` lazy-init result (via `{ type: 'start' }`) and directly by
 * tests.
 *
 * `revealable` defaults to "every slide is revealable" when omitted or
 * mismatched in length — the plain quiz-only deck v1 shipped with, and the
 * shape every existing caller that only ever dealt with questions can keep
 * using unchanged.
 */
export function createPresentationState(
  slideCount: number,
  revealable?: readonly boolean[],
): PresentationState {
  const count = Math.max(0, slideCount);
  const flags =
    revealable && revealable.length === slideCount ? revealable.slice(0, count) : Array(count).fill(true);
  return { slideCount: count, revealable: flags, index: 0, revealed: false };
}

/** Is `state` sitting on the cover slide? */
export function isCoverSlide(state: PresentationState): boolean {
  return state.index === 0;
}

/** Is `state` sitting on the final summary slide? */
export function isSummarySlide(state: PresentationState): boolean {
  return state.index === state.slideCount + 1;
}

/** Is `state` sitting on one of the content slides (neither cover nor summary)? */
export function isContentSlide(state: PresentationState): boolean {
  return state.index >= 1 && state.index <= state.slideCount;
}

/** Does the CURRENT slide support "reveal" at all — a content slide whose own `revealable` flag is set? False on the cover/summary, and on a worksheet-overview-style glance slide. */
export function isRevealable(state: PresentationState): boolean {
  return isContentSlide(state) && state.revealable[state.index - 1] === true;
}

/** The 1-based content-slide number `state` is showing, or `null` off a content slide. */
export function slideNumber(state: PresentationState): number | null {
  return isContentSlide(state) ? state.index : null;
}

/**
 * How far through the content slides the presentation has gotten, clamped
 * to `[0, slideCount]` — the "k / N" progress readout the control bar shows
 * on EVERY slide: `0` on the cover (nothing shown yet), the slide number
 * while on one, `slideCount` on the summary (every slide shown).
 */
export function slideProgress(state: PresentationState): number {
  return Math.min(Math.max(state.index, 0), state.slideCount);
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
      if (!isRevealable(state) || state.revealed) return state;
      return { ...state, revealed: true };

    case 'prev':
      if (state.index === 0) return state;
      return { ...state, index: state.index - 1, revealed: false };

    case 'next': {
      // The two-step reveal-then-advance (see this module's own header).
      if (isRevealable(state) && !state.revealed) {
        return { ...state, revealed: true };
      }
      const summaryIndex = state.slideCount + 1;
      if (state.index >= summaryIndex) return state;
      return { ...state, index: state.index + 1, revealed: false };
    }

    default:
      return state;
  }
}
