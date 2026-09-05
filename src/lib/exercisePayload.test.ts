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
  splitLabelAtBlank,
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

describe('splitLabelAtBlank', () => {
  it('splits a label into the text before and after the blank', () => {
    expect(splitLabelAtBlank('She ___ breakfast at eight every morning.')).toEqual({
      before: 'She ',
      after: ' breakfast at eight every morning.',
    });
  });

  // A label with no marker is a LEGITIMATE authoring style ("What did she say?"),
  // not an error. `null` forces the caller to handle it, so a renderer cannot
  // accidentally splice a control onto the end of a sentence that has no gap.
  it('returns null when the label carries no blank', () => {
    expect(splitLabelAtBlank('What did she say?')).toBeNull();
  });

  it('returns null for an empty label', () => {
    expect(splitLabelAtBlank('')).toBeNull();
  });

  // One slot carries one `answer`, so one slot means ONE blank. Supporting N
  // blanks would need an answer per blank — a model change, deliberately out of
  // scope. The remaining markers stay LITERAL text so the author can see the
  // extra gap was not honoured, instead of it silently disappearing.
  it('splits at the FIRST blank only and leaves later markers as literal text', () => {
    expect(splitLabelAtBlank('A ___ and a ___ walk in.')).toEqual({
      before: 'A ',
      after: ' and a ___ walk in.',
    });
  });

  it('handles a leading blank with an empty `before`', () => {
    expect(splitLabelAtBlank('___ is the answer.')).toEqual({
      before: '',
      after: ' is the answer.',
    });
  });

  it('handles a trailing blank with an empty `after`', () => {
    expect(splitLabelAtBlank('The answer is ___')).toEqual({
      before: 'The answer is ',
      after: '',
    });
  });

  it('treats a label that is nothing but a blank as two empty parts', () => {
    expect(splitLabelAtBlank('___')).toEqual({ before: '', after: '' });
  });

  // CONTRACT: a RUN of three or more underscores is one marker. Authors stretch
  // the gap to suggest answer length (`_____`), and under an "exactly three"
  // rule those labels would silently fall back to the stacked layout with raw
  // underscores on screen — a failure with no error anywhere.
  it('accepts a longer run of underscores as ONE marker', () => {
    expect(splitLabelAtBlank('She ______ breakfast.')).toEqual({
      before: 'She ',
      after: ' breakfast.',
    });
  });

  // Two underscores is below the threshold, which is what keeps the marker from
  // colliding with ordinary text.
  it('does not treat one or two underscores as a blank', () => {
    expect(splitLabelAtBlank('a _ b')).toBeNull();
    expect(splitLabelAtBlank('a __ b')).toBeNull();
  });

  // `snake_case` appears in exercises about code and file names. Single
  // underscores between letters must never be read as a gap.
  it('does not treat snake_case words as a blank', () => {
    expect(splitLabelAtBlank('The variable user_name is set.')).toBeNull();
  });
});
