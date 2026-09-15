/**
 * Integration tests for POST /api/auth/signin — the magic-link request.
 *
 * 🔴 THE CENTRAL TEST IS T3: ACCOUNT ENUMERATION. This endpoint is the only
 * public surface that is handed an arbitrary email address, so any observable
 * difference between "this address has an account" and "this address does not"
 * turns the sign-in form into a membership oracle for the whole site.
 *
 * The enumeration tests therefore compare the FULL response — status, body text
 * and every header — between the two cases, rather than spot-checking a status
 * code. They also drive the case where SUPABASE ITSELF answers differently, so
 * the endpoint's uniformity is proven to be its own property and not something
 * inherited from a provider that may change.
 *
 * `@lib/supabaseSession` is mocked so no client is constructed and no network
 * happens. `@lib/authRedirect` and `@lib/httpCache` are deliberately NOT mocked:
 * the safe redirect and the cache directive are part of this endpoint's
 * contract, and stubbing them would leave both unproven here.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DEFAULT_LANG } from '@lib/i18n';

const { createSessionClientMock, signInWithOtpMock } = vi.hoisted(() => ({
  createSessionClientMock: vi.fn(),
  signInWithOtpMock: vi.fn(),
}));

vi.mock('@lib/supabaseSession', () => ({
  createSessionClient: createSessionClientMock,
}));

import { POST } from './signin';

const KNOWN_EMAIL = 'ya-tiene-cuenta@chuyo.test';
const UNKNOWN_EMAIL = 'nunca-se-registro@chuyo.test';

/** Build the APIContext stub the handler reads. */
function ctx(body: unknown, contentType = 'application/json') {
  const request = new Request('https://chuyocode.com/api/auth/signin', {
    method: 'POST',
    headers: { 'content-type': contentType },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  return { request } as unknown as Parameters<typeof POST>[0];
}

/** Everything observable about a response, for byte-level comparison. */
async function fingerprint(res: Response) {
  return {
    status: res.status,
    body: await res.text(),
    headers: [...res.headers.entries()].sort(),
  };
}

/** The options object handed to `signInWithOtp` on the most recent call. */
function otpOptions() {
  const call = signInWithOtpMock.mock.calls.at(-1)?.[0] as {
    email: string;
    options?: {
      data?: { lang?: string };
      emailRedirectTo?: string;
      shouldCreateUser?: boolean;
    };
  };
  return call;
}

beforeEach(() => {
  vi.clearAllMocks();
  createSessionClientMock.mockReturnValue({
    client: { auth: { signInWithOtp: signInWithOtpMock } },
    pendingHeaders: new Map<string, string>(),
  });
  signInWithOtpMock.mockResolvedValue({ data: {}, error: null });
});

describe('POST /api/auth/signin — T3 account enumeration', () => {
  it('answers identically for an address with an account and one without', async () => {
    const known = await fingerprint(await POST(ctx({ email: KNOWN_EMAIL })));
    const unknown = await fingerprint(await POST(ctx({ email: UNKNOWN_EMAIL })));

    expect(unknown).toEqual(known);
    expect(known.status).toBe(200);
    expect(JSON.parse(known.body)).toEqual({ ok: true });
  });

  it('answers identically even when Supabase itself distinguishes the two', async () => {
    // The real oracle risk is not our branching — it is passing a provider
    // difference straight through. `signInWithOtp` rejecting an unknown address
    // must produce the SAME bytes as accepting a known one.
    signInWithOtpMock.mockResolvedValueOnce({ data: {}, error: null });
    const known = await fingerprint(await POST(ctx({ email: KNOWN_EMAIL })));

    signInWithOtpMock.mockResolvedValueOnce({
      data: {},
      error: { message: 'Signups not allowed for otp', status: 422 },
    });
    const unknown = await fingerprint(await POST(ctx({ email: UNKNOWN_EMAIL })));

    expect(unknown).toEqual(known);
  });

  it('answers identically when the provider is unreachable', async () => {
    // An outage must not become an oracle either: a 500 on some addresses and a
    // 200 on others is the same leak with a different cause.
    const ok = await fingerprint(await POST(ctx({ email: KNOWN_EMAIL })));

    signInWithOtpMock.mockRejectedValueOnce(new Error('fetch failed'));
    const down = await fingerprint(await POST(ctx({ email: UNKNOWN_EMAIL })));

    expect(down).toEqual(ok);
  });

  it('never narrows signInWithOtp to existing accounts only', async () => {
    // 🔴 THIS IS THE DECISION THAT MAKES T3 POSSIBLE AT ALL. `shouldCreateUser`
    // defaults to `true`, which is why an unknown address produces the same link
    // as a known one. Setting it to `false` makes Supabase answer differently
    // for the two, and no amount of uniform wrapping above it hides a provider
    // that sends an email in one case and nothing in the other.
    await POST(ctx({ email: UNKNOWN_EMAIL }));

    expect(otpOptions().options).not.toHaveProperty('shouldCreateUser');
  });
});

describe('POST /api/auth/signin — the request it makes', () => {
  it('asks Supabase for a link for the submitted address', async () => {
    await POST(ctx({ email: KNOWN_EMAIL }));

    expect(signInWithOtpMock).toHaveBeenCalledTimes(1);
    expect(otpOptions().email).toBe(KNOWN_EMAIL);
  });

  it('points the email back at the confirm route on this origin', async () => {
    await POST(ctx({ email: KNOWN_EMAIL, next: '/en/libros' }));

    const target = new URL(otpOptions().options?.emailRedirectTo ?? '');
    expect(target.origin).toBe('https://chuyocode.com');
    expect(target.pathname).toBe('/api/auth/confirm');
    expect(target.searchParams.get('next')).toBe('/en/libros');
  });

  it('neutralises a hostile `next` before it reaches the email', async () => {
    // The emailed link is the one place `next` is hardest to inspect, so the
    // guard runs here as well as at confirm time.
    await POST(ctx({ email: KNOWN_EMAIL, next: '//evil.com' }));

    const target = new URL(otpOptions().options?.emailRedirectTo ?? '');
    expect(target.searchParams.get('next')).toBe(`/${DEFAULT_LANG}/`);
  });

  it('records the submitted locale in user metadata', async () => {
    // Read back server-side when a moderation email is sent (design §9).
    await POST(ctx({ email: KNOWN_EMAIL, lang: 'en' }));

    expect(otpOptions().options?.data).toEqual({ lang: 'en' });
  });

  it('falls back to the default locale when `lang` is not supported', async () => {
    await POST(ctx({ email: KNOWN_EMAIL, lang: 'fr' }));

    expect(otpOptions().options?.data).toEqual({ lang: DEFAULT_LANG });
  });
});

describe('POST /api/auth/signin — response shape', () => {
  it('keeps the answer out of every cache', async () => {
    const res = await POST(ctx({ email: KNOWN_EMAIL }));

    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  it('answers JSON', async () => {
    const res = await POST(ctx({ email: KNOWN_EMAIL }));

    expect(res.headers.get('content-type')).toContain('application/json');
  });
});

describe('POST /api/auth/signin — malformed requests', () => {
  it('rejects a missing email without contacting Supabase', async () => {
    // Syntactic validity is computed locally and is independent of any account,
    // so answering 400 here leaks nothing that 200 would not.
    const res = await POST(ctx({ lang: 'es' }));

    expect(res.status).toBe(400);
    expect(signInWithOtpMock).not.toHaveBeenCalled();
  });

  it('rejects an email-shaped string that is not an address', async () => {
    const res = await POST(ctx({ email: 'no-arroba-aqui' }));

    expect(res.status).toBe(400);
    expect(signInWithOtpMock).not.toHaveBeenCalled();
  });

  it('rejects a non-string email', async () => {
    const res = await POST(ctx({ email: 42 }));

    expect(res.status).toBe(400);
    expect(signInWithOtpMock).not.toHaveBeenCalled();
  });

  it('rejects a body that is not JSON at all', async () => {
    const res = await POST(ctx('not-json{', 'application/json'));

    expect(res.status).toBe(400);
    expect(signInWithOtpMock).not.toHaveBeenCalled();
  });
});
