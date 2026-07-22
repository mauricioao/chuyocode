import { describe, it, expect, beforeEach, vi } from 'vitest';

// The Sanity content layer initializes a real `@sanity/client` at import time
// and calls `.fetch()` inside its query functions. We stub the module so no
// network happens and each test controls the returned documents. `createClient`
// returns a shared mock whose `fetch` we drive per test.
// NOTE: `vi.mock` is hoisted above imports, so `fetchMock` MUST be defined
// via `vi.hoisted()` rather than a top-level `const` (which would be TDZ).
const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));
vi.mock('@sanity/client', () => ({
  createClient: () => ({ fetch: fetchMock }),
}));

// env.ts reads import.meta.env; provide the required vars so loadEnv() passes.
vi.mock('./env', () => ({
  loadEnv: () => ({
    SANITY_PROJECT_ID: 'proj',
    SANITY_DATASET: 'production',
    SUPABASE_URL: 'https://x.supabase.co',
    SUPABASE_ANON_KEY: 'anon',
    SUPABASE_SERVICE_ROLE_KEY: '',
    AD_HMAC_SECRET: '',
  }),
}));

import {
  LruCache,
  CACHE_TTL_MS,
  NEWS_PAGE_SIZE,
  sanityCache,
  getBooks,
  getBookBySlug,
  getNews,
  getArticleBySlug,
  getFeaturedBooks,
  getLatestArticles,
  renderBody,
  MEDIA_CARD_FRAGMENT,
  HERO_FRAGMENT,
  SPOTLIGHT_FRAGMENT,
  getHeroItems,
  getRowsByTheme,
  getSpotlight,
  getRanked,
} from './sanity';

