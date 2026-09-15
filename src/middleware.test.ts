import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// `astro:middleware` is a virtual module only available inside the Astro
// runtime. In unit tests we stub it: defineMiddleware is an identity wrapper
// (it just returns the handler), so this stub preserves behavior exactly.
vi.mock('astro:middleware', () => ({
  defineMiddleware: (fn: unknown) => fn,
}));

// The session client is stubbed rather than exercised: it is already covered by
// `src/lib/supabaseSession.test.ts`, and the real module calls `loadEnv()` at
// import time. What matters here is the ORDER middleware calls it in, and what
// it does with the result.
const { createSessionClient } = vi.hoisted(() => ({
  createSessionClient: vi.fn(),
}));

vi.mock('@lib/supabaseSession', () => ({ createSessionClient }));

import { onRequest, needsSession } from './middleware';

type NextResult = Response;

/** A `getUser()` outcome: an authenticated caller. */
function signedIn(id: string) {
  return { data: { user: { id } }, error: null };
}

/** A `getUser()` outcome: no valid session, or one Supabase rejected. */
function anonymous(error: unknown = null) {
  return { data: { user: null }, error };
}

/**
 * Arm the stubbed session client with one `getUser()` outcome.
 *
 * @returns The `pendingHeaders` map the middleware is expected to flush.
 */
function armSession(getUserResult: unknown) {
  const pendingHeaders = new Map<string, string>();
  const getUser = vi.fn().mockResolvedValue(getUserResult);
  createSessionClient.mockReturnValue({
    client: { auth: { getUser } },
    pendingHeaders,
  });
  return { pendingHeaders, getUser };
}

/**
 * Arm the stubbed session client with a `getUser()` that REJECTS.
 *
 * This is the unreachable-Supabase shape, and it is NOT the same as
 * `anonymous(error)`. A token Supabase dislikes comes back as
 * `{ data: { user: null }, error }` — a value. A network that never answers
 * throws. Only the throw can reach Astro uncaught, so only the throw can turn
 * an outage into a site-wide 500, and it gets its own arming helper for that.
 */
function armUnreachableSession(reason: unknown) {
  const pendingHeaders = new Map<string, string>();
  const getUser = vi.fn().mockRejectedValue(reason);
  createSessionClient.mockReturnValue({
    client: { auth: { getUser } },
    pendingHeaders,
  });
  return { pendingHeaders, getUser };
}

/** Silence and capture the house `console.error` reporting channel. */
function spyOnConsoleError() {
  return vi.spyOn(console, 'error').mockImplementation(() => {});
}

/** Build a minimal Astro middleware context for a given pathname. */
function makeContext(pathname: string) {
  const locals: Record<string, unknown> = {};
  const redirect = vi.fn(
    (location: string, status?: number) =>
      new Response(null, {
        status: status ?? 302,
        headers: { Location: location },
      }),
  );
  const request = new Request(`https://chuyocode.test${pathname}`);
  const cookies = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
  const context = {
    url: new URL(`https://chuyocode.test${pathname}`),
    locals,
    redirect,
    request,
    cookies,
  };
  return { context, locals, redirect, request, cookies };
}

const next = vi.fn<() => Promise<NextResult> | NextResult>(
  () => new Response('OK', { status: 200 }),
);

function run(pathname: string) {
  const { context, locals, redirect, request, cookies } =
    makeContext(pathname);
  // The middleware signature is (context, next). We pass our stubbed next.
  const result = (onRequest as unknown as (
    c: typeof context,
    n: typeof next,
  ) => Response | Promise<Response>)(context, next);
  return { result, locals, redirect, request, cookies };
}

beforeEach(() => {
  next.mockClear();
  createSessionClient.mockReset();
  // Default: every path that reaches the session gate resolves to anonymous.
  // Tests that care about a signed-in caller re-arm it explicitly.
  armSession(anonymous());
});

