import { describe, it, expect } from 'vitest';
import { isEmbeddedWindowRequest } from './embeddedWindow';

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
