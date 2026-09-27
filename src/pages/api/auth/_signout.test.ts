/**
 * Integration tests for POST /api/auth/signout.
 *
 * Sign-out is POST-only on purpose. With `sameSite: 'lax'` the browser does not
 * attach the session cookie to a cross-site POST, so the method IS the CSRF
 * defense here (design §1): a GET sign-out could be triggered by any `<img>` tag
 * on any site, and a prefetch or link preview could sign a visitor out silently.
 *
 * `signOut()` clears the session cookies through the same `setAll` adapter the
 * confirm route sets them with — including the chunked `sb-…-auth-token.0/.1`
 * pair a real JWT produces. That adapter is proven in
 * `src/lib/supabaseSession.test.ts`; this file proves the ROUTE's decisions AND
 * that the clearing directives actually reach the caller, asserted on the
 * `Response` object the handler returns.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DEFAULT_LANG } from '@lib/i18n';
import { AUTH_ERROR_PARAM, AUTH_SIGNED_OUT } from '@lib/authRedirect';

const { createSessionClientMock, signOutMock, pendingHeaders, pendingCookies } =
  vi.hoisted(() => ({
    createSessionClientMock: vi.fn(),
    signOutMock: vi.fn(),
    pendingHeaders: new Map<string, string>(),
    pendingCookies: [] as string[],
  }));

// `@lib/supabaseSession` reads the Supabase URL / anon key at module init, and
// only `createSessionClient` is stubbed below, so the module really loads.
vi.mock('@lib/env', () => ({
  loadEnv: () => ({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon-key' }),
}));

vi.mock('@lib/supabaseSession', async (importActual) => {
  // 🔴 `flushSessionHeaders` IS DELIBERATELY NOT MOCKED — see the SET-COOKIE
  // block below for why asserting on the Response is the whole point.
  const actual = await importActual<typeof import('@lib/supabaseSession')>();
  return { ...actual, createSessionClient: createSessionClientMock };
});

import { POST } from './signout';

const HOME = `/${DEFAULT_LANG}/`;
/** Where the visitor lands, with the marker every success redirect must carry. */
const SIGNED_OUT_HOME = `${HOME}?${AUTH_ERROR_PARAM}=${AUTH_SIGNED_OUT}`;
/** The two chunks a real JWT produces, as the directives that retire them. */
const CLEAR_CHUNK_0 =
  'sb-x-auth-token.0=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax';
const CLEAR_CHUNK_1 =
  'sb-x-auth-token.1=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax';

/** Build the APIContext stub the handler reads. */
function ctx(query = '') {
  const request = new Request(
    `https://chuyocode.com/api/auth/signout${query}`,
    { method: 'POST' },
  );
  // No cookie jar: the route never touches one. Its clearing directives ride on
  // the `Response` it returns, which is what the SET-COOKIE block asserts.
  return { request } as unknown as Parameters<typeof POST>[0];
}

/** The `Location` header of a redirect response. */
function location(res: Response): string {
  return res.headers.get('location') ?? '';
}

beforeEach(() => {
  vi.clearAllMocks();
  pendingHeaders.clear();
  pendingCookies.length = 0;
  createSessionClientMock.mockReturnValue({
    client: { auth: { signOut: signOutMock } },
    pendingHeaders,
    pendingCookies,
  });
  signOutMock.mockResolvedValue({ error: null });
});

