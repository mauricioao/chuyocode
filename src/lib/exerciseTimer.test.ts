/**
 * Countdown rule tests — the decisions, without a clock.
 *
 * Every function here is total and deterministic, so the boundaries that
 * actually break a countdown (the tick that arrives after expiry, the pause
 * while feedback is on screen, the second that renders as `1:5`) are provable
 * directly instead of inferred from advancing fake timers through a component.
 */
import { describe, expect, it } from 'vitest';
import { formatRemaining, hasExpired, shouldTick, tick } from './exerciseTimer';

describe('tick', () => {
  it('takes one second off', () => {
    expect(tick(180)).toBe(179);
  });

  it('reaches exactly zero rather than stepping over it', () => {
    expect(tick(1)).toBe(0);
  });

  // A backgrounded tab queues intervals and the browser flushes them on return.
  // Without the clamp the display would go negative — a bug the learner sees
  // before anyone else does.
  it('never goes negative, however late the tick arrives', () => {
    expect(tick(0)).toBe(0);
    expect(tick(-5)).toBe(0);
  });
});

describe('hasExpired', () => {
  it('is false while there is time left', () => {
    expect(hasExpired(1)).toBe(false);
    expect(hasExpired(180)).toBe(false);
  });

  it('is true at zero', () => {
    expect(hasExpired(0)).toBe(true);
  });

  it('is true below zero, so a stray negative cannot count down forever', () => {
    expect(hasExpired(-1)).toBe(true);
  });
});

describe('shouldTick', () => {
  it('runs while an ungraded exercise has time left', () => {
    expect(shouldTick(180, false)).toBe(true);
  });

  // The normal case: almost no exercise carries a timer.
  it('does not run for an untimed exercise', () => {
    expect(shouldTick(null, false)).toBe(false);
    expect(shouldTick(null, true)).toBe(false);
  });

  it('does not run once the clock is spent', () => {
    expect(shouldTick(0, false)).toBe(false);
  });

  /**
   * PAUSE WHILE GRADED. The clock measures time spent ANSWERING; reading a
   * verdict is not answering, and draining the limit while the learner reads
   * would punish them for looking at the feedback we asked them to look at.
   */
  it('pauses while feedback is on screen', () => {
    expect(shouldTick(60, true)).toBe(false);
  });

  it('resumes when the learner goes back to correcting', () => {
    // Same remaining time, feedback dismissed: the limit stays meaningful across
    // a correction pass instead of silently becoming unlimited.
    expect(shouldTick(60, false)).toBe(true);
  });
});

describe('formatRemaining', () => {
  it('pads the seconds, so a stopwatch never reads 1:5', () => {
    expect(formatRemaining(65)).toBe('1:05');
  });

  it('does not pad the minutes', () => {
    expect(formatRemaining(180)).toBe('3:00');
  });

  it('renders a spent clock as zero', () => {
    expect(formatRemaining(0)).toBe('0:00');
  });

  it('renders under a minute with a leading zero minute', () => {
    expect(formatRemaining(9)).toBe('0:09');
  });

  it('crosses the minute boundary exactly', () => {
    expect(formatRemaining(60)).toBe('1:00');
    expect(formatRemaining(59)).toBe('0:59');
  });

  // Not capped at 60: an hour reads as `60:00`, which is unambiguous, where an
  // `h:mm:ss` branch would exist for a case no author will ever write.
  it('keeps counting in minutes past an hour', () => {
    expect(formatRemaining(3600)).toBe('60:00');
  });

  // Last stop before the DOM: a fractional or negative value must render as a
  // time, not as `NaN:aN`.
  it('renders a time for values a countdown should never produce', () => {
    expect(formatRemaining(-30)).toBe('0:00');
    expect(formatRemaining(90.7)).toBe('1:30');
  });
});
