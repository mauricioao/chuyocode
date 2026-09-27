/**
 * Unit tests for the reaction upsert data layer (src/lib/reactions.ts, slice
 * 9, design.md §4 "API"). T9 (app-level): upsert on (user_id, exercise_id),
 * never a duplicate insert.
 *
 * Mocking follows likes.test.ts's pattern: `createServiceClient` is stubbed at
 * the factory so no network happens, and `clientState.available` simulates an
 * unconfigured service-role key.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { clientState, upsertMock, fromMock } = vi.hoisted(() => {
  const upsertMock = vi.fn();
  const fromMock = vi.fn(() => ({ upsert: upsertMock }));
  return { clientState: { available: true }, upsertMock, fromMock };
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
  upsertReaction,
  isValidReaction,
  clearReactionsClient,
  EXERCISE_REACTIONS_TABLE,
  REACTION_KINDS,
  DISLIKE_REASONS,
} from './reactions';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const EXERCISE_ID = '3f1a2b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b';

beforeEach(() => {
  vi.clearAllMocks();
  clientState.available = true;
  clearReactionsClient();
});

describe('isValidReaction', () => {
  it('accepts a like with no reason', () => {
    expect(isValidReaction({ kind: 'like' })).toBe(true);
  });

  it('rejects a like that carries a reason', () => {
    expect(isValidReaction({ kind: 'like', reason: 'typo' })).toBe(false);
  });

  it('accepts a dislike with any taxonomy reason', () => {
    for (const reason of DISLIKE_REASONS) {
      expect(isValidReaction({ kind: 'dislike', reason })).toBe(true);
    }
  });

  it('rejects a dislike with no reason', () => {
    expect(isValidReaction({ kind: 'dislike' })).toBe(false);
  });

  it('rejects a dislike with a reason outside the taxonomy', () => {
    expect(isValidReaction({ kind: 'dislike', reason: 'boring' })).toBe(false);
  });

  it('rejects an unknown kind', () => {
    expect(isValidReaction({ kind: 'love' })).toBe(false);
  });

  it('rejects non-object input', () => {
    expect(isValidReaction(null)).toBe(false);
    expect(isValidReaction('like')).toBe(false);
    expect(isValidReaction(undefined)).toBe(false);
  });
});

describe('upsertReaction', () => {
  it('upserts on (user_id, exercise_id), never a duplicate insert', async () => {
    upsertMock.mockResolvedValue({ error: null });
    const ok = await upsertReaction(USER_ID, EXERCISE_ID, { kind: 'like' });
    expect(ok).toBe(true);
    expect(fromMock).toHaveBeenCalledWith(EXERCISE_REACTIONS_TABLE);
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: USER_ID,
        exercise_id: EXERCISE_ID,
        kind: 'like',
        reason: null,
      }),
      { onConflict: 'user_id,exercise_id' },
    );
  });

  it('sends the reason for a dislike', async () => {
    upsertMock.mockResolvedValue({ error: null });
    await upsertReaction(USER_ID, EXERCISE_ID, { kind: 'dislike', reason: 'typo' });
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'dislike', reason: 'typo' }),
      { onConflict: 'user_id,exercise_id' },
    );
  });

  it('returns false (never throws) when the upsert errors', async () => {
    upsertMock.mockResolvedValue({ error: { message: 'boom' } });
    expect(await upsertReaction(USER_ID, EXERCISE_ID, { kind: 'like' })).toBe(false);
  });

  it('returns false when the client throws', async () => {
    upsertMock.mockRejectedValue(new Error('network'));
    expect(await upsertReaction(USER_ID, EXERCISE_ID, { kind: 'like' })).toBe(false);
  });

  it('returns false when the service-role key is unconfigured', async () => {
    clientState.available = false;
    expect(await upsertReaction(USER_ID, EXERCISE_ID, { kind: 'like' })).toBe(false);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('exposes the closed kind vocabulary', () => {
    expect(REACTION_KINDS).toEqual(['like', 'dislike']);
  });
});
