/**
 * Stepper arithmetic — the boundaries, mostly.
 *
 * These functions exist so the off-by-one that strands a learner on a step they
 * cannot leave is provable against numbers rather than against a rendered tree.
 * The interesting cases are therefore all at the ends: the first step, the last
 * step, and the inputs a UI should never produce but eventually will.
 */
import { describe, expect, it } from 'vitest';
import {
  clampStep,
  formatStep,
  hasNextStep,
  hasPrevStep,
  showsStepper,
} from './exerciseStepper';

describe('showsStepper', () => {
  /**
   * THE SINGLE-SLOT RULE. "1 de 1" beside two dead arrows is chrome that
   * describes itself and does nothing — and it would appear on the
   * overwhelming majority of exercises, which have exactly one slot.
   */
  it('is false for the one-slot exercise almost every exercise is', () => {
    expect(showsStepper(1)).toBe(false);
  });

  it('is true from two slots up', () => {
    expect(showsStepper(2)).toBe(true);
    expect(showsStepper(12)).toBe(true);
  });

  it('is false for a total no exercise can have', () => {
    for (const total of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(showsStepper(total)).toBe(false);
    }
  });
});

describe('clampStep', () => {
  it('leaves a valid step alone', () => {
    expect(clampStep(0, 3)).toBe(0);
    expect(clampStep(1, 3)).toBe(1);
    expect(clampStep(2, 3)).toBe(2);
  });

  /**
   * CLAMPING, NOT WRAPPING. Wrapping would send a learner who pressed "next"
   * once too often back to question one, which reads as having lost their place
   * rather than as having reached the end.
   */
  it('stops at the last step instead of wrapping to the first', () => {
    expect(clampStep(3, 3)).toBe(2);
    expect(clampStep(99, 3)).toBe(2);
  });

  it('stops at the first step instead of wrapping to the last', () => {
    expect(clampStep(-1, 3)).toBe(0);
    expect(clampStep(-99, 3)).toBe(0);
  });

  /**
   * TOTAL, not partial. The index reaches `payload.slots[i]`, so an input this
   * function refuses to answer for is a crash at the call site — and the one
   * caller that forgets to check is the one that ships.
   */
  it('answers for inputs no UI should produce', () => {
    expect(clampStep(Number.NaN, 3)).toBe(0);
    expect(clampStep(1.7, 3)).toBe(1);
    // An exercise with no slots still has to resolve to a real index.
    expect(clampStep(0, 0)).toBe(0);
    expect(clampStep(5, 0)).toBe(0);
    expect(clampStep(2, Number.NaN)).toBe(0);
  });
});

describe('hasPrevStep / hasNextStep', () => {
  it('opens with no way back and a way forward', () => {
    expect(hasPrevStep(0, 3)).toBe(false);
    expect(hasNextStep(0, 3)).toBe(true);
  });

  it('ends with a way back and no way forward', () => {
    expect(hasPrevStep(2, 3)).toBe(true);
    expect(hasNextStep(2, 3)).toBe(false);
  });

  it('offers both in the middle', () => {
    expect(hasPrevStep(1, 3)).toBe(true);
    expect(hasNextStep(1, 3)).toBe(true);
  });

  /**
   * The single-slot exercise has no stepper at all, but these must still be
   * honest if they are ever asked — a control that claims a next step here
   * would be a button leading nowhere.
   */
  it('offers nothing at all when there is one slot', () => {
    expect(hasPrevStep(0, 1)).toBe(false);
    expect(hasNextStep(0, 1)).toBe(false);
  });

  it('answers for an out-of-range step by clamping it first', () => {
    // Reported as if the learner were on the last step, which is where the
    // clamp would put them.
    expect(hasNextStep(99, 3)).toBe(false);
    expect(hasPrevStep(99, 3)).toBe(true);
    expect(hasPrevStep(-5, 3)).toBe(false);
  });
});

describe('formatStep', () => {
  /** ZERO-BASED INSIDE, ONE-BASED ON SCREEN — and the +1 lives only here. */
  it('counts from one for the learner while indexing from zero', () => {
    expect(formatStep(0, 5, 'de')).toBe('1 de 5');
    expect(formatStep(4, 5, 'de')).toBe('5 de 5');
  });

  it('takes the connecting word from the caller, so copy stays in the island', () => {
    expect(formatStep(1, 3, 'of')).toBe('2 of 3');
    expect(formatStep(1, 3, 'de')).toBe('2 de 3');
  });

  it('reports a real position for an out-of-range step', () => {
    // Never "0 de 5" or "6 de 5": the learner is somewhere, and the label has
    // to name where.
    expect(formatStep(-3, 5, 'de')).toBe('1 de 5');
    expect(formatStep(50, 5, 'de')).toBe('5 de 5');
  });

  it('never divides by an impossible total', () => {
    expect(formatStep(0, 0, 'de')).toBe('1 de 1');
    expect(formatStep(0, Number.NaN, 'de')).toBe('1 de 1');
  });
});
