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
