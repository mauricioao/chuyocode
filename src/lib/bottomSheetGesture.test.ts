import { describe, it, expect } from 'vitest';
import { dragTranslateY, dragVelocity, shouldDismissSheet, DISMISS_DISTANCE_RATIO, DISMISS_VELOCITY } from './bottomSheetGesture';

describe('dragTranslateY', () => {
  it('is the downward distance from start to current', () => {
    expect(dragTranslateY({ y: 100, time: 0 }, { y: 150, time: 10 })).toBe(50);
  });

  it('never goes negative when the drag moves upward', () => {
    expect(dragTranslateY({ y: 100, time: 0 }, { y: 60, time: 10 })).toBe(0);
  });

  it('is zero for no movement', () => {
    expect(dragTranslateY({ y: 100, time: 0 }, { y: 100, time: 5 })).toBe(0);
  });
});

describe('dragVelocity', () => {
  it('is px per ms of downward movement', () => {
    expect(dragVelocity({ y: 0, time: 0 }, { y: 100, time: 200 })).toBe(0.5);
  });

  it('is negative for upward movement', () => {
    expect(dragVelocity({ y: 100, time: 0 }, { y: 0, time: 200 })).toBe(-0.5);
  });

  it('is zero when time did not advance (defensive)', () => {
    expect(dragVelocity({ y: 0, time: 10 }, { y: 50, time: 10 })).toBe(0);
  });
});

describe('shouldDismissSheet', () => {
  it('dismisses past the distance ratio even at zero velocity', () => {
    const sheetHeight = 400;
    const justUnder = sheetHeight * DISMISS_DISTANCE_RATIO;
    const justOver = sheetHeight * DISMISS_DISTANCE_RATIO + 1;
    expect(shouldDismissSheet(justUnder, 0, sheetHeight)).toBe(false);
    expect(shouldDismissSheet(justOver, 0, sheetHeight)).toBe(true);
  });

  it('dismisses on a fast flick even with barely any travel', () => {
    expect(shouldDismissSheet(5, DISMISS_VELOCITY + 0.1, 400)).toBe(true);
  });

  it('never dismisses a zero/negative drag', () => {
    expect(shouldDismissSheet(0, 10, 400)).toBe(false);
  });

  it('never dismisses when the sheet has no measured height yet (jsdom)', () => {
    expect(shouldDismissSheet(1000, 10, 0)).toBe(false);
  });
});
