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
  poolPlacement,
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

  /**
   * `ordered` was carried across this boundary for a `sequence` comparator that
   * never shipped, so `gradeSlot` never read it — a documented field that did
   * nothing. It is gone from the contract, and the parser drops it silently.
   *
   * The test is about GENERATED CONTENT, not about the key. Rows authored while
   * the field was documented still carry it, and they must keep parsing exactly
   * as they did: the slot survives whole, minus a flag nothing ever consulted.
   */
  it('ignores a leftover ordered flag instead of carrying it through', () => {
    const payload = parsePayload({
      pools: { words: [{ id: 'w1', text: 'she' }] },
      slots: [
        { id: 's1', label: 'Order', input: 'order', ordered: true, answer: ['w1'] },
      ],
    });
    expect(payload?.slots[0]).toEqual({
      id: 's1',
      label: 'Order',
      input: 'order',
      answer: ['w1'],
    });
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

/**
 * The OPTIONAL countdown.
 *
 * Every case below asserts the same asymmetry: a broken timer degrades to "no
 * timer" and the exercise still parses. That is the opposite of a broken slot,
 * which kills the payload — and the difference is that a broken slot is
 * UNGRADEABLE, so rendering it would lie to the learner, while a broken timer
 * just means no clock. Turning a typo in an optional field into a 404 on real
 * content would be the worse bug.
 */
describe('parsePayload — timer', () => {
  /** The base exercise, which is complete and answerable without any timer. */
  const timed = (timer: unknown) => ({ ...CHOICE_PAYLOAD, timer });

  it('reads a well-formed timer', () => {
    expect(parsePayload(timed({ seconds: 180 }))?.timer).toEqual({ seconds: 180 });
  });

  // The normal case. Almost no exercise will ever carry a timer.
  it('leaves an untimed exercise untimed', () => {
    expect(parsePayload(CHOICE_PAYLOAD)?.timer).toBeUndefined();
  });

  it('still parses the exercise when the timer is malformed', () => {
    // The whole point: the slots survive a broken timer.
    const payload = parsePayload(timed({ seconds: 'three minutes' }));
    expect(payload?.slots).toHaveLength(1);
    expect(payload?.timer).toBeUndefined();
  });

  it('drops a timer that is not an object', () => {
    for (const bad of [180, 'later', true, null, [180]]) {
      expect(parsePayload(timed(bad))?.timer).toBeUndefined();
    }
  });

  it('drops a timer whose seconds are not a number', () => {
    for (const bad of [{ seconds: '180' }, { seconds: null }, { seconds: {} }, {}]) {
      expect(parsePayload(timed(bad))?.timer).toBeUndefined();
    }
  });

  // Each of these would otherwise produce a countdown that never reaches zero.
  it('drops a timer that could never run out', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(parsePayload(timed({ seconds: bad }))?.timer).toBeUndefined();
    }
  });

  /**
   * A zero-second timer would fire on mount and grade the exercise before the
   * learner had read the first word — an exercise nobody can answer. Dropping to
   * "untimed" is strictly better than shipping that.
   */
  it('drops a timer that would fire before the learner could read it', () => {
    expect(parsePayload(timed({ seconds: 0 }))?.timer).toBeUndefined();
    expect(parsePayload(timed({ seconds: -30 }))?.timer).toBeUndefined();
    // Floored to zero, so it is rejected on the same rule rather than a second.
    expect(parsePayload(timed({ seconds: 0.4 }))?.timer).toBeUndefined();
  });

  it('floors a fractional timer instead of carrying it into the countdown', () => {
    expect(parsePayload(timed({ seconds: 90.7 }))?.timer).toEqual({ seconds: 90 });
  });

  it('keeps the shortest timer an author can meaningfully write', () => {
    expect(parsePayload(timed({ seconds: 1 }))?.timer).toEqual({ seconds: 1 });
  });
});

/**
 * The pool placement — an OPTIONAL presentation hint with a derived default.
 *
 * Two rules under test, and they are separate on purpose: parsing decides
 * whether an authored value is usable at all, and derivation decides what
 * happens when there is none. A malformed hint must land in the SECOND rule, not
 * take the exercise down with it.
 */
