/**
 * Data-access tests for the exercises read path (src/lib/exercises.ts).
 *
 * The Supabase service client is mocked so no network happens. The point of
 * every test here is the same: a Supabase problem must degrade to `null` (which
 * the route turns into a 404), never into a 500. Mirrors the mock-chain style
 * of downloads.test.ts.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const {
  clientState,
  maybeSingleMock,
  eqMock,
  orderMock,
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
  const eqMock = vi.fn(() => builder);
  const orderMock = vi.fn(() => builder);
  builder.eq = eqMock;
  builder.order = orderMock;
  const selectMock = vi.fn((_columns: string) => builder);
  const fromMock = vi.fn(() => ({ select: selectMock }));
  return {
    clientState: { available: true },
    maybeSingleMock,
    eqMock,
    orderMock,
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
  clearExercisesClient,
  EXERCISES_TABLE,
} from './exercises';

/** A published multiple-choice row exactly as Postgres returns it. */
const ROW = {
  id: '11111111-1111-1111-1111-111111111111',
  slug: 'present-simple',
  skill: 'writing',
  level: 'A1',
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

    const exercise = await getExerciseBySlug('A1', 'daily-life', 'present-simple');

    expect(exercise).not.toBeNull();
    expect(exercise?.slug).toBe('present-simple');
    expect(exercise?.level).toBe('A1');
    expect(exercise?.payload.slots[0]?.answer).toEqual(['b']);
    expect(exercise?.payload.pools.opts).toHaveLength(2);
  });

  it('queries the exercises table filtered by level, topic, slug and published', async () => {
    maybeSingleMock.mockResolvedValue({ data: ROW, error: null });

    await getExerciseBySlug('A1', 'daily-life', 'present-simple');

    expect(fromMock).toHaveBeenCalledWith(EXERCISES_TABLE);
    expect(eqMock).toHaveBeenCalledWith('level', 'A1');
    expect(eqMock).toHaveBeenCalledWith('topic', 'daily-life');
    expect(eqMock).toHaveBeenCalledWith('slug', 'present-simple');
    // Unpublished drafts must never be reachable by deep link.
    expect(eqMock).toHaveBeenCalledWith('published', true);
  });

  it('selects named columns rather than *, so the read stays explicit', async () => {
    maybeSingleMock.mockResolvedValue({ data: ROW, error: null });

    await getExerciseBySlug('A1', 'daily-life', 'present-simple');

    const selected = String(selectMock.mock.calls[0]?.[0] ?? '');
    expect(selected).not.toBe('*');
    expect(selected).toContain('payload');
    expect(selected).toContain('slug');
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

    const exercise = await getExerciseBySlug('A1', 'daily-life', 'present-simple');

    expect(exercise?.hasAudio).toBe(true);
    expect(fromMock).toHaveBeenCalledTimes(1);
  });

  it('reports hasAudio false for a row with no media', async () => {
    maybeSingleMock.mockResolvedValue({ data: ROW, error: null });
    const exercise = await getExerciseBySlug('A1', 'daily-life', 'present-simple');
    expect(exercise?.hasAudio).toBe(false);
  });

  it('returns null when no published row matches', async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    expect(await getExerciseBySlug('A1', 'daily-life', 'missing')).toBeNull();
  });

  // Spec — Scenario: Supabase failure yields empty result.
  it('returns null (fail-safe) when Supabase reports an error', async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: { message: 'down' } });
    expect(await getExerciseBySlug('A1', 'daily-life', 'present-simple')).toBeNull();
  });

  it('returns null when the query throws instead of propagating', async () => {
    maybeSingleMock.mockRejectedValue(new Error('network'));
    expect(await getExerciseBySlug('A1', 'daily-life', 'present-simple')).toBeNull();
  });

  it('returns null when the service-role key is unconfigured', async () => {
    clientState.available = false;
    expect(await getExerciseBySlug('A1', 'daily-life', 'present-simple')).toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('returns null when the stored payload is malformed, rather than shipping it to a renderer', async () => {
    maybeSingleMock.mockResolvedValue({
      data: { ...ROW, payload: { pools: {} } },
      error: null,
    });
    expect(await getExerciseBySlug('A1', 'daily-life', 'present-simple')).toBeNull();
  });

  // Spec — Scenario: Invalid topic rejected.
  it('rejects an unknown topic without touching Supabase', async () => {
    expect(await getExerciseBySlug('A1', 'space-travel', 'present-simple')).toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('rejects a level outside the CEFR scale without touching Supabase', async () => {
    expect(await getExerciseBySlug('B3', 'daily-life', 'present-simple')).toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('rejects an empty slug without touching Supabase', async () => {
    expect(await getExerciseBySlug('A1', 'daily-life', '')).toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });
});

describe('getExerciseFacetRows', () => {
  it('returns the published level/topic pairs the entry screen groups by', async () => {
    listResult.value = {
      data: [
        { level: 'A1', topic: 'food' },
        { level: 'B1', topic: 'travel' },
      ],
      error: null,
    };

    const rows = await getExerciseFacetRows();

    expect(rows).toEqual([
      { level: 'A1', topic: 'food' },
      { level: 'B1', topic: 'travel' },
    ]);
  });

  // The entry screen shows six level counts. Counting them with six queries
  // would be six round trips for one screen.
  it('reads every level in ONE query, never one query per level', async () => {
    listResult.value = {
      data: [
        { level: 'A1', topic: 'food' },
        { level: 'C2', topic: 'code-review' },
      ],
      error: null,
    };

    await getExerciseFacetRows();

    expect(fromMock).toHaveBeenCalledTimes(1);
    expect(fromMock).toHaveBeenCalledWith(EXERCISES_TABLE);
    expect(selectMock).toHaveBeenCalledTimes(1);
  });

  it('selects only level and topic, never the payload', async () => {
    await getExerciseFacetRows();

    const selected = String(selectMock.mock.calls[0]?.[0] ?? '');
    expect(selected).toContain('level');
    expect(selected).toContain('topic');
    // Pulling every jsonb payload just to count rows would be wasteful.
    expect(selected).not.toContain('payload');
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
      data: [{ level: 'A1', topic: 'food' }, { level: 7, topic: null }, null],
      error: null,
    };

    // One well-formed pair survives; the junk beside it is discarded.
    expect(await getExerciseFacetRows()).toEqual([
      { level: 'A1', topic: 'food' },
    ]);
  });
});

describe('getPublishedExercises', () => {
  it('returns every published exercise for a level/topic pair', async () => {
    listResult.value = {
      data: [ROW, { ...ROW, id: 'other', slug: 'past-simple' }],
      error: null,
    };

    const exercises = await getPublishedExercises('A1', 'daily-life');

    expect(exercises).toHaveLength(2);
    expect(exercises.map((e) => e.slug)).toEqual([
      'present-simple',
      'past-simple',
    ]);
    expect(exercises[0]?.payload.slots[0]?.answer).toEqual(['b']);
  });

  it('filters by level, topic and published', async () => {
    listResult.value = { data: [ROW], error: null };

    await getPublishedExercises('A1', 'daily-life');

    expect(fromMock).toHaveBeenCalledWith(EXERCISES_TABLE);
    expect(eqMock).toHaveBeenCalledWith('level', 'A1');
    expect(eqMock).toHaveBeenCalledWith('topic', 'daily-life');
    expect(eqMock).toHaveBeenCalledWith('published', true);
  });

  it('orders the listing deterministically so the grid does not reshuffle', async () => {
    listResult.value = { data: [ROW], error: null };

    await getPublishedExercises('A1', 'daily-life');

    expect(orderMock).toHaveBeenCalledWith('slug', { ascending: true });
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

    const exercises = await getPublishedExercises('A1', 'daily-life');

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

    const exercises = await getPublishedExercises('A1', 'daily-life');

    // One bad payload must not empty a page of otherwise valid exercises.
    expect(exercises).toHaveLength(1);
    expect(exercises[0]?.slug).toBe('present-simple');
  });

  it('returns an empty list for a valid pair with nothing published', async () => {
    // Empty because the query really ran and matched no published row — this is
    // the intentional empty state, not a 404.
    listResult.value = { data: [], error: null };

    expect(await getPublishedExercises('C2', 'code-review')).toEqual([]);
    expect(fromMock).toHaveBeenCalledTimes(1);
  });

  it('fail-safes to an empty list when Supabase reports an error', async () => {
    listResult.value = { data: null, error: { message: 'down' } };

    expect(await getPublishedExercises('A1', 'daily-life')).toEqual([]);
  });

  it('fail-safes to an empty list when the query throws', async () => {
    listResult.throws = new Error('network');

    expect(await getPublishedExercises('A1', 'daily-life')).toEqual([]);
  });

  it('fail-safes to an empty list when the service-role key is unconfigured', async () => {
    clientState.available = false;

    expect(await getPublishedExercises('A1', 'daily-life')).toEqual([]);
    expect(fromMock).not.toHaveBeenCalled();
  });

  // Spec — Scenario: Invalid topic rejected.
  it('rejects an unknown topic without touching Supabase', async () => {
    expect(await getPublishedExercises('A1', 'space-travel')).toEqual([]);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('rejects a level outside the CEFR scale without touching Supabase', async () => {
    expect(await getPublishedExercises('B3', 'daily-life')).toEqual([]);
    expect(fromMock).not.toHaveBeenCalled();
  });
});