// ---------------------------------------------------------------------------
// LRU cache — hit / miss / expiry / eviction / LRU ordering.
// ---------------------------------------------------------------------------
describe('LruCache', () => {
  it('returns undefined on a miss', () => {
    const cache = new LruCache<number>();
    expect(cache.get('absent')).toBeUndefined();
  });

  it('returns the stored value on a hit', () => {
    const cache = new LruCache<number>();
    cache.set('a', 1);
    expect(cache.get('a')).toBe(1);
  });

  it('treats an entry as a miss once its TTL has elapsed', () => {
    let now = 1_000;
    const cache = new LruCache<number>(100, CACHE_TTL_MS, () => now);
    cache.set('a', 42);
    // Just before expiry: still a hit.
    now = 1_000 + CACHE_TTL_MS - 1;
    expect(cache.get('a')).toBe(42);
    // At/after expiry: miss, and the stale entry is evicted.
    now = 1_000 + CACHE_TTL_MS;
    expect(cache.get('a')).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it('evicts the least-recently-used entry on overflow', () => {
    const cache = new LruCache<number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    // Access 'a' so 'b' becomes the LRU entry.
    expect(cache.get('a')).toBe(1);
    cache.set('c', 3); // overflow -> evict 'b'
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe(1);
    expect(cache.get('c')).toBe(3);
  });

  it('overwrites an existing key without growing size', () => {
    const cache = new LruCache<number>(2);
    cache.set('a', 1);
    cache.set('a', 2);
    expect(cache.get('a')).toBe(2);
    expect(cache.size).toBe(1);
  });

  it('clear() empties the cache', () => {
    const cache = new LruCache<number>();
    cache.set('a', 1);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get('a')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Typed query functions — shapes, empty results, error handling, caching.
// ---------------------------------------------------------------------------
describe('getBooks', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    sanityCache.clear();
  });

  it('maps raw Sanity docs into typed Book objects', async () => {
    fetchMock.mockResolvedValue([
      {
        _id: 'b1',
        title: 'Clean Architecture',
        slug: 'clean-architecture',
        author: 'Robert C. Martin',
        coverUrl: 'https://cdn/clean.jpg',
        pdfUrl: 'https://cdn/clean.pdf',
        description: 'A book about boundaries.',
      },
    ]);
    const books = await getBooks('es');
    expect(books).toHaveLength(1);
    expect(books[0]).toEqual({
      _id: 'b1',
      title: 'Clean Architecture',
      slug: 'clean-architecture',
      author: 'Robert C. Martin',
      coverUrl: 'https://cdn/clean.jpg',
      pdfUrl: 'https://cdn/clean.pdf',
      description: 'A book about boundaries.',
    });
  });

  it('omits pdfUrl when the book has no PDF asset', async () => {
    fetchMock.mockResolvedValue([
      { _id: 'b2', title: 'No PDF', slug: 'no-pdf', author: 'A', coverUrl: '', description: '' },
    ]);
    const [book] = await getBooks('en');
    expect(book).toBeDefined();
    expect(book?.pdfUrl).toBeUndefined();
  });

  it('returns an empty array when the catalog is empty', async () => {
    fetchMock.mockResolvedValue([]);
    expect(await getBooks('es')).toEqual([]);
  });

  it('returns an empty array (fail-safe) on a Sanity error', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    expect(await getBooks('es')).toEqual([]);
  });

  it('passes the active lang to the GROQ query', async () => {
    fetchMock.mockResolvedValue([]);
    await getBooks('en');
    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), { lang: 'en' });
  });

  it('serves a second identical call from cache (no extra fetch)', async () => {
    fetchMock.mockResolvedValue([]);
    await getBooks('es');
    await getBooks('es');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not share cache entries across languages', async () => {
    fetchMock.mockResolvedValue([]);
    await getBooks('es');
    await getBooks('en');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('getBookBySlug', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    sanityCache.clear();
  });

  it('returns a typed Book when the slug exists', async () => {
    fetchMock.mockResolvedValue({
      _id: 'b1',
      title: 'Refactoring',
      slug: 'refactoring',
      author: 'Martin Fowler',
      coverUrl: 'https://cdn/refactoring.jpg',
      description: 'Improving design of existing code.',
    });
    const book = await getBookBySlug('refactoring', 'es');
    expect(book?._id).toBe('b1');
    expect(book?.title).toBe('Refactoring');
    expect(book?.slug).toBe('refactoring');
  });

  it('returns null when the slug matches no document', async () => {
    fetchMock.mockResolvedValue(null);
    expect(await getBookBySlug('missing', 'es')).toBeNull();
  });

  it('returns null (fail-safe) on a Sanity error', async () => {
    fetchMock.mockRejectedValue(new Error('boom'));
    expect(await getBookBySlug('x', 'es')).toBeNull();
  });

  it('passes slug and lang to the GROQ query', async () => {
    fetchMock.mockResolvedValue(null);
    await getBookBySlug('some-slug', 'en');
    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), {
      slug: 'some-slug',
      lang: 'en',
    });
  });
});

