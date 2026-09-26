/**
 * Unit tests for the request-scoped Supabase session client
 * (src/lib/supabaseSession.ts).
 *
 * Three things are under test and they are NOT the same thing:
 *  1. `sessionCookieOptions` produces the hardened cookie flags.
 *  2. `createSessionClient` actually HANDS those flags to `createServerClient`.
 *  3. `flushSessionHeaders` puts what Supabase asked for onto a real `Headers`.
 *
 * Without (2) the constant can be perfectly correct and completely unused, and
 * `@supabase/ssr` would silently fall back to its own DEFAULT_COOKIE_OPTIONS —
 * which ship `httpOnly: false` and never set `secure`.
 *
 * 🔴 (3) IS THE ASSERTION WHOSE ABSENCE HID A DEAD SIGN-IN. The suite used to
 * prove that `setAll` called Astro's cookie jar and stopped there, which is a
 * test of what the code CALLED rather than of what the caller RECEIVES. A
 * browser that got no `Set-Cookie` at all passed it. So the pending cookies are
 * asserted as serialized header values here, and the endpoint suites assert
 * them on the `Response` object each route actually returns.
 *
 * `createServerClient` is mocked so no Supabase client is ever constructed and
 * no network happens; the cookie adapter it receives is then exercised
 * directly, which is the only way to observe `getAll`/`setAll` behaviour.
 * `parseCookieHeader` is wrapped in a spy that defaults to the real
 * implementation, so the "drop non-string values" guard can be driven without
 * depending on any particular version's coalescing behaviour.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { createServerClientMock, parseCookieHeaderMock, ssrActual } = vi.hoisted(
  () => ({
    createServerClientMock: vi.fn(),
    parseCookieHeaderMock: vi.fn(),
    ssrActual: {
      parseCookieHeader: null as
        | ((header: string) => { name: string; value: string }[])
        | null,
    },
  }),
);

vi.mock('@supabase/ssr', async (importActual) => {
  const actual = await importActual<typeof import('@supabase/ssr')>();
  ssrActual.parseCookieHeader = actual.parseCookieHeader;
  return {
    ...actual,
    createServerClient: createServerClientMock,
    parseCookieHeader: parseCookieHeaderMock,
  };
});

// supabaseSession.ts reads the Supabase URL / anon key at module init, exactly
// like supabase.ts does, so env is provided instead of relying on a real .env.
vi.mock('./env', () => ({
  loadEnv: () => ({
    SANITY_PROJECT_ID: 'proj',
    SANITY_DATASET: 'production',
    SUPABASE_URL: 'https://x.supabase.co',
    SUPABASE_ANON_KEY: 'anon-key',
    SUPABASE_SERVICE_ROLE_KEY: '',
    AD_HMAC_SECRET: '',
  }),
}));

import {
  sessionCookieOptions,
  createSessionClient,
  flushSessionHeaders,
} from './supabaseSession';

/** The four flags the user-identity spec requires, in production. */
const PROD_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/',
};

/**
 * Build a session client and expose everything the assertions need: the
 * buffered state, and the options object handed to `createServerClient`.
 */
function buildSessionClient(
  opts: { cookieHeader?: string; isProd?: boolean } = {},
) {
  const request = new Request(
    'https://chuyocode.com/es/',
    opts.cookieHeader ? { headers: { cookie: opts.cookieHeader } } : undefined,
  );
  const created = createSessionClient({
    request,
    isProd: opts.isProd ?? true,
  });
  const call = createServerClientMock.mock.calls.at(-1);
  return {
    ...created,
    args: call as unknown[],
    clientOptions: (call as unknown[])[2] as {
      cookieOptions: Record<string, unknown>;
      cookies: {
        getAll: () => { name: string; value: string }[];
        setAll: (
          cookiesToSet: {
            name: string;
            value: string;
            options: Record<string, unknown>;
          }[],
          headers: Record<string, string>,
        ) => void;
      };
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  createServerClientMock.mockReturnValue({ auth: { getUser: vi.fn() } });
  parseCookieHeaderMock.mockImplementation((header: string) =>
    ssrActual.parseCookieHeader ? ssrActual.parseCookieHeader(header) : [],
  );
});

describe('sessionCookieOptions', () => {
  it('hardens every flag in production', () => {
    expect(sessionCookieOptions(true)).toEqual(PROD_COOKIE_OPTIONS);
  });

  it('flips only `secure` outside production', () => {
    // A `Secure` cookie is discarded outright by the browser on http://localhost,
    // which would make local magic-link sign-in impossible. The other three
    // flags are unconditional and MUST NOT move with the environment.
    expect(sessionCookieOptions(false)).toEqual({
      ...PROD_COOKIE_OPTIONS,
      secure: false,
    });
  });

  it('sets every flag explicitly instead of inheriting library defaults', () => {
    // `@supabase/ssr` DEFAULT_COOKIE_OPTIONS ship `httpOnly: false` and never
    // set `secure`, so an inherited flag is a security regression, not a
    // convenience. Own-property checks are the only way to tell the two apart.
    const options = sessionCookieOptions(false);

    expect(Object.keys(options).sort()).toEqual([
      'httpOnly',
      'path',
      'sameSite',
      'secure',
    ]);
    expect(Object.prototype.hasOwnProperty.call(options, 'httpOnly')).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(options, 'secure')).toBe(true);
  });
});

