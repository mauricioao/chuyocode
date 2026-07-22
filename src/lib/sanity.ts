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
  themeTag?: string;
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
  themeTag?: string;
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
  /** Short editorial tagline; always a string (coalesced to "" when absent). */
  tagline: string;
  /** Long editorial synopsis for hero/spotlight contexts (optional). */
  synopsis?: string;
  /** Grouping tag for editorial rows (optional). */
  themeTag?: string;
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
  themeTag,
  "kind": _type,
  "asset": coalesce(cover.asset, image.asset)->{ url, "metadata": { "lqip": metadata.lqip } }`;

/** Hero projection: card fields plus a long synopsis for the slide panel. */
export const HERO_FRAGMENT = `${MEDIA_CARD_FRAGMENT},
  "synopsis": coalesce(description[$lang], description.es, "")`;

/** Spotlight projection: hero fields (featured is already in the base card). */
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

/** Cards grouped by themeTag, mixed book + news, for EditorialRows. */
const ROWS_BY_THEME_QUERY = `*[
  (_type == "book" || _type == "news")
  && defined(themeTag)
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

/** Top books ordered for the numbered RankedRow. */
const RANKED_QUERY = `*[
  _type == "book" && !(_id in path("drafts.**"))
] | order(title asc) [0...$limit] {
  ${MEDIA_CARD_FRAGMENT}
}`;

/** An editorial row: a themeTag plus the items grouped under it. */
export interface EditorialRow {
  themeTag: string;
  items: MediaItem[];
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
 * Normalize a raw discovery projection into a {@link MediaItem}, applying the
 * same safe defaults the GROQ coalesces guarantee (defensive: a raw doc missing
 * `featured`/`tagline` still yields `false`/`""`). The asset is preserved in
 * buildImage's `{ url, metadata: { lqip } }` shape or dropped when absent.
 */
function toMediaItem(raw: Record<string, unknown>, lang: Lang): MediaItem {
  const kind = raw.kind === 'news' ? 'news' : 'book';
  const slug = String(raw.slug ?? '');
  const rawAsset = raw.asset as { url?: unknown; metadata?: unknown } | null | undefined;
  const asset =
    rawAsset && typeof rawAsset.url === 'string' && rawAsset.url.length > 0
      ? {
          url: rawAsset.url,
          ...(rawAsset.metadata && typeof rawAsset.metadata === 'object'
            ? { metadata: rawAsset.metadata as { lqip?: string } }
            : {}),
        }
      : undefined;
  const synopsis = typeof raw.synopsis === 'string' && raw.synopsis.length > 0
    ? raw.synopsis
    : undefined;
  const themeTag = typeof raw.themeTag === 'string' && raw.themeTag.length > 0
    ? raw.themeTag
    : undefined;
  return {
    _id: String(raw._id ?? ''),
    kind,
    title: String(raw.title ?? ''),
    slug,
    href: hrefFor(kind, slug, lang),
    ...(asset ? { asset } : {}),
    tagline: String(raw.tagline ?? ''),
    ...(synopsis ? { synopsis } : {}),
    ...(themeTag ? { themeTag } : {}),
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
      if (!item.themeTag) {
        continue;
      }
      const bucket = rows.get(item.themeTag);
      if (bucket) {
        bucket.push(item);
      } else {
        rows.set(item.themeTag, [item]);
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
 * Fetch the top books for the numbered RankedRow, ordered by title.
 *
 * Cached for {@link CACHE_TTL_MS}. Returns `[]` on any Sanity error or when the
 * catalog is empty. Ranking is derived from the query order (design open
 * question: no dedicated `rank` field yet).
 */
export async function getRanked(
  lang: Lang | string,
  limit = 10,
): Promise<MediaItem[]> {
  const l = safeLang(lang);
  const cap = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 10;
  try {
    const raw = await cached(`ranked:${l}:${cap}`, () =>
      sanityClient.fetch<Record<string, unknown>[]>(RANKED_QUERY, {
        lang: l,
        limit: cap,
      }),
    );
    return Array.isArray(raw) ? raw.map((r) => toMediaItem(r, l)) : [];
  } catch (err) {
    console.error('[sanity] getRanked failed:', err);
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