describe('getNews', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    sanityCache.clear();
  });

  it('maps articles and computes pagination metadata', async () => {
    const articles = Array.from({ length: NEWS_PAGE_SIZE }, (_, i) => ({
      _id: `n${i}`,
      title: `Article ${i}`,
      slug: `article-${i}`,
      excerpt: 'ex',
      body: 'body',
      publishedAt: '2026-01-01T00:00:00Z',
      imageUrl: '',
    }));
    fetchMock.mockResolvedValue({ articles, total: 25 });
    const result = await getNews(1, 'es');
    expect(result.articles).toHaveLength(NEWS_PAGE_SIZE);
    expect(result.page).toBe(1);
    expect(result.total).toBe(25);
    expect(result.pageCount).toBe(3); // ceil(25 / 10)
  });

  it('requests the correct slice window for a given page', async () => {
    fetchMock.mockResolvedValue({ articles: [], total: 0 });
    await getNews(3, 'es');
    // Page 3 with size 10 -> start 20, end 30.
    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), {
      lang: 'es',
      start: 20,
      end: 30,
    });
  });

  it('clamps a non-positive page to 1', async () => {
    fetchMock.mockResolvedValue({ articles: [], total: 0 });
    const result = await getNews(0, 'es');
    expect(result.page).toBe(1);
    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), {
      lang: 'es',
      start: 0,
      end: NEWS_PAGE_SIZE,
    });
  });

  it('returns an empty page (fail-safe) on a Sanity error', async () => {
    fetchMock.mockRejectedValue(new Error('down'));
    const result = await getNews(1, 'es');
    expect(result.articles).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.pageCount).toBe(1);
  });

  it('reports at least one page even with zero articles', async () => {
    fetchMock.mockResolvedValue({ articles: [], total: 0 });
    const result = await getNews(1, 'es');
    expect(result.pageCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// getArticleBySlug — single article lookup, fail-safe, lang + caching.
// ---------------------------------------------------------------------------
describe('getArticleBySlug', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    sanityCache.clear();
  });

  it('returns a typed NewsArticle when the slug exists', async () => {
    fetchMock.mockResolvedValue({
      _id: 'n1',
      title: 'Mi Artículo',
      slug: 'mi-articulo',
      excerpt: 'resumen',
      body: 'cuerpo del artículo',
      publishedAt: '2026-01-01T00:00:00Z',
      imageUrl: 'https://cdn/art.jpg',
    });
    const article = await getArticleBySlug('mi-articulo', 'es');
    expect(article?._id).toBe('n1');
    expect(article?.title).toBe('Mi Artículo');
    expect(article?.slug).toBe('mi-articulo');
    expect(article?.body).toBe('cuerpo del artículo');
  });

  it('preserves a Portable Text block array body untouched', async () => {
    const blocks = [
      { _type: 'block', children: [{ text: 'Hola' }] },
    ];
    fetchMock.mockResolvedValue({
      _id: 'n2',
      title: 'T',
      slug: 's',
      excerpt: '',
      body: blocks,
      publishedAt: '',
      imageUrl: '',
    });
    const article = await getArticleBySlug('s', 'es');
    expect(article?.body).toEqual(blocks);
  });

  it('returns null when the slug matches no document', async () => {
    fetchMock.mockResolvedValue(null);
    expect(await getArticleBySlug('missing', 'es')).toBeNull();
  });

  it('returns null (fail-safe) on a Sanity error', async () => {
    fetchMock.mockRejectedValue(new Error('boom'));
    expect(await getArticleBySlug('x', 'es')).toBeNull();
  });

  it('passes slug and lang to the GROQ query', async () => {
    fetchMock.mockResolvedValue(null);
    await getArticleBySlug('some-slug', 'en');
    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), {
      slug: 'some-slug',
      lang: 'en',
    });
  });

  it('serves a second identical call from cache (no extra fetch)', async () => {
    fetchMock.mockResolvedValue(null);
    await getArticleBySlug('foo', 'es');
    await getArticleBySlug('foo', 'es');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Home helpers — featured books + latest articles slices (fail-safe).
// ---------------------------------------------------------------------------
describe('getFeaturedBooks', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    sanityCache.clear();
  });

  it('slices the first N books from the ordered catalog', async () => {
    fetchMock.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => ({
        _id: `b${i}`,
        title: `Book ${i}`,
        slug: `book-${i}`,
        author: 'A',
        coverUrl: '',
        description: '',
      })),
    );
    const books = await getFeaturedBooks('es', 3);
    expect(books).toHaveLength(3);
    expect(books[0]?._id).toBe('b0');
  });

  it('returns [] (fail-safe) on a Sanity error', async () => {
    fetchMock.mockRejectedValue(new Error('down'));
    expect(await getFeaturedBooks('es')).toEqual([]);
  });
});

