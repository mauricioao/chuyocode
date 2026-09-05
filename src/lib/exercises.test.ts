/**
 * Data-access tests for the exercises read path (src/lib/exercises.ts).
 *
 * The Supabase service client is mocked so no network happens. The point of
 * every test here is the same: a Supabase problem must degrade to `null` (which
 * the route turns into a 404), never into a 500. Mirrors the mock-chain style
 * of downloads.test.ts.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { clientState, maybeSingleMock, eqMock, selectMock, fromMock } = vi.hoisted(
  () => {
    const maybeSingleMock = vi.fn();
    // Every .eq() returns the same builder so filters can be chained.
    const builder: Record<string, unknown> = { maybeSingle: maybeSingleMock };
    const eqMock = vi.fn(() => builder);
    builder.eq = eqMock;
    const selectMock = vi.fn((_columns: string) => builder);
    const fromMock = vi.fn(() => ({ select: selectMock }));
    return {
      clientState: { available: true },
      maybeSingleMock,
      eqMock,
      selectMock,
      fromMock,
    };
  },
);

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