describe('createSessionClient', () => {
  it('passes the hardened options to createServerClient as `cookieOptions`', () => {
    const { clientOptions, args } = buildSessionClient({ isProd: true });

    expect(args[0]).toBe('https://x.supabase.co');
    expect(args[1]).toBe('anon-key');
    expect(clientOptions.cookieOptions).toEqual(PROD_COOKIE_OPTIONS);
  });

  it('passes the non-production options through unchanged too', () => {
    const { clientOptions } = buildSessionClient({ isProd: false });

    expect(clientOptions.cookieOptions).toEqual({
      ...PROD_COOKIE_OPTIONS,
      secure: false,
    });
  });

  it('returns the client built by createServerClient', () => {
    const built = { auth: { getUser: vi.fn() } };
    createServerClientMock.mockReturnValue(built);

    expect(buildSessionClient().client).toBe(built);
  });

  it('reads the request Cookie header in getAll', () => {
    const { clientOptions } = buildSessionClient({
      cookieHeader: 'sb-access-token=abc; sb-refresh-token=def',
    });

    expect(clientOptions.cookies.getAll()).toEqual([
      { name: 'sb-access-token', value: 'abc' },
      { name: 'sb-refresh-token', value: 'def' },
    ]);
  });

  it('returns an empty list from getAll when the request carries no cookies', () => {
    const { clientOptions } = buildSessionClient();

    expect(clientOptions.cookies.getAll()).toEqual([]);
  });

  it('drops parsed entries whose value is not a string', () => {
    // `GetAllCookies` promises `{name, value: string}[]`. A parser that emits
    // `{name}` alone would violate that contract downstream instead of here.
    parseCookieHeaderMock.mockReturnValue([
      { name: 'sb-access-token', value: 'abc' },
      { name: 'orphan' },
      { name: 'sb-refresh-token', value: 'def' },
    ]);
    const { clientOptions } = buildSessionClient({ cookieHeader: 'ignored' });

    expect(clientOptions.cookies.getAll()).toEqual([
      { name: 'sb-access-token', value: 'abc' },
      { name: 'sb-refresh-token', value: 'def' },
    ]);
  });

  it('serializes each cookie into a Set-Cookie value with its own options', () => {
    const { clientOptions, pendingCookies } = buildSessionClient();

    clientOptions.cookies.setAll(
      [
        {
          name: 'sb-access-token',
          value: 'abc',
          options: { path: '/', httpOnly: true },
        },
        { name: 'sb-refresh-token', value: 'def', options: { path: '/' } },
      ],
      {},
    );

    expect(pendingCookies).toEqual([
      'sb-access-token=abc; Path=/; HttpOnly',
      'sb-refresh-token=def; Path=/',
    ]);
  });

  it('serializes an empty value into a directive that expires the cookie', () => {
    // An empty value means "remove this cookie", and `@supabase/ssr` always
    // pairs it with `maxAge: 0`. A plain `name=` would leave a live, empty
    // cookie behind and sign-out would not actually sign out.
    const { clientOptions, pendingCookies } = buildSessionClient();

    clientOptions.cookies.setAll(
      [{ name: 'sb-access-token', value: '', options: { path: '/', maxAge: 0 } }],
      {},
    );

    expect(pendingCookies).toEqual(['sb-access-token=; Max-Age=0; Path=/']);
  });

  it('keeps two directives for the same name at different scopes', () => {
    // `@supabase/ssr` deliberately emits a host-only clear NEXT TO a
    // domain-scoped one when a parent domain is configured, because the browser
    // returns both and a stale one resurrects the session. A buffer keyed by
    // cookie NAME collapses the pair into one; a list does not.
    const { clientOptions, pendingCookies } = buildSessionClient();

    clientOptions.cookies.setAll(
      [
        { name: 'sb-access-token', value: '', options: { path: '/', maxAge: 0 } },
        {
          name: 'sb-access-token',
          value: '',
          options: { path: '/', maxAge: 0, domain: '.chuyocode.com' },
        },
      ],
      {},
    );

    expect(pendingCookies).toEqual([
      'sb-access-token=; Max-Age=0; Path=/',
      'sb-access-token=; Max-Age=0; Domain=.chuyocode.com; Path=/',
    ]);
  });

  it('starts with no pending cookies', () => {
    expect(buildSessionClient().pendingCookies).toEqual([]);
  });

  it('buffers the response headers handed to setAll', () => {
    // Middleware cannot reach the Response until `next()` resolves, so the
    // cache headers Supabase asks for have to be held until then.
    const { clientOptions, pendingHeaders } = buildSessionClient();

    clientOptions.cookies.setAll([], {
      'cache-control': 'private, no-store',
      pragma: 'no-cache',
    });

    expect(pendingHeaders.get('cache-control')).toBe('private, no-store');
    expect(pendingHeaders.get('pragma')).toBe('no-cache');
    expect(pendingHeaders.size).toBe(2);
  });

  it('starts with no pending headers and adds none when setAll receives none', () => {
    const { clientOptions, pendingHeaders } = buildSessionClient();

    expect(pendingHeaders.size).toBe(0);

    clientOptions.cookies.setAll(
      [{ name: 'sb-access-token', value: 'abc', options: { path: '/' } }],
      {},
    );

    expect(pendingHeaders.size).toBe(0);
  });
});

