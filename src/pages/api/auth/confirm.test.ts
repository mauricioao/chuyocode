/**
 * Integration tests for GET /api/auth/confirm — the magic-link landing route.
 *
 * 🔴 THE CENTRAL TEST IS T2: CREDENTIAL LEAKAGE. `token_hash` and the PKCE
 * `code` are both single-use session credentials arriving in a URL. If either
 * survives into the `Location` header it is written to browser history and sent
 * in the `Referer` of whatever the destination page loads next, which is how a
 * credential ends up in a third party's access log. Both must be gone BEFORE the
 * 303, not after, and both are asserted — a suite that covered only `token_hash`
 * would pass while the other half of the hole stayed open.
 *
 * 🔴 THE SECOND CENTRAL TEST IS PRECEDENCE. When a hand-crafted URL carries both
 * credentials, the route must redeem the browser-bound `code` and must NOT fall
 * back to the unbound `token_hash` beside it. That fallback would be a
 * session-fixation attack; `confirm.ts`'s module header argues it in full.
 *
 * The rest covers what task 3.8 can honestly prove without a mail transport:
 * redemption success on both paths, an expired token, an already-consumed token,
 * a rejected code exchange, no credential at all, and an unreachable provider —
 * each asserted on the OBSERVABLE outcome (status, `Location`, which Supabase
 * call was made) rather than on the provider's internals.
 *
 * SCOPE NOTE. Writing the session cookies is `@supabase/ssr`'s job through the
 * adapter proven in `src/lib/supabaseSession.test.ts`; this file proves the
 * ROUTE's decisions — what it calls, with what, and where it sends the visitor.
 * The two together are still not an end-to-end magic link: that needs a real
 * email and is recorded as blocked.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DEFAULT_LANG } from '@lib/i18n';
import { AUTH_ERROR_PARAM, AUTH_ERROR_LINK_INVALID } from '@lib/authRedirect';

const {
  createSessionClientMock,
  verifyOtpMock,
  exchangeCodeMock,
  pendingHeaders,
} = vi.hoisted(() => ({
  createSessionClientMock: vi.fn(),
  verifyOtpMock: vi.fn(),
  exchangeCodeMock: vi.fn(),
  pendingHeaders: new Map<string, string>(),
}));

vi.mock('@lib/supabaseSession', () => ({
  createSessionClient: createSessionClientMock,
}));

import { GET } from './confirm';

const TOKEN = 'pkce_9f3c1d7e2b';
/** What Supabase's DEFAULT email template actually delivers, as `?code=`. */
const CODE = '6a1f0c39-2b7d-4e18-9c55-0d3a71b4e9cf';

/** The auth surface both credential paths are dispatched against. */
function authStub() {
  return { verifyOtp: verifyOtpMock, exchangeCodeForSession: exchangeCodeMock };
}

/** Build the APIContext stub the handler reads, from a confirm query string. */
function ctx(query: string) {
  const request = new Request(
    `https://chuyocode.com/api/auth/confirm${query}`,
    { method: 'GET' },
  );
  return {
    request,
    cookies: { set: vi.fn(), delete: vi.fn() },
  } as unknown as Parameters<typeof GET>[0];
}

/** The `Location` header of a redirect response. */
function location(res: Response): string {
  return res.headers.get('location') ?? '';
}

/** The arguments of the most recent `verifyOtp` call. */
function otpArgs() {
  return verifyOtpMock.mock.calls.at(-1)?.[0] as {
    type: string;
    token_hash: string;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  pendingHeaders.clear();
  createSessionClientMock.mockReturnValue({
    client: { auth: authStub() },
    pendingHeaders,
  });
  verifyOtpMock.mockResolvedValue({
    data: { user: { id: 'user-1' } },
    error: null,
  });
  exchangeCodeMock.mockResolvedValue({
    data: { user: { id: 'user-1' }, session: { access_token: 'at' } },
    error: null,
  });
});

describe('GET /api/auth/confirm — T2 credential stripping', () => {
  it('never carries token_hash into the redirect target', async () => {
    const res = await GET(
      ctx(`?token_hash=${TOKEN}&type=email&next=%2Fes%2Flibros`),
    );

    expect(res.status).toBe(303);
    expect(location(res)).not.toContain(TOKEN);
    expect(location(res)).not.toContain('token_hash');
  });

  it('never carries type into the redirect target', async () => {
    const res = await GET(ctx(`?token_hash=${TOKEN}&type=email`));

    expect(location(res)).not.toContain('type=');
  });

  it('strips the credential even when it rides inside `next`', async () => {
    // The confirm URL's own parameters are not the only route in: a crafted
    // `next` can carry them too, and it is the value we echo back.
    const next = encodeURIComponent(
      `/es/libros?token_hash=${TOKEN}&type=email&orden=reciente`,
    );
    const res = await GET(ctx(`?token_hash=${TOKEN}&type=email&next=${next}`));

    expect(location(res)).toBe('/es/libros?orden=reciente');
  });

  it('sends the visitor to the requested destination on success', async () => {
    const res = await GET(
      ctx(`?token_hash=${TOKEN}&type=email&next=%2Fen%2Flibros`),
    );

    expect(location(res)).toBe('/en/libros');
  });

  it('uses 303 so the browser follows with GET', async () => {
    // A 302 lets the browser preserve the original method; 303 is the status
    // that means "go and GET this other thing instead".
    const res = await GET(ctx(`?token_hash=${TOKEN}&type=email`));

    expect(res.status).toBe(303);
  });

  it('falls back to the default locale home when `next` is hostile (T1)', async () => {
    const res = await GET(
      ctx(`?token_hash=${TOKEN}&type=email&next=%2F%2Fevil.com`),
    );

    expect(location(res)).toBe(`/${DEFAULT_LANG}/`);
  });
});

