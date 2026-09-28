/**
 * Tests for `src/lib/activities/hearts.ts`. Mirrors `moderation.test.ts`'s
 * per-table FIFO-queue mock style.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

function makeBuilder(result: unknown) {
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: () => Promise.resolve(result),
  };
  return builder;
}

const { state } = vi.hoisted(() => ({
  state: {
    available: true,
    queues: {} as Record<string, unknown[]>,
    rpcResult: { data: null as unknown, error: null as unknown },
    rpcCalls: [] as Array<{ fn: string; args: unknown }>,
  },
}));

function push(table: string, result: unknown) {
  (state.queues[table] ??= []).push(makeBuilder(result));
}

vi.mock('../supabase', () => ({
  createServiceClient: () => {
    if (!state.available) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
    return {
      from: (table: string) => {
        const q = state.queues[table];
        if (!q || q.length === 0) throw new Error(`no queued result for table ${table}`);
        return q.shift();
      },
      rpc: async (fn: string, args: unknown) => {
        state.rpcCalls.push({ fn, args });
        return state.rpcResult;
      },
    };
  },
}));

import { toggleActivityHeart, hasHeartedActivity, clearHeartsClient } from './hearts';

const ACTIVITY = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const AUTHOR = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const OTHER_USER = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

beforeEach(() => {
  state.available = true;
  state.queues = {};
  state.rpcResult = { data: null, error: null };
  state.rpcCalls = [];
  clearHeartsClient();
});

describe('toggleActivityHeart', () => {
  it('returns toggle_failed when the service client is unavailable', async () => {
    state.available = false;
    expect(await toggleActivityHeart(ACTIVITY, OTHER_USER)).toEqual({ ok: false, error: 'toggle_failed' });
  });

  it('returns toggle_failed when the activity fetch errors', async () => {
    push('activities', { data: null, error: { message: 'down' } });
    expect(await toggleActivityHeart(ACTIVITY, OTHER_USER)).toEqual({ ok: false, error: 'toggle_failed' });
  });

  it('returns not_found for an activity that does not exist or is not live', async () => {
    push('activities', { data: null, error: null });
    expect(await toggleActivityHeart(ACTIVITY, OTHER_USER)).toEqual({ ok: false, error: 'not_found' });
  });

  it("refuses a heart from the activity's own author, without calling the RPC", async () => {
    push('activities', { data: { id: ACTIVITY, author_id: AUTHOR }, error: null });
    expect(await toggleActivityHeart(ACTIVITY, AUTHOR)).toEqual({ ok: false, error: 'self_heart' });
    expect(state.rpcCalls).toHaveLength(0);
  });

  it('toggles the heart via the RPC and returns the new state', async () => {
    push('activities', { data: { id: ACTIVITY, author_id: AUTHOR }, error: null });
    state.rpcResult = { data: [{ hearted: true, heart_count: 5 }], error: null };
    const result = await toggleActivityHeart(ACTIVITY, OTHER_USER);
    expect(result).toEqual({ ok: true, hearted: true, heartCount: 5 });
    expect(state.rpcCalls[0]).toEqual({
      fn: 'toggle_activity_heart',
      args: { p_user: OTHER_USER, p_activity: ACTIVITY },
    });
  });

  it('tolerates an object-shaped RPC result (not just an array)', async () => {
    push('activities', { data: { id: ACTIVITY, author_id: AUTHOR }, error: null });
    state.rpcResult = { data: { hearted: false, heart_count: 2 }, error: null };
    const result = await toggleActivityHeart(ACTIVITY, OTHER_USER);
    expect(result).toEqual({ ok: true, hearted: false, heartCount: 2 });
  });

  it('returns toggle_failed when the RPC errors', async () => {
    push('activities', { data: { id: ACTIVITY, author_id: AUTHOR }, error: null });
    state.rpcResult = { data: null, error: { message: 'boom' } };
    expect(await toggleActivityHeart(ACTIVITY, OTHER_USER)).toEqual({ ok: false, error: 'toggle_failed' });
  });

  it('returns toggle_failed when the RPC answers a malformed row', async () => {
    push('activities', { data: { id: ACTIVITY, author_id: AUTHOR }, error: null });
    state.rpcResult = { data: [{ hearted: 'yes', heart_count: '5' }], error: null };
    expect(await toggleActivityHeart(ACTIVITY, OTHER_USER)).toEqual({ ok: false, error: 'toggle_failed' });
  });

  it('returns toggle_failed when the client throws', async () => {
    state.queues.activities = [
      {
        select: () => {
          throw new Error('network down');
        },
      },
    ];
    expect(await toggleActivityHeart(ACTIVITY, OTHER_USER)).toEqual({ ok: false, error: 'toggle_failed' });
  });
});

describe('hasHeartedActivity', () => {
  it('returns false for an empty activityId or userId', async () => {
    expect(await hasHeartedActivity('', OTHER_USER)).toBe(false);
    expect(await hasHeartedActivity(ACTIVITY, '')).toBe(false);
  });

  it('returns false when the service client is unavailable', async () => {
    state.available = false;
    expect(await hasHeartedActivity(ACTIVITY, OTHER_USER)).toBe(false);
  });

  it('returns true when a row exists', async () => {
    push('activity_hearts', { data: { user_id: OTHER_USER }, error: null });
    expect(await hasHeartedActivity(ACTIVITY, OTHER_USER)).toBe(true);
  });

  it('returns false when no row exists', async () => {
    push('activity_hearts', { data: null, error: null });
    expect(await hasHeartedActivity(ACTIVITY, OTHER_USER)).toBe(false);
  });

  it('returns false when the read errors', async () => {
    push('activity_hearts', { data: null, error: { message: 'down' } });
    expect(await hasHeartedActivity(ACTIVITY, OTHER_USER)).toBe(false);
  });

  it('returns false when the client throws', async () => {
    state.queues.activity_hearts = [
      {
        select: () => {
          throw new Error('network down');
        },
      },
    ];
    expect(await hasHeartedActivity(ACTIVITY, OTHER_USER)).toBe(false);
  });
});
