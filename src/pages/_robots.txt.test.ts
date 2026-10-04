import { describe, it, expect } from 'vitest';
import { GET } from './robots.txt';

function ctx(site?: string) {
  return { site: site ? new URL(site) : undefined } as unknown as Parameters<typeof GET>[0];
}

describe('GET /robots.txt', () => {
  it('answers 200 with a plain-text content type and the public cache header', async () => {
    const res = await GET(ctx('https://chuyocode.netlify.app/'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/plain');
    expect(res.headers.get('CDN-Cache-Control')).toBe(
      'public, s-maxage=3600, stale-while-revalidate=86400',
    );
  });

  it('allows crawling by default and disallows exactly the fully-private trees', async () => {
    const res = await GET(ctx('https://chuyocode.netlify.app/'));
    const body = await res.text();
    expect(body).toContain('User-agent: *');
    expect(body).toContain('Disallow: /api/');
    expect(body).toContain('Disallow: /*/admin');
    expect(body).toContain('Disallow: /*/auth');
    expect(body).toContain('Disallow: /*/crear');
    expect(body).toContain('Disallow: /*/mis-actividades');
  });

  it('does not disallow ingles or cursos, so the public guest-play practice pages stay crawlable', async () => {
    const res = await GET(ctx('https://chuyocode.netlify.app/'));
    const body = await res.text();
    expect(body).not.toContain('/ingles');
    expect(body).not.toContain('/cursos');
  });

  it('points Sitemap: at the absolute sitemap URL built from site', async () => {
    const res = await GET(ctx('https://chuyocode.netlify.app/'));
    const body = await res.text();
    expect(body).toContain('Sitemap: https://chuyocode.netlify.app/sitemap.xml');
  });

  it('falls back to the literal Netlify domain when site is undefined', async () => {
    const res = await GET(ctx(undefined));
    const body = await res.text();
    expect(body).toContain('Sitemap: https://chuyocode.netlify.app/sitemap.xml');
  });
});
