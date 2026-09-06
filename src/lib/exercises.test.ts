/**
 * Data-access tests for the exercises read path (src/lib/exercises.ts).
 *
 * The Supabase service client is mocked so no network happens. The point of
 * every test here is the same: a Supabase problem must degrade to `null` (which
 * the route turns into a 404), never into a 500. Mirrors the mock-chain style
 * of downloads.test.ts.
 *
 * Every read is keyed on `(level, focus)` — the language point — because that
 * is the primary axis and the table's unique key. `topic` is secondary context
 * that rides along on the row and may be absent.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const {
  clientState,
  maybeSingleMock,
  eqMock,
  orderMock,
  limitMock,
  selectMock,
  fromMock,
  listResult,
} = vi.hoisted(() => {
  const maybeSingleMock = vi.fn();
  // What awaiting the builder (a list read, no `.maybeSingle()`) resolves to.
  const listResult: { value: unknown; throws: Error | null } = {
    value: { data: [], error: null },
    throws: null,
  };
  // Every .eq()/.order() returns the same builder so filters can be chained.
  const builder: Record<string, unknown> = {
    maybeSingle: maybeSingleMock,
    /**
     * `PostgrestBuilder implements PromiseLike` (verified in
     * node_modules/.pnpm/@supabase+postgrest-js@2.110.7/.../src/PostgrestBuilder.ts:72),
     * so awaiting a filter builder WITHOUT a terminal method is the real API
     * and resolves to `{ data, error }`. The list queries rely on that.
     */
    then: (
      onfulfilled: (value: unknown) => unknown,
      onrejected?: (reason: unknown) => unknown,
    ) => {
      // Both callbacks must be forwarded: `await` hands in resolve AND reject,
      // and swallowing the second one hangs the await instead of rejecting it.
      const settled = listResult.throws
        ? Promise.reject(listResult.throws)
        : Promise.resolve(listResult.value);
      return settled.then(onfulfilled, onrejected);
    },
  };
  // Parameters are declared so the recorded call tuple is indexable: a test
  // that asserts a column was NEVER filtered on has to read `call[0]`, and an
  // untyped `vi.fn(() => …)` records a zero-length tuple.
  const eqMock = vi.fn((_column: string, _value: unknown) => builder);
  const orderMock = vi.fn(() => builder);
  const limitMock = vi.fn((_count: number) => builder);
  builder.eq = eqMock;
  builder.order = orderMock;
  builder.limit = limitMock;
  const selectMock = vi.fn((_columns: string) => builder);
  const fromMock = vi.fn(() => ({ select: selectMock }));
  return {
    clientState: { available: true },
    maybeSingleMock,
    eqMock,
    orderMock,
    limitMock,
    selectMock,
    fromMock,
    listResult,
  };
});

vi.mock('./supabase', () => ({
  createServiceClient: () => {
    if (!clientState.available) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
    }
    return { from: fromMock };
  },
}));

import {
  getExerciseBySlug,
  getExerciseFacetRows,
  getPublishedExercises,
  getRelatedExercises,
  clearExercisesClient,
  EXERCISES_TABLE,
  RELATED_LIMIT,
  type Exercise,
} from './exercises';

/**
 * A published multiple-choice row exactly as Postgres returns it.
 *
 * `focus` and `slug` carry DIFFERENT values on purpose: they are separate
 * filters on the same query, and reusing one string for both would let a
 * mis-wired `.eq()` pass unnoticed.
 */
const ROW = {
  id: '11111111-1111-1111-1111-111111111111',
  slug: 'cat-on-the-mat',
  skill: 'writing',
  level: 'A1',
  focus: 'present-simple',
  topic: 'daily-life',
  payload: {
    pools: {
      opts: [
        { id: 'a', text: 'sit' },
        { id: 'b', text: 'sits' },
      ],
    },
    slots: [
      { id: 's1', label: 'The cat ___', input: 'choice', pool: 'opts', answer: ['b'] },
    ],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  clientState.available = true;
  listResult.value = { data: [], error: null };
  listResult.throws = null;
  clearExercisesClient();
});

