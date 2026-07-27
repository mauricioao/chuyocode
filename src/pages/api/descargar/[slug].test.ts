/**
 * Integration tests for GET /api/descargar/[slug] — the pass-gated download
 * proxy + counter.
 *
 * Verifies the contract:
 *  - missing slug / missing book / missing PDF → 404,
 *  - no valid pass → 403 (hard gate),
 *  - valid pass + fresh browser → counts once, sets the 24h dedup cookie,
 *    302-redirects to the real pdfUrl,
 *  - valid pass + existing dedup cookie → does NOT re-count, still 302s,
 *  - counting is best-effort: an increment failure never blocks the redirect.
 *
 * getBookBySlug, getPassState, and incrementDownload are all mocked so no
 * Sanity/Supabase/crypto is exercised — this isolates the endpoint's own logic.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { getBookMock, passMock, incrementMock } = vi.hoisted(() => ({
  getBookMock: vi.fn(),
  passMock: vi.fn(),
  incrementMock: vi.fn(),
}));

vi.mock('@lib/sanity', () => ({ getBookBySlug: getBookMock }));
vi.mock('@lib/pass', () => ({ getPassState: passMock }));
vi.mock('@lib/downloads', () => ({ incrementDownload: incrementMock }));

import { GET } from './[slug]';

const PDF_URL = 'https://cdn.sanity.io/files/proj/production/abc.pdf';

/** Build the APIContext stub the handler reads (params + request). */
function ctx(slug: string | undefined, cookie?: string) {
  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = cookie;
  const request = new Request('https://chuyo.test/api/descargar/x', { headers });
  return { params: { slug }, request } as unknown as Parameters<typeof GET>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default happy-path dependencies; individual tests override as needed.
  getBookMock.mockResolvedValue({ slug: 'el-libro', pdfUrl: PDF_URL });
  passMock.mockReturnValue('valid');
  incrementMock.mockResolvedValue(true);
});

describe('GET /api/descargar/[slug]', () => {
  it('404s when the slug param is missing', async () => {
    const res = await GET(ctx(undefined));
    expect(res.status).toBe(404);
    expect(getBookMock).not.toHaveBeenCalled();
  });

  it('404s when the book does not exist', async () => {
    getBookMock.mockResolvedValue(null);
    const res = await GET(ctx('ghost'));
    expect(res.status).toBe(404);
  });

  it('404s when the book has no PDF', async () => {
    getBookMock.mockResolvedValue({ slug: 'no-pdf', pdfUrl: '' });
    const res = await GET(ctx('no-pdf'));
    expect(res.status).toBe(404);
  });

  it('403s when there is no valid pass (hard gate, no count)', async () => {
    passMock.mockReturnValue('invalid');
    const res = await GET(ctx('el-libro'));
    expect(res.status).toBe(403);
    expect(incrementMock).not.toHaveBeenCalled();
  });

  it('counts once, sets the dedup cookie, and 302s to the PDF (fresh browser)', async () => {
    const res = await GET(ctx('el-libro'));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(PDF_URL);
    expect(incrementMock).toHaveBeenCalledWith('el-libro');
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('chu_dl_el-libro=1');
    expect(setCookie).toContain('Max-Age=86400');
    expect(setCookie).toContain('HttpOnly');
  });

  it('does NOT re-count when the dedup cookie is already present', async () => {
    const res = await GET(ctx('el-libro', 'chu_dl_el-libro=1'));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(PDF_URL);
    expect(incrementMock).not.toHaveBeenCalled();
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('still redirects when the counter write fails (best-effort)', async () => {
    incrementMock.mockResolvedValue(false);
    const res = await GET(ctx('el-libro'));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(PDF_URL);
  });
});
