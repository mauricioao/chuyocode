/**
 * Integration tests for POST /api/me-gusta/[id] — the exercise like TOGGLE.
 *
 * Verifies the contract the button depends on:
 *  - a non-uuid id → 404 before any Supabase call,
 *  - cookie ABSENT → increment, arm the 24h dedup cookie, answer the new total,
 *  - cookie PRESENT → decrement, CLEAR the cookie, answer the new total,
 *  - a Supabase failure in EITHER direction → 200 with `count: null` and the
 *    cookie left exactly where it was, so the page survives the outage and the
 *    browser's state never drifts away from the counter's.
 *
 * The cookie is the toggle's only input, which is why these cases are about
 * cookies rather than about a request body: the browser sends no intent at all.
 *
 * `@lib/likes` is mocked, so this isolates the endpoint's own decisions
 * (guard, direction, cookie handling) from the counter layer, which has its own
 * tests. `@lib/dedupCookie` is deliberately NOT mocked — the cookie is half of
 * this endpoint's contract, and stubbing it would leave the toggle unproven.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { incrementMock, decrementMock } = vi.hoisted(() => ({
  incrementMock: vi.fn(),
  decrementMock: vi.fn(),
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
    decrementLike: decrementMock,
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
  decrementMock.mockResolvedValue(4);
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
    expect(decrementMock).not.toHaveBeenCalled();
  });

  it('answers JSON that no cache may reuse', async () => {
    const res = await POST(ctx(ID));
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  describe('no dedup cookie — the press means "like"', () => {
    it('counts once, arms the 24h cookie, and answers the new total', async () => {
      const res = await POST(ctx(ID));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ count: 5 });
      expect(incrementMock).toHaveBeenCalledWith(ID);
      expect(decrementMock).not.toHaveBeenCalled();

      const setCookie = res.headers.get('set-cookie') ?? '';
      expect(setCookie).toContain(`${COOKIE}=1`);
      expect(setCookie).toContain('Max-Age=86400');
      expect(setCookie).toContain('HttpOnly');
    });

    it('is not fooled by a dedup cookie belonging to a DIFFERENT exercise', async () => {
      const other = '00000000-0000-4000-8000-000000000000';
      await POST(ctx(ID, `${LIKE_COOKIE_PREFIX}${other}=1`));
      expect(incrementMock).toHaveBeenCalledWith(ID);
      expect(decrementMock).not.toHaveBeenCalled();
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
      // Otherwise a transient outage the learner never saw would lock them out
      // of liking this exercise for a full day.
      incrementMock.mockResolvedValue(null);
      const res = await POST(ctx(ID));
      expect(res.headers.get('set-cookie')).toBeNull();
    });
  });

  describe('dedup cookie present — the press means "un-like"', () => {
    it('decrements and answers the new total', async () => {
      const res = await POST(ctx(ID, `${COOKIE}=1`));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ count: 4 });
      expect(decrementMock).toHaveBeenCalledWith(ID);
      expect(incrementMock).not.toHaveBeenCalled();
    });

    /**
     * 🔴 THE COOKIE MUST BE CLEARED, AND CLEARED PROPERLY. This is what makes
     * un-liking immediate rather than something the visitor waits 24 hours for,
     * and the `Path=/` is what makes the browser recognise the deletion at all —
     * without it a second, path-scoped cookie is created and the original stays.
     */
    it('clears the dedup cookie on the spot, matching how it was set', async () => {
      const res = await POST(ctx(ID, `${COOKIE}=1`));
      const setCookie = res.headers.get('set-cookie') ?? '';
      expect(setCookie).toContain(`${COOKIE}=`);
      expect(setCookie).toContain('Max-Age=0');
      expect(setCookie).toContain('Path=/');
      expect(setCookie).not.toContain('Max-Age=86400');
    });

    it('reports the floored count the RPC returns, rather than second-guessing it', async () => {
      // Taking the last like back is an ordinary 0, not an "unknown". The floor
      // itself is the database's job (0006 clamps inside the UPDATE and a CHECK
      // constraint sits behind it); the endpoint just reports what came back.
      decrementMock.mockResolvedValue(0);
      const res = await POST(ctx(ID, `${COOKIE}=1`));
      expect(await res.json()).toEqual({ count: 0 });
    });

    it('fail-safes to 200 with count:null when the counter is unavailable', async () => {
      decrementMock.mockResolvedValue(null);
      const res = await POST(ctx(ID, `${COOKIE}=1`));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ count: null });
    });

    /**
     * The mirror of "does not arm on a failed like", and the worse of the two to
     * get wrong: clearing the cookie after a decrement that never happened would
     * leave the count holding a like the browser believes it no longer has, so
     * the next press would ADD a second one.
     */
    it('does NOT clear the cookie when the write failed', async () => {
      decrementMock.mockResolvedValue(null);
      const res = await POST(ctx(ID, `${COOKIE}=1`));
      expect(res.headers.get('set-cookie')).toBeNull();
    });
  });
});
