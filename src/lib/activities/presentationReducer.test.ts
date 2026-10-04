import { describe, it, expect } from 'vitest';
import {
  createPresentationState,
  isCoverSlide,
  isContentSlide,
  isSummarySlide,
  isRevealable,
  presentationReducer,
  slideNumber,
  slideProgress,
  type PresentationState,
} from './presentationReducer';

const SLIDE_COUNT = 3;

function state(partial: Partial<PresentationState>): PresentationState {
  return { ...createPresentationState(SLIDE_COUNT), ...partial };
}

describe('createPresentationState', () => {
  it('starts on the cover, nothing revealed, every slide revealable by default', () => {
    expect(createPresentationState(SLIDE_COUNT)).toEqual({
      slideCount: SLIDE_COUNT,
      revealable: [true, true, true],
      index: 0,
      revealed: false,
    });
  });

  it('never stores a negative slide count', () => {
    expect(createPresentationState(-5).slideCount).toBe(0);
    expect(createPresentationState(-5).revealable).toEqual([]);
  });

  it('accepts an explicit revealable flag per slide (the worksheet overview case)', () => {
    const s = createPresentationState(3, [false, true, true]);
    expect(s.revealable).toEqual([false, true, true]);
  });

  it('falls back to all-revealable when the given flags do not match the slide count', () => {
    expect(createPresentationState(3, [true]).revealable).toEqual([true, true, true]);
  });
});

describe('presentationReducer — start / restart', () => {
  it('resets to the cover from any slide, revealed or not', () => {
    const mid = state({ index: 2, revealed: true });
    expect(presentationReducer(mid, { type: 'start' })).toEqual(state({ index: 0, revealed: false }));
    expect(presentationReducer(mid, { type: 'restart' })).toEqual(state({ index: 0, revealed: false }));
  });

  it('is a no-op (same values) already sitting on the cover', () => {
    const cover = createPresentationState(SLIDE_COUNT);
    expect(presentationReducer(cover, { type: 'restart' })).toEqual(cover);
  });
});

describe('presentationReducer — next (the two-step reveal-then-advance)', () => {
  it('from the cover, advances straight to slide 1, unrevealed', () => {
    const cover = createPresentationState(SLIDE_COUNT);
    expect(presentationReducer(cover, { type: 'next' })).toEqual(state({ index: 1, revealed: false }));
  });

  it('on an unrevealed, revealable slide, reveals it instead of advancing', () => {
    const q1 = state({ index: 1, revealed: false });
    expect(presentationReducer(q1, { type: 'next' })).toEqual(state({ index: 1, revealed: true }));
  });

  it('on an already-revealed slide, advances to the next one, unrevealed', () => {
    const q1Revealed = state({ index: 1, revealed: true });
    expect(presentationReducer(q1Revealed, { type: 'next' })).toEqual(state({ index: 2, revealed: false }));
  });

  it('advancing past the LAST revealed slide lands on the summary', () => {
    const lastRevealed = state({ index: SLIDE_COUNT, revealed: true });
    expect(presentationReducer(lastRevealed, { type: 'next' })).toEqual(
      state({ index: SLIDE_COUNT + 1, revealed: false }),
    );
  });

  it('is a no-op on the summary', () => {
    const summary = state({ index: SLIDE_COUNT + 1, revealed: false });
    expect(presentationReducer(summary, { type: 'next' })).toEqual(summary);
  });

  it('advances straight through a NON-revealable slide (a worksheet overview) with a single press', () => {
    const withOverview = createPresentationState(3, [false, true, true]);
    const onOverview = { ...withOverview, index: 1 };
    // No reveal step at all: `revealed` stays false, index moves straight to 2.
    expect(presentationReducer(onOverview, { type: 'next' })).toEqual({ ...withOverview, index: 2, revealed: false });
  });
});

