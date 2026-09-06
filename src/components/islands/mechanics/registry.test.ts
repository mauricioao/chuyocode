/**
 * Mechanic registry tests — dispatch on `slot.input`, plus the invariant that
 * keeps grading honest.
 *
 * THE BUG THIS FILE EXISTS TO PREVENT: `COMPARATORS` in exerciseGrading.ts can
 * be wider than the set of shipped renderers, because a comparator is cheap and
 * a renderer is not, so one routinely lands first. Graded with the default
 * resolver, such a slot renders as Unavailable — the learner is shown NO input
 * — and is then marked `incorrect` for the answer they were never allowed to
 * give. Permanently wrong, silently, with nothing thrown.
 *
 * The fix is structural: grade through the RENDERER registry, so a slot can
 * only be graded by a mechanic that was actually drawn.
 */
import { describe, expect, it } from 'vitest';
import { COMPARATORS, check, comparatorFor } from '@/lib/exerciseGrading';
import type { Payload } from '@/lib/exercisePayload';
import ChoiceRenderer from './ChoiceRenderer';
import SelectRenderer from './SelectRenderer';
import TextRenderer from './TextRenderer';
import { comparatorForRenderable, rendererFor } from './registry';

/** Mechanics named in the model that have shipped neither half. */
const UNSHIPPED = ['drop', 'order', 'hotspot'];

describe('rendererFor', () => {
  it('resolves every shipped mechanic to its own renderer', () => {
    expect(rendererFor('choice')).toBe(ChoiceRenderer);
    expect(rendererFor('select')).toBe(SelectRenderer);
    expect(rendererFor('text')).toBe(TextRenderer);
  });

  // TRIANGULATION: three distinct mechanics must map to three DISTINCT
  // renderers, which a single catch-all component would fail.
  it('maps each mechanic to a distinct renderer', () => {
    const resolved = [
      rendererFor('choice'),
      rendererFor('select'),
      rendererFor('text'),
    ];

    expect(new Set(resolved).size).toBe(3);
  });

  it('returns null for a mechanic that has no renderer yet', () => {
    for (const input of UNSHIPPED) {
      expect(rendererFor(input)).toBeNull();
    }
  });

  it('returns null for an empty or unknown input rather than throwing', () => {
    expect(rendererFor('')).toBeNull();
    expect(rendererFor('definitely-not-a-mechanic')).toBeNull();
  });
});

describe('comparatorForRenderable', () => {
  it('resolves a comparator for every mechanic that is actually rendered', () => {
    // Both halves shipped for all three: a renderer AND a comparator.
    expect(comparatorForRenderable('choice')).toBe('set');
    expect(comparatorForRenderable('select')).toBe('set');
    expect(comparatorForRenderable('text')).toBe('text');
  });

  it('refuses to grade a mechanic that has neither half', () => {
    for (const input of UNSHIPPED) {
      expect(comparatorForRenderable(input)).toBeNull();
    }
  });

  /**
   * THE INVARIANT, stated directly rather than via one example pair.
   *
   * As of this slice `COMPARATORS` and the renderer registry happen to cover the
   * same three mechanics, so no concrete "comparator without renderer" case is
   * left to demonstrate. Asserting the RULE instead of an instance keeps the
   * guard alive: it re-arms by itself the next time a comparator ships ahead of
   * its renderer, which is precisely when nobody remembers this hole existed.
   */
  it('never grades a mechanic the registry cannot draw, for ANY known input', () => {
    const inputs = [...Object.keys(COMPARATORS), ...UNSHIPPED, '', 'unknown'];

    for (const input of inputs) {
      const expected = rendererFor(input) ? comparatorFor(input) : null;
      expect(comparatorForRenderable(input)).toBe(expected);
    }
  });

  it('is never wider than the comparator map', () => {
    for (const input of [...Object.keys(COMPARATORS), ...UNSHIPPED]) {
      if (comparatorForRenderable(input) !== null) {
        expect(comparatorFor(input)).not.toBeNull();
      }
    }
  });
});

describe('grading through the registry (the correctness guarantee)', () => {
  const payload: Payload = {
    pools: { opts: [{ id: 'a', text: 'sit' }, { id: 'b', text: 'sits' }] },
    slots: [
      { id: 's1', label: 'pick one', input: 'choice', pool: 'opts', answer: ['b'] },
      { id: 'h1', label: 'tap it', input: 'hotspot', answer: ['x'] },
    ],
  };

  it('marks an UNRENDERABLE slot unavailable, never incorrect', () => {
    // The learner answered the only slot they were shown.
    const result = check(payload, { s1: ['b'] }, comparatorForRenderable);

    expect(result.slots.h1).toBe('unavailable');
    expect(result.slots.h1).not.toBe('incorrect');
  });

  it('keeps the exercise winnable when a slot cannot be rendered', () => {
    const result = check(payload, { s1: ['b'] }, comparatorForRenderable);

    // The rest still grades, and the verdict is not poisoned by our gap.
    expect(result.slots.s1).toBe('correct');
    expect(result.correct).toBe(true);
  });

  it('still grades a rendered slot as incorrect when it truly is wrong', () => {
    const result = check(payload, { s1: ['a'] }, comparatorForRenderable);

    expect(result.slots.s1).toBe('incorrect');
    expect(result.correct).toBe(false);
  });

  it('grades the newly shipped mechanics instead of degrading them', () => {
    // REGRESSION GUARD for this slice: these two used to render as Unavailable
    // and were excluded from the verdict. Registering them must make them real.
    const mixed: Payload = {
      pools: { qty: [{ id: 'some', text: 'some' }, { id: 'a', text: 'a' }] },
      slots: [
        { id: 'q1', label: 'olives', input: 'select', pool: 'qty', answer: ['some'] },
        { id: 't1', label: 'The cat ___', input: 'text', answer: ['sits'] },
      ],
    };

    const result = check(
      mixed,
      { q1: ['some'], t1: ['  SITS '] },
      comparatorForRenderable,
    );

    expect(result.slots.q1).toBe('correct');
    // The comparator normalizes the raw string the renderer reported.
    expect(result.slots.t1).toBe('correct');
    expect(result.correct).toBe(true);
  });
});
