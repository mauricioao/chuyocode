/**
 * Payload contract tests (docs/exercise-model.md, "Payload shape").
 *
 * `payload` arrives as raw `jsonb` from Postgres, so it is `unknown` until
 * proven otherwise. `parsePayload` is the single gate: anything malformed
 * becomes `null` and the route 404s, instead of a renderer exploding on a
 * missing `slots` array at request time.
 */
import { describe, it, expect } from 'vitest';
import {
  parsePayload,
  getSlotItems,
  hasAudio,
  type Payload,
} from './exercisePayload';

/** The multiple-choice worked example from docs/exercise-model.md. */
const CHOICE_PAYLOAD = {
  pools: {
    opts: [
      { id: 'a', text: 'sit' },
      { id: 'b', text: 'sits' },
      { id: 'c', text: 'sitting' },
    ],
  },
  slots: [
    {
      id: 's1',
      label: 'The cat ___ on the mat',
      input: 'choice',
      pool: 'opts',
      answer: ['b'],
    },
  ],
};

describe('parsePayload', () => {
  it('parses the multiple-choice worked example into pools and slots', () => {
    const payload = parsePayload(CHOICE_PAYLOAD);
    expect(payload?.slots).toHaveLength(1);
    expect(payload?.slots[0]).toMatchObject({
      id: 's1',
      input: 'choice',
      pool: 'opts',
      answer: ['b'],
    });
    expect(payload?.pools.opts).toHaveLength(3);
  });

  it('parses a poolless fill-in-the-blank slot with multiple accepted answers', () => {
    const payload = parsePayload({
      pools: {},
      slots: [
        {
          id: 's1',
          label: 'The cat ___ on the mat',
          input: 'text',
          answer: ['sits', 'is sitting'],
        },
      ],
    });
    expect(payload?.slots[0]?.answer).toEqual(['sits', 'is sitting']);
    expect(payload?.slots[0]?.pool).toBeUndefined();
  });

  it('carries an ordered flag through for sequence-graded slots', () => {
    const payload = parsePayload({
      pools: { words: [{ id: 'w1', text: 'she' }] },
      slots: [
        { id: 's1', label: 'Order', input: 'order', ordered: true, answer: ['w1'] },
      ],
    });
    expect(payload?.slots[0]?.ordered).toBe(true);
  });

  it('defaults pools to an empty map when the key is absent', () => {
    const payload = parsePayload({
      slots: [{ id: 's1', label: 'L', input: 'text', answer: ['x'] }],
    });
    expect(payload?.pools).toEqual({});
  });

  it('returns null when the value is not an object', () => {
    expect(parsePayload('not-a-payload')).toBeNull();
    expect(parsePayload(null)).toBeNull();
  });

  it('returns null when slots is missing or not an array', () => {
    expect(parsePayload({ pools: {} })).toBeNull();
    expect(parsePayload({ pools: {}, slots: 'nope' })).toBeNull();
  });

  it('returns null when a slot has no id — an ungradeable slot is a broken exercise', () => {
    expect(
      parsePayload({ pools: {}, slots: [{ label: 'L', input: 'text', answer: ['x'] }] }),
    ).toBeNull();
  });

  it('returns null when a slot has an empty answer', () => {
    expect(
      parsePayload({
        pools: {},
        slots: [{ id: 's1', label: 'L', input: 'text', answer: [] }],
      }),
    ).toBeNull();
  });

  it('keeps an unknown input value — dispatch degrades it later, parsing must not reject it', () => {
    const payload = parsePayload({
      pools: {},
      slots: [{ id: 's1', label: 'L', input: 'hotspot', answer: ['x'] }],
    });
    expect(payload?.slots[0]?.input).toBe('hotspot');
  });
});

describe('hasAudio', () => {
  // Spec — Scenario: Availability derived free.
  it('is true when media.audio is present on the already-fetched row', () => {
    const payload = parsePayload({
      media: { audio: 'https://cdn.test/standup.mp3' },
      pools: {},
      slots: [{ id: 's1', label: 'L', input: 'text', answer: ['x'] }],
    });
    expect(hasAudio(payload as Payload)).toBe(true);
  });

  it('is false when media is absent entirely', () => {
    expect(hasAudio(parsePayload(CHOICE_PAYLOAD) as Payload)).toBe(false);
  });

  it('is false when the audio field is present but empty', () => {
    const payload = parsePayload({
      media: { audio: '' },
      pools: {},
      slots: [{ id: 's1', label: 'L', input: 'text', answer: ['x'] }],
    });
    expect(hasAudio(payload as Payload)).toBe(false);
  });
});

describe('getSlotItems', () => {
  it('resolves a slot to the items of its referenced pool', () => {
    const payload = parsePayload(CHOICE_PAYLOAD) as Payload;
    expect(getSlotItems(payload, payload.slots[0]!).map((i) => i.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('returns [] for a poolless slot (the learner types the answer)', () => {
    const payload = parsePayload({
      pools: {},
      slots: [{ id: 's1', label: 'L', input: 'text', answer: ['sits'] }],
    }) as Payload;
    expect(getSlotItems(payload, payload.slots[0]!)).toEqual([]);
  });

  it('returns [] when the slot names a pool that does not exist, instead of throwing', () => {
    const payload = parsePayload({
      pools: { opts: [{ id: 'a', text: 'sit' }] },
      slots: [
        { id: 's1', label: 'L', input: 'choice', pool: 'missing', answer: ['a'] },
      ],
    }) as Payload;
    expect(getSlotItems(payload, payload.slots[0]!)).toEqual([]);
  });
});
