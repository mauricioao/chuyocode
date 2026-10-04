import { describe, it, expect } from 'vitest';
import {
  createPresentationState,
  isCoverSlide,
  isQuestionSlide,
  isSummarySlide,
  presentationReducer,
  questionNumber,
  questionProgress,
  type PresentationState,
} from './presentationReducer';

const QUESTION_COUNT = 3;

function state(partial: Partial<PresentationState>): PresentationState {
  return { ...createPresentationState(QUESTION_COUNT), ...partial };
}

describe('createPresentationState', () => {
  it('starts on the cover, nothing revealed', () => {
    expect(createPresentationState(QUESTION_COUNT)).toEqual({
      questionCount: QUESTION_COUNT,
      index: 0,
      revealed: false,
    });
  });

  it('never stores a negative question count', () => {
    expect(createPresentationState(-5).questionCount).toBe(0);
  });
});

describe('presentationReducer — start / restart', () => {
  it('resets to the cover from any slide, revealed or not', () => {
    const mid = state({ index: 2, revealed: true });
    expect(presentationReducer(mid, { type: 'start' })).toEqual(state({ index: 0, revealed: false }));
    expect(presentationReducer(mid, { type: 'restart' })).toEqual(state({ index: 0, revealed: false }));
  });

  it('is a no-op (same values) already sitting on the cover', () => {
    const cover = createPresentationState(QUESTION_COUNT);
    expect(presentationReducer(cover, { type: 'restart' })).toEqual(cover);
  });
});

describe('presentationReducer — next (the two-step reveal-then-advance)', () => {
  it('from the cover, advances straight to question 1, unrevealed', () => {
    const cover = createPresentationState(QUESTION_COUNT);
    expect(presentationReducer(cover, { type: 'next' })).toEqual(state({ index: 1, revealed: false }));
  });

  it('on an unrevealed question, reveals it instead of advancing', () => {
    const q1 = state({ index: 1, revealed: false });
    expect(presentationReducer(q1, { type: 'next' })).toEqual(state({ index: 1, revealed: true }));
  });

  it('on an already-revealed question, advances to the next one, unrevealed', () => {
    const q1Revealed = state({ index: 1, revealed: true });
    expect(presentationReducer(q1Revealed, { type: 'next' })).toEqual(state({ index: 2, revealed: false }));
  });

  it('advancing past the LAST revealed question lands on the summary', () => {
    const lastRevealed = state({ index: QUESTION_COUNT, revealed: true });
    expect(presentationReducer(lastRevealed, { type: 'next' })).toEqual(
      state({ index: QUESTION_COUNT + 1, revealed: false }),
    );
  });

  it('is a no-op on the summary', () => {
    const summary = state({ index: QUESTION_COUNT + 1, revealed: false });
    expect(presentationReducer(summary, { type: 'next' })).toEqual(summary);
  });
});

describe('presentationReducer — prev', () => {
  it('is a no-op on the cover', () => {
    const cover = createPresentationState(QUESTION_COUNT);
    expect(presentationReducer(cover, { type: 'prev' })).toEqual(cover);
  });

  it('steps back one slide and hides the answer again, even if it was revealed', () => {
    const q2Revealed = state({ index: 2, revealed: true });
    expect(presentationReducer(q2Revealed, { type: 'prev' })).toEqual(state({ index: 1, revealed: false }));
  });

  it('from the summary, steps back to the last question, unrevealed', () => {
    const summary = state({ index: QUESTION_COUNT + 1, revealed: false });
    expect(presentationReducer(summary, { type: 'prev' })).toEqual(
      state({ index: QUESTION_COUNT, revealed: false }),
    );
  });
});

describe('presentationReducer — reveal (the explicit "R" shortcut)', () => {
  it('reveals the current question without advancing', () => {
    const q1 = state({ index: 1, revealed: false });
    expect(presentationReducer(q1, { type: 'reveal' })).toEqual(state({ index: 1, revealed: true }));
  });

  it('is idempotent once already revealed', () => {
    const q1Revealed = state({ index: 1, revealed: true });
    expect(presentationReducer(q1Revealed, { type: 'reveal' })).toEqual(q1Revealed);
  });

  it('is a no-op on the cover', () => {
    const cover = createPresentationState(QUESTION_COUNT);
    expect(presentationReducer(cover, { type: 'reveal' })).toEqual(cover);
  });

  it('is a no-op on the summary', () => {
    const summary = state({ index: QUESTION_COUNT + 1, revealed: false });
    expect(presentationReducer(summary, { type: 'reveal' })).toEqual(summary);
  });
});

describe('slide predicates', () => {
  it('classify the cover, each question, and the summary', () => {
    const cover = createPresentationState(QUESTION_COUNT);
    const q2 = state({ index: 2 });
    const summary = state({ index: QUESTION_COUNT + 1 });

    expect([isCoverSlide(cover), isQuestionSlide(cover), isSummarySlide(cover)]).toEqual([true, false, false]);
    expect([isCoverSlide(q2), isQuestionSlide(q2), isSummarySlide(q2)]).toEqual([false, true, false]);
    expect([isCoverSlide(summary), isQuestionSlide(summary), isSummarySlide(summary)]).toEqual([
      false,
      false,
      true,
    ]);
  });

  it('questionNumber is null off a question slide, 1-based on one', () => {
    expect(questionNumber(createPresentationState(QUESTION_COUNT))).toBeNull();
    expect(questionNumber(state({ index: 2 }))).toBe(2);
    expect(questionNumber(state({ index: QUESTION_COUNT + 1 }))).toBeNull();
  });

  it('questionProgress clamps to [0, questionCount] for the cover and summary', () => {
    expect(questionProgress(createPresentationState(QUESTION_COUNT))).toBe(0);
    expect(questionProgress(state({ index: 2 }))).toBe(2);
    expect(questionProgress(state({ index: QUESTION_COUNT + 1 }))).toBe(QUESTION_COUNT);
  });
});
