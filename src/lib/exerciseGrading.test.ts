/**
 * Grading tests (docs/exercise-model.md, "Grading").
 *
 * One function grades every mechanic. The properties that matter most are the
 * ones that fail SILENTLY when broken — positional answers, cross-slot
 * coupling, an unshipped renderer poisoning a whole exercise — so each gets an
 * explicit test rather than being assumed.
 */
import { describe, it, expect } from 'vitest';
import { parsePayload, type Payload } from './exercisePayload';
import {
  check,
  comparatorFor,
  normalizeAnswer,
  COMPARATORS,
} from './exerciseGrading';

/** Build a payload from raw jsonb, failing loudly if the fixture is malformed. */
function payloadOf(raw: unknown): Payload {
  const parsed = parsePayload(raw);
  if (!parsed) throw new Error('fixture payload is invalid');
  return parsed;
}

const CHOICE = {
  pools: {
    opts: [
      { id: 'a', text: 'sit' },
      { id: 'b', text: 'sits' },
      { id: 'c', text: 'sitting' },
    ],
  },
  slots: [
    { id: 's1', label: 'The cat ___ on the mat', input: 'choice', pool: 'opts', answer: ['b'] },
  ],
};

describe('normalizeAnswer', () => {
  it('trims the edges and case-folds', () => {
    expect(normalizeAnswer('  Is Sitting  ')).toBe('is sitting');
  });

  it('preserves inner spacing so multi-word answers stay distinguishable', () => {
    expect(normalizeAnswer('is  sitting')).toBe('is  sitting');
  });
});

describe('comparator contract', () => {
  it('maps multiple choice to the set comparator', () => {
    expect(comparatorFor('choice')).toBe('set');
  });

  it('maps fill-in-the-blank to the text comparator', () => {
    expect(comparatorFor('text')).toBe('text');
  });

  it('returns null for a mechanic that has not shipped', () => {
    expect(comparatorFor('hotspot')).toBeNull();
  });

  it('collapses its mechanics onto a small set of comparators, not one each', () => {
    expect(new Set(Object.values(COMPARATORS)).size).toBeLessThan(
      Object.keys(COMPARATORS).length,
    );
  });
});

describe('check — set comparator', () => {
  it('marks the exercise correct when the chosen id matches the answer', () => {
    const result = check(payloadOf(CHOICE), { s1: ['b'] });
    expect(result.correct).toBe(true);
    expect(result.slots).toEqual({ s1: 'correct' });
  });

  it('marks the exercise incorrect when a different id is chosen', () => {
    const result = check(payloadOf(CHOICE), { s1: ['a'] });
    expect(result.correct).toBe(false);
    expect(result.slots).toEqual({ s1: 'incorrect' });
  });

  it('marks an unanswered slot incorrect rather than throwing', () => {
    expect(check(payloadOf(CHOICE), {}).slots).toEqual({ s1: 'incorrect' });
  });

  it('ignores selection order for a multi-select slot', () => {
    const multi = payloadOf({
      pools: { opts: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] },
      slots: [{ id: 's1', label: 'Pick two', input: 'choice', pool: 'opts', answer: ['a', 'c'] }],
    });
    expect(check(multi, { s1: ['c', 'a'] }).correct).toBe(true);
  });

  it('rejects a partial answer to a multi-select slot', () => {
    const multi = payloadOf({
      pools: { opts: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] },
      slots: [{ id: 's1', label: 'Pick two', input: 'choice', pool: 'opts', answer: ['a', 'c'] }],
    });
    expect(check(multi, { s1: ['a'] }).correct).toBe(false);
  });
});

// Spec — Scenario: Shuffled pool order unchanged result.
describe('check — stable ids, never positions', () => {
  it('grades identically after the pool is reordered', () => {
    const original = payloadOf(CHOICE);
    const shuffled = payloadOf({
      ...CHOICE,
      pools: {
        opts: [
          { id: 'c', text: 'sitting' },
          { id: 'b', text: 'sits' },
          { id: 'a', text: 'sit' },
        ],
      },
    });
    expect(check(original, { s1: ['b'] })).toEqual(check(shuffled, { s1: ['b'] }));
    expect(check(shuffled, { s1: ['b'] }).correct).toBe(true);
  });
});

// Spec — Scenario: Trimmed case-insensitive match accepted / Inner spacing mismatch rejected.
describe('check — text comparator', () => {
  const blank = payloadOf({
    pools: {},
    slots: [
      { id: 's1', label: 'The cat ___ on the mat', input: 'text', answer: ['sits', 'is sitting'] },
    ],
  });

  it('accepts a trimmed, case-folded match against the second listed answer', () => {
    expect(check(blank, { s1: [' Is Sitting '] }).correct).toBe(true);
  });

  it('accepts the first listed answer too', () => {
    expect(check(blank, { s1: ['sits'] }).correct).toBe(true);
  });

  it('rejects a response whose inner spacing differs', () => {
    expect(check(blank, { s1: ['is  sitting'] }).correct).toBe(false);
  });

  it('rejects a response that matches no listed answer', () => {
    expect(check(blank, { s1: ['sat'] }).correct).toBe(false);
  });
});

// Spec — Scenario: Mixed mechanics grade independently.
describe('check — per-slot independence', () => {
  const mixed = payloadOf({
    pools: { opts: [{ id: 'a', text: 'sit' }, { id: 'b', text: 'sits' }] },
    slots: [
      { id: 'pick', label: 'Choose', input: 'choice', pool: 'opts', answer: ['b'] },
      { id: 'type', label: 'Type', input: 'text', answer: ['early'] },
    ],
  });

  it('reports one slot correct and the other incorrect', () => {
    const result = check(mixed, { pick: ['b'], type: ['late'] });
    expect(result.slots).toEqual({ pick: 'correct', type: 'incorrect' });
    expect(result.correct).toBe(false);
  });

  it('reports the whole exercise correct only when every slot is', () => {
    expect(check(mixed, { pick: ['b'], type: ['early'] }).correct).toBe(true);
  });
});

// Spec — Scenario: Unknown mechanic degrades one slot only.
describe('check — unshipped mechanic', () => {
  const drifted = payloadOf({
    pools: { opts: [{ id: 'a' }, { id: 'b' }] },
    slots: [
      { id: 'pick', label: 'Choose', input: 'choice', pool: 'opts', answer: ['b'] },
      { id: 'spot', label: 'Tap it', input: 'hotspot', answer: ['x'] },
    ],
  });

  it('marks the unshipped slot unavailable while still grading the known one', () => {
    const result = check(drifted, { pick: ['b'] });
    expect(result.slots).toEqual({ pick: 'correct', spot: 'unavailable' });
  });

  it('does not let an unshipped renderer make the exercise permanently wrong', () => {
    expect(check(drifted, { pick: ['b'] }).correct).toBe(true);
  });

  it('still fails the exercise when the gradeable slot is wrong', () => {
    expect(check(drifted, { pick: ['a'] }).correct).toBe(false);
  });
});

// Spec — Scenario: Same result with/without audio.
describe('check — audio is a stimulus, not a grading input', () => {
  it('grades a response identically with and without media.audio', () => {
    const silent = payloadOf(CHOICE);
    const listening = payloadOf({ ...CHOICE, media: { audio: 'https://cdn.test/a.mp3' } });
    expect(check(listening, { s1: ['b'] })).toEqual(check(silent, { s1: ['b'] }));
    expect(check(listening, { s1: ['b'] }).correct).toBe(true);
  });
});