describe('getLatestArticles', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    sanityCache.clear();
  });

  it('slices the first N articles from page 1', async () => {
    const articles = Array.from({ length: NEWS_PAGE_SIZE }, (_, i) => ({
      _id: `n${i}`,
      title: `Article ${i}`,
      slug: `article-${i}`,
      excerpt: 'ex',
      body: 'body',
      publishedAt: '2026-01-01T00:00:00Z',
      imageUrl: '',
    }));
    fetchMock.mockResolvedValue({ articles, total: NEWS_PAGE_SIZE });
    const latest = await getLatestArticles(4, 'es');
    expect(latest).toHaveLength(4);
    expect(latest[0]?._id).toBe('n0');
  });

  it('returns [] (fail-safe) on a Sanity error', async () => {
    fetchMock.mockRejectedValue(new Error('down'));
    expect(await getLatestArticles(4, 'es')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// renderBody — string / block-array / empty / escaping (design decision #5).
// ---------------------------------------------------------------------------
describe('renderBody', () => {
  it('wraps a plain string in a single escaped <p>', () => {
    expect(renderBody('hola mundo')).toBe('<p>hola mundo</p>');
  });

  it('escapes HTML-significant characters in a string', () => {
    expect(renderBody('<b>x</b> & "y"')).toBe(
      '<p>&lt;b&gt;x&lt;/b&gt; &amp; &quot;y&quot;</p>',
    );
  });

  it('joins a Portable Text block array into <p> paragraphs', () => {
    const blocks = [
      { _type: 'block', children: [{ text: 'First ' }, { text: 'block' }] },
      { _type: 'block', children: [{ text: 'Second block' }] },
    ];
    expect(renderBody(blocks)).toBe('<p>First block</p><p>Second block</p>');
  });

  it('escapes text inside block children', () => {
    const blocks = [{ _type: 'block', children: [{ text: 'a < b & c' }] }];
    expect(renderBody(blocks)).toBe('<p>a &lt; b &amp; c</p>');
  });

  it('returns an empty string for an empty string', () => {
    expect(renderBody('')).toBe('');
    expect(renderBody('   ')).toBe('');
  });

  it('returns an empty string for an empty array', () => {
    expect(renderBody([])).toBe('');
  });

  it('skips blocks without valid children', () => {
    const blocks = [
      { _type: 'block' },
      { _type: 'block', children: [{ text: 'kept' }] },
      null,
    ];
    expect(renderBody(blocks)).toBe('<p>kept</p>');
  });

  it('returns an empty string for non-string, non-array input', () => {
    expect(renderBody(null)).toBe('');
    expect(renderBody(undefined)).toBe('');
    expect(renderBody(42)).toBe('');
    expect(renderBody({ foo: 'bar' })).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Discovery GROQ fragments (frontend-v3 home-discovery, design decision #6).
// Fragments are the single source of truth for the projected shape; these
// asserts pin their composition so hero/card/spotlight stay in sync.
// ---------------------------------------------------------------------------
describe('discovery GROQ fragments', () => {
  it('MEDIA_CARD_FRAGMENT projects the buildImage asset shape and safe defaults', () => {
    // Cover projected into buildImage's nested `{ url, metadata: { lqip } }`
    // shape (coalescing cover/image so books and news both resolve).
    expect(MEDIA_CARD_FRAGMENT).toContain(
      'coalesce(cover.asset, image.asset)->{ url, "metadata": { "lqip": metadata.lqip } }',
    );
    // Coalesced safe defaults per the content-schema delta.
    expect(MEDIA_CARD_FRAGMENT).toContain('coalesce(featured, false)');
    expect(MEDIA_CARD_FRAGMENT).toContain('coalesce(tagline[$lang], tagline.es, "")');
    // Localized title with es fallback and a final empty-string guard.
    expect(MEDIA_CARD_FRAGMENT).toContain('coalesce(title[$lang], title.es, title, "")');
    expect(MEDIA_CARD_FRAGMENT).toContain('themeTag');
  });

  it('HERO_FRAGMENT composes the card fragment plus a synopsis', () => {
    // Fragment composition: HERO extends MEDIA_CARD (DRY, design decision #6).
    expect(HERO_FRAGMENT).toContain(MEDIA_CARD_FRAGMENT);
    expect(HERO_FRAGMENT).toContain('"synopsis": coalesce(description[$lang], description.es, "")');
  });

  it('SPOTLIGHT_FRAGMENT composes the hero fragment', () => {
    expect(SPOTLIGHT_FRAGMENT).toContain(HERO_FRAGMENT);
    // Transitively includes the card fields (featured is in the base card).
    expect(SPOTLIGHT_FRAGMENT).toContain('coalesce(featured, false)');
  });
});

// ---------------------------------------------------------------------------
// getHeroItems — featured mixed items, shape, coalesce defaults, fail-safe.
// ---------------------------------------------------------------------------
describe('getHeroItems', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    sanityCache.clear();
  });

  it('maps raw docs into MediaItems with a resolved detail href', async () => {
    fetchMock.mockResolvedValue([
      {
        _id: 'b1',
        kind: 'book',
        title: 'Featured Book',
        slug: 'featured-book',
        tagline: 'A tagline',
        featured: true,
        themeTag: 'architecture',
        synopsis: 'Long synopsis',
        asset: { url: 'https://cdn/cover.jpg', metadata: { lqip: 'data:blur' } },
      },
    ]);
    const items = await getHeroItems('es');
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({
      _id: 'b1',
      kind: 'book',
      title: 'Featured Book',
      slug: 'featured-book',
      href: '/es/libros/featured-book',
      asset: { url: 'https://cdn/cover.jpg', metadata: { lqip: 'data:blur' } },
      tagline: 'A tagline',
      synopsis: 'Long synopsis',
      themeTag: 'architecture',
      featured: true,
    });
  });

  it('builds a noticias href for news-kind items', async () => {
    fetchMock.mockResolvedValue([
      { _id: 'n1', kind: 'news', title: 'N', slug: 'la-noticia', tagline: '', featured: true },
    ]);
    const [item] = await getHeroItems('en');
    expect(item?.href).toBe('/en/noticias/la-noticia');
  });

  it('applies safe defaults for docs missing the optional fields', async () => {
    // Simulates a doc where coalesce already produced false/"" and no asset.
    fetchMock.mockResolvedValue([
      { _id: 'b2', kind: 'book', title: 'Bare', slug: 'bare', tagline: '', featured: false },
    ]);
    const [item] = await getHeroItems('es');
    expect(item?.tagline).toBe('');
    expect(item?.featured).toBe(false);
    expect(item?.asset).toBeUndefined();
    expect(item?.synopsis).toBeUndefined();
    expect(item?.themeTag).toBeUndefined();
  });

  it('passes lang and limit to the GROQ query', async () => {
    fetchMock.mockResolvedValue([]);
    await getHeroItems('en', 4);
    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), {
      lang: 'en',
      limit: 4,
    });
  });

  it('returns [] (fail-safe) on a Sanity error', async () => {
    fetchMock.mockRejectedValue(new Error('down'));
    expect(await getHeroItems('es')).toEqual([]);
  });

  it('serves a second identical call from cache (no extra fetch)', async () => {
    fetchMock.mockResolvedValue([]);
    await getHeroItems('es');
    await getHeroItems('es');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// getRowsByTheme — mixed-type grouping, order, fail-safe.
// ---------------------------------------------------------------------------
describe('getRowsByTheme', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    sanityCache.clear();
  });

  it('groups mixed book + news items into rows by themeTag', async () => {
    fetchMock.mockResolvedValue([
      { _id: 'b1', kind: 'book', title: 'Book A', slug: 'a', tagline: '', featured: false, themeTag: 'testing' },
      { _id: 'n1', kind: 'news', title: 'News B', slug: 'b', tagline: '', featured: false, themeTag: 'testing' },
      { _id: 'b2', kind: 'book', title: 'Book C', slug: 'c', tagline: '', featured: false, themeTag: 'frontend' },
    ]);
    const rows = await getRowsByTheme('es');
    expect(rows).toHaveLength(2);
    const testing = rows.find((r) => r.themeTag === 'testing');
    expect(testing?.items).toHaveLength(2);
    // Mixed content types share one row (spec: Mixed-type editorial row).
    expect(testing?.items.map((i) => i.kind)).toEqual(['book', 'news']);
    expect(rows.find((r) => r.themeTag === 'frontend')?.items).toHaveLength(1);
  });

  it('preserves first-seen tag order', async () => {
    fetchMock.mockResolvedValue([
      { _id: '1', kind: 'book', title: 'X', slug: 'x', tagline: '', featured: false, themeTag: 'backend' },
      { _id: '2', kind: 'book', title: 'Y', slug: 'y', tagline: '', featured: false, themeTag: 'career' },
    ]);
    const rows = await getRowsByTheme('es');
    expect(rows.map((r) => r.themeTag)).toEqual(['backend', 'career']);
  });

  it('returns [] when no document carries a themeTag', async () => {
    fetchMock.mockResolvedValue([]);
    expect(await getRowsByTheme('es')).toEqual([]);
  });

  it('returns [] (fail-safe) on a Sanity error', async () => {
    fetchMock.mockRejectedValue(new Error('boom'));
    expect(await getRowsByTheme('es')).toEqual([]);
  });

  it('passes the active lang to the GROQ query', async () => {
    fetchMock.mockResolvedValue([]);
    await getRowsByTheme('en');
    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), { lang: 'en' });
  });
});

// ---------------------------------------------------------------------------
// getSpotlight — single featured item, null fallback, fail-safe.
// ---------------------------------------------------------------------------
describe('getSpotlight', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    sanityCache.clear();
  });

  it('returns a MediaItem when a featured doc exists', async () => {
    fetchMock.mockResolvedValue({
      _id: 's1',
      kind: 'book',
      title: 'Spot',
      slug: 'spot',
      tagline: 'lede',
      featured: true,
      synopsis: 'editorial synopsis',
      asset: { url: 'https://cdn/s.jpg' },
    });
    const item = await getSpotlight('es');
    expect(item?._id).toBe('s1');
    expect(item?.href).toBe('/es/libros/spot');
    expect(item?.synopsis).toBe('editorial synopsis');
    expect(item?.featured).toBe(true);
  });

  it('returns null when nothing is featured', async () => {
    fetchMock.mockResolvedValue(null);
    expect(await getSpotlight('es')).toBeNull();
  });

  it('returns null (fail-safe) on a Sanity error', async () => {
    fetchMock.mockRejectedValue(new Error('down'));
    expect(await getSpotlight('es')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getRanked — ordered books, cap, fail-safe, caching.
// ---------------------------------------------------------------------------
describe('getRanked', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    sanityCache.clear();
  });

  it('maps ranked books into MediaItems', async () => {
    fetchMock.mockResolvedValue([
      { _id: 'b1', kind: 'book', title: 'A', slug: 'a', tagline: '', featured: false },
      { _id: 'b2', kind: 'book', title: 'B', slug: 'b', tagline: '', featured: false },
    ]);
    const items = await getRanked('es', 5);
    expect(items).toHaveLength(2);
    expect(items[0]?.href).toBe('/es/libros/a');
  });

  it('passes lang and limit to the GROQ query', async () => {
    fetchMock.mockResolvedValue([]);
    await getRanked('en', 3);
    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), {
      lang: 'en',
      limit: 3,
    });
  });

  it('returns [] (fail-safe) on a Sanity error', async () => {
    fetchMock.mockRejectedValue(new Error('boom'));
    expect(await getRanked('es')).toEqual([]);
  });

  it('serves a second identical call from cache (no extra fetch)', async () => {
    fetchMock.mockResolvedValue([]);
    await getRanked('es', 10);
    await getRanked('es', 10);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
