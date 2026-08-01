/**
 * Server-only Sanity content layer (spec 2: content-delivery, spec 5: i18n).
 *
 * Initializes `@sanity/client` from validated env vars and exposes typed,
 * locale-aware query functions for books and news. An in-memory LRU cache
 * (design decision #4: 60s TTL, per-process) sits in front of every read to
 * cut SSR latency (proposal risk: "SSR latency Sanity+Supabase per request").
 *
 * Security (design decision #4): this module is server-only and must NEVER be
 * imported into a browser bundle — exposing the project id/dataset through the
 * client CDN was explicitly rejected. `astro.config.mjs` keeps `@sanity/client`
 * in `ssr.noExternal` so secrets never leak client-side.
 *
 * Failure policy (design decision #8): Sanity read errors NEVER crash the SSR
 * server. Query functions catch, log, and return safe empty results so pages
 * can render a friendly empty/404 state instead of a 500.
 */
import { createClient, type SanityClient } from '@sanity/client';
import { loadEnv } from './env';
import { DEFAULT_LANG, type Lang } from './i18n';

const env = loadEnv();

/**
 * Shared server-side Sanity client. `useCdn` is enabled for read performance;
 * pass-gated reads never rely on Sanity, so CDN staleness is acceptable here.
 */
export const sanityClient: SanityClient = createClient({
  projectId: env.SANITY_PROJECT_ID,
  dataset: env.SANITY_DATASET,
  apiVersion: '2024-01-01',
  useCdn: true,
});

// ---------------------------------------------------------------------------
// Types (design decision: all Sanity types live here, no separate types file).
// ---------------------------------------------------------------------------

/** A published book document, projected into a flat, render-ready shape. */
export interface Book {
  _id: string;
  title: string;
  slug: string;
  author: string;
  coverUrl: string;
  /**
   * Base64 LQIP blur-up placeholder from the cover asset's Sanity metadata
   * (frontend-v3 sanity-image-pipeline). Optional: absent when the asset has no
   * `metadata.lqip`, in which case the image pipeline falls back gracefully.
   */
  coverLqip?: string;
  /** Present only when the book has an attached PDF asset. */
  pdfUrl?: string;
  description: string;
  /**
   * frontend-v3 discovery fields (content-schema delta). All optional so
   * existing documents render unchanged; GROQ coalesces safe defaults.
   */
  featured?: boolean;
  tagline?: string;
}

/** A published news article, projected into a flat, render-ready shape. */
export interface NewsArticle {
  _id: string;
  title: string;
  slug: string;
  excerpt: string;
  /**
   * Article body. May be a plain string OR a Portable Text block array
   * depending on the Sanity schema, so it stays `unknown` and is normalized to
   * HTML by {@link renderBody} at render time (design decision #5).
   */
  body: unknown;
  publishedAt: string;
  imageUrl: string;
  /**
   * Base64 LQIP blur-up placeholder from the article image's Sanity metadata
   * (frontend-v3 sanity-image-pipeline). Optional: absent when the asset has no
   * `metadata.lqip`, in which case the image pipeline falls back gracefully.
   */
  imageLqip?: string;
  /**
   * frontend-v3 discovery fields (content-schema delta). All optional so
   * existing documents render unchanged; GROQ coalesces safe defaults.
   */
  featured?: boolean;
  tagline?: string;
}

/**
 * A content asset reference in the exact shape {@link buildImage} consumes:
 * `{ url, metadata: { lqip } }`. The discovery GROQ fragments project covers
 * into this nested shape so hero/card/spotlight sections can feed `asset`
 * straight into `MediaCard`/`HeroCarousel`/`Spotlight` without reshaping.
 */
export interface MediaAsset {
  url: string;
  metadata?: { lqip?: string };
}

/**
 * A single document projected for image-first discovery (frontend-v3
 * home-discovery). One base document (book OR news) renders as a hero slide,
 * an editorial/ranked card, or a spotlight using the SAME shape with different
 * projections — no new document types (spec: Context-Aware GROQ Projections).
 *
 * `href` is a pre-resolved detail deep-link so sections stay presentational.
 * `featured`/`tagline` always carry safe coalesced defaults (false / "").
 */
