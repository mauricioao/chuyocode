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

// `@lib/supabaseSession` reads the Supabase URL / anon key at module init, and
// only `createSessionClient` is stubbed, so the module really loads.
vi.mock('@lib/env', () => ({
  loadEnv: () => ({
    SUPABASE_URL: 'https://x.supabase.co',
    SUPABASE_ANON_KEY: 'anon-key',
  }),
}));

vi.mock('@lib/supabaseSession', async (importActual) => {
  // 🔴 `flushSessionHeaders` IS DELIBERATELY NOT MOCKED. Whether a rotated
  // session cookie actually lands on the response is the thing under test, and
  // a stub would assert the call instead of the outcome.
  const actual = await importActual<typeof import('@lib/supabaseSession')>();
  return { ...actual, createSessionClient };
});

import { onRequest, needsSession } from './middleware';

type NextResult = Response;

/** A `getUser()` outcome: an authenticated caller. */
function signedIn(id: string) {
  return { data: { user: { id } }, error: null };
}

/**
 * A `getUser()` outcome: an authenticated caller who has ALSO already
 * recorded age/legal consent (`@lib/ageConsent#hasRecordedConsent`). Tests
 * that are about the LOGIN gate, not the consent gate, use this so a bare
 * `signedIn()` can keep meaning exactly what it already means everywhere
 * else: signed in, nothing more assumed.
 */