describe('presentationReducer — prev', () => {
  it('is a no-op on the cover', () => {
    const cover = createPresentationState(SLIDE_COUNT);
    expect(presentationReducer(cover, { type: 'prev' })).toEqual(cover);
  });

  it('steps back one slide and hides the reveal again, even if it was revealed', () => {
    const q2Revealed = state({ index: 2, revealed: true });
    expect(presentationReducer(q2Revealed, { type: 'prev' })).toEqual(state({ index: 1, revealed: false }));
  });

  it('from the summary, steps back to the last slide, unrevealed', () => {
    const summary = state({ index: SLIDE_COUNT + 1, revealed: false });
    expect(presentationReducer(summary, { type: 'prev' })).toEqual(
      state({ index: SLIDE_COUNT, revealed: false }),
    );
  });
});

describe('presentationReducer — reveal (the explicit "R" shortcut)', () => {
  it('reveals the current slide without advancing', () => {
    const q1 = state({ index: 1, revealed: false });
    expect(presentationReducer(q1, { type: 'reveal' })).toEqual(state({ index: 1, revealed: true }));
  });

  it('is idempotent once already revealed', () => {
    const q1Revealed = state({ index: 1, revealed: true });
    expect(presentationReducer(q1Revealed, { type: 'reveal' })).toEqual(q1Revealed);
  });

  it('is a no-op on the cover', () => {
    const cover = createPresentationState(SLIDE_COUNT);
    expect(presentationReducer(cover, { type: 'reveal' })).toEqual(cover);
  });

  it('is a no-op on the summary', () => {
    const summary = state({ index: SLIDE_COUNT + 1, revealed: false });
    expect(presentationReducer(summary, { type: 'reveal' })).toEqual(summary);
  });

  it('is a no-op on a NON-revealable slide (a worksheet overview) — there is nothing to reveal', () => {
    const withOverview = createPresentationState(3, [false, true, true]);
    const onOverview = { ...withOverview, index: 1 };
    expect(presentationReducer(onOverview, { type: 'reveal' })).toEqual(onOverview);
  });
});

describe('slide predicates', () => {
  it('classify the cover, each content slide, and the summary', () => {
    const cover = createPresentationState(SLIDE_COUNT);
    const q2 = state({ index: 2 });
    const summary = state({ index: SLIDE_COUNT + 1 });

    expect([isCoverSlide(cover), isContentSlide(cover), isSummarySlide(cover)]).toEqual([true, false, false]);
    expect([isCoverSlide(q2), isContentSlide(q2), isSummarySlide(q2)]).toEqual([false, true, false]);
    expect([isCoverSlide(summary), isContentSlide(summary), isSummarySlide(summary)]).toEqual([
      false,
      false,
      true,
    ]);
  });

  it('isRevealable is false on the cover/summary, and follows the per-slide flag on a content slide', () => {
    const withOverview = createPresentationState(3, [false, true, true]);
    expect(isRevealable(withOverview)).toBe(false); // cover
    expect(isRevealable({ ...withOverview, index: 1 })).toBe(false); // the overview slide itself
    expect(isRevealable({ ...withOverview, index: 2 })).toBe(true);
    expect(isRevealable({ ...withOverview, index: 4 })).toBe(false); // summary
  });

  it('slideNumber is null off a content slide, 1-based on one', () => {
    expect(slideNumber(createPresentationState(SLIDE_COUNT))).toBeNull();
    expect(slideNumber(state({ index: 2 }))).toBe(2);
    expect(slideNumber(state({ index: SLIDE_COUNT + 1 }))).toBeNull();
  });

  it('slideProgress clamps to [0, slideCount] for the cover and summary', () => {
    expect(slideProgress(createPresentationState(SLIDE_COUNT))).toBe(0);
    expect(slideProgress(state({ index: 2 }))).toBe(2);
    expect(slideProgress(state({ index: SLIDE_COUNT + 1 }))).toBe(SLIDE_COUNT);
  });
});