export interface MediaItem {
  _id: string;
  /** Underlying document type, used to build the detail `href`. */
  kind: 'book' | 'news';
  title: string;
  slug: string;
  /** Resolved detail deep-link (`/[lang]/libros/<slug>` or `/noticias/<slug>`). */
  href: string;
  /** Cover asset in `buildImage` shape (`{ url, metadata: { lqip } }`). */
  asset?: MediaAsset | null;
  /**
   * Content/franchise title-treatment logo (transparent PNG) in `buildImage`
   * shape. Projected by HERO_FRAGMENT and therefore present in BOTH
   * `getHeroItems` and `getSpotlight` (via SPOTLIGHT_FRAGMENT inheritance).
   * Consumed only by HeroCarousel today; Spotlight receives it and ignores it.
   * Optional: when absent the hero renders its text title alone.
   */
  logoAsset?: MediaAsset | null;
  /**
   * Wide landscape hero backdrop in `buildImage` shape. Projected by
   * HERO_FRAGMENT and therefore present in BOTH `getHeroItems` and
   * `getSpotlight` (via SPOTLIGHT_FRAGMENT inheritance). Consumed only by
   * HeroCarousel today; Spotlight receives it and ignores it. Optional: when
   * absent the hero falls back to {@link MediaItem.asset} (the cover).
   */
  backgroundAsset?: MediaAsset | null;
  /** Short editorial tagline; always a string (coalesced to "" when absent). */
  tagline: string;
  /** Long editorial synopsis for hero/spotlight contexts (optional). */
  synopsis?: string;
  /**
   * Grouping tags for editorial rows. Always an array (coalesced to `[]` when
   * absent). A document can belong to several themes at once, so it appears in
   * one editorial row per tag it carries.
   */
  themes: string[];
  /** Featured flag; always a boolean (coalesced to false when absent). */
  featured: boolean;
}

/** A page of news plus the metadata pages need for prev/next navigation. */
export interface NewsPage {
  articles: NewsArticle[];
  /** 1-based current page. */
  page: number;
  /** Total number of news articles across all pages. */
  total: number;
  /** Total number of pages given {@link NEWS_PAGE_SIZE}. */
  pageCount: number;
}

/** News articles served per page (spec 2: News Pagination — page size 10). */
export const NEWS_PAGE_SIZE = 10;

// ---------------------------------------------------------------------------
// In-memory LRU cache — simple Map-based, 60s TTL, per-process.
// ---------------------------------------------------------------------------

/** How long a cached Sanity read stays fresh, in milliseconds. */
export const CACHE_TTL_MS = 60_000;

interface CacheEntry<T> {
  data: T;
  /** Epoch ms after which the entry is considered stale. */
  expiry: number;
}

/**
 * Tiny LRU cache backed by a `Map`.
 *
 * `Map` preserves insertion order, so the oldest key is always `keys().next()`.
 * On every hit we re-insert the key to mark it most-recently-used; on overflow
 * we evict the oldest. Entries also carry a TTL and are treated as a miss once
 * expired. This is intentionally minimal (design decision #4) — no external
 * cache dependency, trivially unit-testable.
 */
export class LruCache<T> {
  private readonly store = new Map<string, CacheEntry<T>>();

  constructor(
    private readonly maxSize = 100,
    private readonly ttlMs = CACHE_TTL_MS,
    /** Injectable clock so tests can advance time deterministically. */
    private readonly now: () => number = Date.now,
  ) {}

  /** Return the cached value for `key`, or `undefined` on miss/expiry. */
  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) {
      return undefined;
    }
    if (this.now() >= entry.expiry) {
      // Expired: drop it and report a miss.
      this.store.delete(key);
      return undefined;
    }
    // Mark most-recently-used by re-inserting at the end of the Map.
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.data;
  }

  /** Store `value` under `key`, evicting the oldest entry on overflow. */
  set(key: string, value: T): void {
    // Refresh position if the key already exists.
    if (this.store.has(key)) {
      this.store.delete(key);
    } else if (this.store.size >= this.maxSize) {
      // Evict least-recently-used (first inserted, still present) key.
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) {
        this.store.delete(oldest);
      }
    }
    this.store.set(key, { data: value, expiry: this.now() + this.ttlMs });
  }

  /** Remove every entry. Primarily for test isolation. */
  clear(): void {
    this.store.clear();
  }

  /** Current number of live (not necessarily fresh) entries. */
  get size(): number {
    return this.store.size;
  }
}

/**
 * Process-wide cache for Sanity reads. Keyed by a query-specific string that
 * always includes the active `lang` so locales never collide.
 */
export const sanityCache = new LruCache<unknown>();

/**
 * Run `loader` behind {@link sanityCache}, keyed by `key`. On a hit the cached
 * value is returned without touching Sanity; on a miss `loader` runs and its
 * result is cached. Loader errors are re-thrown to the caller so query
 * functions can apply their own fail-safe empty result.
 */
async function cached<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const hit = sanityCache.get(key) as T | undefined;
  if (hit !== undefined) {
    return hit;
  }
  const data = await loader();
  sanityCache.set(key, data);
  return data;
}

