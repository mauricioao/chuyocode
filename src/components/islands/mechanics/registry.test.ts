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
import TextRenderer from './TextRenderer';
import { comparatorForRenderable, rendererFor } from './registry';

/** Mechanics named in the model that have shipped neither half. */
const UNSHIPPED = ['drop', 'order', 'hotspot'];

describe('rendererFor', () => {
  it('resolves every shipped mechanic to its own renderer', () => {
    expect(rendererFor('choice')).toBe(ChoiceRenderer);
    expect(rendererFor('text')).toBe(TextRenderer);
  });

  // TRIANGULATION: two mechanics must map to two DISTINCT renderers, which a
  // single catch-all component would fail.
  it('maps each mechanic to a distinct renderer', () => {
    expect(rendererFor('choice')).not.toBe(rendererFor('text'));
  });

  it('returns null for a mechanic that has no renderer yet', () => {
    for (const input of UNSHIPPED) {
      expect(rendererFor(input)).toBeNull();
    }
  });

  // `select` HAS a comparator. It must still miss the registry, because
  // comparators and renderers are different axes and drift apart on purpose.
  it('returns null for `select`, which has a comparator but no renderer', () => {
    expect(comparatorFor('select')).toBe('set');
    expect(rendererFor('select')).toBeNull();
  });

  it('returns null for an empty or unknown input rather than throwing', () => {
    expect(rendererFor('')).toBeNull();
    expect(rendererFor('definitely-not-a-mechanic')).toBeNull();
  });
});

describe('comparatorForRenderable', () => {
  it('resolves a comparator for every mechanic that is actually rendered', () => {
    expect(comparatorForRenderable('choice')).toBe('set');
    expect(comparatorForRenderable('text')).toBe('text');
  });

  it('refuses to grade a mechanic that has a comparator but no renderer', () => {
    expect(comparatorFor('select')).toBe('set');
    expect(comparatorForRenderable('select')).toBeNull();
  });

  it('refuses to grade a mechanic that has neither half', () => {
    for (const input of UNSHIPPED) {
      expect(comparatorForRenderable(input)).toBeNull();
    }
  });

  /**
   * THE INVARIANT, stated directly rather than via one example pair, so the
   * guard survives the day `select` finally ships a renderer and the single
   * concrete example above stops being a counterexample.
   */
  it('never grades a mechanic the registry cannot draw, for ANY known input', () => {
    const inputs = [...Object.keys(COMPARATORS), ...UNSHIPPED, '', 'unknown'];

    for (const input of inputs) {
      const expected = rendererFor(input) ? comparatorFor(input) : null;
      expect(comparatorForRenderable(input)).toBe(expected);
    }
  });
});

describe('grading through the registry (the correctness guarantee)', () => {
  const payload: Payload = {
    pools: { opts: [{ id: 'a', text: 'sit' }, { id: 'b', text: 'sits' }] },
    slots: [
      { id: 's1', label: 'pick one', input: 'choice', pool: 'opts', answer: ['b'] },
      { id: 'd1', label: 'pick from a list', input: 'select', pool: 'opts', answer: ['b'] },
    ],
  };

  it('marks an UNRENDERABLE slot unavailable, never incorrect', () => {
    // The learner answered the only slot they were shown.
    const result = check(payload, { s1: ['b'] }, comparatorForRenderable);

    expect(result.slots.d1).toBe('unavailable');
    expect(result.slots.d1).not.toBe('incorrect');
  });

  it('keeps the exercise winnable when a slot cannot be rendered', () => {
    const result = check(payload, { s1: ['b'] }, comparatorForRenderable);

    // The rest still grades, and the verdict is not poisoned by our gap.
    expect(result.slots.s1).toBe('correct');
    expect(result.correct).toBe(true);
  });

  it('demonstrates the bug the resolver fixes: the DEFAULT resolver fails it', () => {
    // Same payload, same response, default (comparator-only) resolver.
    const naive = check(payload, { s1: ['b'] });

    expect(naive.slots.d1).toBe('incorrect');
    expect(naive.correct).toBe(false);
  });

  it('still grades a rendered slot as incorrect when it truly is wrong', () => {
    const result = check(payload, { s1: ['a'] }, comparatorForRenderable);

    expect(result.slots.s1).toBe('incorrect');
    expect(result.correct).toBe(false);
  });

  it('grades a text slot instead of degrading it', () => {
    // REGRESSION GUARD for this slice: `text` used to render as Unavailable and
    // was excluded from the verdict. Registering it must make it real.
    const blank: Payload = {
      pools: {},
      slots: [{ id: 't1', label: 'The cat ___', input: 'text', answer: ['sits'] }],
    };

    // The comparator normalizes the raw string the renderer reported.
    const result = check(blank, { t1: ['  SITS '] }, comparatorForRenderable);

    expect(result.slots.t1).toBe('correct');
    expect(result.correct).toBe(true);
  });
});