describe('locale middleware', () => {
  // Spec 5 — Scenario: Root redirect.
  it('redirects / to /es/ with 302', async () => {
    const { result, redirect } = run('/');
    const res = await result;
    expect(redirect).toHaveBeenCalledWith('/es/', 302);
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/es/');
  });

  // Spec 5 — Scenario: Valid lang prefix.
  it('passes through a valid es path and sets locals.lang', async () => {
    next.mockClear();
    const { result, locals } = run('/es/libros');
    await result;
    expect(next).toHaveBeenCalledOnce();
    expect(locals.lang).toBe('es');
  });

  it('passes through a valid en path and sets locals.lang', async () => {
    next.mockClear();
    const { result, locals } = run('/en/');
    await result;
    expect(next).toHaveBeenCalledOnce();
    expect(locals.lang).toBe('en');
  });

  // Spec 5 — Scenario: Invalid lang.
  it('returns 404 for an invalid lang segment', async () => {
    next.mockClear();
    const { result } = run('/fr/libros');
    const res = await result;
    expect(res.status).toBe(404);
    expect(next).not.toHaveBeenCalled();
  });

  it('lets API routes pass through untouched', async () => {
    next.mockClear();
    const { result, locals } = run('/api/validar-anuncio');
    await result;
    expect(next).toHaveBeenCalledOnce();
    expect(locals.lang).toBeUndefined();
  });

  it('lets asset-like paths with an extension pass through', async () => {
    next.mockClear();
    const { result } = run('/favicon.ico');
    await result;
    expect(next).toHaveBeenCalledOnce();
  });
});

// `needsSession` is the only thing standing between this site and one
// authenticated Supabase round trip per static asset, so it is tested directly
// as a pure predicate rather than through the middleware (design §1).
describe('needsSession', () => {
  it.each([
    ['/es/libros', 'a locale-prefixed page'],
    ['/en/', 'a locale home'],
    ['/api/validar-anuncio', 'an API route — auth routes and guards live here'],
    ['/', 'the root — unreachable in practice, the redirect runs first'],
    ['/es/ejercicios/daily-standup-routine', 'a deep page path'],
  ])('is true for %s (%s)', (pathname) => {
    expect(needsSession(pathname)).toBe(true);
  });

  it.each([
    ['/_astro/hoisted.DxKz1a.js', 'a built client bundle'],
    ['/_astro/', 'the Astro internals prefix with no file extension'],
    ['/favicon.ico', 'a root static file'],
    ['/robots.txt', 'a root static file with a different extension'],
  ])('is false for %s (%s)', (pathname) => {
    expect(needsSession(pathname)).toBe(false);
  });

  // Only the FIRST segment is inspected. A dot deeper in the path belongs to a
  // page slug, not to a static file, and must still resolve a session.
  it('inspects only the first segment, so a dotted slug still needs a session', () => {
    expect(needsSession('/es/libros/clean.architecture')).toBe(true);
    expect(needsSession('/es/v1.2/notas')).toBe(true);
  });
});

