import { describe, it, expect, beforeEach, vi } from 'vitest';

const getBooks = vi.fn();
const getNews = vi.fn();
vi.mock('@lib/sanity', () => ({
  getBooks: (...args: unknown[]) => getBooks(...args),
  getNews: (...args: unknown[]) => getNews(...args),
}));

const getPublishedActivities = vi.fn();
vi.mock('@lib/activities/activities', () => ({
  getPublishedActivities: (...args: unknown[]) => getPublishedActivities(...args),
  ACTIVITIES_PAGE_SIZE: 20,
}));

import { GET } from './sitemap.xml';

function ctx(site?: string) {
  return { site: site ? new URL(site) : undefined } as unknown as Parameters<typeof GET>[0];
}

describe('GET /sitemap.xml', () => {
  beforeEach(() => {
    getBooks.mockReset();
    getNews.mockReset();
    getPublishedActivities.mockReset();
    getBooks.mockResolvedValue([]);
    getNews.mockResolvedValue({ articles: [], page: 1, total: 0, pageCount: 1 });
    getPublishedActivities.mockResolvedValue({ activities: [], total: 0 });
  });

  it('answers 200 with an XML content type and the public cache header', async () => {
    const res = await GET(ctx('https://chuyocode.netlify.app/'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/xml');
    expect(res.headers.get('CDN-Cache-Control')).toBe(
      'public, s-maxage=3600, stale-while-revalidate=86400',
    );
  });

  it('always includes the static entries: home, libros index, noticias index, premium, legal pages', async () => {
    const res = await GET(ctx('https://chuyocode.netlify.app/'));
    const xml = await res.text();
    expect(xml).toContain('<loc>https://chuyocode.netlify.app/es/</loc>');
    expect(xml).toContain('<loc>https://chuyocode.netlify.app/en/</loc>');
    expect(xml).toContain('<loc>https://chuyocode.netlify.app/es/libros</loc>');
    expect(xml).toContain('<loc>https://chuyocode.netlify.app/en/libros</loc>');
    expect(xml).toContain('<loc>https://chuyocode.netlify.app/es/noticias</loc>');
    expect(xml).toContain('<loc>https://chuyocode.netlify.app/es/premium</loc>');
    expect(xml).toContain('<loc>https://chuyocode.netlify.app/en/premium</loc>');
    expect(xml).toContain('<loc>https://chuyocode.netlify.app/es/legal/terms</loc>');
    expect(xml).toContain('<loc>https://chuyocode.netlify.app/es/legal/privacy</loc>');
    // Refund Policy (third legal document) — same Spanish slug in both
    // languages, same convention as every other `[lang]`-scoped page segment.
    expect(xml).toContain('<loc>https://chuyocode.netlify.app/es/legal/reembolsos</loc>');
    expect(xml).toContain('<loc>https://chuyocode.netlify.app/en/legal/reembolsos</loc>');
  });

  it('emits hreflang alternates (es/en + x-default -> es) on every entry', async () => {
    const res = await GET(ctx('https://chuyocode.netlify.app/'));
    const xml = await res.text();
    expect(xml).toContain(
      '<xhtml:link rel="alternate" hreflang="es" href="https://chuyocode.netlify.app/es/libros"/>',
    );
    expect(xml).toContain(
      '<xhtml:link rel="alternate" hreflang="en" href="https://chuyocode.netlify.app/en/libros"/>',
    );
    expect(xml).toContain(
      '<xhtml:link rel="alternate" hreflang="x-default" href="https://chuyocode.netlify.app/es/libros"/>',
    );
  });

  it('includes every book slug, every news slug (with lastmod), and every published activity id', async () => {
    getBooks.mockResolvedValue([
      { _id: 'b1', title: 'Clean Code', slug: 'clean-code', author: 'A', coverUrl: '', description: '' },
    ]);
    getNews.mockResolvedValue({
      articles: [
        {
          _id: 'n1',
          title: 'T',
          slug: 'astro-7',
          excerpt: '',
          body: '',
          publishedAt: '2026-09-15T00:00:00Z',
          imageUrl: '',
        },
      ],
      page: 1,
      total: 1,
      pageCount: 1,
    });
    getPublishedActivities.mockResolvedValue({
      activities: [
        {
          id: 'act1',
          title: 'A',
          level: null,
          blockCount: 1,
          publishedAt: '2026-08-01T00:00:00Z',
          thumbnailPath: null,
          heartCount: 0,
          viewTotal: 0,
          viewedByViewer: false,
        },
      ],
      total: 1,
    });

    const res = await GET(ctx('https://chuyocode.netlify.app/'));
    const xml = await res.text();
    expect(xml).toContain('<loc>https://chuyocode.netlify.app/es/libros/clean-code</loc>');
    expect(xml).toContain('<loc>https://chuyocode.netlify.app/es/noticias/astro-7</loc>');
    expect(xml).toContain('<lastmod>2026-09-15</lastmod>');
    expect(xml).toContain('<loc>https://chuyocode.netlify.app/es/ingles/actividades/act1</loc>');
    expect(xml).toContain('<lastmod>2026-08-01</lastmod>');
  });

  it('paginates activities across multiple pages up to the reported total', async () => {
    const pageOf = (n: number, page: number) =>
      Array.from({ length: n }, (_, i) => ({
        id: `p${page}-${i}`,
        title: 'A',
        level: null,
        blockCount: 1,
        publishedAt: null,
        thumbnailPath: null,
        heartCount: 0,
        viewTotal: 0,
        viewedByViewer: false,
      }));
    getPublishedActivities.mockImplementation(async ({ page }: { page: number }) => {
      if (page === 1) return { activities: pageOf(20, 1), total: 25 };
      if (page === 2) return { activities: pageOf(5, 2), total: 25 };
      return { activities: [], total: 25 };
    });

    const res = await GET(ctx('https://chuyocode.netlify.app/'));
    const xml = await res.text();
    expect(xml).toContain('/es/ingles/actividades/p1-0');
    expect(xml).toContain('/es/ingles/actividades/p2-4');
    expect(getPublishedActivities).toHaveBeenCalledTimes(2);
  });

  it('fail-soft: still returns the static entries with 200 when Sanity/Supabase throws', async () => {
    getBooks.mockRejectedValue(new Error('sanity down'));
    getNews.mockRejectedValue(new Error('sanity down'));
    getPublishedActivities.mockRejectedValue(new Error('supabase down'));

    const res = await GET(ctx('https://chuyocode.netlify.app/'));
    expect(res.status).toBe(200);
    const xml = await res.text();
    expect(xml).toContain('<loc>https://chuyocode.netlify.app/es/</loc>');
    expect(xml).toContain('<loc>https://chuyocode.netlify.app/es/libros</loc>');
    expect(xml).toContain('<loc>https://chuyocode.netlify.app/es/noticias</loc>');
    expect(xml).toContain('<loc>https://chuyocode.netlify.app/es/legal/terms</loc>');
    expect(xml).toContain('<loc>https://chuyocode.netlify.app/es/legal/privacy</loc>');
  });

  it('falls back to the literal Netlify domain when site is undefined', async () => {
    const res = await GET(ctx(undefined));
    const xml = await res.text();
    expect(xml).toContain('<loc>https://chuyocode.netlify.app/es/</loc>');
  });
});
