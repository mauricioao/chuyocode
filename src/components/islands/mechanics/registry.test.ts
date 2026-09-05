/**
 * Mechanic registry tests — dispatch on `slot.input`, plus the invariant that
 * keeps grading honest.
 *
 * THE BUG THIS FILE EXISTS TO PREVENT: `COMPARATORS` in exerciseGrading.ts is
 * wider than the set of shipped renderers. `text` and `select` both have a
 * comparator but neither has a renderer in this slice. Graded with the default
 * resolver, such a slot renders as Unavailable — the learner is shown NO input
 * — and is then marked `incorrect` for the answer they were never allowed to
 * give. Permanently wrong, silently, with nothing thrown.
 *
 * The fix is structural: grade through the RENDERER registry, so a slot can
 * only be graded by a mechanic that was actually drawn.
 */
import { describe, expect, it } from 'vitest';
import { check, comparatorFor } from '@/lib/exerciseGrading';
import type { Payload } from '@/lib/exercisePayload';
import ChoiceRenderer from './ChoiceRenderer';
import { comparatorForRenderable, rendererFor } from './registry';

describe('rendererFor', () => {
  it('resolves the shipped `choice` mechanic to its renderer', () => {
    expect(rendererFor('choice')).toBe(ChoiceRenderer);
  });

  it('returns null for a mechanic that has no renderer yet', () => {
    expect(rendererFor('hotspot')).toBeNull();
    expect(rendererFor('drop')).toBeNull();
  });

  // TRIANGULATION: `text` HAS a comparator. It must still miss the registry,
  // because comparators and renderers are different axes.
  it('returns null for `text`, which has a comparator but no renderer', () => {
    expect(comparatorFor('text')).toBe('text');
    expect(rendererFor('text')).toBeNull();
  });

  it('returns null for an empty input rather than throwing', () => {
    expect(rendererFor('')).toBeNull();
  });
});

describe('comparatorForRenderable', () => {
  it('resolves the comparator for a mechanic that is actually rendered', () => {
    expect(comparatorForRenderable('choice')).toBe('set');
  });

  it('refuses to grade a mechanic that has a comparator but no renderer', () => {
    // Both are in COMPARATORS; neither ships a renderer in this slice.
    expect(comparatorFor('text')).toBe('text');
    expect(comparatorForRenderable('text')).toBeNull();

    expect(comparatorFor('select')).toBe('set');
    expect(comparatorForRenderable('select')).toBeNull();
  });

  it('refuses to grade a mechanic that has neither', () => {
    expect(comparatorForRenderable('hotspot')).toBeNull();
  });
});

describe('grading through the registry (the correctness guarantee)', () => {
  const payload: Payload = {
    pools: { opts: [{ id: 'a', text: 'sit' }, { id: 'b', text: 'sits' }] },
    slots: [
      { id: 's1', label: 'pick one', input: 'choice', pool: 'opts', answer: ['b'] },
      { id: 's2', label: 'type one', input: 'text', answer: ['sits'] },
    ],
  };

  it('marks an UNRENDERABLE slot unavailable, never incorrect', () => {
    // The learner answered the only slot they were shown.
    const result = check(payload, { s1: ['b'] }, comparatorForRenderable);

    expect(result.slots.s2).toBe('unavailable');
    expect(result.slots.s2).not.toBe('incorrect');
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

    expect(naive.slots.s2).toBe('incorrect');
    expect(naive.correct).toBe(false);
  });

  it('still grades a rendered slot as incorrect when it truly is wrong', () => {
    const result = check(payload, { s1: ['a'] }, comparatorForRenderable);

    expect(result.slots.s1).toBe('incorrect');
    expect(result.correct).toBe(false);
  });
});