describe('flushSessionHeaders', () => {
  it('appends every pending cookie to the response headers', () => {
    const headers = new Headers();

    flushSessionHeaders(headers, {
      pendingHeaders: new Map(),
      pendingCookies: ['sb-a=1; Path=/', 'sb-b=2; Path=/'],
    });

    expect(headers.getSetCookie()).toEqual(['sb-a=1; Path=/', 'sb-b=2; Path=/']);
  });

  it('appends rather than overwrites, so a cookie already on the response survives', () => {
    // `set` would silently drop a `Set-Cookie` a route put there itself.
    const headers = new Headers();
    headers.append('set-cookie', 'chu_like_x=1; Path=/');

    flushSessionHeaders(headers, {
      pendingHeaders: new Map(),
      pendingCookies: ['sb-a=1; Path=/'],
    });

    expect(headers.getSetCookie()).toEqual([
      'chu_like_x=1; Path=/',
      'sb-a=1; Path=/',
    ]);
  });

  it('sets the buffered response headers', () => {
    const headers = new Headers();

    flushSessionHeaders(headers, {
      pendingHeaders: new Map([['pragma', 'no-cache']]),
      pendingCookies: [],
    });

    expect(headers.get('pragma')).toBe('no-cache');
  });

  it('overwrites a buffered header rather than appending a second copy', () => {
    // `Cache-Control` is the one Supabase always asks for. Two copies is not a
    // stricter directive, it is an ambiguous one.
    const headers = new Headers({ 'cache-control': 'public, max-age=3600' });

    flushSessionHeaders(headers, {
      pendingHeaders: new Map([['cache-control', 'private, no-store']]),
      pendingCookies: [],
    });

    expect(headers.get('cache-control')).toBe('private, no-store');
  });

  it('leaves the headers untouched when nothing was buffered', () => {
    const headers = new Headers({ 'content-type': 'application/json' });

    flushSessionHeaders(headers, {
      pendingHeaders: new Map(),
      pendingCookies: [],
    });

    expect([...headers.entries()]).toEqual([
      ['content-type', 'application/json'],
    ]);
  });
});