function signedInWithConsent(id: string) {
  return {
    data: {
      user: {
        id,
        app_metadata: { ageConsent: { acceptedAt: '2026-10-04T00:00:00.000Z', version: 'v1' } },
      },
    },
    error: null,
  };
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
  const pendingCookies: string[] = [];
  const getUser = vi.fn().mockResolvedValue(getUserResult);
  createSessionClient.mockReturnValue({
    client: { auth: { getUser } },
    pendingHeaders,
    pendingCookies,
  });
  return { pendingHeaders, pendingCookies, getUser };
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
  const pendingCookies: string[] = [];
  const getUser = vi.fn().mockRejectedValue(reason);
  createSessionClient.mockReturnValue({
    client: { auth: { getUser } },
    pendingHeaders,
    pendingCookies,
  });
  return { pendingHeaders, pendingCookies, getUser };
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

  it('builds the client from this request and the environment', async () => {
    const { request, result } = run('/es/libros');
    await result;
    expect(createSessionClient).toHaveBeenCalledWith({
      request,
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

  // 🔴 A REFRESHED TOKEN THAT NEVER REACHES THE BROWSER IS A SILENT LOGOUT.
  // `getUser()` rotates the session, and the rotated cookie is buffered exactly
  // like the auth endpoints' cookies are. Middleware is the only place that can
  // put it on the response, because the `Response` does not exist until
  // `next()` resolves.
  it('flushes the rotated session cookie onto the response after next()', async () => {
    const { pendingCookies } = armSession(signedIn('user-5'));
    pendingCookies.push('sb-x-auth-token=rotated; Path=/; HttpOnly');
    const { result } = run('/es/libros');
    const res = await result;
    expect(res.headers.getSetCookie()).toEqual([
      'sb-x-auth-token=rotated; Path=/; HttpOnly',
    ]);
  });

  it('emits each rotated cookie exactly once', async () => {
    // Middleware and the framework's cookie jar writing the same cookie would
    // send it twice, and the browser keeps whichever arrived last.
    const { pendingCookies } = armSession(signedIn('user-6'));
    pendingCookies.push('sb-x-auth-token.0=a; Path=/', 'sb-x-auth-token.1=b; Path=/');
    const { result } = run('/es/libros');
    const res = await result;
    expect(res.headers.getSetCookie()).toHaveLength(2);
  });

  it('adds no cookie to the response when the session was not rotated', async () => {
    const { pendingCookies } = armSession(signedIn('user-7'));
    expect(pendingCookies).toEqual([]);
    const { result } = run('/es/libros');
    const res = await result;
    expect(res.headers.getSetCookie()).toEqual([]);
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

// Gating Inglés/Cursos behind login (`@lib/access`). Libros, Noticias and the
// home page must stay untouched by this — see the final block below.
describe('gating private sections', () => {
  it('redirects an anonymous visitor away from a gated ingles path with a safe next', async () => {
    armSession(anonymous());
    const { result } = run('/es/ingles');
    const res = await result;

    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(
      '/es/auth/entrar?next=%2Fes%2Fingles',
    );
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  it('carries the original query string in next, safely encoded', async () => {
    armSession(anonymous());
    const { result } = run('/es/ingles?nivel=B1');
    const res = await result;

    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(
      '/es/auth/entrar?next=%2Fes%2Fingles%3Fnivel%3DB1',
    );
  });

  it('redirects an anonymous visitor away from a gated cursos path, in en', async () => {
    armSession(anonymous());
    const { result } = run('/en/cursos/react-basics');
    const res = await result;

    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(
      '/en/auth/entrar?next=%2Fen%2Fcursos%2Freact-basics',
    );
  });

  it('never calls next() for a gated path when anonymous', async () => {
    armSession(anonymous());
    const { result } = run('/es/ingles/A1/present-simple');
    await result;

    expect(next).not.toHaveBeenCalled();
  });

  it('lets a signed-in, consented visitor through to a gated ingles path', async () => {
    armSession(signedInWithConsent('user-9'));
    const { result, locals } = run('/es/ingles');
    const res = await result;

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).toBe(200);
    expect(locals.user).toEqual({
      id: 'user-9',
      app_metadata: { ageConsent: { acceptedAt: '2026-10-04T00:00:00.000Z', version: 'v1' } },
    });
  });

  it('lets a signed-in, consented visitor through to a gated cursos path', async () => {
    armSession(signedInWithConsent('user-11'));
    const { result } = run('/es/cursos/react-basico');
    const res = await result;

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).toBe(200);
  });

  it('marks a gated response private/no-store even once it passes through', async () => {
    armSession(signedInWithConsent('user-10'));
    const { result } = run('/es/ingles');
    const res = await result;

    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  it('flushes a buffered session cookie onto the gate redirect too', async () => {
    const { pendingCookies } = armSession(anonymous());
    pendingCookies.push('sb-x-auth-token=cleared; Path=/; Max-Age=0');
    const { result } = run('/es/ingles');
    const res = await result;

    expect(res.headers.getSetCookie()).toEqual([
      'sb-x-auth-token=cleared; Path=/; Max-Age=0',
    ]);
  });

  it('leaves libros untouched for an anonymous visitor', async () => {
    armSession(anonymous());
    const { result } = run('/es/libros');
    const res = await result;

    expect(res.status).toBe(200);
    expect(next).toHaveBeenCalledOnce();
    // Not forced private by the gate — libros keeps whatever cache policy it
    // sets for itself, untouched by this feature.
    expect(res.headers.has('cache-control')).toBe(false);
  });

  it('leaves noticias untouched for an anonymous visitor', async () => {
    armSession(anonymous());
    const { result } = run('/es/noticias');
    const res = await result;

    expect(res.status).toBe(200);
    expect(next).toHaveBeenCalledOnce();
    expect(res.headers.has('cache-control')).toBe(false);
  });

  it('leaves the localized home untouched for an anonymous visitor', async () => {
    armSession(anonymous());
    const { result } = run('/es/');
    const res = await result;

    expect(res.status).toBe(200);
    expect(next).toHaveBeenCalledOnce();
    expect(res.headers.has('cache-control')).toBe(false);
  });
});

// Age/legal consent gate (Ley N° 29733, `@lib/ageConsent`). Runs AFTER the
// login gate above: an anonymous visitor to a gated ingles/cursos path still
// gets the entrar redirect from that block first (this gate never even sees
// them, since it only ever fires for a signed-in `locals.user`). Scope is
// broader than login-gated sections — `crear`/`mis-actividades`/`admin` are
// signed-in-only in intent but the LOGIN gate never enforces them at the
// middleware level (`@lib/access`'s own header) — the consent gate still
// must catch a signed-in, non-consented visitor there.
describe('age consent gate', () => {
  it('redirects a signed-in visitor with no recorded consent away from a gated ingles path', async () => {
    armSession(signedIn('user-20'));
    const { result } = run('/es/ingles');
    const res = await result;

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(
      '/es/auth/consentimiento?next=%2Fes%2Fingles',
    );
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  it('carries the original query string in next, safely encoded', async () => {
    armSession(signedIn('user-21'));
    const { result } = run('/es/ingles?nivel=B1');
    const res = await result;

    expect(res.headers.get('location')).toBe(
      '/es/auth/consentimiento?next=%2Fes%2Fingles%3Fnivel%3DB1',
    );
  });

  it('redirects a signed-in visitor with no recorded consent away from cursos, in en', async () => {
    armSession(signedIn('user-22'));
    const { result } = run('/en/cursos/react-basics');
    const res = await result;

    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(
      '/en/auth/consentimiento?next=%2Fen%2Fcursos%2Freact-basics',
    );
  });

  it('redirects away from a signed-in-only section the login gate itself never enforces (crear)', async () => {
    armSession(signedIn('user-23'));
    const { result } = run('/es/crear');
    const res = await result;

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/es/auth/consentimiento?next=%2Fes%2Fcrear');
  });

  it('redirects away from mis-actividades', async () => {
    armSession(signedIn('user-24'));
    const { result } = run('/es/mis-actividades');
    const res = await result;

    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(
      '/es/auth/consentimiento?next=%2Fes%2Fmis-actividades',
    );
  });

  it('flushes a buffered session cookie onto the consent redirect too', async () => {
    const { pendingCookies } = armSession(signedIn('user-25'));
    pendingCookies.push('sb-x-auth-token=cleared; Path=/; Max-Age=0');
    const { result } = run('/es/ingles');
    const res = await result;

    expect(res.headers.getSetCookie()).toEqual([
      'sb-x-auth-token=cleared; Path=/; Max-Age=0',
    ]);
  });

  it('lets a signed-in visitor WITH recorded consent through to crear untouched', async () => {
    armSession(signedInWithConsent('user-26'));
    const { result } = run('/es/crear');
    const res = await result;

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).toBe(200);
  });

  it('never redirects an anonymous visitor (the login gate, not this one, owns that)', async () => {
    armSession(anonymous());
    const { result } = run('/es/crear');
    const res = await result;

    // No login gate exists for `crear` today, and this gate only ever
    // fires for a signed-in `locals.user` — an anonymous visitor reaches
    // the page itself, which decides for itself what an anonymous visit
    // looks like.
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).toBe(200);
  });

  it.each([
    ['/es/', 'home'],
    ['/es/libros', 'libros'],
    ['/es/noticias', 'noticias'],
    ['/es/creditos', 'creditos'],
    ['/es/premium', 'premium'],
    ['/es/legal/terms', 'legal'],
    ['/es/auth/entrar', 'the sign-in page'],
    ['/es/auth/consentimiento', 'the consent screen itself (no loop)'],
  ])('leaves %s (%s) reachable for a signed-in visitor with no recorded consent', async (pathname) => {
    armSession(signedIn('user-27'));
    const { result } = run(pathname);
    const res = await result;

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).toBe(200);
  });

  it('never redirects an /api/* request regardless of consent', async () => {
    armSession(signedIn('user-28'));
    const { result } = run('/api/auth/signout');
    const res = await result;

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).toBe(200);
  });

  it('leaves the guest-play practice page reachable for a signed-in visitor with no recorded consent', async () => {
    armSession(signedIn('user-29'));
    const { result } = run('/es/ingles/actividades/abc123');
    const res = await result;

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).toBe(200);
  });
});

// Guest play (owner-approved): the practice and presentation-mode pages for a
// PUBLISHED activity are reachable without signing in — `@lib/access`'s
// `isPublicActivityRoute`. Everything else under `ingles/**` stays gated.
describe('guest play — the two public activity routes', () => {
  it('lets an anonymous visitor through to the practice page', async () => {
    armSession(anonymous());
    const { result } = run('/es/ingles/actividades/abc123');
    const res = await result;

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).toBe(200);
  });

  it('lets an anonymous visitor through to the presentation-mode page', async () => {
    armSession(anonymous());
    const { result } = run('/es/ingles/actividades/abc123/presentar');
    const res = await result;

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).toBe(200);
  });

  it('still marks the practice page private/no-store for an anonymous visitor (T7)', async () => {
    armSession(anonymous());
    const { result } = run('/es/ingles/actividades/abc123');
    const res = await result;

    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  it('still marks the presentation-mode page private/no-store for an anonymous visitor', async () => {
    armSession(anonymous());
    const { result } = run('/es/ingles/actividades/abc123/presentar');
    const res = await result;

    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  it('still redirects an anonymous visitor away from the activities catalog', async () => {
    armSession(anonymous());
    const { result } = run('/es/ingles/actividades');
    const res = await result;

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(
      '/es/auth/entrar?next=%2Fes%2Fingles%2Factividades',
    );
  });

  it('still redirects an anonymous visitor away from the print page', async () => {
    armSession(anonymous());
    const { result } = run('/es/ingles/actividades/abc123/imprimir');
    const res = await result;

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toBe(303);
  });

  it('leaves a signed-in visitor unaffected on the practice page', async () => {
    armSession(signedIn('user-12'));
    const { result } = run('/es/ingles/actividades/abc123');
    const res = await result;

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });
});

// Security headers (work unit 4): every exit point the middleware can
// produce or pass through must carry them — see `src/lib/securityHeaders.ts`
// for why this cannot be left to Netlify's static `_headers` file (no
// prerendered pages exist on this SSR-on-Functions site).
describe('security headers on every response', () => {
  /** Assert the baseline set `applySecurityHeaders` always sets. */
  function expectSecurityHeaders(res: Response) {
    expect(res.headers.get('x-frame-options')).toBe('SAMEORIGIN');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('content-security-policy')).toBe("frame-ancestors 'self'");
    expect(res.headers.has('content-security-policy-report-only')).toBe(true);
    // CSP report collection (src/pages/api/csp-report.ts): both reporting
    // directives, plus the header the Reporting API path needs to resolve
    // `report-to csp-endpoint`.
    expect(res.headers.get('content-security-policy-report-only')).toContain(
      'report-to csp-endpoint',
    );
    expect(res.headers.get('content-security-policy-report-only')).toContain(
      'report-uri /api/csp-report',
    );
    expect(res.headers.get('reporting-endpoints')).toBe('csp-endpoint="/api/csp-report"');
  }

  it('carries the headers on a normal page response', async () => {
    armSession(anonymous());
    const { result } = run('/es/libros');
    const res = await result;

    expect(res.status).toBe(200);
    expectSecurityHeaders(res);
  });

  it('carries the headers on an API JSON response', async () => {
    armSession(signedIn('user-api'));
    next.mockImplementationOnce(
      async () =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    const { result } = run('/api/reacciones/abc');
    const res = await result;

    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(res.headers.get('content-type')).toBe('application/json');
    expectSecurityHeaders(res);
  });

  it('carries the headers on the gate\'s own 303 (built with new Response)', async () => {
    armSession(anonymous());
    const { result } = run('/es/ingles');
    const res = await result;

    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/es/auth/entrar?next=%2Fes%2Fingles');
    expectSecurityHeaders(res);
  });

  it('carries the headers on the root redirect', async () => {
    const { result } = run('/');
    const res = await result;

    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/es/');
    expectSecurityHeaders(res);
  });

  it('carries the headers on the static-asset passthrough (no session work)', async () => {
    const { result } = run('/favicon.ico');
    const res = await result;

    expect(res.status).toBe(200);
    expect(createSessionClient).not.toHaveBeenCalled();
    expectSecurityHeaders(res);
  });

  it('carries the headers on the invalid-lang 404', async () => {
    const { result } = run('/fr/libros');
    const res = await result;

    expect(res.status).toBe(404);
    expectSecurityHeaders(res);
  });

  it('carries the headers on an immutable Response.redirect() returned by next()', async () => {
    armSession(signedIn('user-immutable'));
    const upstream = Response.redirect('https://chuyocode.test/es/destino', 302);
    // Sanity check on the premise: Response.redirect() really is immutable
    // here, so this test actually exercises the rebuild-and-copy fallback
    // (`withSecurityHeaders`) instead of a plain in-place `headers.set()`.
    expect(() => upstream.headers.set('x-probe', '1')).toThrow();
    next.mockImplementationOnce(async () => upstream);

    const { result } = run('/es/libros');
    const res = await result;

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://chuyocode.test/es/destino');
    expectSecurityHeaders(res);
  });

  it('does not overwrite a header a downstream route already set', async () => {
    armSession(anonymous());
    next.mockImplementationOnce(
      async () =>
        new Response('OK', {
          status: 200,
          headers: { 'referrer-policy': 'no-referrer' },
        }),
    );

    const { result } = run('/es/libros');
    const res = await result;

    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    // The rest are still applied — only the pre-set one is preserved.
    expect(res.headers.get('x-frame-options')).toBe('SAMEORIGIN');
  });
});
