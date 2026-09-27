/**
 * Data-access tests for role assignment and authorization (src/lib/roles.ts).
 *
 * Mirrors the mock-chain style of exercises.test.ts / likes.test.ts: the
 * Supabase service client is mocked so no network happens.
 *
 * The load-bearing assertion in this file is the INVERSE of every other
 * module here: a Supabase failure must degrade to DENIAL, never to an empty
 * "no problem" that a moderation surface could read as "not a moderator, but
 * also not blocked". `exercises.ts` degrades to empty CONTENT on failure,
 * which is safe because the worst case is a blank page. Here the worst case
 * of the same fail-OPEN idiom would be an outage that opens the moderation
 * dashboard to everyone — so this module fails CLOSED instead.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';

const { clientState, eqMock, fromMock, listResult } = vi.hoisted(
  () => {
    const listResult: { value: unknown; throws: Error | null } = {
      value: { data: [], error: null },
      throws: null,
    };
    const builder: Record<string, unknown> = {
      then: (
        onfulfilled: (value: unknown) => unknown,
        onrejected?: (reason: unknown) => unknown,
      ) => {
        const settled = listResult.throws
          ? Promise.reject(listResult.throws)
          : Promise.resolve(listResult.value);
        return settled.then(onfulfilled, onrejected);
      },
    };
    const eqMock = vi.fn((_column: string, _value: unknown) => builder);
    builder.eq = eqMock;
    const selectMock = vi.fn((_columns: string) => builder);
    const fromMock = vi.fn(() => ({ select: selectMock }));
    return {
      clientState: { available: true },
      eqMock,
      selectMock,
      fromMock,
      listResult,
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
  getUserRoles,
  hasRole,
  requireRole,
  clearRolesClient,
  USER_ROLES_TABLE,
} from './roles';

const USER_ID = '11111111-1111-1111-1111-111111111111';

function user(id: string): User {
  return { id } as User;
}

beforeEach(() => {
  vi.clearAllMocks();
  clientState.available = true;
  listResult.value = { data: [], error: null };
  listResult.throws = null;
  clearRolesClient();
});

describe('getUserRoles', () => {
  it('returns the roles a user has been granted', async () => {
    listResult.value = { data: [{ role: 'moderator' }], error: null };

    const roles = await getUserRoles(USER_ID);

    expect(roles).toEqual(['moderator']);
    expect(fromMock).toHaveBeenCalledWith(USER_ROLES_TABLE);
    expect(eqMock).toHaveBeenCalledWith('user_id', USER_ID);
  });

  it('returns [] for a user with no role rows', async () => {
    listResult.value = { data: [], error: null };

    expect(await getUserRoles(USER_ID)).toEqual([]);
  });

  it('drops a row whose role fell out of the closed vocabulary', async () => {
    listResult.value = { data: [{ role: 'super-admin' }], error: null };

    expect(await getUserRoles(USER_ID)).toEqual([]);
  });

  // 🔴 THE LOAD-BEARING CASE. A Supabase error MUST collapse to [] here, the
  // exact inverse of exercises.ts, because [] is what makes hasRole/
  // requireRole deny below.
  it('fails CLOSED to [] on a Supabase error', async () => {
    listResult.value = { data: null, error: { message: 'down' } };

    expect(await getUserRoles(USER_ID)).toEqual([]);
  });

  it('fails CLOSED to [] when the client throws', async () => {
    listResult.throws = new Error('network down');

    expect(await getUserRoles(USER_ID)).toEqual([]);
  });

  it('fails CLOSED to [] when the service-role key is unconfigured', async () => {
    clientState.available = false;

    expect(await getUserRoles(USER_ID)).toEqual([]);
  });
});

describe('hasRole', () => {
  it('is true when the role is among the user’s roles', async () => {
    listResult.value = { data: [{ role: 'moderator' }], error: null };

    expect(await hasRole(USER_ID, 'moderator')).toBe(true);
  });

  it('is false — DENIED — when the role check fails (fail closed)', async () => {
    listResult.value = { data: null, error: { message: 'down' } };

    expect(await hasRole(USER_ID, 'moderator')).toBe(false);
  });
});

describe('requireRole', () => {
  it('returns the user when they hold the role', async () => {
    listResult.value = { data: [{ role: 'moderator' }], error: null };

    expect(await requireRole(user(USER_ID), 'moderator')).toEqual(user(USER_ID));
  });

  it('returns null for a signed-in user without the role', async () => {
    listResult.value = { data: [], error: null };

    expect(await requireRole(user(USER_ID), 'moderator')).toBeNull();
  });

  it('returns null for no user at all, without querying Supabase', async () => {
    expect(await requireRole(null, 'moderator')).toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('DENIES — returns null — when the role check fails, never granting on an outage', async () => {
    listResult.value = { data: null, error: { message: 'down' } };

    expect(await requireRole(user(USER_ID), 'moderator')).toBeNull();
  });
});
