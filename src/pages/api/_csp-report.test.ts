/**
 * Tests for POST /api/csp-report — see that module's header for the full
 * contract (both report formats, privacy redaction, flood cap, size cap).
 */
import { describe, it, expect, vi } from 'vitest';
import { POST, ALL } from './csp-report';

const URL = 'https://chuyocode.test/api/csp-report';
const MAX_BODY_BYTES = 16 * 1024;

/** Minimal APIContext stub carrying just the request the handler reads. */
function ctx(request: Request): Parameters<typeof POST>[0] {
  return { request } as unknown as Parameters<typeof POST>[0];
}

/** A realistic legacy `csp-report` payload — a cross-origin script blocked
 * while the visitor was on a page with a query string and a fragment, which
 * the logged line must never carry. */
const LEGACY_REPORT: Record<string, unknown> = {
  'document-uri': 'https://chuyocode.test/es/libros?ref=newsletter&utm=abc#section',
  referrer: '',
  'violated-directive': 'script-src-elem',
  'effective-directive': 'script-src-elem',
  'original-policy': "default-src 'self'; script-src 'self'",
  disposition: 'report',
  'blocked-uri': 'https://evil.example.com:8443/payload.js?x=1',
  'status-code': 200,
};

/** The same violation, shaped as a Reporting API `CSPViolationReportBody`. */
const REPORTING_API_BODY: Record<string, unknown> = {
  documentURL: 'https://chuyocode.test/en/noticias?from=email#top',
  referrer: '',
  blockedURL: 'https://malicious.example.net/x.js?y=2',
  effectiveDirective: 'script-src-elem',
  originalPolicy: "default-src 'self'",
  disposition: 'reporting',
  statusCode: 200,
};

function legacyRequest(report: Record<string, unknown>, extraHeaders: Record<string, string> = {}): Request {
  return new Request(URL, {
    method: 'POST',
    headers: { 'content-type': 'application/csp-report', ...extraHeaders },
    body: JSON.stringify({ 'csp-report': report }),
  });
}

function reportingApiRequest(entries: unknown[]): Request {
  return new Request(URL, {
    method: 'POST',
    headers: { 'content-type': 'application/reports+json' },
    body: JSON.stringify(entries),
  });
}

/** Spy on console.warn for one test, pre-silenced so nothing prints. */
function spyOnWarn() {
  return vi.spyOn(console, 'warn').mockImplementation(() => {});
}

