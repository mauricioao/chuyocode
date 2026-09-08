/**
 * Integration tests for POST /api/me-gusta/[id] — the exercise like counter.
 *
 * Verifies the contract the button depends on:
 *  - a non-uuid id → 404 before any Supabase call,
 *  - a fresh browser → counts once, arms the 24h dedup cookie, answers the
 *    authoritative new total,
 *  - a browser inside the dedup window → does NOT re-count, and still answers
 *    the real total so the optimistic +1 can be undone,
 *  - a Supabase failure → 200 with `count: null` and NO cookie, so the page
 *    survives the outage and the browser may try again later.
 *
 * `@lib/likes` is mocked, so this isolates the endpoint's own decisions
 * (guard, dedup, cookie arming) from the counter layer, which has its own tests.
 * `@lib/dedupCookie` is deliberately NOT mocked — the cookie is half of this
 * endpoint's contract, and stubbing it would leave the dedup unproven here.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { incrementMock, getCountMock } = vi.hoisted(() => ({
  incrementMock: vi.fn(),
  getCountMock: vi.fn(),
}));

// `likes.ts` reaches `supabase.ts`, which calls `loadEnv()` at MODULE LOAD and
// throws when the Supabase vars are absent — which they are in a unit test. The
// client factory is stubbed so the real module can be imported at all; nothing
// here ever calls it, because both functions that would are mocked below.
vi.mock('@lib/supabase', () => ({
  createServiceClient: () => {
    throw new Error('service client is never built in this suite');
  },
}));

vi.mock('@lib/likes', async (importActual) => {
  // The real `isExerciseId` and `LIKE_COOKIE_PREFIX` are kept: they are the
  // endpoint's 404 guard and its cookie name, so faking them would make those
  // tests assert the stub instead of the rule.
  const actual = await importActual<typeof import('@lib/likes')>();
  return {
    ...actual,
    incrementLike: incrementMock,
    getLikeCount: getCountMock,
  };
});

import { LIKE_COOKIE_PREFIX } from '@lib/likes';
import { POST } from './[id]';

const ID = '3f1a2b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b';
const COOKIE = `${LIKE_COOKIE_PREFIX}${ID}`;

/** Build the APIContext stub the handler reads (params + request). */
function ctx(id: string | undefined, cookie?: string) {
  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = cookie;
  const request = new Request('https://chuyo.test/api/me-gusta/x', {
    method: 'POST',
    headers,
  });
  return { params: { id }, request } as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  incrementMock.mockResolvedValue(5);
  getCountMock.mockResolvedValue(5);
});

describe('POST /api/me-gusta/[id]', () => {
  it('404s when the id param is missing', async () => {
    const res = await POST(ctx(undefined));
    expect(res.status).toBe(404);
    expect(incrementMock).not.toHaveBeenCalled();
  });

  it('404s on an id that is not a uuid, without touching Supabase', async () => {
    const res = await POST(ctx('../../etc/passwd'));
    expect(res.status).toBe(404);
    expect(incrementMock).not.toHaveBeenCalled();
    expect(getCountMock).not.toHaveBeenCalled();
  });

  it('counts once, arms the 24h cookie, and answers the new total', async () => {
    const res = await POST(ctx(ID));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ count: 5 });
    expect(incrementMock).toHaveBeenCalledWith(ID);

    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain(`${COOKIE}=1`);
    expect(setCookie).toContain('Max-Age=86400');
    expect(setCookie).toContain('HttpOnly');
  });

  it('answers JSON that no cache may reuse', async () => {
    const res = await POST(ctx(ID));
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('does NOT re-count while the dedup cookie is present', async () => {
    getCountMock.mockResolvedValue(9);
    const res = await POST(ctx(ID, `${COOKIE}=1`));
    expect(res.status).toBe(200);
    expect(incrementMock).not.toHaveBeenCalled();
    // The real total comes back anyway, which is what undoes the optimistic +1.
    expect(await res.json()).toEqual({ count: 9 });
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('is not fooled by a dedup cookie belonging to a DIFFERENT exercise', async () => {
    const other = '00000000-0000-4000-8000-000000000000';
    await POST(ctx(ID, `${LIKE_COOKIE_PREFIX}${other}=1`));
    expect(incrementMock).toHaveBeenCalledWith(ID);
  });

  it('fail-safes to 200 with count:null when the counter is unavailable', async () => {
    // A Supabase outage is not a client error and must not 500 — the page that
    // owns this button is grading an exercise entirely in the browser.
    incrementMock.mockResolvedValue(null);
    const res = await POST(ctx(ID));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ count: null });
  });

  it('does NOT arm the cookie when the write failed', async () => {
    // Otherwise a transient outage the learner never saw would lock them out of
    // liking this exercise for a full day.
    incrementMock.mockResolvedValue(null);
    const res = await POST(ctx(ID));
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('reports count:null when the deduped read is also unavailable', async () => {
    getCountMock.mockResolvedValue(null);
    const res = await POST(ctx(ID, `${COOKIE}=1`));
    expect(await res.json()).toEqual({ count: null });
  });
});