describe('poolPlacement', () => {
  /** An exercise with `count` interchangeable drop slots and an optional layout. */
  const withSlots = (count: number, layout?: unknown) => {
    const raw: Record<string, unknown> = {
      pools: { p: [{ id: 'i1', text: 'one' }] },
      slots: Array.from({ length: count }, (_, i) => ({
        id: `s${i + 1}`,
        label: `Slot ___ ${i + 1}`,
        input: 'drop',
        pool: 'p',
        answer: ['i1'],
      })),
    };
    if (layout !== undefined) raw.layout = layout;
    return parsePayload(raw) as Payload;
  };

  describe('the derived default', () => {
    /**
     * One question: the sentence leads, the options sit under it. That is the
     * reading order of every worksheet ever printed.
     */
    it('puts the pool below a single-slot exercise', () => {
      expect(poolPlacement(withSlots(1))).toBe('bottom');
    });

    /**
     * The pool is SHARED, so it has to be reachable from every gap. Anchoring it
     * above keeps it in one fixed place instead of moving as prompts of
     * different heights come and go.
     */
    it('puts the pool above a multi-slot exercise', () => {
      expect(poolPlacement(withSlots(2))).toBe('top');
      expect(poolPlacement(withSlots(5))).toBe('top');
    });

    /**
     * The boundary is between ONE and TWO, so this is the pair that proves the
     * rule is a rule and not a constant.
     */
    it('changes answer at the one-to-two boundary', () => {
      expect(poolPlacement(withSlots(1))).not.toBe(poolPlacement(withSlots(2)));
    });
  });

  describe('the authored override', () => {
    it('honours every accepted placement', () => {
      for (const pool of ['bottom', 'top', 'left', 'right'] as const) {
        expect(poolPlacement(withSlots(3, { pool }))).toBe(pool);
      }
    });

    /**
     * THE OVERRIDE MUST BEAT THE DEFAULT, not merely agree with it. Asserting
     * against a slot count whose default is the OPPOSITE value is what proves
     * the authored hint is actually read.
     */
    it('beats the derived default in both directions', () => {
      // One slot derives `bottom`...
      expect(poolPlacement(withSlots(1, { pool: 'top' }))).toBe('top');
      // ...and two derive `top`.
      expect(poolPlacement(withSlots(2, { pool: 'bottom' }))).toBe('bottom');
    });

    /**
     * `left` and `right` are explicit-only: they depend on there being a large
     * block on the other side, which no slot count can tell us. So they must be
     * reachable ONLY this way.
     */
    it('is the only way to reach a side placement', () => {
      expect(poolPlacement(withSlots(1, { pool: 'left' }))).toBe('left');
      expect(poolPlacement(withSlots(4, { pool: 'right' }))).toBe('right');
      for (const count of [1, 2, 3, 10]) {
        expect(['left', 'right']).not.toContain(poolPlacement(withSlots(count)));
      }
    });
  });

  /**
   * DEGRADES, NEVER REJECTS — the `timer` rule. A typo in an optional
   * presentation hint must not turn answerable content into a 404.
   */
  describe('a malformed hint', () => {
    const malformed = [
      { pool: 'sideways' }, // a string, but not one we can draw
      { pool: 'BOTTOM' }, // right word, wrong case
      { pool: '' },
      { pool: 123 },
      { pool: null },
      { pool: ['left'] },
      {}, // the key itself is missing
      'top', // not an object at all
      42,
      null,
      [],
    ];

    it('leaves the payload parseable and answerable', () => {
      for (const layout of malformed) {
        const payload = parsePayload({
          pools: {},
          slots: [{ id: 's1', label: 'L', input: 'text', answer: ['x'] }],
          layout,
        });
        // The whole exercise still parses: this is the failure mode that would
        // otherwise 404 real content over a misspelt optional word.
        expect(payload).not.toBeNull();
        expect(payload?.slots).toHaveLength(1);
      }
    });

    it('is absent rather than present-and-meaningless', () => {
      for (const layout of malformed) {
        // ONE condition for the consumer, not two: an exercise that omitted the
        // hint and one that misspelt it are the same state.
        expect(parsePayload({ ...CHOICE_PAYLOAD, layout })?.layout).toBeUndefined();
      }
    });

    it('falls back to the derived default', () => {
      for (const layout of malformed) {
        expect(poolPlacement(withSlots(1, layout))).toBe('bottom');
        expect(poolPlacement(withSlots(3, layout))).toBe('top');
      }
    });
  });

  it('is absent on every exercise authored without one', () => {
    // The normal case, and the reason the field is payload data rather than a
    // column: almost nothing carries it.
    expect(parsePayload(CHOICE_PAYLOAD)?.layout).toBeUndefined();
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
