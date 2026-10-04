/**
 * GET /sitemap.xml (SEO basics pass).
 *
 * Lists every indexable PUBLIC url: home, libros (index + every book slug),
 * noticias (index + every news slug), legal pages, creditos, and the practice page of
 * every PUBLISHED community activity (guest play) — never the gated
 * sections (`/ingles` hub/catalog, `/cursos`, `/crear`, `/mis-actividades`,
 * `/admin`, `/auth`), which `@lib/seo.ts#isNoindexPath` already keeps out of
 * search results via `BaseLayout`'s own robots meta.
 *
 * Each logical page gets ONE `<url>` entry PER language (es/en), and every
 * entry carries an `xhtml:link rel="alternate"` for es, en, AND `x-default`
 * (-> es) — the shape Google documents for a multilingual sitemap
 * (https://developers.google.com/search/docs/specialty/international/localized-versions#sitemap).
 *
 * Fail-soft: `getBooks`/`getNews`/`getPublishedActivities` already catch
 * their own Sanity/Supabase errors and return an empty result (design
 * decision #8, mirrored throughout `@lib/sanity.ts`/`@lib/activities/activities.ts`).
 * Each section below is ALSO wrapped in its own try/catch, so even an
 * unexpected throw degrades to "skip this section" rather than a 500 — the
 * static entries (home, libros index, noticias index, legal) always make it
 * into the response regardless of a Sanity or Supabase outage.
 *
 * Public, cacheable with the SAME policy the home page uses
 * (`publicCachePolicy`, `@lib/cache.ts`): this response never reads
 * `Astro.locals.user` and is byte-identical for every visitor.
 */
import type { APIRoute } from 'astro';
import { getBooks, getNews } from '@lib/sanity';
import {
  getPublishedActivities,
  ACTIVITIES_PAGE_SIZE,
  type PublishedActivityCard,
} from '@lib/activities/activities';
import { SUPPORTED_LANGS, DEFAULT_LANG, type Lang } from '@lib/i18n';
import { publicCachePolicy } from '@lib/cache';

/** Defensive safety valve on top of real pagination (`pageCount`/`total`),
 * in case either ever lies or a catalog grows unexpectedly large. */
const MAX_NEWS_PAGES = 50; // 50 * NEWS_PAGE_SIZE(10) = 500 articles
const MAX_ACTIVITY_PAGES = 100; // 100 * ACTIVITIES_PAGE_SIZE(20) = 2000 activities

/** Escape the five XML-significant characters in text content/attributes. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** The same path suffix under every supported language, e.g. `/libros`. */
function sharedPath(suffix: string): Record<Lang, string> {
  const entry = {} as Record<Lang, string>;
  for (const lang of SUPPORTED_LANGS) {
    entry[lang] = `/${lang}${suffix}`;
  }
  return entry;
}

/** ISO timestamp -> `YYYY-MM-DD` `<lastmod>`, or `undefined` if unparseable. */
function lastmodFrom(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
}

/**
 * One `<url>` block PER language in `pathByLang`, each carrying hreflang
 * alternates to every other language plus `x-default` (-> {@link DEFAULT_LANG}).
 */
function urlEntries(site: URL, pathByLang: Record<Lang, string>, lastmod?: string): string {
  const hrefs = SUPPORTED_LANGS.map((lang) => ({
    lang,
    href: new URL(pathByLang[lang], site).href,
  }));
  const defaultHref = hrefs.find((h) => h.lang === DEFAULT_LANG)?.href ?? hrefs[0].href;

  const alternateLinks =
    hrefs
      .map((h) => `<xhtml:link rel="alternate" hreflang="${h.lang}" href="${escapeXml(h.href)}"/>`)
      .join('') +
    `<xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(defaultHref)}"/>`;

  const lastmodTag = lastmod ? `<lastmod>${lastmod}</lastmod>` : '';

  return hrefs
    .map((h) => `<url><loc>${escapeXml(h.href)}</loc>${lastmodTag}${alternateLinks}</url>`)
    .join('');
}

export const GET: APIRoute = async ({ site }) => {
  const origin = site ?? new URL('https://chuyocode.netlify.app/');

  const entries: string[] = [
    // Static chrome — always present, even if every section below fails.
    urlEntries(origin, sharedPath('/')),
    urlEntries(origin, sharedPath('/libros')),
    urlEntries(origin, sharedPath('/noticias')),
    urlEntries(origin, sharedPath('/legal/terms')),
    urlEntries(origin, sharedPath('/legal/privacy')),
    urlEntries(origin, sharedPath('/creditos')),
  ];

  // Libros — every published book slug. `getBooks` returns ALL books (no
  // pagination); slugs do not vary by locale, so one call is enough.
  try {
    const books = await getBooks(DEFAULT_LANG);
    for (const book of books) {
      if (!book.slug) continue;
      entries.push(urlEntries(origin, sharedPath(`/libros/${book.slug}`)));
    }
  } catch (err) {
    console.error('[sitemap] books section failed:', err);
  }

  // Noticias — every published article slug, paginated via the existing
  // `getNews` helper (same one the list page uses), capped defensively.
  try {
    const first = await getNews(1, DEFAULT_LANG);
    const articles = [...first.articles];
    const pageCount = Math.min(first.pageCount, MAX_NEWS_PAGES);
    for (let page = 2; page <= pageCount; page++) {
      const next = await getNews(page, DEFAULT_LANG);
      articles.push(...next.articles);
    }
    for (const article of articles) {
      if (!article.slug) continue;
      entries.push(
        urlEntries(origin, sharedPath(`/noticias/${article.slug}`), lastmodFrom(article.publishedAt)),
      );
    }
  } catch (err) {
    console.error('[sitemap] news section failed:', err);
  }

  // Community activities — every PUBLISHED activity's practice page (guest
  // play), via the existing discovery-feed query, paginated and capped.
  try {
    const activities: PublishedActivityCard[] = [];
    let page = 1;
    let total = Number.POSITIVE_INFINITY;
    while (page <= MAX_ACTIVITY_PAGES && activities.length < total) {
      const result = await getPublishedActivities({ level: null, page });
      total = result.total;
      activities.push(...result.activities);
      if (result.activities.length < ACTIVITIES_PAGE_SIZE) break;
      page++;
    }
    for (const activity of activities) {
      entries.push(
        urlEntries(
          origin,
          sharedPath(`/ingles/actividades/${activity.id}`),
          lastmodFrom(activity.publishedAt),
        ),
      );
    }
  } catch (err) {
    console.error('[sitemap] activities section failed:', err);
  }

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">' +
    entries.join('') +
    '</urlset>';

  const headers = new Headers({ 'content-type': 'application/xml; charset=utf-8' });
  for (const [name, value] of Object.entries(publicCachePolicy())) {
    headers.set(name, value);
  }

  return new Response(xml, { status: 200, headers });
};
