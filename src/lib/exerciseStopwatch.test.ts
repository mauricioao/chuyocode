/**
 * Stopwatch rule tests — the decisions, without a clock.
 *
 * Every function here is total and deterministic, so the boundaries that
 * actually break a stopwatch (the verdict that must NOT stop it, the one that
 * must, the second that renders as `1:5`) are provable directly instead of
 * inferred from advancing fake timers through a component.
 */
import { describe, expect, it } from 'vitest';
import type { GradeResult } from './exerciseGrading';
import {
  formatElapsed,
  isSolved,
  shouldTick,
  START_SECONDS,
  tick,
} from './exerciseStopwatch';

const solved: GradeResult = { correct: true, slots: { s1: 'correct' } };
const wrong: GradeResult = { correct: false, slots: { s1: 'incorrect' } };

describe('tick', () => {
  it('starts from zero and advances one second at a time', () => {
    expect(START_SECONDS).toBe(0);
    expect(tick(START_SECONDS)).toBe(1);
    expect(tick(1)).toBe(2);
  });

  it('crosses the minute boundary without a special case', () => {
    expect(tick(59)).toBe(60);
  });

  /**
   * No ceiling, deliberately. A backgrounded tab flushes its queued intervals on
   * return, and here that simply catches the display up to the time that really
   * passed — the opposite of the countdown, where the same flush had to be
   * clamped to keep the display off `-1:59`.
   */
  it('keeps counting past an hour rather than capping', () => {
    expect(tick(3599)).toBe(3600);
    expect(tick(86399)).toBe(86400);
  });
});

describe('isSolved', () => {
  it('is false before the learner has submitted anything', () => {
    expect(isSolved(null)).toBe(false);
  });

  it('is false on a submission that was not fully correct', () => {
    expect(isSolved(wrong)).toBe(false);
  });

  it('is true on a fully correct submission', () => {
    expect(isSolved(solved)).toBe(true);
  });
});

describe('shouldTick', () => {
  it('runs from the moment the exercise is answerable', () => {
    expect(shouldTick(null)).toBe(true);
  });

  /**
   * THE REVERSAL. The countdown paused while feedback was on screen, because it
   * was a BUDGET and draining it punished the learner for reading the verdict we
   * asked them to read. A stopwatch has no budget and imposes no penalty — it
   * reports elapsed time, and freezing it here would make it report something
   * else. On a wrong answer, reading why is not a break in the attempt: it IS
   * the work.
   */
  it('keeps running while an incorrect verdict is on screen', () => {
    expect(shouldTick(wrong)).toBe(true);
  });

  it('stops on a fully correct submission — the one finish line', () => {
    expect(shouldTick(solved)).toBe(false);
  });
});

describe('formatElapsed', () => {
  it('opens at a padded zero, the way a stopwatch reads before it starts', () => {
    expect(formatElapsed(START_SECONDS)).toBe('00:00');
  });

  it('pads the seconds, so a stopwatch never reads 1:5', () => {
    expect(formatElapsed(65)).toBe('01:05');
  });

  it('crosses the minute boundary exactly', () => {
    expect(formatElapsed(59)).toBe('00:59');
    expect(formatElapsed(60)).toBe('01:00');
  });

  /**
   * Past ten minutes the minute field needs two digits of its own. The pad must
   * widen the field, never truncate it — a `slice`-based formatter reads `10:00`
   * as `0:00` here and the bug only appears on the longest attempts.
   */
  it('keeps both digits once the minutes reach two of their own', () => {
    expect(formatElapsed(600)).toBe('10:00');
    expect(formatElapsed(659)).toBe('10:59');
  });

  // Not capped at 60: an hour reads as `60:00`, which is unambiguous, where an
  // `h:mm:ss` branch would exist for a case nothing produces.
  it('keeps counting in minutes past an hour', () => {
    expect(formatElapsed(3600)).toBe('60:00');
  });

  // Last stop before the DOM: a fractional or negative value must render as a
  // time, not as `NaN:aN`.
  it('renders a time for values a stopwatch should never produce', () => {
    expect(formatElapsed(-30)).toBe('00:00');
    expect(formatElapsed(90.7)).toBe('01:30');
  });
});