// ---------------------------------------------------------------------------
// GROQ queries — locale-aware with es fallback (spec 5: Localized Content).
// ---------------------------------------------------------------------------

// Localized string fields are modeled as `{ es, en }` objects in Sanity. The
// `coalesce(field[$lang], field.es)` pattern applies the requested locale and
// falls back to es when the field is absent for that lang (spec 5 fallback).
// Cover projection (frontend-v3 sanity-image-pipeline): keep the flat
// backward-compatible `coverUrl` AND surface the asset's LQIP blur-up
// placeholder as `coverLqip`. Existing consumers reading `coverUrl` are
// unaffected; the image pipeline uses `coverLqip` when present.
const BOOKS_QUERY = `*[_type == "book" && !(_id in path("drafts.**"))] | order(title asc) {
  _id,
  "title": coalesce(title[$lang], title.es, title),
  "slug": slug.current,
  "author": coalesce(author[$lang], author.es, author),
  "coverUrl": cover.asset->url,
  "coverLqip": cover.asset->metadata.lqip,
  "pdfUrl": pdf.asset->url,
  "description": coalesce(description[$lang], description.es, description)
}`;

const BOOK_BY_SLUG_QUERY = `*[_type == "book" && slug.current == $slug && !(_id in path("drafts.**"))][0] {
  _id,
  "title": coalesce(title[$lang], title.es, title),
  "slug": slug.current,
  "author": coalesce(author[$lang], author.es, author),
  "coverUrl": cover.asset->url,
  "coverLqip": cover.asset->metadata.lqip,
  "pdfUrl": pdf.asset->url,
  "description": coalesce(description[$lang], description.es, description)
}`;

const NEWS_QUERY = `{
  "articles": *[_type == "news" && !(_id in path("drafts.**"))] | order(publishedAt desc) [$start...$end] {
    _id,
    "title": coalesce(title[$lang], title.es, title),
    "slug": slug.current,
    "excerpt": coalesce(excerpt[$lang], excerpt.es, excerpt),
    "body": coalesce(body[$lang], body.es, body),
    publishedAt,
    "imageUrl": image.asset->url,
    "imageLqip": image.asset->metadata.lqip
  },
  "total": count(*[_type == "news" && !(_id in path("drafts.**"))])
}`;

// Single news article by slug. Localized with es fallback like the list query;
// `body` may resolve to a plain string or a Portable Text block array depending
// on the Sanity schema, so it stays untyped here and is normalized at render
// time by {@link renderBody} (design decision #5).
const ARTICLE_BY_SLUG_QUERY = `*[_type == "news" && slug.current == $slug && !(_id in path("drafts.**"))][0] {
  _id,
  "title": coalesce(title[$lang], title.es, title),
  "slug": slug.current,
  "excerpt": coalesce(excerpt[$lang], excerpt.es, excerpt),
  "body": coalesce(body[$lang], body.es, body),
  publishedAt,
  "imageUrl": image.asset->url,
  "imageLqip": image.asset->metadata.lqip
}`;

// ---------------------------------------------------------------------------
// Discovery GROQ fragments (frontend-v3 home-discovery, design decision #6).
//
// Reusable fragment strings concatenated into the discovery queries so ONE base
// document renders as a card, a hero slide, or a spotlight — a single source of
// truth for the projected shape (design decision #6: DRY, easy to test). No new
// document types are introduced (spec: Context-Aware GROQ Projections).
//
// Safe defaults per the content-schema delta: `coalesce(featured, false)` and
// `coalesce(tagline[$lang], tagline.es, "")`, so documents missing the optional
// frontend-v3 fields still project without nulls.
//
// The cover is projected into buildImage's exact nested shape
// `{ url, metadata: { lqip } }` (NOT the flat coverUrl/coverLqip the legacy
// queries use) so discovery sections can feed `asset` straight into MediaCard /
// HeroCarousel / Spotlight without reshaping.

/** Base card projection: id, localized title/tagline, slug, cover asset. */
export const MEDIA_CARD_FRAGMENT = `
  _id,
  "title": coalesce(title[$lang], title.es, title, ""),
  "slug": slug.current,
  "tagline": coalesce(tagline[$lang], tagline.es, ""),
  "featured": coalesce(featured, false),
  "themes": coalesce(themes, []),
  "kind": _type,
  "asset": coalesce(cover.asset, image.asset)->{ url, "metadata": { "lqip": metadata.lqip } }`;

