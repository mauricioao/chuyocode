import { describe, it, expect } from 'vitest';
import {
  createPresentationQuizState,
  presentationQuizReducer,
  isAnswerLocked,
  formatElapsed,
  type PresentationQuizState,
} from './presentationQuiz';

const SLIDE_COUNT = 3;

function state(partial: Partial<PresentationQuizState>): PresentationQuizState {
  return { ...createPresentationQuizState(SLIDE_COUNT), ...partial };
}

describe('createPresentationQuizState', () => {
  it('starts with every slide unanswered, zero score, zero elapsed, menu closed', () => {
    expect(createPresentationQuizState(SLIDE_COUNT)).toEqual({
      answers: [
        { status: 'unanswered', selectedIndex: null },
        { status: 'unanswered', selectedIndex: null },
        { status: 'unanswered', selectedIndex: null },
      ],
      score: 0,
      elapsedMs: 0,
      menuOpen: false,
    });
  });

  it('never stores a negative slide count', () => {
    expect(createPresentationQuizState(-5).answers).toEqual([]);
  });
});

describe('presentationQuizReducer — answer', () => {
  it('marks the tapped tile correct and increments the score', () => {
    const s = state({});
    const next = presentationQuizReducer(s, { type: 'answer', slideIndex: 0, optionIndex: 2, correct: true });
    expect(next.answers[0]).toEqual({ status: 'correct', selectedIndex: 2 });
    expect(next.score).toBe(1);
  });

  it('marks the tapped tile wrong and does NOT increment the score', () => {
    const s = state({});
    const next = presentationQuizReducer(s, { type: 'answer', slideIndex: 1, optionIndex: 0, correct: false });
    expect(next.answers[1]).toEqual({ status: 'wrong', selectedIndex: 0 });
    expect(next.score).toBe(0);
  });

  it('only touches the given slide — the others stay unanswered', () => {
    const s = state({});
    const next = presentationQuizReducer(s, { type: 'answer', slideIndex: 1, optionIndex: 0, correct: true });
    expect(next.answers[0]).toEqual({ status: 'unanswered', selectedIndex: null });
    expect(next.answers[2]).toEqual({ status: 'unanswered', selectedIndex: null });
  });

  it('is a no-op (locked) on a slide already answered — a second tap never flips the score or the mark', () => {
    const answered = presentationQuizReducer(state({}), {
      type: 'answer',
      slideIndex: 0,
      optionIndex: 1,
      correct: true,
    });
    const second = presentationQuizReducer(answered, {
      type: 'answer',
      slideIndex: 0,
      optionIndex: 2,
      correct: false,
    });
    expect(second).toEqual(answered);
  });

  it('is a no-op on an out-of-range slide index', () => {
    const s = state({});
    expect(presentationQuizReducer(s, { type: 'answer', slideIndex: 99, optionIndex: 0, correct: true })).toBe(s);
  });

  it('counts every correct answer across multiple questions', () => {
    let s = state({});
    s = presentationQuizReducer(s, { type: 'answer', slideIndex: 0, optionIndex: 0, correct: true });
    s = presentationQuizReducer(s, { type: 'answer', slideIndex: 1, optionIndex: 0, correct: false });
    s = presentationQuizReducer(s, { type: 'answer', slideIndex: 2, optionIndex: 0, correct: true });
    expect(s.score).toBe(2);
  });
});

describe('presentationQuizReducer — tick', () => {
  it('adds the delta to elapsedMs', () => {
    const s = presentationQuizReducer(state({}), { type: 'tick', deltaMs: 1000 });
    expect(s.elapsedMs).toBe(1000);
  });

  it('accumulates across multiple ticks', () => {
    let s = state({});
    s = presentationQuizReducer(s, { type: 'tick', deltaMs: 1000 });
    s = presentationQuizReducer(s, { type: 'tick', deltaMs: 1000 });
    expect(s.elapsedMs).toBe(2000);
  });

  it('is a no-op for a zero or negative delta', () => {
    const s = state({ elapsedMs: 500 });
    expect(presentationQuizReducer(s, { type: 'tick', deltaMs: 0 })).toBe(s);
    expect(presentationQuizReducer(s, { type: 'tick', deltaMs: -10 })).toBe(s);
  });
});

describe('presentationQuizReducer — openMenu / closeMenu', () => {
  it('opens and closes the menu, pausing/resuming nothing itself (the component decides what that means)', () => {
    const opened = presentationQuizReducer(state({}), { type: 'openMenu' });
    expect(opened.menuOpen).toBe(true);
    const closed = presentationQuizReducer(opened, { type: 'closeMenu' });
    expect(closed.menuOpen).toBe(false);
  });

  it('is a no-op (same reference) opening an already-open menu, or closing an already-closed one', () => {
    const opened = state({ menuOpen: true });
    expect(presentationQuizReducer(opened, { type: 'openMenu' })).toBe(opened);
    const closed = state({ menuOpen: false });
    expect(presentationQuizReducer(closed, { type: 'closeMenu' })).toBe(closed);
  });
});

describe('presentationQuizReducer — restart', () => {
  it('resets every answer, the score, the timer, and closes the menu', () => {
    let s = state({});
    s = presentationQuizReducer(s, { type: 'answer', slideIndex: 0, optionIndex: 0, correct: true });
    s = presentationQuizReducer(s, { type: 'tick', deltaMs: 5000 });
    s = presentationQuizReducer(s, { type: 'openMenu' });
    const restarted = presentationQuizReducer(s, { type: 'restart' });
    expect(restarted).toEqual(createPresentationQuizState(SLIDE_COUNT));
  });
});

describe('isAnswerLocked', () => {
  it('is false while unanswered, true once correct or wrong', () => {
    const s = state({});
    expect(isAnswerLocked(s, 0)).toBe(false);
    const correct = presentationQuizReducer(s, { type: 'answer', slideIndex: 0, optionIndex: 0, correct: true });
    expect(isAnswerLocked(correct, 0)).toBe(true);
    const wrong = presentationQuizReducer(s, { type: 'answer', slideIndex: 1, optionIndex: 0, correct: false });
    expect(isAnswerLocked(wrong, 1)).toBe(true);
  });

  it('is false for an out-of-range slide index', () => {
    expect(isAnswerLocked(state({}), 99)).toBe(false);
  });
});

describe('formatElapsed', () => {
  it('formats under a minute as "0:ss"', () => {
    expect(formatElapsed(0)).toBe('0:00');
    expect(formatElapsed(5000)).toBe('0:05');
    expect(formatElapsed(59000)).toBe('0:59');
  });

  it('formats minutes without a leading zero, seconds with one', () => {
    expect(formatElapsed(60000)).toBe('1:00');
    expect(formatElapsed(150000)).toBe('2:30');
    expect(formatElapsed(3661000)).toBe('61:01');
  });

  it('floors partial seconds', () => {
    expect(formatElapsed(1999)).toBe('0:01');
  });

  it('never goes negative', () => {
    expect(formatElapsed(-500)).toBe('0:00');
  });
});
