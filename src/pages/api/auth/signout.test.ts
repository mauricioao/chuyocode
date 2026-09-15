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
 * `src/lib/supabaseSession.test.ts`; this file proves the ROUTE's decisions.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DEFAULT_LANG } from '@lib/i18n';

const { createSessionClientMock, signOutMock, pendingHeaders } = vi.hoisted(
  () => ({
    createSessionClientMock: vi.fn(),
    signOutMock: vi.fn(),
    pendingHeaders: new Map<string, string>(),
  }),
);

vi.mock('@lib/supabaseSession', () => ({
  createSessionClient: createSessionClientMock,
}));

import { POST } from './signout';

const HOME = `/${DEFAULT_LANG}/`;

/** Build the APIContext stub the handler reads. */
function ctx(query = '') {
  const request = new Request(
    `https://chuyocode.com/api/auth/signout${query}`,
    { method: 'POST' },
  );
  return {
    request,
    cookies: { set: vi.fn(), delete: vi.fn() },
  } as unknown as Parameters<typeof POST>[0];
}

/** The `Location` header of a redirect response. */
function location(res: Response): string {
  return res.headers.get('location') ?? '';
}

beforeEach(() => {
  vi.clearAllMocks();
  pendingHeaders.clear();
  createSessionClientMock.mockReturnValue({
    client: { auth: { signOut: signOutMock } },
    pendingHeaders,
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
    expect(location(res)).toBe(HOME);
  });

  it('keeps the visitor in the locale they signed out from', async () => {
    // Dropping an English reader onto the Spanish home page is a locale bug, so
    // the caller may name the page to return to — through the same guard the
    // magic-link routes use, never as a raw value.
    const res = await POST(ctx('?next=%2Fen%2F'));

    expect(location(res)).toBe('/en/');
  });

  it('neutralises a hostile `next`', async () => {
    const res = await POST(ctx('?next=%2F%2Fevil.com'));

    expect(location(res)).toBe(HOME);
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
      return { client: { auth: { signOut: signOutMock } }, pendingHeaders };
    });

    const res = await POST(ctx());

    expect(res.headers.get('x-supabase-hint')).toBe('cleared');
  });

  it('does not let a buffered header overwrite the cache directive', async () => {
    createSessionClientMock.mockImplementation(() => {
      pendingHeaders.set('cache-control', 'public, max-age=3600');
      return { client: { auth: { signOut: signOutMock } }, pendingHeaders };
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
    expect(location(res)).toBe(HOME);
  });

  it('still redirects when the provider is unreachable', async () => {
    signOutMock.mockRejectedValue(new Error('fetch failed'));

    const res = await POST(ctx());

    expect(res.status).toBe(303);
    expect(location(res)).toBe(HOME);
  });
});
