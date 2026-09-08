/**
 * Unit tests for the exercise like counter (src/lib/likes.ts).
 *
 * The Supabase service client is mocked so no network happens: `rpc` drives
 * incrementLike, and `from().select().eq().maybeSingle()` drives the read.
 * `createServiceClient` is mocked at the factory (rather than by mutating env)
 * because supabase.ts captures env once at import, so the "unconfigured key"
 * path can only be simulated where the client is built.
 *
 * The through-line of every case here is the `number | null` contract: `null`
 * means "we do not know" and MUST never be a coerced `0`, because the two
 * produce opposite behaviour in the endpoint and on the page.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { clientState, rpcMock, maybeSingleMock, eqMock, selectMock, fromMock } =
  vi.hoisted(() => {
    const maybeSingleMock = vi.fn();
    const eqMock = vi.fn(() => ({ maybeSingle: maybeSingleMock }));
    const selectMock = vi.fn(() => ({ eq: eqMock }));
    const fromMock = vi.fn(() => ({ select: selectMock }));
    return {
      clientState: { available: true },
      rpcMock: vi.fn(),
      maybeSingleMock,
      eqMock,
      selectMock,
      fromMock,
    };
  });

vi.mock('./supabase', () => ({
  createServiceClient: () => {
    if (!clientState.available) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
    }
    return { rpc: rpcMock, from: fromMock };
  },
}));

import {
  incrementLike,
  getLikeCount,
  isExerciseId,
  clearLikesClient,
  INCREMENT_LIKE_RPC,
  EXERCISE_LIKES_TABLE,
} from './likes';

/** A canonical uuid, the shape `gen_random_uuid()` produces. */
const ID = '3f1a2b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b';

beforeEach(() => {
  vi.clearAllMocks();
  clientState.available = true;
  clearLikesClient();
});

describe('isExerciseId', () => {
  it('accepts a canonical uuid in either case', () => {
    expect(isExerciseId(ID)).toBe(true);
    expect(isExerciseId(ID.toUpperCase())).toBe(true);
  });

  it('rejects anything that is not one', () => {
    // The id arrives from the browser, so these are the inputs a hand-written
    // request actually sends — including a SQL-ish string, which must be
    // rejected structurally rather than relying on the driver to escape it.
    expect(isExerciseId('')).toBe(false);
    expect(isExerciseId('not-a-uuid')).toBe(false);
    expect(isExerciseId(`${ID}-extra`)).toBe(false);
    expect(isExerciseId("' or 1=1--")).toBe(false);
    expect(isExerciseId(undefined)).toBe(false);
    expect(isExerciseId(42)).toBe(false);
  });
});

describe('incrementLike', () => {
  it('calls the RPC with the exercise id and returns the new count', async () => {
    rpcMock.mockResolvedValue({ data: 7, error: null });
    expect(await incrementLike(ID)).toBe(7);
    expect(rpcMock).toHaveBeenCalledWith(INCREMENT_LIKE_RPC, { exercise: ID });
  });

  it('accepts a bigint returned as a string', async () => {
    // PostgREST may serialize bigint either way; both are the same number.
    rpcMock.mockResolvedValue({ data: '12', error: null });
    expect(await incrementLike(ID)).toBe(12);
  });

  it('returns null (never throws) when the RPC errors', async () => {
    // This is also the unknown-exercise path: the foreign key rejects an
    // invented id, which surfaces here as an ordinary RPC error.
    rpcMock.mockResolvedValue({ data: null, error: { message: 'fk violation' } });
    expect(await incrementLike(ID)).toBeNull();
  });

  it('returns null when the RPC throws', async () => {
    rpcMock.mockRejectedValue(new Error('network'));
    expect(await incrementLike(ID)).toBeNull();
  });

  it('returns null for a malformed id without touching Supabase', async () => {
    expect(await incrementLike('not-a-uuid')).toBeNull();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('returns null when the service-role key is unconfigured', async () => {
    clientState.available = false;
    expect(await incrementLike(ID)).toBeNull();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('returns null rather than 0 when the RPC returns a non-count', async () => {
    // An unreadable counter is UNKNOWN. Coercing it to 0 would tell the browser
    // to render "0 likes" on an exercise that may have hundreds.
    rpcMock.mockResolvedValue({ data: 'boom', error: null });
    expect(await incrementLike(ID)).toBeNull();
  });
});

describe('getLikeCount', () => {
  it('reads the counter row for exactly this exercise', async () => {
    maybeSingleMock.mockResolvedValue({ data: { count: 42 }, error: null });
    expect(await getLikeCount(ID)).toBe(42);
    expect(fromMock).toHaveBeenCalledWith(EXERCISE_LIKES_TABLE);
    expect(selectMock).toHaveBeenCalledWith('count');
    expect(eqMock).toHaveBeenCalledWith('exercise_id', ID);
  });

  it('returns 0 when no row exists yet (a real zero, not a failure)', async () => {
    // The row is created by the FIRST like, so every exercise nobody has liked
    // has no row at all. That is the common case, and it must show as 0.
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    expect(await getLikeCount(ID)).toBe(0);
  });

  it('returns null (fail-safe) on a Supabase error', async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: { message: 'down' } });
    expect(await getLikeCount(ID)).toBeNull();
  });

  it('returns null when the read throws', async () => {
    maybeSingleMock.mockRejectedValue(new Error('network'));
    expect(await getLikeCount(ID)).toBeNull();
  });

  it('returns null when the service-role key is unconfigured', async () => {
    clientState.available = false;
    expect(await getLikeCount(ID)).toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('returns null for a malformed id without touching Supabase', async () => {
    expect(await getLikeCount('nope')).toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });
});
