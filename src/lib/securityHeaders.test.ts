import { afterEach, describe, it, expect, vi } from 'vitest';
import { applySecurityHeaders, isCspEnforced, withSecurityHeaders } from './securityHeaders';
import { mergeEnvSources } from './env';

afterEach(() => {
  vi.unstubAllEnvs();
});

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

    it("allows Sentry's ingest endpoint (both SaaS host shapes) in connect-src", () => {
      const csp = reportOnly();
      expect(csp).toMatch(/connect-src[^;]*https:\/\/\*\.ingest\.sentry\.io/);
      expect(csp).toMatch(/connect-src[^;]*https:\/\/\*\.ingest\.us\.sentry\.io/);
      expect(csp).toMatch(/connect-src[^;]*https:\/\/\*\.ingest\.de\.sentry\.io/);
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

    it("allows Sanity and Supabase in media-src for exercise audio playback, plus blob: for the editor's own recorded-audio preview", () => {
      const csp = reportOnly();
      expect(csp).toMatch(/media-src[^;]*https:\/\/cdn\.sanity\.io/);
      expect(csp).toMatch(/media-src[^;]*https:\/\/\*\.supabase\.co/);
      // AudioMarkerPanel.tsx renders `<audio src={blobUrl}>` from
      // useAudioRecorder.ts's own `URL.createObjectURL(blob)` — a
      // `blob:` URL, never an http(s) one.
      expect(csp).toMatch(/media-src[^;]*blob:/);
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

    it('allows the Cloudflare Web Analytics beacon script and its reporting origin', () => {
      const csp = reportOnly();
      expect(csp).toMatch(/script-src[^;]*https:\/\/static\.cloudflareinsights\.com/);
      expect(csp).toMatch(/connect-src[^;]*https:\/\/cloudflareinsights\.com/);
    });

    it('never allows a PostHog host while PUBLIC_POSTHOG_KEY is unset', () => {
      vi.stubEnv('PUBLIC_POSTHOG_KEY', undefined);
      const csp = reportOnly();
      expect(csp).not.toContain('posthog');
    });

    it('allows the configured PostHog host AND its assets sibling in script-src and connect-src once a key is set (posthog-js loads its remote config/extensions from the assets host too)', () => {
      vi.stubEnv('PUBLIC_POSTHOG_KEY', 'phc_abc123');
      vi.stubEnv('PUBLIC_POSTHOG_HOST', 'https://us.i.posthog.com');
      const csp = reportOnly();
      expect(csp).toMatch(/script-src[^;]*https:\/\/us\.i\.posthog\.com/);
      expect(csp).toMatch(/script-src[^;]*https:\/\/us-assets\.i\.posthog\.com/);
      expect(csp).toMatch(/connect-src[^;]*https:\/\/us\.i\.posthog\.com/);
      expect(csp).toMatch(/connect-src[^;]*https:\/\/us-assets\.i\.posthog\.com/);
    });

    it('allows the default EU PostHog host, and its assets sibling, in both script-src and connect-src when only the key is set', () => {
      vi.stubEnv('PUBLIC_POSTHOG_KEY', 'phc_abc123');
      vi.stubEnv('PUBLIC_POSTHOG_HOST', undefined);
      const csp = reportOnly();
      expect(csp).toMatch(/script-src[^;]*https:\/\/eu\.i\.posthog\.com/);
      expect(csp).toMatch(/script-src[^;]*https:\/\/eu-assets\.i\.posthog\.com/);
      expect(csp).toMatch(/connect-src[^;]*https:\/\/eu\.i\.posthog\.com/);
      expect(csp).toMatch(/connect-src[^;]*https:\/\/eu-assets\.i\.posthog\.com/);
    });

    it('allows a custom/self-hosted PostHog host verbatim, with NO -assets sibling (posthog-js only derives one for a recognized Cloud region)', () => {
      vi.stubEnv('PUBLIC_POSTHOG_KEY', 'phc_abc123');
      vi.stubEnv('PUBLIC_POSTHOG_HOST', 'https://ph.example.com');
      const csp = reportOnly();
      expect(csp).toMatch(/script-src[^;]*https:\/\/ph\.example\.com/);
      expect(csp).toMatch(/connect-src[^;]*https:\/\/ph\.example\.com/);
      expect(csp).not.toContain('-assets');
      // No wildcard either — only the exact configured host (plus its
      // sibling for a recognized Cloud region, covered above).
      expect(csp).not.toContain('*.posthog.com');
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
      // NOT here: browsers ignore `upgrade-insecure-requests` in a
      // Report-Only policy and log a console error about it on every page.
      // It belongs in the enforced `content-security-policy` header once
      // this policy is enforced instead of report-only (see securityHeaders.ts).
      expect(csp).not.toContain('upgrade-insecure-requests');
      expect(csp).toContain("worker-src 'self'");
    });

    it('points both reporting directives at the csp-report endpoint', () => {
      const csp = reportOnly();
      expect(csp).toContain('report-to csp-endpoint');
      expect(csp).toContain('report-uri /api/csp-report');
    });
  });

  it('sets Reporting-Endpoints naming the same csp-endpoint the report-only policy points at', () => {
    const headers = new Headers();
    applySecurityHeaders(headers);
    expect(headers.get('reporting-endpoints')).toBe('csp-endpoint="/api/csp-report"');
  });

  it('does not overwrite an existing Reporting-Endpoints header', () => {
    const headers = new Headers({ 'reporting-endpoints': 'other-endpoint="/elsewhere"' });
    applySecurityHeaders(headers);
    expect(headers.get('reporting-endpoints')).toBe('other-endpoint="/elsewhere"');
  });
});