describe('POST /api/auth/signout', () => {
  it('ends the session', async () => {
    await POST(ctx());

    expect(signOutMock).toHaveBeenCalledTimes(1);
  });

  it('sends the visitor home with a 303', async () => {
    const res = await POST(ctx());

    expect(res.status).toBe(303);
    expect(location(res)).toBe(SIGNED_OUT_HOME);
  });

  it('keeps the visitor in the locale they signed out from', async () => {
    // Dropping an English reader onto the Spanish home page is a locale bug, so
    // the caller may name the page to return to — through the same guard the
    // magic-link routes use, never as a raw value.
    const res = await POST(ctx('?next=%2Fen%2F'));

    expect(location(res)).toBe(`/en/?${AUTH_ERROR_PARAM}=${AUTH_SIGNED_OUT}`);
  });

  it('neutralises a hostile `next`', async () => {
    const res = await POST(ctx('?next=%2F%2Fevil.com'));

    expect(location(res)).toBe(SIGNED_OUT_HOME);
  });

  it('always carries a query string, defeating a query-less Location (Netlify)', async () => {
    // Verified on a deploy preview: Netlify appends the original request's
    // query string to any redirect whose Location has none of its own.
    const res = await POST(ctx());

    expect(location(res)).toContain('?');
  });

  it('keeps the response out of every cache', async () => {
    // The response carries the cookie deletions. A cached copy would hand a
    // later visitor a sign-out, or hide this one.
    const res = await POST(ctx());

    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  it('flushes the headers Supabase asked for while clearing cookies', async () => {
    createSessionClientMock.mockImplementation(() => {
      pendingHeaders.set('x-supabase-hint', 'cleared');
      return {
        client: { auth: { signOut: signOutMock } },
        pendingHeaders,
        pendingCookies,
      };
    });

    const res = await POST(ctx());

    expect(res.headers.get('x-supabase-hint')).toBe('cleared');
  });

  it('does not let a buffered header overwrite the cache directive', async () => {
    createSessionClientMock.mockImplementation(() => {
      pendingHeaders.set('cache-control', 'public, max-age=3600');
      return {
        client: { auth: { signOut: signOutMock } },
        pendingHeaders,
        pendingCookies,
      };
    });

    const res = await POST(ctx());

    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  it('still redirects when Supabase reports a failure', async () => {
    // The visitor asked to leave. Stranding them on an error page would leave a
    // signed-in browser with no obvious way out.
    signOutMock.mockResolvedValue({ error: { message: 'session not found' } });

    const res = await POST(ctx());

    expect(res.status).toBe(303);
    expect(location(res)).toBe(SIGNED_OUT_HOME);
  });

  it('still redirects when the provider is unreachable', async () => {
    signOutMock.mockRejectedValue(new Error('fetch failed'));

    const res = await POST(ctx());

    expect(res.status).toBe(303);
    expect(location(res)).toBe(SIGNED_OUT_HOME);
  });
});

describe('POST /api/auth/signout — the clearing directives reach the browser', () => {
  // 🔴 A SIGN-OUT THAT SENDS NO `Set-Cookie` IS NOT A SIGN-OUT. `signOut()`
  // returning without an error only means Supabase revoked the refresh token
  // server-side. The browser keeps whatever it holds until this response tells
  // it otherwise, and it presents that cookie on the very next request.
  //
  // Asserting the route called `signOut()` never covered that. These assert on
  // the Response the route returns.
  it('carries every clearing directive on the response it returns', async () => {
    pendingCookies.push(CLEAR_CHUNK_0, CLEAR_CHUNK_1);

    const res = await POST(ctx());

    expect(res.headers.getSetCookie()).toEqual([
      CLEAR_CHUNK_0,
      CLEAR_CHUNK_1,
    ]);
  });

  it('expires the cookie rather than blanking it', async () => {
    // `name=` with no expiry leaves a LIVE, empty cookie: the browser keeps
    // sending the name and sign-out looks done while nothing was removed.
    pendingCookies.push(CLEAR_CHUNK_0);

    const res = await POST(ctx());

    expect(res.headers.getSetCookie()[0]).toContain('Max-Age=0');
  });

  it('clears both chunks of a chunked token, not just the first', async () => {
    // A real JWT does not fit in one cookie, so Supabase writes `.0` and `.1`.
    // Leaving one behind hands the next request a truncated token.
    pendingCookies.push(CLEAR_CHUNK_0, CLEAR_CHUNK_1);

    const res = await POST(ctx());

    expect(res.headers.getSetCookie()).toHaveLength(2);
  });

  it('still clears when Supabase reports a failure', async () => {
    // The local cookie is the thing that keeps the browser signed in. A
    // provider that says "session not found" must not leave it in place.
    signOutMock.mockResolvedValue({ error: { message: 'session not found' } });
    pendingCookies.push(CLEAR_CHUNK_0);

    const res = await POST(ctx());

    expect(res.headers.getSetCookie()).toEqual([CLEAR_CHUNK_0]);
  });
});
