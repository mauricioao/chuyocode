/**
 * The submit gate — proved against the pure rule, with no DOM in sight.
 *
 * The resolver is a one-line fake here, which is the point of injecting it: the
 * rule is arithmetic over "which slots were offered" and "which of those have an
 * answer", and neither question needs React to answer.
 */
import { describe, expect, it } from 'vitest';
import type { Payload } from '@/lib/exercisePayload';
import {
  answerableSlots,
  isSlotAnswered,
  isSubmittable,
} from '@/lib/exerciseSubmit';

/**
 * Stands in for the renderer registry: everything ships except `hotspot`.
 *
 * `hotspot` is a real unshipped mechanic (see `mechanics/registry.ts`), so this
 * fake models the actual production gap rather than an invented one.
 */
const shipped = (input: string) => input !== 'hotspot';

const single: Payload = {
  pools: { opts: [{ id: 'a', text: 'sit' }, { id: 'b', text: 'sits' }] },
  slots: [
    { id: 's1', label: 'The cat ___', input: 'choice', pool: 'opts', answer: ['b'] },
  ],
};

/** Three slots, all of them answerable. */
const three: Payload = {
  pools: {},
  slots: [
    { id: 't1', label: 'First ___', input: 'text', answer: ['one'] },
    { id: 't2', label: 'Second ___', input: 'text', answer: ['two'] },
    { id: 't3', label: 'Third ___', input: 'text', answer: ['three'] },
  ],
};

/** One answerable slot next to one whose mechanic never shipped. */
const mixed: Payload = {
  pools: { opts: [{ id: 'a', text: 'sit' }, { id: 'b', text: 'sits' }] },
  slots: [
    { id: 's1', label: 'First', input: 'choice', pool: 'opts', answer: ['b'] },
    { id: 'h1', label: 'Tap it', input: 'hotspot', answer: ['x'] },
  ],
};

/** Nothing here can be drawn, so nothing here can be answered. */
const unanswerable: Payload = {
  pools: {},
  slots: [{ id: 'h1', label: 'Tap it', input: 'hotspot', answer: ['x'] }],
};

describe('answerableSlots', () => {
  it('keeps only the slots whose mechanic shipped', () => {
    expect(answerableSlots(mixed, shipped).map((slot) => slot.id)).toEqual(['s1']);
  });

  it('returns nothing when no mechanic in the exercise shipped', () => {
    expect(answerableSlots(unanswerable, shipped)).toEqual([]);
  });
});

describe('isSlotAnswered', () => {
  it('reads a non-empty answer as answered', () => {
    expect(isSlotAnswered({ s1: ['b'] }, 's1')).toBe(true);
  });

  it('treats an EMPTY ARRAY as unanswered, not as the answer ""', () => {
    // Every renderer reports `[]` for "nothing chosen" — a cleared field, a
    // dropdown back on its placeholder, an emptied drop box.
    expect(isSlotAnswered({ s1: [] }, 's1')).toBe(false);
  });

  it('treats a slot with no entry at all as unanswered', () => {
    expect(isSlotAnswered({}, 's1')).toBe(false);
  });
});

describe('isSubmittable', () => {
  it('is false for an untouched exercise', () => {
    expect(isSubmittable(single, {}, shipped)).toBe(false);
    expect(isSubmittable(three, {}, shipped)).toBe(false);
  });

  it('is still false when SOME slots are answered but not all', () => {
    // The rule this file exists for. Under the old "at least one" gate both of
    // these were submittable, and the learner was marked Incorrect on questions
    // the stepper had not even shown them yet.
    expect(isSubmittable(three, { t1: ['one'] }, shipped)).toBe(false);
    expect(isSubmittable(three, { t1: ['one'], t3: ['three'] }, shipped)).toBe(false);
  });

  it('is true only once EVERY answerable slot has an answer', () => {
    expect(
      isSubmittable(three, { t1: ['one'], t2: ['two'], t3: ['three'] }, shipped),
    ).toBe(true);
  });

  it('is true for a single-slot exercise as soon as its one slot is answered', () => {
    expect(isSubmittable(single, { s1: ['b'] }, shipped)).toBe(true);
  });

  it('re-locks when an answered slot is emptied again', () => {
    const full = { t1: ['one'], t2: ['two'], t3: ['three'] };
    expect(isSubmittable(three, full, shipped)).toBe(true);
    expect(isSubmittable(three, { ...full, t2: [] }, shipped)).toBe(false);
  });

  it('does NOT let an unrenderable slot block submission forever', () => {
    // `h1` ships no control, so the learner has no way to ever answer it. If it
    // counted, this exercise could never be submitted at all — the mechanic gap
    // would silently become a dead end instead of a degraded slot.
    expect(isSubmittable(mixed, { s1: ['b'] }, shipped)).toBe(true);
  });

  it('ignores a stale answer to a slot that was never drawn', () => {
    expect(isSubmittable(unanswerable, { h1: ['x'] }, shipped)).toBe(false);
  });

  it('is false when NOTHING in the exercise can be answered', () => {
    // `every` is vacuously true on an empty array, so without the explicit
    // length guard this would offer an enabled button on an exercise the
    // learner was shown no controls for at all.
    expect(isSubmittable(unanswerable, {}, shipped)).toBe(false);
  });
});