/**
 * Hero projection: card fields, a long synopsis for the slide panel, and the
 * two art assets (`contentLogo` title treatment + `heroBackground` landscape
 * backdrop).
 *
 * Those two assets live HERE and deliberately NOT in
 * {@link MEDIA_CARD_FRAGMENT}: the card fragment also feeds
 * `ROWS_BY_THEME_QUERY` and `BOOKS_BY_SLUGS_QUERY`, which render poster
 * thumbnails that never show a backdrop or a logo. Every added `->` is a
 * per-document dereference paid on EVERY card of EVERY row, so hoisting them
 * into the shared fragment would be pure waste on the heaviest queries.
 *
 * NOTE: `SPOTLIGHT_FRAGMENT` is a pass-through of this fragment, so
 * `getSpotlight` ALSO projects `logoAsset` and `backgroundAsset`. The spotlight
 * query targets a single document, so the extra dereferences are bounded — that
 * is WHY leaving them in is acceptable rather than an oversight. Both assets are
 * consumed only by HeroCarousel today; Spotlight receives them and ignores them.
 *
 * `book` and `news` intentionally use the SAME field names for these two, so a
 * plain `contentLogo.asset->` works and no `coalesce(a, b)` is needed (unlike
 * the cover, where the field is `cover` on books and `image` on news).
 */
export const HERO_FRAGMENT = `${MEDIA_CARD_FRAGMENT},
  "synopsis": coalesce(description[$lang], description.es, ""),
  "logoAsset": contentLogo.asset->{ url, "metadata": { "lqip": metadata.lqip } },
  "backgroundAsset": heroBackground.asset->{ url, "metadata": { "lqip": metadata.lqip } }`;

/**
 * Spotlight projection: inherits HERO_FRAGMENT verbatim, so it projects
 * `logoAsset` and `backgroundAsset` in addition to all card fields. Spotlight
 * targets one document, so the dereference cost is bounded. The art fields are
 * consumed only by HeroCarousel; Spotlight.astro receives them and ignores them.
 */
export const SPOTLIGHT_FRAGMENT = `${HERO_FRAGMENT}`;

/**
 * Normalize a raw Sanity book projection into a {@link Book}. Missing scalar
 * fields collapse to safe defaults; `pdfUrl` stays `undefined` when absent so
 * the detail page can gate on its presence.
 */
function toBook(raw: Record<string, unknown>): Book {
  const pdfUrl = typeof raw.pdfUrl === 'string' ? raw.pdfUrl : undefined;
  const coverLqip =
    typeof raw.coverLqip === 'string' && raw.coverLqip.length > 0
      ? raw.coverLqip
      : undefined;
  return {
    _id: String(raw._id ?? ''),
    title: String(raw.title ?? ''),
    slug: String(raw.slug ?? ''),
    author: String(raw.author ?? ''),
    coverUrl: String(raw.coverUrl ?? ''),
    ...(coverLqip ? { coverLqip } : {}),
    ...(pdfUrl ? { pdfUrl } : {}),
    description: String(raw.description ?? ''),
  };
}

/**
 * Normalize a raw Sanity news projection into a {@link NewsArticle}.
 *
 * Scalar chrome fields are coerced to strings; `body` is preserved as-is
 * (string or Portable Text block array) so {@link renderBody} can decide how to
 * turn it into HTML.
 */
function toNewsArticle(raw: Record<string, unknown>): NewsArticle {
  const imageLqip =
    typeof raw.imageLqip === 'string' && raw.imageLqip.length > 0
      ? raw.imageLqip
      : undefined;
  return {
    _id: String(raw._id ?? ''),
    title: String(raw.title ?? ''),
    slug: String(raw.slug ?? ''),
    excerpt: String(raw.excerpt ?? ''),
    body: raw.body ?? '',
    publishedAt: String(raw.publishedAt ?? ''),
    imageUrl: String(raw.imageUrl ?? ''),
    ...(imageLqip ? { imageLqip } : {}),
  };
}

/** Coerce an untrusted lang into a supported one, defaulting to es. */
function safeLang(lang: Lang | string): Lang {
  return lang === 'en' ? 'en' : DEFAULT_LANG;
}

/**
 * Fetch all published books for `lang`, ordered by title.
 *
 * Cached for {@link CACHE_TTL_MS}. Returns `[]` on any Sanity error or when the
 * catalog is empty (spec 2: Empty catalog — no broken layout).
 */
export async function getBooks(lang: Lang | string): Promise<Book[]> {
  const l = safeLang(lang);
  try {
    const raw = await cached(`books:${l}`, () =>
      sanityClient.fetch<Record<string, unknown>[]>(BOOKS_QUERY, { lang: l }),
    );
    return Array.isArray(raw) ? raw.map(toBook) : [];
  } catch (err) {
    console.error('[sanity] getBooks failed:', err);
    return [];
  }
}

/**
 * Fetch a single published book by `slug` for `lang`.
 *
 * Cached for {@link CACHE_TTL_MS}. Returns `null` when the slug matches no
 * document or on any Sanity error (spec 2: Slug not found -> 404 at the page).
 */