describe('session resolution (design §1 ordering)', () => {
  // Steps 1 and 2 return before the session gate, but `locals.user` is assigned
  // FIRST, so even a path that does no session work leaves a defined value.
  it('nulls locals.user on the root redirect and does no session work', async () => {
    const { result, locals } = run('/');
    await result;
    expect(locals.user).toBeNull();
    expect(createSessionClient).not.toHaveBeenCalled();
  });

  it('nulls locals.user on an invalid lang 404 and does no session work', async () => {
    const { result, locals } = run('/fr/libros');
    const res = await result;
    expect(res.status).toBe(404);
    expect(locals.user).toBeNull();
    expect(createSessionClient).not.toHaveBeenCalled();
  });

  it('skips the session round trip for static assets and Astro internals', async () => {
    const skipped = ['/favicon.ico', '/robots.txt', '/_astro/app.DxKz1a.js'];
    for (const pathname of skipped) {
      const { result, locals } = run(pathname);
      await result;
      expect(locals.user).toBeNull();
    }
    // The real cost this guards: one authenticated Supabase round trip per
    // asset request would otherwise be paid on every page load.
    expect(next).toHaveBeenCalledTimes(skipped.length);
    expect(createSessionClient).not.toHaveBeenCalled();
  });

  // user-identity spec — Scenario: Authenticated request resolves identity
  // server-side.
  it('populates locals.user from getUser() on a locale page', async () => {
    const { getUser } = armSession(signedIn('user-1'));
    const { result, locals } = run('/es/libros');
    await result;
    expect(getUser).toHaveBeenCalledOnce();
    expect(locals.user).toEqual({ id: 'user-1' });
    // Lang routing still happens, and happens before the session gate.
    expect(locals.lang).toBe('es');
  });

  it('builds the client from this request, its cookie jar, and the environment', async () => {
    const { request, cookies, result } = run('/es/libros');
    await result;
    expect(createSessionClient).toHaveBeenCalledWith({
      request,
      cookies,
      // Vitest runs with `import.meta.env.PROD` false, which is the
      // local-development branch: `secure` off, so the cookie survives http://.
      isProd: false,
    });
  });

  it('resolves identity on /api routes too — auth guards live there', async () => {
    const { getUser } = armSession(signedIn('user-2'));
    const { result, locals } = run('/api/reacciones/abc');
    await result;
    expect(getUser).toHaveBeenCalledOnce();
    expect(locals.user).toEqual({ id: 'user-2' });
    expect(locals.lang).toBeUndefined();
  });

  // user-identity spec — Scenario: Tampered or stale session cookie is rejected.
  it('leaves locals.user null when getUser() rejects the cookie', async () => {
    armSession(anonymous({ message: 'invalid JWT: unable to parse' }));
    const { result, locals } = run('/es/libros');
    await result;
    expect(locals.user).toBeNull();
  });

  it('flushes the buffered auth headers onto the response after next()', async () => {
    // Supabase buffers response headers while refreshing the session, because
    // middleware cannot reach the `Response` until `next()` resolves.
    const { pendingHeaders } = armSession(signedIn('user-3'));
    pendingHeaders.set('cache-control', 'private, no-store');
    const { result } = run('/es/libros');
    const res = await result;
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  it('returns the downstream response intact when nothing was buffered', async () => {
    const { pendingHeaders } = armSession(signedIn('user-4'));
    expect(pendingHeaders.size).toBe(0);
    const { result } = run('/es/libros');
    const res = await result;
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('OK');
  });
});

// Identity resolution fails OPEN. The role guards and the mutating endpoints
// fail CLOSED. See the module header of `src/middleware.ts` — that asymmetry is
// the decision, not an inconsistency waiting to be tidied up.
describe('identity resolution fails open when getUser() throws', () => {
  let consoleError: ReturnType<typeof spyOnConsoleError>;

  beforeEach(() => {
    consoleError = spyOnConsoleError();
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it('renders the page as anonymous instead of returning a 500', async () => {
    const { getUser } = armUnreachableSession(new Error('fetch failed'));
    const { result, locals } = run('/es/libros');
    const res = await result;
    expect(getUser).toHaveBeenCalledOnce();
    // The whole point: a Supabase blip must not take down the books page,
    // which renders no authenticated content whatsoever.
    expect(res.status).not.toBe(500);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('OK');
    expect(next).toHaveBeenCalledOnce();
    expect(locals.user).toBeNull();
    // Routing still happened: the catch covers the `getUser()` call and
    // nothing else.
    expect(locals.lang).toBe('es');
  });

  it('degrades the same way on /api routes, where the guards live', async () => {
    armUnreachableSession(new Error('ECONNRESET'));
    const { result, locals } = run('/api/reacciones/abc');
    const res = await result;
    expect(res.status).toBe(200);
    // No user means every downstream guard denies exactly as it would for an
    // anonymous visitor. Failing open here opens nothing.
    expect(locals.user).toBeNull();
    expect(locals.lang).toBeUndefined();
  });

  it('reports the failure through the house console.error idiom', async () => {
    const reason = new Error('fetch failed');
    armUnreachableSession(reason);
    const { result } = run('/es/libros');
    await result;
    // A bare `catch {}` would hide a programming error behind a site that is
    // permanently signed out — worse than the 500 it replaced. Same shape as
    // `src/lib/exercises.ts` and `src/lib/sanity.ts`.
    expect(consoleError).toHaveBeenCalledWith(
      '[middleware] getUser() threw:',
      reason,
    );
  });
});