describe('getExerciseBySlug', () => {
  it('returns the exercise with its parsed payload', async () => {
    maybeSingleMock.mockResolvedValue({ data: ROW, error: null });

    const exercise = await getExerciseBySlug('A1', 'present-simple', 'cat-on-the-mat');

    expect(exercise).not.toBeNull();
    expect(exercise?.slug).toBe('cat-on-the-mat');
    expect(exercise?.level).toBe('A1');
    expect(exercise?.focus).toBe('present-simple');
    expect(exercise?.payload.slots[0]?.answer).toEqual(['b']);
    expect(exercise?.payload.pools.opts).toHaveLength(2);
  });

  it('queries the exercises table filtered by level, focus, slug and published', async () => {
    maybeSingleMock.mockResolvedValue({ data: ROW, error: null });

    await getExerciseBySlug('A1', 'present-simple', 'cat-on-the-mat');

    expect(fromMock).toHaveBeenCalledWith(EXERCISES_TABLE);
    expect(eqMock).toHaveBeenCalledWith('level', 'A1');
    expect(eqMock).toHaveBeenCalledWith('focus', 'present-simple');
    expect(eqMock).toHaveBeenCalledWith('slug', 'cat-on-the-mat');
    // Unpublished drafts must never be reachable by deep link.
    expect(eqMock).toHaveBeenCalledWith('published', true);
  });

  it('never filters by topic — context is not an axis', async () => {
    maybeSingleMock.mockResolvedValue({ data: ROW, error: null });

    await getExerciseBySlug('A1', 'present-simple', 'cat-on-the-mat');

    const filtered = eqMock.mock.calls.map((call) => call[0]);
    expect(filtered).not.toContain('topic');
  });

  it('selects named columns rather than *, so the read stays explicit', async () => {
    maybeSingleMock.mockResolvedValue({ data: ROW, error: null });

    await getExerciseBySlug('A1', 'present-simple', 'cat-on-the-mat');

    const selected = String(selectMock.mock.calls[0]?.[0] ?? '');
    expect(selected).not.toBe('*');
    expect(selected).toContain('payload');
    expect(selected).toContain('slug');
    expect(selected).toContain('focus');
  });

  it('carries the secondary topic through when the row has one', async () => {
    maybeSingleMock.mockResolvedValue({ data: ROW, error: null });

    const exercise = await getExerciseBySlug('A1', 'present-simple', 'cat-on-the-mat');

    expect(exercise?.topic).toBe('daily-life');
  });

  it('reports a null topic as null — an absent context is ORDINARY', async () => {
    // A pure grammar drill has no natural setting. The column was made nullable
    // precisely so an author is not pushed into inventing one, so this is a
    // normal row and not a data problem.
    maybeSingleMock.mockResolvedValue({
      data: { ...ROW, topic: null },
      error: null,
    });

    const exercise = await getExerciseBySlug('A1', 'present-simple', 'cat-on-the-mat');

    expect(exercise).not.toBeNull();
    expect(exercise?.topic).toBeNull();
  });

  it('collapses a topic outside the taxonomy to null rather than dropping the exercise', async () => {
    // A retired context has no label to draw, which is the same instruction to
    // the caller as no context at all. Losing the whole exercise over a
    // secondary attribute would be wildly disproportionate.
    maybeSingleMock.mockResolvedValue({
      data: { ...ROW, topic: 'space-travel' },
      error: null,
    });

    const exercise = await getExerciseBySlug('A1', 'present-simple', 'cat-on-the-mat');

    expect(exercise).not.toBeNull();
    expect(exercise?.topic).toBeNull();
  });

  // Spec — Scenario: Availability derived free.
  it('derives hasAudio from the fetched row without any extra request', async () => {
    maybeSingleMock.mockResolvedValue({
      data: {
        ...ROW,
        skill: 'listening',
        payload: { ...ROW.payload, media: { audio: 'https://cdn.test/a.mp3' } },
      },
      error: null,
    });

    const exercise = await getExerciseBySlug('A1', 'present-simple', 'cat-on-the-mat');

    expect(exercise?.hasAudio).toBe(true);
    expect(fromMock).toHaveBeenCalledTimes(1);
  });

  it('reports hasAudio false for a row with no media', async () => {
    maybeSingleMock.mockResolvedValue({ data: ROW, error: null });
    const exercise = await getExerciseBySlug('A1', 'present-simple', 'cat-on-the-mat');
    expect(exercise?.hasAudio).toBe(false);
  });

  it('returns null when no published row matches', async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    expect(await getExerciseBySlug('A1', 'present-simple', 'missing')).toBeNull();
  });

  // Spec — Scenario: Supabase failure yields empty result.
  it('returns null (fail-safe) when Supabase reports an error', async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: { message: 'down' } });
    expect(await getExerciseBySlug('A1', 'present-simple', 'cat-on-the-mat')).toBeNull();
  });

  it('returns null when the query throws instead of propagating', async () => {
    maybeSingleMock.mockRejectedValue(new Error('network'));
    expect(await getExerciseBySlug('A1', 'present-simple', 'cat-on-the-mat')).toBeNull();
  });

  it('returns null when the service-role key is unconfigured', async () => {
    clientState.available = false;
    expect(await getExerciseBySlug('A1', 'present-simple', 'cat-on-the-mat')).toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('returns null when the stored payload is malformed, rather than shipping it to a renderer', async () => {
    maybeSingleMock.mockResolvedValue({
      data: { ...ROW, payload: { pools: {} } },
      error: null,
    });
    expect(await getExerciseBySlug('A1', 'present-simple', 'cat-on-the-mat')).toBeNull();
  });

  // Spec — Scenario: Invalid focus rejected.
  it('rejects an unknown focus without touching Supabase', async () => {
    expect(
      await getExerciseBySlug('A1', 'subjunctive-mood', 'cat-on-the-mat'),
    ).toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('rejects the migration sentinel without touching Supabase', async () => {
    // `0004_exercises_focus.sql` parks unclassified rows under `unassigned` and
    // unpublishes them; the deep link must not resolve even by accident.
    expect(await getExerciseBySlug('A1', 'unassigned', 'cat-on-the-mat')).toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('rejects a topic slug used where a focus belongs', async () => {
    // The two axes share a URL position with the old routes. A stale link
    // carrying `travel` must 404, not silently resolve.
    expect(await getExerciseBySlug('A1', 'travel', 'cat-on-the-mat')).toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('rejects a level outside the CEFR scale without touching Supabase', async () => {
    expect(await getExerciseBySlug('B3', 'present-simple', 'cat-on-the-mat')).toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('rejects an empty slug without touching Supabase', async () => {
    expect(await getExerciseBySlug('A1', 'present-simple', '')).toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });
});

describe('getExerciseFacetRows', () => {
  it('returns the published level/focus pairs the entry screen groups by', async () => {
    listResult.value = {
      data: [
        { level: 'A1', focus: 'articles' },
        { level: 'B1', focus: 'phrasal-verbs' },
      ],
      error: null,
    };

    const rows = await getExerciseFacetRows();

    expect(rows).toEqual([
      { level: 'A1', focus: 'articles' },
      { level: 'B1', focus: 'phrasal-verbs' },
    ]);
  });

  // The entry screen shows six level counts. Counting them with six queries
  // would be six round trips for one screen.
  it('reads every level in ONE query, never one query per level', async () => {
    listResult.value = {
      data: [
        { level: 'A1', focus: 'articles' },
        { level: 'C2', focus: 'idioms' },
      ],
      error: null,
    };

    await getExerciseFacetRows();

    expect(fromMock).toHaveBeenCalledTimes(1);
    expect(fromMock).toHaveBeenCalledWith(EXERCISES_TABLE);
    expect(selectMock).toHaveBeenCalledTimes(1);
  });

  it('selects only level and focus — never the payload, never the topic', async () => {
    await getExerciseFacetRows();

    const selected = String(selectMock.mock.calls[0]?.[0] ?? '');
    expect(selected).toContain('level');
    expect(selected).toContain('focus');
    // Pulling every jsonb payload just to count rows would be wasteful, and the
    // topic is not an axis so it is not grouped on.
    expect(selected).not.toContain('payload');
    expect(selected).not.toContain('topic');
  });

  it('counts only published rows, so drafts never inflate a chip', async () => {
    await getExerciseFacetRows();

    expect(eqMock).toHaveBeenCalledWith('published', true);
  });

  // Spec — Scenario: Supabase failure yields empty result.
  it('fail-safes to an empty list when Supabase reports an error', async () => {
    listResult.value = { data: null, error: { message: 'down' } };

    expect(await getExerciseFacetRows()).toEqual([]);
  });

  it('fail-safes to an empty list when the query throws', async () => {
    listResult.throws = new Error('network');

    expect(await getExerciseFacetRows()).toEqual([]);
  });

  it('fail-safes to an empty list when the service-role key is unconfigured', async () => {
    clientState.available = false;

    expect(await getExerciseFacetRows()).toEqual([]);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('fail-safes to an empty list when the driver returns a null data set', async () => {
    listResult.value = { data: null, error: null };

    expect(await getExerciseFacetRows()).toEqual([]);
  });

  it('drops rows whose columns are not strings rather than shipping them onward', async () => {
    listResult.value = {
      data: [{ level: 'A1', focus: 'articles' }, { level: 7, focus: null }, null],
      error: null,
    };

    // One well-formed pair survives; the junk beside it is discarded.
    expect(await getExerciseFacetRows()).toEqual([
      { level: 'A1', focus: 'articles' },
    ]);
  });
});

describe('getPublishedExercises', () => {
  it('returns every published exercise for a level/focus pair', async () => {
    listResult.value = {
      data: [ROW, { ...ROW, id: 'other', slug: 'she-works-here' }],
      error: null,
    };

    const exercises = await getPublishedExercises('A1', 'present-simple');

    expect(exercises).toHaveLength(2);
    expect(exercises.map((e) => e.slug)).toEqual([
      'cat-on-the-mat',
      'she-works-here',
    ]);
    expect(exercises[0]?.payload.slots[0]?.answer).toEqual(['b']);
  });

  it('filters by level, focus and published', async () => {
    listResult.value = { data: [ROW], error: null };

    await getPublishedExercises('A1', 'present-simple');

    expect(fromMock).toHaveBeenCalledWith(EXERCISES_TABLE);
    expect(eqMock).toHaveBeenCalledWith('level', 'A1');
    expect(eqMock).toHaveBeenCalledWith('focus', 'present-simple');
    expect(eqMock).toHaveBeenCalledWith('published', true);
  });

  it('orders the listing deterministically so the grid does not reshuffle', async () => {
    listResult.value = { data: [ROW], error: null };

    await getPublishedExercises('A1', 'present-simple');

    expect(orderMock).toHaveBeenCalledWith('slug', { ascending: true });
  });

  it('carries a different context per row inside ONE language point', async () => {
    // The point of keeping `topic` at all: the same grammar practised in
    // several settings, plus rows with no setting whatsoever.
    listResult.value = {
      data: [
        ROW,
        { ...ROW, slug: 'at-the-desk', topic: 'code-review' },
        { ...ROW, slug: 'plain-drill', topic: null },
      ],
      error: null,
    };

    const exercises = await getPublishedExercises('A1', 'present-simple');

    expect(exercises.map((e) => e.topic)).toEqual([
      'daily-life',
      'code-review',
      null,
    ]);
  });

  it('keeps a row whose topic left the taxonomy, with no context to render', async () => {
    listResult.value = {
      data: [{ ...ROW, topic: 'space-travel' }],
      error: null,
    };

    const exercises = await getPublishedExercises('A1', 'present-simple');

    expect(exercises).toHaveLength(1);
    expect(exercises[0]?.topic).toBeNull();
  });

  it('derives hasAudio per row from the payload already fetched', async () => {
    listResult.value = {
      data: [
        ROW,
        {
          ...ROW,
          slug: 'listening-one',
          skill: 'listening',
          payload: { ...ROW.payload, media: { audio: 'https://cdn.test/a.mp3' } },
        },
      ],
      error: null,
    };

    const exercises = await getPublishedExercises('A1', 'present-simple');

    expect(exercises[0]?.hasAudio).toBe(false);
    expect(exercises[1]?.hasAudio).toBe(true);
    // Derived from the rows we already have — no second round trip.
    expect(fromMock).toHaveBeenCalledTimes(1);
  });

  it('drops a malformed row instead of losing the whole listing to it', async () => {
    listResult.value = {
      data: [{ ...ROW, slug: 'broken', payload: { pools: {} } }, ROW],
      error: null,
    };

    const exercises = await getPublishedExercises('A1', 'present-simple');

    // One bad payload must not empty a page of otherwise valid exercises.
    expect(exercises).toHaveLength(1);
    expect(exercises[0]?.slug).toBe('cat-on-the-mat');
  });

  it('returns an empty list for a valid pair with nothing published', async () => {
    // Empty because the query really ran and matched no published row — this is
    // the intentional empty state, not a 404.
    listResult.value = { data: [], error: null };

    expect(await getPublishedExercises('C2', 'inversion')).toEqual([]);
    expect(fromMock).toHaveBeenCalledTimes(1);
  });

  it('fail-safes to an empty list when Supabase reports an error', async () => {
    listResult.value = { data: null, error: { message: 'down' } };

    expect(await getPublishedExercises('A1', 'present-simple')).toEqual([]);
  });

  it('fail-safes to an empty list when the query throws', async () => {
    listResult.throws = new Error('network');

    expect(await getPublishedExercises('A1', 'present-simple')).toEqual([]);
  });

  it('fail-safes to an empty list when the service-role key is unconfigured', async () => {
    clientState.available = false;

    expect(await getPublishedExercises('A1', 'present-simple')).toEqual([]);
    expect(fromMock).not.toHaveBeenCalled();
  });

  // Spec — Scenario: Invalid focus rejected.
  it('rejects an unknown focus without touching Supabase', async () => {
    expect(await getPublishedExercises('A1', 'subjunctive-mood')).toEqual([]);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('rejects a topic slug used where a focus belongs', async () => {
    expect(await getPublishedExercises('A1', 'travel')).toEqual([]);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('rejects a level outside the CEFR scale without touching Supabase', async () => {
    expect(await getPublishedExercises('B3', 'present-simple')).toEqual([]);
    expect(fromMock).not.toHaveBeenCalled();
  });
});

describe('getRelatedExercises', () => {
  /** The exercise the learner is currently on. */
  const current: Exercise = {
    // Same primary key as ROW, so `{ ...ROW }` in a result set IS this exercise.
    id: ROW.id,
    slug: ROW.slug,
    skill: 'writing',
    level: 'A1',
    focus: 'present-simple',
    topic: 'daily-life',
    payload: ROW.payload as Exercise['payload'],
    hasAudio: false,
  };

  /** A published row at the same level, in whatever language point. */
  const rowAt = (slug: string, focus = 'articles', id = `id-${slug}`) => ({
    ...ROW,
    id,
    slug,
    focus,
  });

  it('offers other exercises at the SAME LEVEL, across language points', async () => {
    listResult.value = {
      data: [rowAt('a-an-the', 'articles'), rowAt('two-cats', 'plurals')],
      error: null,
    };

    const related = await getRelatedExercises(current);

    // Level is the axis, not focus: someone browsing A1 is roughly at A1, and
    // restricting to the current language point would hide most of what they
    // can do and would empty the block for any focus holding one exercise.
    expect(related.map((e) => e.focus)).toEqual(['articles', 'plurals']);
    expect(related.map((e) => e.level)).toEqual(['A1', 'A1']);
    expect(eqMock).toHaveBeenCalledWith('level', 'A1');
  });

  it('never lists the exercise the learner is already on', async () => {
    listResult.value = {
      data: [rowAt('a-an-the'), { ...ROW }, rowAt('two-cats', 'plurals')],
      error: null,
    };

    const related = await getRelatedExercises(current);

    expect(related.map((e) => e.slug)).toEqual(['a-an-the', 'two-cats']);
  });

  it('excludes by (focus, slug) when the row carries no usable id', async () => {
    // `slug` is unique per (level, focus), NOT per level, so slug alone cannot
    // be the exclusion rule — two language points may legitimately share one.
    // `topic` cannot serve here either: it is nullable and not in the key.
    listResult.value = {
      data: [
        { ...ROW, id: 7 },
        rowAt('cat-on-the-mat', 'articles'),
      ],
      error: null,
    };

    const related = await getRelatedExercises({ ...current, id: '' });

    // The same slug under a DIFFERENT focus is a different exercise and stays.
    expect(related.map((e) => e.focus)).toEqual(['articles']);
  });

  it('caps the list', async () => {
    listResult.value = {
      data: Array.from({ length: 20 }, (_, i) => rowAt(`ex-${i}`)),
      error: null,
    };

    expect(await getRelatedExercises(current)).toHaveLength(RELATED_LIMIT);
    expect(await getRelatedExercises(current, 2)).toHaveLength(2);
  });

  it('asks Supabase for cap + 1 rows so the cap survives the exclusion', async () => {
    listResult.value = { data: [rowAt('a')], error: null };

    await getRelatedExercises(current, 3);

    // The current exercise is itself a row at this level and may sit inside the
    // window. Fetching exactly the cap would render cap - 1 cards whenever it
    // does — a silent off-by-one nothing would report.
    expect(limitMock).toHaveBeenCalledWith(4);
  });

  it('reads published rows only', async () => {
    listResult.value = { data: [rowAt('a')], error: null };

    await getRelatedExercises(current);

    expect(fromMock).toHaveBeenCalledWith(EXERCISES_TABLE);
    expect(eqMock).toHaveBeenCalledWith('published', true);
  });

  it('orders by (focus, slug) — the new unique key — so the block cannot reshuffle', async () => {
    listResult.value = { data: [rowAt('a')], error: null };

    await getRelatedExercises(current);

    // `(level, focus, slug)` is the table's unique key, so at a FIXED level
    // `(focus, slug)` has no ties: a total order, not merely a sort. Ordering
    // by `topic` would no longer be total — it is nullable and non-unique — and
    // the NULL rows would sort into an arbitrary block.
    expect(orderMock).toHaveBeenNthCalledWith(1, 'focus', { ascending: true });
    expect(orderMock).toHaveBeenNthCalledWith(2, 'slug', { ascending: true });
    expect(orderMock).not.toHaveBeenCalledWith('topic', { ascending: true });
  });

  it('drops a row whose focus is outside the taxonomy', async () => {
    listResult.value = {
      data: [rowAt('a', 'subjunctive-mood'), rowAt('b', 'plurals')],
      error: null,
    };

    const related = await getRelatedExercises(current);

    // The card links to /[lang]/ingles/[level]/[focus]/[slug]; an unknown focus
    // would build a link the route 404s on.
    expect(related.map((e) => e.focus)).toEqual(['plurals']);
  });

  it('keeps a row with no topic — the card simply shows no context badge', async () => {
    // The opposite of the focus rule above, and deliberately so: `topic` is not
    // in the link, so an absent or retired one costs a badge, never the card.
    listResult.value = {
      data: [
        { ...rowAt('a', 'plurals'), topic: null },
        { ...rowAt('b', 'articles'), topic: 'space-travel' },
      ],
      error: null,
    };

    const related = await getRelatedExercises(current);

    expect(related).toHaveLength(2);
    expect(related.map((e) => e.topic)).toEqual([null, null]);
  });

  it('drops a malformed row instead of losing the whole block to it', async () => {
    listResult.value = {
      data: [{ ...rowAt('broken'), payload: { pools: {} } }, rowAt('fine')],
      error: null,
    };

    const related = await getRelatedExercises(current);

    expect(related.map((e) => e.slug)).toEqual(['fine']);
  });

  it('returns an empty list when this level holds nothing else', async () => {
    listResult.value = { data: [{ ...ROW }], error: null };

    // The route renders NOTHING for this: an empty "related" heading is noise.
    expect(await getRelatedExercises(current)).toEqual([]);
  });

  it('fail-safes to an empty list when Supabase reports an error', async () => {
    listResult.value = { data: null, error: { message: 'down' } };

    expect(await getRelatedExercises(current)).toEqual([]);
  });

  it('fail-safes to an empty list when the query throws', async () => {
    listResult.throws = new Error('network');

    expect(await getRelatedExercises(current)).toEqual([]);
  });

  it('fail-safes to an empty list when the service-role key is unconfigured', async () => {
    clientState.available = false;

    expect(await getRelatedExercises(current)).toEqual([]);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('fail-safes to an empty list when the driver returns a null data set', async () => {
    listResult.value = { data: null, error: null };

    expect(await getRelatedExercises(current)).toEqual([]);
  });

  it('rejects a level outside the CEFR scale without touching Supabase', async () => {
    expect(
      await getRelatedExercises({ ...current, level: 'B3' as Exercise['level'] }),
    ).toEqual([]);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('does not query at all for a non-positive cap', async () => {
    expect(await getRelatedExercises(current, 0)).toEqual([]);
    expect(fromMock).not.toHaveBeenCalled();
  });
});