describe('GET /api/auth/confirm — verification', () => {
  it('verifies the token as an email OTP', async () => {
    await GET(ctx(`?token_hash=${TOKEN}&type=email`));

    expect(verifyOtpMock).toHaveBeenCalledTimes(1);
    expect(otpArgs()).toEqual({ type: 'email', token_hash: TOKEN });
  });

  it('ignores the `type` the URL claims and always verifies as email', async () => {
    // `type` is attacker-controlled. Passing it through would let a crafted link
    // choose which verification flow runs; the server decides instead.
    await GET(ctx(`?token_hash=${TOKEN}&type=recovery`));

    expect(otpArgs().type).toBe('email');
  });

  it('does not mark the redirect on a successful confirmation', async () => {
    const res = await GET(ctx(`?token_hash=${TOKEN}&type=email`));

    expect(location(res)).not.toContain(AUTH_ERROR_PARAM);
  });
});

describe('GET /api/auth/confirm — rejected links', () => {
  it('creates no session for an expired token and invites a new link', async () => {
    verifyOtpMock.mockResolvedValue({
      data: { user: null },
      error: { message: 'Email link is invalid or has expired', status: 401 },
    });

    const res = await GET(ctx(`?token_hash=${TOKEN}&type=email&next=%2Fes%2F`));

    expect(res.status).toBe(303);
    expect(location(res)).toBe(
      `/es/?${AUTH_ERROR_PARAM}=${AUTH_ERROR_LINK_INVALID}`,
    );
  });

  it('creates no session for an already-consumed token', async () => {
    verifyOtpMock.mockResolvedValue({
      data: { user: null },
      error: { message: 'Token has already been used', status: 401 },
    });

    const res = await GET(ctx(`?token_hash=${TOKEN}&type=email`));

    expect(location(res)).toContain(
      `${AUTH_ERROR_PARAM}=${AUTH_ERROR_LINK_INVALID}`,
    );
  });

  it('does not call Supabase at all when no credential is present', async () => {
    // A bare `/api/auth/confirm` is a crawler or a truncated link, not a visitor
    // with a credential. There is nothing to verify and no round trip to spend.
    const res = await GET(ctx('?type=email&next=%2Fes%2F'));

    expect(verifyOtpMock).not.toHaveBeenCalled();
    expect(exchangeCodeMock).not.toHaveBeenCalled();
    expect(location(res)).toBe(
      `/es/?${AUTH_ERROR_PARAM}=${AUTH_ERROR_LINK_INVALID}`,
    );
  });

  it('degrades to the invite instead of a 500 when the provider is unreachable', async () => {
    verifyOtpMock.mockRejectedValue(new Error('fetch failed'));

    const res = await GET(ctx(`?token_hash=${TOKEN}&type=email`));

    expect(res.status).toBe(303);
    expect(location(res)).toContain(
      `${AUTH_ERROR_PARAM}=${AUTH_ERROR_LINK_INVALID}`,
    );
  });

  it('keeps the credential out of the redirect on the failure path too', async () => {
    verifyOtpMock.mockResolvedValue({
      data: { user: null },
      error: { message: 'Email link is invalid or has expired', status: 401 },
    });

    const res = await GET(ctx(`?token_hash=${TOKEN}&type=email`));

    expect(location(res)).not.toContain(TOKEN);
  });
});

/**
 * The PKCE `code` path — the one a real emailed link uses TODAY.
 *
 * The site cannot edit its Supabase email templates, so every link it sends is
 * the default one, and the default one comes back as `?code=`. A route that
 * only knows `token_hash` signs nobody in.
 */