export async function getBookBySlug(
  slug: string,
  lang: Lang | string,
): Promise<Book | null> {
  const l = safeLang(lang);
  try {
    const raw = await cached(`book:${l}:${slug}`, () =>
      sanityClient.fetch<Record<string, unknown> | null>(BOOK_BY_SLUG_QUERY, {
        slug,
        lang: l,
      }),
    );
    return raw ? toBook(raw) : null;
  } catch (err) {
    console.error('[sanity] getBookBySlug failed:', err);
    return null;
  }
}

/**
 * Fetch page `page` (1-based) of published news for `lang`, newest first.
 *
 * Page size is {@link NEWS_PAGE_SIZE}. Cached for {@link CACHE_TTL_MS}. Returns
 * an empty page (with correct `total`/`pageCount` when known) on error so the
 * page can render an empty state or 404 for out-of-range requests
 * (spec 2: News Pagination).
 */
export async function getNews(
  page: number,
  lang: Lang | string,
): Promise<NewsPage> {
  const l = safeLang(lang);
  const safePage = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
  const start = (safePage - 1) * NEWS_PAGE_SIZE;
  const end = start + NEWS_PAGE_SIZE;

  try {
    const raw = await cached(`news:${l}:${safePage}`, () =>
      sanityClient.fetch<{
        articles: Record<string, unknown>[];
        total: number;
      }>(NEWS_QUERY, { lang: l, start, end }),
    );
    const total = typeof raw?.total === 'number' ? raw.total : 0;
    const articles = Array.isArray(raw?.articles)
      ? raw.articles.map(toNewsArticle)
      : [];
    return {
      articles,
      page: safePage,
      total,
      pageCount: Math.max(1, Math.ceil(total / NEWS_PAGE_SIZE)),
    };
  } catch (err) {
    console.error('[sanity] getNews failed:', err);
    return { articles: [], page: safePage, total: 0, pageCount: 1 };
  }
}

/**
 * Fetch a single published news article by `slug` for `lang`.
 *
 * Cached for {@link CACHE_TTL_MS}. Returns `null` when the slug matches no
 * document or on any Sanity error (spec: article-reading — Missing slug -> 404
 * at the page; content-delivery — Sanity network error fail-safe). Never
 * coupled to the premium pass gate.
 */
export async function getArticleBySlug(
  slug: string,
  lang: Lang | string,
): Promise<NewsArticle | null> {
  const l = safeLang(lang);
  try {
    const raw = await cached(`article:${l}:${slug}`, () =>
      sanityClient.fetch<Record<string, unknown> | null>(
        ARTICLE_BY_SLUG_QUERY,
        { slug, lang: l },
      ),
    );
    return raw ? toNewsArticle(raw) : null;
  } catch (err) {
    console.error('[sanity] getArticleBySlug failed:', err);
    return null;
  }
}

/**
 * Fetch a small slice of published books to feature on the home page.
 *
 * There is no Sanity `featured` flag yet (design open question), so this reuses
 * the ordered {@link getBooks} result and slices the first `limit`. Fail-safe:
 * returns `[]` on any error (inherited from {@link getBooks}).
 */
export async function getFeaturedBooks(
  lang: Lang | string,
  limit = 8,
): Promise<Book[]> {
  const books = await getBooks(lang);
  return books.slice(0, Math.max(0, limit));
}

/**
 * Fetch the latest published news articles for `lang`, newest first.
 *
 * Reuses the first page of {@link getNews} and slices the first `limit`. This
 * keeps the home "latest articles" row consistent with the news list ordering.
 * Fail-safe: returns `[]` on any error (inherited from {@link getNews}).
 */
export async function getLatestArticles(
  limit: number,
  lang: Lang | string,
): Promise<NewsArticle[]> {
  const page = await getNews(1, lang);
  const n = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 0;
  return page.articles.slice(0, n);
}

// ---------------------------------------------------------------------------
// Discovery queries + fns (frontend-v3 home-discovery). Each section on the
// home page has a dedicated GROQ projection built from the shared fragments
// above. All fns are cached (60s LRU) and fail-safe: they return [] / null on
// any Sanity error and NEVER throw, so a data outage renders an empty section
// instead of a 500 (design decision #8, mirrors getBooks/getNews).
// ---------------------------------------------------------------------------

/** Featured items across books + news, for the HeroCarousel. */
const HERO_QUERY = `*[
  (_type == "book" || _type == "news")
  && coalesce(featured, false) == true
  && !(_id in path("drafts.**"))
] | order(coalesce(publishedAt, _createdAt) desc) [0...$limit] {
  ${HERO_FRAGMENT}
}`;

