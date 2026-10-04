import { describe, it, expect } from 'vitest';
import { applySecurityHeaders, withSecurityHeaders } from './securityHeaders';

describe('applySecurityHeaders', () => {
  it('sets every security header on a fresh Headers instance', () => {
    const headers = new Headers();
    applySecurityHeaders(headers);

    expect(headers.get('content-security-policy')).toBe("frame-ancestors 'self'");
    expect(headers.get('x-frame-options')).toBe('SAMEORIGIN');
    expect(headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    expect(headers.get('permissions-policy')).toBe(
      'camera=(), geolocation=(), microphone=(self)',
    );
    expect(headers.get('x-content-type-options')).toBe('nosniff');
    expect(headers.has('content-security-policy-report-only')).toBe(true);
  });

  it('never restricts payment in Permissions-Policy (a future payment provider needs it)', () => {
    const headers = new Headers();
    applySecurityHeaders(headers);
    expect(headers.get('permissions-policy')).not.toContain('payment');
  });

  it('does not overwrite a header the route already set', () => {
    const headers = new Headers({ 'referrer-policy': 'no-referrer' });
    applySecurityHeaders(headers);
    expect(headers.get('referrer-policy')).toBe('no-referrer');
    // The other five are still applied — only the pre-set one is preserved.
    expect(headers.get('x-frame-options')).toBe('SAMEORIGIN');
  });

  it('is idempotent: calling it twice changes nothing the second time', () => {
    const headers = new Headers();
    applySecurityHeaders(headers);
    const first = [...headers.entries()];
    applySecurityHeaders(headers);
    expect([...headers.entries()]).toEqual(first);
  });

  describe('report-only CSP source list', () => {
    function reportOnly(): string {
      const headers = new Headers();
      applySecurityHeaders(headers);
      return headers.get('content-security-policy-report-only') as string;
    }

    it('allows Supabase REST/Auth/Storage over https, but NOT realtime websockets', () => {
      const csp = reportOnly();
      expect(csp).toContain('https://*.supabase.co');
      // No Realtime (`.channel(`) usage exists anywhere in the codebase today —
      // verified by grep, not assumed. Adding `wss://` back is a one-line
      // change the day a realtime subscription actually ships.
      expect(csp).not.toContain('wss://');
    });

    it('allows Supabase Storage, the Sanity image CDN, and Google account avatars in img-src', () => {
      const csp = reportOnly();
      // Scoped to the img-src directive specifically (not just "appears
      // somewhere in the policy") — exerciseMedia.ts allow-lists Supabase
      // Storage alongside Sanity's CDN for the SAME media, so img-src must
      // carry both, not just whichever one connect-src/media-src already do.
      expect(csp).toMatch(/img-src[^;]*https:\/\/\*\.supabase\.co/);
      expect(csp).toMatch(/img-src[^;]*https:\/\/cdn\.sanity\.io/);
      expect(csp).toMatch(/img-src[^;]*https:\/\/lh3\.googleusercontent\.com/);
      expect(csp).toMatch(/img-src[^;]*data:/);
      expect(csp).toMatch(/img-src[^;]*blob:/);
    });

    it('allows Sanity and Supabase in media-src for exercise audio playback', () => {
      const csp = reportOnly();
      expect(csp).toMatch(/media-src[^;]*https:\/\/cdn\.sanity\.io/);
      expect(csp).toMatch(/media-src[^;]*https:\/\/\*\.supabase\.co/);
    });

    it('allows YouTube (nocookie) and Vimeo embeds, and Cloudflare Turnstile, in frame-src', () => {
      const csp = reportOnly();
      expect(csp).toMatch(/frame-src[^;]*https:\/\/www\.youtube-nocookie\.com/);
      expect(csp).toMatch(/frame-src[^;]*https:\/\/player\.vimeo\.com/);
      expect(csp).toMatch(/frame-src[^;]*https:\/\/challenges\.cloudflare\.com/);
    });

    it('allows Cloudflare Turnstile in script-src ahead of time', () => {
      expect(reportOnly()).toMatch(/script-src[^;]*https:\/\/challenges\.cloudflare\.com/);
    });

    it('allows the Google Fonts stylesheet and its gstatic font files', () => {
      const csp = reportOnly();
      expect(csp).toMatch(/style-src[^;]*https:\/\/fonts\.googleapis\.com/);
      expect(csp).toMatch(/font-src[^;]*https:\/\/fonts\.gstatic\.com/);
    });

    it('allows the Google sign-in redirect chain in form-action', () => {
      const csp = reportOnly();
      expect(csp).toMatch(/form-action[^;]*https:\/\/\*\.supabase\.co/);
      expect(csp).toMatch(/form-action[^;]*https:\/\/accounts\.google\.com/);
    });

    it('denies object/embed and keeps the baseline directives', () => {
      const csp = reportOnly();
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("base-uri 'self'");
      expect(csp).toContain("frame-ancestors 'self'");
      expect(csp).toContain('upgrade-insecure-requests');
      expect(csp).toContain("worker-src 'self'");
    });
  });
});

describe('withSecurityHeaders', () => {
  it('applies headers in place on an ordinary (mutable) Response', () => {
    const response = new Response('hello', { status: 200 });
    const result = withSecurityHeaders(response);

    expect(result.headers.get('x-content-type-options')).toBe('nosniff');
    expect(result.status).toBe(200);
  });

  it('preserves an existing header on an ordinary Response', () => {
    const response = new Response(null, {
      status: 200,
      headers: { 'referrer-policy': 'no-referrer' },
    });
    const result = withSecurityHeaders(response);
    expect(result.headers.get('referrer-policy')).toBe('no-referrer');
  });

  it('rebuilds and applies headers when the Response has immutable headers (Response.redirect)', () => {
    const redirect = Response.redirect('https://chuyo.test/es/', 302);
    // Sanity check on the premise this test exists to cover: redirect()
    // responses really do carry immutable headers in this runtime.
    expect(() => redirect.headers.set('x-probe', '1')).toThrow();

    const result = withSecurityHeaders(redirect);

    expect(result.status).toBe(302);
    expect(result.headers.get('location')).toBe('https://chuyo.test/es/');
    expect(result.headers.get('x-content-type-options')).toBe('nosniff');
    expect(result.headers.get('content-security-policy')).toBe("frame-ancestors 'self'");
  });

  it('applies headers to a 303 built with new Response', async () => {
    const headers = new Headers({ location: '/es/auth/entrar' });
    const response = new Response(null, { status: 303, statusText: 'See Other', headers });

    const result = withSecurityHeaders(response);

    expect(result.status).toBe(303);
    expect(result.headers.get('location')).toBe('/es/auth/entrar');
    expect(result.headers.get('x-frame-options')).toBe('SAMEORIGIN');
  });

  it('applies headers to a JSON API response', async () => {
    const response = new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });

    const result = withSecurityHeaders(response);

    await expect(result.json()).resolves.toEqual({ ok: true });
    expect(result.headers.get('content-type')).toBe('application/json');
    expect(result.headers.get('permissions-policy')).toBe(
      'camera=(), geolocation=(), microphone=(self)',
    );
  });
});