describe('GET /api/auth/confirm — the PKCE `code` credential', () => {
  it('exchanges the code for a session', async () => {
    await GET(ctx(`?code=${CODE}&next=%2Fes%2F`));

    expect(exchangeCodeMock).toHaveBeenCalledTimes(1);
    expect(exchangeCodeMock).toHaveBeenCalledWith(CODE);
  });

  it('sends the visitor to the requested destination after the exchange', async () => {
    const res = await GET(ctx(`?code=${CODE}&next=%2Fen%2Flibros`));

    expect(res.status).toBe(303);
    expect(location(res)).toBe('/en/libros');
  });

  it('does not verify an OTP when the credential is a code', async () => {
    await GET(ctx(`?code=${CODE}`));

    expect(verifyOtpMock).not.toHaveBeenCalled();
  });

  it('never carries the code into the redirect target', async () => {
    const res = await GET(ctx(`?code=${CODE}&next=%2Fes%2Flibros`));

    expect(location(res)).not.toContain(CODE);
    expect(location(res)).not.toContain('code=');
  });

  it('strips the code even when it rides inside `next`', async () => {
    const next = encodeURIComponent(`/es/libros?code=${CODE}&orden=reciente`);
    const res = await GET(ctx(`?code=${CODE}&next=${next}`));

    expect(location(res)).toBe('/es/libros?orden=reciente');
  });

  it('invites a new link when the exchange is rejected', async () => {
    // The commonest real cause is the missing code verifier: the link was
    // requested in one browser and opened in another.
    exchangeCodeMock.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'invalid request: both auth code and code verifier should be non-empty' },
    });

    const res = await GET(ctx(`?code=${CODE}&next=%2Fes%2F`));

    expect(res.status).toBe(303);
    expect(location(res)).toBe(
      `/es/?${AUTH_ERROR_PARAM}=${AUTH_ERROR_LINK_INVALID}`,
    );
  });

  it('keeps the code out of the redirect on the failure path too', async () => {
    exchangeCodeMock.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'invalid flow state' },
    });

    const res = await GET(ctx(`?code=${CODE}`));

    expect(location(res)).not.toContain(CODE);
    expect(location(res)).not.toContain('code=');
  });

  it('degrades to the invite instead of a 500 when the exchange throws', async () => {
    exchangeCodeMock.mockRejectedValue(new Error('fetch failed'));

    const res = await GET(ctx(`?code=${CODE}`));

    expect(res.status).toBe(303);
    expect(location(res)).toContain(
      `${AUTH_ERROR_PARAM}=${AUTH_ERROR_LINK_INVALID}`,
    );
  });
});

/**
 * Precedence when a URL carries BOTH credentials.
 *
 * Supabase never sends both, so a URL that has both was composed by hand. The
 * order is therefore a security decision, not a formality — see the module
 * header of `confirm.ts` for the reasoning these tests lock in.
 */
describe('GET /api/auth/confirm — credential precedence', () => {
  it('prefers the code and never redeems the token_hash beside it', async () => {
    await GET(ctx(`?code=${CODE}&token_hash=${TOKEN}&type=email`));

    expect(exchangeCodeMock).toHaveBeenCalledWith(CODE);
    expect(verifyOtpMock).not.toHaveBeenCalled();
  });

  it('does NOT fall back to the token_hash when the code exchange fails', async () => {
    // This is the whole point of the precedence. `token_hash` is an unbound
    // bearer credential: whoever holds it can redeem it from any browser. If a
    // failed exchange fell through to it, an attacker could append their own
    // `token_hash` to a link and have the victim's browser sign in as THEM.
    exchangeCodeMock.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'invalid flow state' },
    });

    const res = await GET(ctx(`?code=${CODE}&token_hash=${TOKEN}&next=%2Fes%2F`));

    expect(verifyOtpMock).not.toHaveBeenCalled();
    expect(location(res)).toBe(
      `/es/?${AUTH_ERROR_PARAM}=${AUTH_ERROR_LINK_INVALID}`,
    );
  });

  it('strips BOTH credentials from the redirect target', async () => {
    const res = await GET(
      ctx(`?code=${CODE}&token_hash=${TOKEN}&type=email&next=%2Fes%2Flibros`),
    );

    expect(location(res)).toBe('/es/libros');
  });

  it('still redeems a lone token_hash, for the day a custom template exists', async () => {
    await GET(ctx(`?token_hash=${TOKEN}&type=email`));

    expect(verifyOtpMock).toHaveBeenCalledTimes(1);
    expect(exchangeCodeMock).not.toHaveBeenCalled();
  });
});

describe('GET /api/auth/confirm — response mechanics', () => {
  it('keeps the redirect out of every cache', async () => {
    const res = await GET(ctx(`?token_hash=${TOKEN}&type=email`));

    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  it('flushes the headers Supabase asked for while writing cookies', async () => {
    createSessionClientMock.mockImplementation(() => {
      pendingHeaders.set('x-supabase-hint', 'refreshed');
      return { client: { auth: authStub() }, pendingHeaders };
    });

    const res = await GET(ctx(`?token_hash=${TOKEN}&type=email`));

    expect(res.headers.get('x-supabase-hint')).toBe('refreshed');
  });

  it('does not let a buffered header overwrite the cache directive', async () => {
    // Order matters: the cache safety of a session response is not negotiable,
    // so it is applied after anything the library asked for.
    createSessionClientMock.mockImplementation(() => {
      pendingHeaders.set('cache-control', 'public, max-age=3600');
      return { client: { auth: authStub() }, pendingHeaders };
    });

    const res = await GET(ctx(`?token_hash=${TOKEN}&type=email`));

    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });
});
