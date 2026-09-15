/**
 * Unit tests for the magic-link redirect guards (src/lib/authRedirect.ts).
 *
 * These cover threat-matrix rows T1 and T2, and they are the highest-value
 * tests in the auth work because both functions guard a URL the ATTACKER
 * supplies:
 *
 *  - T1 `safeNextPath` — an open redirect on the confirm route is worse than an
 *    ordinary one. The visitor has just authenticated, so a link that looks like
 *    ours and lands them on someone else's page lands them there SIGNED IN.
 *  - T2 `stripAuthParams` — `token_hash` is a single-use session credential. If
 *    it survives into the `Location` header it is written to browser history and
 *    sent in the `Referer` of whatever the destination page loads next.
 *
 * Both are pure string functions, so every case here calls production code with
 * a concrete input and asserts a concrete output. No mocks exist in this file.
 */
import { describe, it, expect } from 'vitest';
import { DEFAULT_LANG } from './i18n';
import { safeNextPath, stripAuthParams } from './authRedirect';

/** Where an untrusted `next` must land instead. */
const FALLBACK = `/${DEFAULT_LANG}/`;

describe('safeNextPath — accepted same-site paths', () => {
  it('keeps a plain locale path', () => {
    expect(safeNextPath('/es/')).toBe('/es/');
  });

  it('keeps a deep path in the secondary locale', () => {
    expect(safeNextPath('/en/libros')).toBe('/en/libros');
  });

  it('keeps a query string and a fragment', () => {
    expect(safeNextPath('/es/ejercicios?nivel=a1#top')).toBe(
      '/es/ejercicios?nivel=a1#top',
    );
  });

  it('keeps percent-encoded characters that decode to an ordinary path', () => {
    // `%C3%B1` is `ñ`. Encoded input is not suspicious by itself, so the guard
    // must not reject every escape it sees — only the ones that decode into a
    // different KIND of URL.
    expect(safeNextPath('/es/ni%C3%B1os')).toBe('/es/ni%C3%B1os');
  });
});

describe('safeNextPath — T1 open-redirect attempts', () => {
  it('rejects a protocol-relative path', () => {
    // `//evil.com` inherits the current scheme and resolves to a DIFFERENT
    // ORIGIN, even though it starts with a slash.
    expect(safeNextPath('//evil.com')).toBe(FALLBACK);
  });

  it('rejects a backslash after the leading slash', () => {
    // The WHATWG URL parser normalises `\` to `/` for special schemes, so
    // `/\evil` resolves exactly like `//evil`.
    expect(safeNextPath('/\\evil')).toBe(FALLBACK);
  });

  it('rejects an absolute https URL', () => {
    expect(safeNextPath('https://evil')).toBe(FALLBACK);
  });

  it('rejects a javascript: URL', () => {
    expect(safeNextPath('javascript:alert(1)')).toBe(FALLBACK);
  });

  it('rejects a data: URL', () => {
    expect(safeNextPath('data:text/html,<script>alert(1)</script>')).toBe(
      FALLBACK,
    );
  });

  it('rejects a scheme-relative path with no leading slash at all', () => {
    expect(safeNextPath('evil.com/es/')).toBe(FALLBACK);
  });

  it('rejects a bare backslash-prefixed host', () => {
    expect(safeNextPath('\\\\evil.com')).toBe(FALLBACK);
  });
});

describe('safeNextPath — encoded and control-character bypasses', () => {
  it('rejects an encoded protocol-relative path', () => {
    // `/%2F%2Fevil.com` decodes to `///evil.com`. A guard that inspects only
    // the raw string sees a harmless single leading slash and lets it through.
    expect(safeNextPath('/%2F%2Fevil.com')).toBe(FALLBACK);
  });

  it('rejects a DOUBLE-encoded protocol-relative path', () => {
    // One decode leaves `/%2F%2Fevil.com`, which still looks same-site. Only
    // decoding to a fixed point exposes `///evil.com` underneath.
    expect(safeNextPath('/%252F%252Fevil.com')).toBe(FALLBACK);
  });

  it('rejects an encoded backslash', () => {
    expect(safeNextPath('/%5Cevil.com')).toBe(FALLBACK);
  });

  it('rejects a tab between the slashes', () => {
    // Browsers STRIP tab, LF and CR from a URL before parsing it, so `/\t/evil`
    // is resolved as `//evil` — a string we never inspected.
    expect(safeNextPath('/\t/evil.com')).toBe(FALLBACK);
  });

  it('rejects a newline between the slashes', () => {
    expect(safeNextPath('/\n/evil.com')).toBe(FALLBACK);
  });

  it('rejects an ENCODED newline between the slashes', () => {
    expect(safeNextPath('/%0A/evil.com')).toBe(FALLBACK);
  });

  it('rejects a percent sequence it cannot decode', () => {
    // `%zz` is not a valid escape. A string whose meaning we cannot establish
    // is not a string we redirect to.
    expect(safeNextPath('/es/%zz')).toBe(FALLBACK);
  });
});

describe('safeNextPath — absent or empty input', () => {
  it('falls back when `next` is missing', () => {
    expect(safeNextPath(null)).toBe(FALLBACK);
  });

  it('falls back when `next` is undefined', () => {
    expect(safeNextPath(undefined)).toBe(FALLBACK);
  });

  it('falls back on an empty string', () => {
    expect(safeNextPath('')).toBe(FALLBACK);
  });
});

describe('stripAuthParams — T2 token leakage', () => {
  it('removes token_hash from the redirect target', () => {
    expect(stripAuthParams('/es/?token_hash=pkce_abc123')).toBe('/es/');
  });

  it('removes type from the redirect target', () => {
    expect(stripAuthParams('/es/?type=email')).toBe('/es/');
  });

  it('removes both and keeps every other parameter', () => {
    expect(
      stripAuthParams('/es/ejercicios?token_hash=abc&nivel=a1&type=email'),
    ).toBe('/es/ejercicios?nivel=a1');
  });

  it('removes REPEATED occurrences of the same parameter', () => {
    expect(stripAuthParams('/es/?token_hash=a&token_hash=b&nivel=a1')).toBe(
      '/es/?nivel=a1',
    );
  });

  it('leaves a path with no query string untouched', () => {
    expect(stripAuthParams('/es/libros')).toBe('/es/libros');
  });

  it('leaves an unrelated query string untouched', () => {
    expect(stripAuthParams('/es/?nivel=a1&foco=verbos')).toBe(
      '/es/?nivel=a1&foco=verbos',
    );
  });

  it('drops the `?` entirely when stripping empties the query', () => {
    // A trailing `?` is a different URL string and would show up in history and
    // in every canonical-link comparison.
    expect(stripAuthParams('/es/?type=email')).not.toContain('?');
  });

  it('preserves the fragment', () => {
    expect(stripAuthParams('/es/?token_hash=abc#seccion')).toBe('/es/#seccion');
  });
});