/** Cards grouped by theme, mixed book + news, for EditorialRows. A document
 * with several themes is returned once and fanned out into one row per theme
 * by {@link getRowsByTheme}. */
const ROWS_BY_THEME_QUERY = `*[
  (_type == "book" || _type == "news")
  && count(themes) > 0
  && !(_id in path("drafts.**"))
] | order(coalesce(publishedAt, _createdAt) desc) {
  ${MEDIA_CARD_FRAGMENT}
}`;

/** The single most recent featured item, for the Spotlight block. */
const SPOTLIGHT_QUERY = `*[
  (_type == "book" || _type == "news")
  && coalesce(featured, false) == true
  && !(_id in path("drafts.**"))
] | order(coalesce(publishedAt, _createdAt) desc) [0] {
  ${SPOTLIGHT_FRAGMENT}
}`;

/**
 * ALL featured items (books + news), newest first, for the Spotlight CAROUSEL.
 * Same filter/order as {@link SPOTLIGHT_QUERY} but without the `[0]` slice, so
 * the home can rotate through every featured document instead of a single one.
 */
const SPOTLIGHTS_QUERY = `*[
  (_type == "book" || _type == "news")
  && coalesce(featured, false) == true
  && !(_id in path("drafts.**"))
] | order(coalesce(publishedAt, _createdAt) desc) {
  ${SPOTLIGHT_FRAGMENT}
}`;

/**
 * Books whose slug is in `$slugs`, projected as discovery cards. Used to
 * hydrate the "Más descargados" ranking: Supabase returns the ordered slugs,
 * this query fetches their content. GROQ has no stable "order by array index",
 * so the CALLER re-sorts the result back into the `$slugs` order.
 */
const BOOKS_BY_SLUGS_QUERY = `*[
  _type == "book"
  && slug.current in $slugs
  && !(_id in path("drafts.**"))
] {
  ${MEDIA_CARD_FRAGMENT}
}`;

/** An editorial row: a theme slug plus the items grouped under it. */
export interface EditorialRow {
  themeTag: string;
  items: MediaItem[];
}

/**
 * Reserved theme slugs that get a fixed slot + a curated title near the TOP of
 * the home page. Today only `recomendados` (rendered as the hero-overlapping
 * row); every OTHER theme renders as a dynamic editorial row below the
 * automatic "Más descargados" ranking. Keep the slugs lowercase + hyphenated to
 * match what editors type in the Studio `themes` tag field.
 */
export const RESERVED_THEMES = ['recomendados'] as const;

/**
 * Display-title overrides for theme slugs whose auto-generated title would be
 * wrong (accents the slug can't carry, or a multi-word editorial label). Any
 * slug NOT listed here falls through to {@link themeTitle}'s generic transform.
 * Editors add a line here only for special-cased titles; plain slugs like
 * `frontend` need nothing.
 */
export const THEME_TITLE_OVERRIDES: Record<string, string> = {
  recomendados: 'Libros Recomendados',
};

/**
 * Turn a theme slug into a display title. Precedence:
 *   1. An explicit entry in {@link THEME_TITLE_OVERRIDES} (accents / labels).
 *   2. Generic transform: hyphens/underscores → spaces, then capitalize the
 *      first letter of each word ("frontend" → "Frontend", "clean-arch" →
 *      "Clean Arch").
 * The generic path CANNOT invent accents that are not in the slug, which is
 * exactly why the override map exists.
 */