describe('CSP_ENFORCE (enforce mode toggle)', () => {
  it('report-only (default/unset) behaviour is unchanged — byte for byte', () => {
    const headers = new Headers();
    applySecurityHeaders(headers);
    expect(headers.get('content-security-policy')).toBe("frame-ancestors 'self'");
    expect(headers.get('content-security-policy-report-only')).not.toBeNull();
  });

  it.each(['false', 'FALSE', 'enabled', 'yes', '  true  ', ''])(
    'stays report-only for any value other than exactly "true"/"1" (got %j)',
    (value) => {
      vi.stubEnv('CSP_ENFORCE', value);
      const headers = new Headers();
      applySecurityHeaders(headers);
      expect(headers.get('content-security-policy')).toBe("frame-ancestors 'self'");
      expect(headers.has('content-security-policy-report-only')).toBe(true);
    },
  );

  it.each(['true', '1'])(
    'enforces the full policy on content-security-policy and sends no report-only header (CSP_ENFORCE=%s)',
    (value) => {
      vi.stubEnv('CSP_ENFORCE', value);
      const headers = new Headers();
      applySecurityHeaders(headers);

      const csp = headers.get('content-security-policy') as string;
      // Same source list as the report-only policy today...
      expect(csp).toMatch(/img-src[^;]*https:\/\/\*\.supabase\.co/);
      expect(csp).toMatch(/img-src[^;]*https:\/\/cdn\.sanity\.io/);
      expect(csp).toContain('https://*.supabase.co');
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("base-uri 'self'");
      expect(csp).toContain("frame-ancestors 'self'");
      // ...plus upgrade-insecure-requests, which only belongs in the
      // enforced policy (see securityHeaders.ts header).
      expect(csp).toContain('upgrade-insecure-requests');
      // Violations are still collected while enforced.
      expect(csp).toContain('report-to csp-endpoint');
      expect(csp).toContain('report-uri /api/csp-report');

      expect(headers.has('content-security-policy-report-only')).toBe(false);
    },
  );

  it('still sets Reporting-Endpoints while enforced', () => {
    vi.stubEnv('CSP_ENFORCE', 'true');
    const headers = new Headers();
    applySecurityHeaders(headers);
    expect(headers.get('reporting-endpoints')).toBe('csp-endpoint="/api/csp-report"');
  });

  it('allows the configured PostHog host AND its assets sibling in the ENFORCED policy too, not just report-only', () => {
    vi.stubEnv('CSP_ENFORCE', 'true');
    vi.stubEnv('PUBLIC_POSTHOG_KEY', 'phc_abc123');
    vi.stubEnv('PUBLIC_POSTHOG_HOST', 'https://us.i.posthog.com');
    const headers = new Headers();
    applySecurityHeaders(headers);

    const csp = headers.get('content-security-policy') as string;
    expect(csp).toMatch(/script-src[^;]*https:\/\/us\.i\.posthog\.com/);
    expect(csp).toMatch(/script-src[^;]*https:\/\/us-assets\.i\.posthog\.com/);
    expect(csp).toMatch(/connect-src[^;]*https:\/\/us\.i\.posthog\.com/);
    expect(csp).toMatch(/connect-src[^;]*https:\/\/us-assets\.i\.posthog\.com/);
  });

  it('never overwrites a content-security-policy header a route already set, enforced or not', () => {
    vi.stubEnv('CSP_ENFORCE', 'true');
    const headers = new Headers({ 'content-security-policy': "default-src 'none'" });
    applySecurityHeaders(headers);
    expect(headers.get('content-security-policy')).toBe("default-src 'none'");
  });
});