describe('POST /api/csp-report', () => {
  it('logs a legacy application/csp-report violation with exactly the redacted fields', async () => {
    const warn = spyOnWarn();
    const res = await POST(ctx(legacyRequest(LEGACY_REPORT)));

    expect(res.status).toBe(204);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(await res.text()).toBe('');

    expect(warn).toHaveBeenCalledTimes(1);
    const line = warn.mock.calls[0]?.[0] as string;
    expect(line).toBe(
      '[csp-report] directive=script-src-elem blocked=https://evil.example.com:8443 path=/es/libros disposition=report',
    );
    // The whole point of the redaction: no query string and no cookie ever
    // reach the log line.
    expect(line).not.toContain('?');
    expect(line).not.toContain('ref=newsletter');
    expect(line).not.toContain('utm');
    warn.mockRestore();
  });

  it('falls back to violated-directive when effective-directive is absent (older browsers)', async () => {
    const warn = spyOnWarn();
    const { 'effective-directive': _omit, ...withoutEffective } = LEGACY_REPORT;
    const res = await POST(ctx(legacyRequest(withoutEffective)));

    expect(res.status).toBe(204);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('directive=script-src-elem');
    warn.mockRestore();
  });

  it.each(['inline', 'eval'])(
    'keeps a bare blocked-uri keyword (%s) as-is instead of trying to reduce it',
    async (keyword) => {
      const warn = spyOnWarn();
      const res = await POST(ctx(legacyRequest({ ...LEGACY_REPORT, 'blocked-uri': keyword })));

      expect(res.status).toBe(204);
      expect(warn.mock.calls[0]?.[0]).toContain(`blocked=${keyword}`);
      warn.mockRestore();
    },
  );

  it('strips every control and line-separator character a crafted report carries', async () => {
    const warn = spyOnWarn();
    // ANSI escapes can rewrite a terminal tailing the logs; U+2028/U+2029 and
    // NEL split records in log shippers that treat them as line breaks.
    const res = await POST(
      ctx(
        legacyRequest({
          ...LEGACY_REPORT,
          'effective-directive': 'script-src\u001b[2K\u001b[1G\u2028[csp-report] forged',
          'blocked-uri': 'not-a-url\u2029\u007f\u009bline',
          disposition: 'report\u0085fake',
        }),
      ),
    );

    expect(res.status).toBe(204);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).not.toMatch(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/);
    warn.mockRestore();
  });

  it('never logs an ambient Cookie header even when the browser sends one', async () => {
    const warn = spyOnWarn();
    const req = legacyRequest(LEGACY_REPORT, {
      cookie: 'sb-access-token=super-secret-session-value',
    });
    const res = await POST(ctx(req));

    expect(res.status).toBe(204);
    const line = warn.mock.calls[0]?.[0] as string;
    expect(line).not.toContain('super-secret-session-value');
    expect(line.toLowerCase()).not.toContain('cookie');
    warn.mockRestore();
  });

  it('logs a Reporting API (application/reports+json) violation with exactly the redacted fields', async () => {
    const warn = spyOnWarn();
    const res = await POST(
      ctx(reportingApiRequest([{ type: 'csp-violation', url: REPORTING_API_BODY.documentURL, body: REPORTING_API_BODY }])),
    );

    expect(res.status).toBe(204);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toBe(
      '[csp-report] directive=script-src-elem blocked=https://malicious.example.net path=/en/noticias disposition=reporting',
    );
    warn.mockRestore();
  });

  it('logs one line per csp-violation entry in a batch, skipping other report types', async () => {
    const warn = spyOnWarn();
    const entries = [
      { type: 'csp-violation', body: { ...REPORTING_API_BODY, effectiveDirective: 'style-src-elem' } },
      { type: 'deprecation', body: { id: 'something-unrelated' } },
      { type: 'csp-violation', body: { ...REPORTING_API_BODY, effectiveDirective: 'img-src' } },
    ];
    const res = await POST(ctx(reportingApiRequest(entries)));

    expect(res.status).toBe(204);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[0]?.[0]).toContain('directive=style-src-elem');
    expect(warn.mock.calls[1]?.[0]).toContain('directive=img-src');
    warn.mockRestore();
  });

  it('caps logging at 10 lines per request even with a larger batch (flood guard)', async () => {
    const warn = spyOnWarn();
    const entries = Array.from({ length: 15 }, (_, i) => ({
      type: 'csp-violation',
      body: { ...REPORTING_API_BODY, effectiveDirective: `directive-${i}` },
    }));
    const res = await POST(ctx(reportingApiRequest(entries)));

    expect(res.status).toBe(204);
    expect(warn).toHaveBeenCalledTimes(10);
    warn.mockRestore();
  });

  it('the flood cap is request-scoped: a second, separate request logs its own 10 again', async () => {
    const warn = spyOnWarn();
    const entries = Array.from({ length: 15 }, (_, i) => ({
      type: 'csp-violation',
      body: { ...REPORTING_API_BODY, effectiveDirective: `directive-${i}` },
    }));
    await POST(ctx(reportingApiRequest(entries)));
    warn.mockClear();
    await POST(ctx(reportingApiRequest(entries)));

    expect(warn).toHaveBeenCalledTimes(10);
    warn.mockRestore();
  });

  describe('malformed input is ignored — never thrown, never logged', () => {
    it('invalid JSON body', async () => {
      const warn = spyOnWarn();
      const req = new Request(URL, {
        method: 'POST',
        headers: { 'content-type': 'application/csp-report' },
        body: '{not valid json',
      });
      const res = await POST(ctx(req));

      expect(res.status).toBe(204);
      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });

    it('legacy content-type but no csp-report key', async () => {
      const warn = spyOnWarn();
      const req = new Request(URL, {
        method: 'POST',
        headers: { 'content-type': 'application/csp-report' },
        body: JSON.stringify({ foo: 'bar' }),
      });
      const res = await POST(ctx(req));

      expect(res.status).toBe(204);
      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });

    it('legacy report missing a required field (disposition)', async () => {
      const warn = spyOnWarn();
      const { disposition: _omit, ...incomplete } = LEGACY_REPORT;
      const res = await POST(ctx(legacyRequest(incomplete)));

      expect(res.status).toBe(204);
      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });

    it('document-uri that is not a parseable absolute URL', async () => {
      const warn = spyOnWarn();
      const res = await POST(ctx(legacyRequest({ ...LEGACY_REPORT, 'document-uri': 'not-a-url' })));

      expect(res.status).toBe(204);
      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });

    it('reports+json body that is not an array', async () => {
      const warn = spyOnWarn();
      const req = new Request(URL, {
        method: 'POST',
        headers: { 'content-type': 'application/reports+json' },
        body: JSON.stringify({ type: 'csp-violation', body: REPORTING_API_BODY }),
      });
      const res = await POST(ctx(req));

      expect(res.status).toBe(204);
      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });

    it('an unsupported content type is ignored even with an otherwise well-formed body', async () => {
      const warn = spyOnWarn();
      const req = new Request(URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ 'csp-report': LEGACY_REPORT }),
      });
      const res = await POST(ctx(req));

      expect(res.status).toBe(204);
      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });

    it('no explicit content-type is ignored (never treated as a valid report)', async () => {
      const warn = spyOnWarn();
      const req = new Request(URL, { method: 'POST', body: JSON.stringify({ 'csp-report': LEGACY_REPORT }) });
      const res = await POST(ctx(req));

      expect(res.status).toBe(204);
      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });
  });

  describe('oversized body is rejected (413) before it is treated as a report', () => {
    it('Content-Length alone declares more than the cap', async () => {
      const warn = spyOnWarn();
      const req = new Request(URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/csp-report',
          'content-length': String(MAX_BODY_BYTES + 1024),
        },
        body: JSON.stringify({ 'csp-report': LEGACY_REPORT }),
      });
      const res = await POST(ctx(req));

      expect(res.status).toBe(413);
      expect(res.headers.get('cache-control')).toBe('private, no-store');
      await expect(res.json()).resolves.toEqual({ error: 'payload_too_large' });
      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });

    it('the actual body exceeds the cap regardless of a missing/understated Content-Length', async () => {
      const warn = spyOnWarn();
      const huge = 'a'.repeat(MAX_BODY_BYTES + 1024);
      const req = new Request(URL, {
        method: 'POST',
        headers: { 'content-type': 'application/csp-report' },
        body: JSON.stringify({ 'csp-report': { ...LEGACY_REPORT, 'original-policy': huge } }),
      });
      const res = await POST(ctx(req));

      expect(res.status).toBe(413);
      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });
  });
});

describe('csp-report — method guard', () => {
  it('returns 405 for non-POST methods', async () => {
    const req = new Request(URL, { method: 'GET' });
    const res = await ALL(ctx(req));

    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('POST');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    await expect(res.json()).resolves.toEqual({ error: 'method_not_allowed' });
  });
});