export function themeTitle(slug: string): string {
  if (!slug) return '';
  const override = THEME_TITLE_OVERRIDES[slug];
  if (override) return override;
  return slug
    .replace(/[-_]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Build the detail deep-link for a projected item. Books live under
 * `/[lang]/libros/<slug>`, news under `/[lang]/noticias/<slug>`.
 */
function hrefFor(kind: MediaItem['kind'], slug: string, lang: Lang): string {
  const segment = kind === 'news' ? 'noticias' : 'libros';
  return `/${lang}/${segment}/${slug}`;
}

/**
 * Normalize ONE raw projected asset into a {@link MediaAsset}, or `undefined`
 * when the projection produced nothing usable.
 *
 * A dereference like `cover.asset->{ url, ... }` yields `null` when the field is
 * unset, and an object with a missing/blank `url` is just as unrenderable, so
 * both collapse to `undefined` and the caller omits the key entirely. `metadata`
 * only rides along when it is actually an object.
 *
 * Extracted because {@link toMediaItem} now normalizes THREE assets (cover,
 * logo, background) with identical rules — three copies of this block would
 * drift.
 */
export function toAsset(raw: unknown): MediaAsset | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const candidate = raw as { url?: unknown; metadata?: unknown };
  if (typeof candidate.url !== 'string' || candidate.url.length === 0) {
    return undefined;
  }
  return {
    url: candidate.url,
    ...(candidate.metadata && typeof candidate.metadata === 'object'
      ? { metadata: candidate.metadata as { lqip?: string } }
      : {}),
  };
}

/**
 * Normalize a raw discovery projection into a {@link MediaItem}, applying the
 * same safe defaults the GROQ coalesces guarantee (defensive: a raw doc missing
 * `featured`/`tagline` still yields `false`/`""`). Assets are preserved in
 * buildImage's `{ url, metadata: { lqip } }` shape or dropped when absent.
 *
 * NOTE: this is a WHITELIST normalizer — a field added to a GROQ fragment is
 * silently discarded unless it is also picked up here.
 */
function toMediaItem(raw: Record<string, unknown>, lang: Lang): MediaItem {
  const kind = raw.kind === 'news' ? 'news' : 'book';
  const slug = String(raw.slug ?? '');
  const asset = toAsset(raw.asset);
  // Art projected by HERO_FRAGMENT → present on both hero and spotlight results;
  // absent on card/ranked projections, which never select HERO_FRAGMENT.
  const logoAsset = toAsset(raw.logoAsset);
  const backgroundAsset = toAsset(raw.backgroundAsset);
  const synopsis = typeof raw.synopsis === 'string' && raw.synopsis.length > 0
    ? raw.synopsis
    : undefined;
  // `themes` is an array of non-empty strings. Defensive: tolerate a raw doc
  // that still carries a legacy string OR a null, coercing both to a clean
  // string[] so grouping never sees nulls/blanks.
  const themes = Array.isArray(raw.themes)
    ? raw.themes.filter(
        (t): t is string => typeof t === 'string' && t.length > 0,
      )
    : typeof raw.themes === 'string' && raw.themes.length > 0
      ? [raw.themes]
      : [];
  return {
    _id: String(raw._id ?? ''),
    kind,
    title: String(raw.title ?? ''),
    slug,
    href: hrefFor(kind, slug, lang),
    ...(asset ? { asset } : {}),
    ...(logoAsset ? { logoAsset } : {}),
    ...(backgroundAsset ? { backgroundAsset } : {}),
    tagline: String(raw.tagline ?? ''),
    ...(synopsis ? { synopsis } : {}),
    themes,
    featured: raw.featured === true,
  };
}

/**
 * Fetch featured items (books + news) for the HeroCarousel, newest first.
 *
 * Cached for {@link CACHE_TTL_MS}. Returns `[]` on any Sanity error or when
 * nothing is featured (spec: Edge-Case Item Counts — 0 items → no carousel).
 */
export async function getHeroItems(
  lang: Lang | string,
  limit = 6,
): Promise<MediaItem[]> {
  const l = safeLang(lang);
  const cap = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 6;
  try {
    const raw = await cached(`hero:${l}:${cap}`, () =>
      sanityClient.fetch<Record<string, unknown>[]>(HERO_QUERY, {
        lang: l,
        limit: cap,
      }),
    );
    return Array.isArray(raw) ? raw.map((r) => toMediaItem(r, l)) : [];
  } catch (err) {
    console.error('[sanity] getHeroItems failed:', err);
    return [];
  }
}

/**
 * Fetch tagged items grouped into editorial rows by `themeTag`, mixed book +
 * news within a row (spec: Mixed-type editorial row).
 *
 * Cached for {@link CACHE_TTL_MS}. Returns `[]` on any Sanity error or when no
 * document carries a themeTag. Rows preserve first-seen tag order; items within
 * a row preserve the query order (newest first).
 */
export async function getRowsByTheme(
  lang: Lang | string,
): Promise<EditorialRow[]> {
  const l = safeLang(lang);
  try {
    const raw = await cached(`rows:${l}`, () =>
      sanityClient.fetch<Record<string, unknown>[]>(ROWS_BY_THEME_QUERY, {
        lang: l,
      }),
    );
    if (!Array.isArray(raw)) {
      return [];
    }
    const rows = new Map<string, MediaItem[]>();
    for (const doc of raw) {
      const item = toMediaItem(doc, l);
      // A document can carry several themes → it joins one row per theme.
      for (const theme of item.themes) {
        const bucket = rows.get(theme);
        if (bucket) {
          bucket.push(item);
        } else {
          rows.set(theme, [item]);
        }
      }
    }
    return Array.from(rows, ([themeTag, items]) => ({ themeTag, items }));
  } catch (err) {
    console.error('[sanity] getRowsByTheme failed:', err);
    return [];
  }
}

/**
 * Fetch the single most recent featured item for the Spotlight block.
 *
 * Cached for {@link CACHE_TTL_MS}. Returns `null` when nothing is featured or
 * on any Sanity error, so the Spotlight section renders an empty state.
 */
export async function getSpotlight(
  lang: Lang | string,
): Promise<MediaItem | null> {
  const l = safeLang(lang);
  try {
    const raw = await cached(`spotlight:${l}`, () =>
      sanityClient.fetch<Record<string, unknown> | null>(SPOTLIGHT_QUERY, {
        lang: l,
      }),
    );
    return raw ? toMediaItem(raw, l) : null;
  } catch (err) {
    console.error('[sanity] getSpotlight failed:', err);
    return null;
  }
}

/**
 * Fetch ALL featured items (books + news), newest first, for the Spotlight
 * CAROUSEL. Same projection as {@link getSpotlight} but returns every featured
 * document instead of just the first, so the home can rotate through them.
 *
 * Cached for {@link CACHE_TTL_MS}. Fail-safe: returns `[]` when nothing is
 * featured or on any Sanity error, so the Spotlight section self-hides instead
 * of breaking the home page.
 */
export async function getSpotlights(
  lang: Lang | string,
): Promise<MediaItem[]> {
  const l = safeLang(lang);
  try {
    const raw = await cached(`spotlights:${l}`, () =>
      sanityClient.fetch<Record<string, unknown>[]>(SPOTLIGHTS_QUERY, {
        lang: l,
      }),
    );
    return Array.isArray(raw) ? raw.map((r) => toMediaItem(r, l)) : [];
  } catch (err) {
    console.error('[sanity] getSpotlights failed:', err);
    return [];
  }
}

/**
 * Fetch books by an explicit list of slugs and return them IN THE GIVEN slug
 * order (not GROQ's default order).
 *
 * Used to hydrate the "Más descargados" ranking: `slugs` comes pre-sorted by
 * download count from Supabase, so this preserves that ranking. Slugs with no
 * matching (or draft) book are silently dropped. Cached for {@link CACHE_TTL_MS}
 * keyed by the ordered slug list. Fail-safe: `[]` on any error or empty input.
 */
export async function getBooksBySlugs(
  slugs: string[],
  lang: Lang | string,
): Promise<MediaItem[]> {
  const l = safeLang(lang);
  const clean = Array.isArray(slugs)
    ? slugs.filter((s): s is string => typeof s === 'string' && s.length > 0)
    : [];
  if (clean.length === 0) return [];
  try {
    const raw = await cached(`books-by-slugs:${l}:${clean.join(',')}`, () =>
      sanityClient.fetch<Record<string, unknown>[]>(BOOKS_BY_SLUGS_QUERY, {
        lang: l,
        slugs: clean,
      }),
    );
    const items = Array.isArray(raw) ? raw.map((r) => toMediaItem(r, l)) : [];
    // Re-order into the requested slug order (GROQ returned them unordered).
    const bySlug = new Map(items.map((it) => [it.slug, it]));
    return clean
      .map((s) => bySlug.get(s))
      .filter((it): it is MediaItem => it !== undefined);
  } catch (err) {
    console.error('[sanity] getBooksBySlugs failed:', err);
    return [];
  }
}

/** Escape the five HTML-significant characters so body text is injection-safe. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Render an article `body` into a safe HTML string of `<p>` paragraphs.
 *
 * Defensive by design (decision #5): the Sanity schema may deliver either a
 * plain string or a Portable Text block array, so both are handled:
 *  - string        -> a single escaped `<p>`
 *  - block array   -> one `<p>` per block, joining each block's child `.text`
 *                     spans (escaped) with the empty string
 *  - anything else  -> empty string
 *
 * All text is HTML-escaped before wrapping, so the result is safe to inject via
 * `<Fragment set:html>`. Future: swap internals for a full Portable Text
 * renderer without changing this signature.
 */
export function renderBody(body: unknown): string {
  if (typeof body === 'string') {
    const trimmed = body.trim();
    return trimmed ? `<p>${escapeHtml(trimmed)}</p>` : '';
  }

  if (Array.isArray(body)) {
    const paragraphs = body
      .map((block) => {
        if (!block || typeof block !== 'object') {
          return '';
        }
        const children = (block as { children?: unknown }).children;
        if (!Array.isArray(children)) {
          return '';
        }
        const text = children
          .map((child) => {
            const span = child as { text?: unknown };
            return typeof span?.text === 'string' ? span.text : '';
          })
          .join('');
        const trimmed = text.trim();
        return trimmed ? `<p>${escapeHtml(trimmed)}</p>` : '';
      })
      .filter((p) => p.length > 0);
    return paragraphs.join('');
  }

  return '';
}