/**
 * Netlify UI-configured env vars arrive at runtime through `process.env`,
 * never `import.meta.env` (only what Vite statically inlined at BUILD time
 * survives there) — same posture as `src/lib/env.ts`'s own merge, same
 * header.
 *
 * These resolution-order cases pass an explicit `EnvSource` into
 * {@link isCspEnforced} rather than mutating the ambient `import.meta.env`/
 * `process.env` globals (the way `src/lib/env.test.ts` does for
 * `defaultEnvSource`), because Vitest's own `import.meta.env`, in this
 * project's "node" test environment, transparently falls through to a LIVE
 * `process.env` read for any key Vite did not statically define — so an
 * ambient `process.env.CSP_ENFORCE` mutation reads back through
 * `import.meta.env.CSP_ENFORCE` too regardless of which source the
 * implementation actually consults, which would make a naive ambient test
 * pass even against the pre-fix, `import.meta.env`-only implementation (a
 * false RED-less green, found while writing this — see the fix's own
 * commit). An explicit `EnvSource` sidesteps that quirk and gives a
 * deterministic RED against the pre-fix code, same reason `loadEnv`
 * (`src/lib/env.ts`) takes one too.
 */
describe('CSP_ENFORCE resolution order (build-time vs runtime)', () => {
  it('enforces when CSP_ENFORCE is usable ONLY on the runtime (process.env) side', () => {
    const source = mergeEnvSources({}, { CSP_ENFORCE: 'true' });
    expect(isCspEnforced(source)).toBe(true);
  });

  it('stays off when CSP_ENFORCE is usable on neither side', () => {
    const source = mergeEnvSources({}, {});
    expect(isCspEnforced(source)).toBe(false);
  });

  it('prefers a usable build-time (import.meta.env) value over the runtime one', () => {
    const source = mergeEnvSources({ CSP_ENFORCE: 'false' }, { CSP_ENFORCE: 'true' });
    expect(isCspEnforced(source)).toBe(false);
  });

  it('falls back to the runtime value when the build-time one is blank', () => {
    const source = mergeEnvSources({ CSP_ENFORCE: '  ' }, { CSP_ENFORCE: 'true' });
    expect(isCspEnforced(source)).toBe(true);
  });
});

/**
 * End-to-end confirmation that `applySecurityHeaders`'s AMBIENT default
 * (no explicit source — `defaultEnvSource()`, reading real
 * `import.meta.env`/`process.env`) still resolves correctly when nothing is
 * configured at all. This is the one ambient case that genuinely needs no
 * source override to be meaningful: "neither side set" behaves identically
 * regardless of the quirk described above.
 */
describe('CSP_ENFORCE resolved from the runtime environment (Netlify Function)', () => {
  it('stays report-only by default (neither import.meta.env nor process.env set it)', () => {
    const headers = new Headers();
    applySecurityHeaders(headers);

    expect(headers.get('content-security-policy')).toBe("frame-ancestors 'self'");
    expect(headers.has('content-security-policy-report-only')).toBe(true);
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
