import { describe, it, expect } from 'vitest';
import { PRIVATE_CACHE_CONTROL, markPrivate } from './httpCache';

// Threat matrix T7 — a session-dependent response reaching a shared cache.
// Every auth-dependent page and endpoint routes through `markPrivate`, so this
// is the single place the directive is spelled, and the single place it is
// proven.
describe('PRIVATE_CACHE_CONTROL', () => {
  it('is the exact directive pair a per-session response requires', () => {
    // `private` bars shared caches (the Netlify CDN); `no-store` bars the
    // browser's own disk cache, which matters on a shared machine after
    // sign-out. Neither directive alone is sufficient.
    expect(PRIVATE_CACHE_CONTROL).toBe('private, no-store');
  });
});

describe('markPrivate', () => {
  it('sets cache-control on headers that had none', () => {
    const headers = new Headers();
    markPrivate(headers);
    expect(headers.get('cache-control')).toBe('private, no-store');
  });

  // The hazard is not an absent directive, it is a PERMISSIVE one already in
  // place: Astro or the adapter may have set a cacheable default. Overwriting
  // is the whole point, so this case is what forces `set` over `append`.
  it('overwrites a permissive directive instead of appending to it', () => {
    const headers = new Headers({ 'cache-control': 'public, max-age=3600' });
    markPrivate(headers);
    expect(headers.get('cache-control')).toBe('private, no-store');
    expect(headers.get('cache-control')).not.toContain('public');
    expect(headers.get('cache-control')).not.toContain('max-age');
  });

  it('leaves every other header untouched', () => {
    const headers = new Headers({
      'content-type': 'text/html; charset=utf-8',
      'x-request-id': 'abc123',
    });
    markPrivate(headers);
    expect(headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(headers.get('x-request-id')).toBe('abc123');
    expect(headers.get('cache-control')).toBe('private, no-store');
  });

  it('is idempotent, so a page and its layout may both call it', () => {
    const headers = new Headers();
    markPrivate(headers);
    markPrivate(headers);
    // `append` would have produced 'private, no-store, private, no-store'.
    expect(headers.get('cache-control')).toBe('private, no-store');
  });
});
