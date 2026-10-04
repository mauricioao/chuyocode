/**
 * GET /robots.txt (SEO basics pass).
 *
 * Allows public content; disallows the sections that have NO public
 * sub-pages at all: `/api/`, and the admin/auth/crear/mis-actividades trees.
 * Deliberately does NOT disallow `/*\/ingles` or `/*\/cursos`: most of
 * `ingles/**` is gated too, but the practice page of every published
 * community activity (`/ingles/actividades/[id]`, and its `/presentar`) is
 * public since guest play — a blanket `ingles` disallow would also block
 * crawling those. `BaseLayout`'s own `noindex` meta
 * (`@lib/seo.ts#isNoindexPath`) is the finer-grained tool for excluding the
 * gated pages under that tree from results while leaving them crawlable.
 *
 * Public, cacheable with the SAME policy the home page uses
 * (`publicCachePolicy`, `@lib/cache.ts`): this response is static and never
 * reads `Astro.locals.user`.
 */
import type { APIRoute } from 'astro';
import { publicCachePolicy } from '@lib/cache';

/** Paths with no public sub-pages at all — see the file header for why
 * `ingles`/`cursos` are deliberately absent from this list. */
const DISALLOWED_PATHS = ['/api/', '/*/admin', '/*/auth', '/*/crear', '/*/mis-actividades'] as const;

export const GET: APIRoute = async ({ site }) => {
  const origin = site ?? new URL('https://chuyocode.netlify.app/');
  const sitemapUrl = new URL('/sitemap.xml', origin).href;

  const lines = [
    'User-agent: *',
    ...DISALLOWED_PATHS.map((path) => `Disallow: ${path}`),
    '',
    `Sitemap: ${sitemapUrl}`,
    '',
  ];

  const headers = new Headers({ 'content-type': 'text/plain; charset=utf-8' });
  for (const [name, value] of Object.entries(publicCachePolicy())) {
    headers.set(name, value);
  }

  return new Response(lines.join('\n'), { status: 200, headers });
};
