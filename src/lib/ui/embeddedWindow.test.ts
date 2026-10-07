import { describe, it, expect } from 'vitest';
import { isEmbeddedWindowRequest, shouldRetryAsEmbeddedFrame } from './embeddedWindow';

function req(path: string, headers: Record<string, string> = {}): { url: URL; headers: Headers } {
  return { url: new URL(`https://example.com${path}`), headers: new Headers(headers) };
}

describe('isEmbeddedWindowRequest', () => {
  it('is true with ?ventana=1', () => {
    const { url, headers } = req('/es/ingles/actividades/abc?ventana=1');
    expect(isEmbeddedWindowRequest(url, headers)).toBe(true);
  });

  it('is true with Sec-Fetch-Dest: iframe, even with no query at all', () => {
    const { url, headers } = req('/es/ingles/actividades?page=2', { 'sec-fetch-dest': 'iframe' });
    expect(isEmbeddedWindowRequest(url, headers)).toBe(true);
  });

  it('is false for an ordinary top-level request', () => {
    const { url, headers } = req('/es/ingles/actividades/abc', { 'sec-fetch-dest': 'document' });
    expect(isEmbeddedWindowRequest(url, headers)).toBe(false);
  });

  it('is false with no signal at all (no Sec-Fetch-Dest header, e.g. an older browser)', () => {
    const { url, headers } = req('/es/ingles/actividades/abc');
    expect(isEmbeddedWindowRequest(url, headers)).toBe(false);
  });

  it('ventana must be exactly "1"', () => {
    const { url, headers } = req('/es/ingles/actividades/abc?ventana=true');
    expect(isEmbeddedWindowRequest(url, headers)).toBe(false);
  });
});

describe('shouldRetryAsEmbeddedFrame', () => {
  // Bug repro (owner report, verified in a real browser): a 404/500/any page
  // whose own frontmatter never reads `isEmbeddedWindowRequest` (e.g.
  // `404.astro`, which calls `BaseLayout` with no `embedded` prop at all)
  // NEVER sets `data-desk-window-embedded`, no matter how many times it is
  // requested with `?ventana=1`. The OLD guard retried unconditionally
  // whenever not-embedded-and-inside-a-frame, which replaced the frame's own
  // location with the SAME URL forever — an infinite reload loop that never
  // lets the frame's `load` event settle, so the host's own chrome-less
  // fallback bar (`deskWindowManager.ts`) never got a chance to show either.
  it('never retries once ?ventana=1 is already set — stops the infinite reload loop', () => {
    expect(
      shouldRetryAsEmbeddedFrame({ alreadyEmbedded: false, isTopFrame: false, ventanaParam: '1' }),
    ).toBe(false);
  });

  it('retries exactly once when inside a frame, not yet embedded, and ventana is not set yet', () => {
    expect(
      shouldRetryAsEmbeddedFrame({ alreadyEmbedded: false, isTopFrame: false, ventanaParam: null }),
    ).toBe(true);
  });

  it('never retries when already embedded', () => {
    expect(
      shouldRetryAsEmbeddedFrame({ alreadyEmbedded: true, isTopFrame: false, ventanaParam: null }),
    ).toBe(false);
  });

  it('never retries at the top level (not inside any frame)', () => {
    expect(
      shouldRetryAsEmbeddedFrame({ alreadyEmbedded: false, isTopFrame: true, ventanaParam: null }),
    ).toBe(false);
  });

  it('a stray ventana value other than "1" still retries (gets normalized to exactly "1")', () => {
    expect(
      shouldRetryAsEmbeddedFrame({ alreadyEmbedded: false, isTopFrame: false, ventanaParam: 'true' }),
    ).toBe(true);
  });
});
