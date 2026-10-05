/**
 * Integration tests for POST /api/auth/consentimiento — Login step 2's
 * durable write (Ley N° 29733, `@lib/ageConsent`). `recordAgeConsent`'s own
 * write shape and fail-closed behavior are covered by `ageConsent.test.ts`;
 * this file proves the ROUTE: signed-in only, `application/json` only (a
 * cross-site form can post `text/plain`), the required `consent: true` body,
 * idempotent success, and that every exit stays `private, no-store` with any
 * buffered session cookie flushed.
 *
 * `@lib/supabaseSession` is mocked so no client is constructed and no network
 * happens (same pattern as `_signin.test.ts`); `recordAgeConsent` is mocked
 * too, so this file is free to assert exactly what it was called with
 * without re-proving its own internals.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { createSessionClientMock, getUserMock, recordAgeConsentMock } = vi.hoisted(() => ({
  createSessionClientMock: vi.fn(),
  getUserMock: vi.fn(),
  recordAgeConsentMock: vi.fn(),
}));

// `@lib/supabaseSession` reads the Supabase URL / anon key at module init, and
// only `createSessionClient` is stubbed below, so the module really loads.
vi.mock('@lib/env', () => ({
  loadEnv: () => ({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon-key' }),
}));

vi.mock('@lib/supabaseSession', async (importActual) => {
  // 🔴 `flushSessionHeaders` IS DELIBERATELY NOT MOCKED — same reason as
  // `_signin.test.ts`'s own header: the assertions belong on what the caller
  // RECEIVES, not on what the route called.
  const actual = await importActual<typeof import('@lib/supabaseSession')>();
  return { ...actual, createSessionClient: createSessionClientMock };
});

vi.mock('@lib/ageConsent', async (importActual) => {
  const actual = await importActual<typeof import('@lib/ageConsent')>();
  return { ...actual, recordAgeConsent: recordAgeConsentMock };
});

import { POST } from './consentimiento';

const USER = { id: 'user-1', app_metadata: { provider: 'email', providers: ['email'] } };

/** Build the APIContext stub the handler reads. */
function ctx(body: unknown, contentType: string | null = 'application/json') {
  const request = new Request('https://chuyocode.com/api/auth/consentimiento', {
    method: 'POST',
    headers: contentType ? { 'content-type': contentType } : {},
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  return { request } as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  createSessionClientMock.mockImplementation(() => ({
    client: { auth: { getUser: getUserMock } },
    pendingHeaders: new Map(),
    pendingCookies: [],
  }));
  getUserMock.mockResolvedValue({ data: { user: USER }, error: null });
  recordAgeConsentMock.mockResolvedValue(true);
});

describe('signed-in only', () => {
  it('401s with no leaked body when there is no session', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    const res = await POST(ctx({ consent: true }));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false });
    expect(recordAgeConsentMock).not.toHaveBeenCalled();
  });

  it('401s when getUser() throws (unreachable Supabase) rather than 500ing', async () => {
    getUserMock.mockRejectedValue(new Error('offline'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await POST(ctx({ consent: true }));

    expect(res.status).toBe(401);
    errorSpy.mockRestore();
  });
});

describe('application/json only', () => {
  it('400s a text/plain body even when it is JSON-shaped (cross-site form bypass)', async () => {
    const res = await POST(ctx(JSON.stringify({ consent: true }), 'text/plain'));

    expect(res.status).toBe(400);
    expect(recordAgeConsentMock).not.toHaveBeenCalled();
  });

  it('400s a missing content-type', async () => {
    const res = await POST(ctx({ consent: true }, null));
    expect(res.status).toBe(400);
  });

  it('400s malformed JSON even with the right content-type', async () => {
    const res = await POST(ctx('not json'));
    expect(res.status).toBe(400);
  });
});

describe('the consent field is required (never trust the client)', () => {
  it('400s when consent is missing', async () => {
    const res = await POST(ctx({}));
    expect(res.status).toBe(400);
    expect(recordAgeConsentMock).not.toHaveBeenCalled();
  });

  it('400s when consent is false', async () => {
    const res = await POST(ctx({ consent: false }));
    expect(res.status).toBe(400);
  });

  it('400s a truthy non-boolean consent value', async () => {
    const res = await POST(ctx({ consent: 'true' }));
    expect(res.status).toBe(400);
  });
});

describe('success', () => {
  it('records consent for the server-verified user id and their current app_metadata', async () => {
    const res = await POST(ctx({ consent: true }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(recordAgeConsentMock).toHaveBeenCalledWith('user-1', USER.app_metadata);
  });

  it('is private, no-store on every exit', async () => {
    const res = await POST(ctx({ consent: true }));
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  it('flushes a buffered session cookie onto the response', async () => {
    createSessionClientMock.mockImplementation(() => ({
      client: { auth: { getUser: getUserMock } },
      pendingHeaders: new Map(),
      pendingCookies: ['sb-x-auth-token=rotated; Path=/; HttpOnly'],
    }));

    const res = await POST(ctx({ consent: true }));

    expect(res.headers.getSetCookie()).toEqual(['sb-x-auth-token=rotated; Path=/; HttpOnly']);
  });

  it('is idempotent — calling it again still succeeds', async () => {
    await POST(ctx({ consent: true }));
    const res = await POST(ctx({ consent: true }));

    expect(res.status).toBe(200);
    expect(recordAgeConsentMock).toHaveBeenCalledTimes(2);
  });
});

describe('a failed write', () => {
  it('500s without leaking why, when recordAgeConsent fails closed', async () => {
    recordAgeConsentMock.mockResolvedValue(false);
    const res = await POST(ctx({ consent: true }));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false });
  });
});
