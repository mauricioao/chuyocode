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
  getBooksBySlugs,
  toAsset,
  themeTitle,
  RESERVED_THEMES,
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

  it('maps heroBackgroundUrl when present, omits when absent', async () => {
    fetchMock.mockResolvedValue({
      _id: 'n3',
      title: 'Hero Article',
      slug: 'hero-article',
      excerpt: '',
      body: '',
      publishedAt: '',
      imageUrl: 'https://cdn/img.jpg',
      heroBackgroundUrl: 'https://cdn/hero.jpg',
      heroBackgroundLqip: 'data:blur',
    });
    const article = await getArticleBySlug('hero-article', 'es');
    expect(article?.heroBackgroundUrl).toBe('https://cdn/hero.jpg');
    expect(article?.heroBackgroundLqip).toBe('data:blur');
    // imageUrl is still populated (fallback when heroBackground is absent).
    expect(article?.imageUrl).toBe('https://cdn/img.jpg');

    // Article without heroBackground: field is absent.
    fetchMock.mockResolvedValue({
      _id: 'n4',
      title: 'Plain Article',
      slug: 'plain',
      excerpt: '',
      body: '',
      publishedAt: '',
      imageUrl: 'https://cdn/img.jpg',
    });
    const plain = await getArticleBySlug('plain', 'es');
    expect(plain?.heroBackgroundUrl).toBeUndefined();
    expect(plain?.heroBackgroundLqip).toBeUndefined();
  });

  it('maps contentLogoUrl when present, omits when absent', async () => {
    fetchMock.mockResolvedValue({
      _id: 'n5',
      title: 'Logo Article',
      slug: 'logo-article',
      excerpt: '',
      body: '',
      publishedAt: '',
      imageUrl: '',
      contentLogoUrl: 'https://cdn/logo.png',
    });
    const article = await getArticleBySlug('logo-article', 'es');
    expect(article?.contentLogoUrl).toBe('https://cdn/logo.png');
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
    expect(MEDIA_CARD_FRAGMENT).toContain('"themes": coalesce(themes, [])');
  });

  it('MEDIA_CARD_FRAGMENT does NOT project the hero-only art assets', () => {
    // The card fragment feeds ROWS_BY_THEME_QUERY and BOOKS_BY_SLUGS_QUERY,
    // which render poster thumbnails. Dereferencing a backdrop/logo there would
    // be a wasted per-card `->` on the heaviest queries.
    expect(MEDIA_CARD_FRAGMENT).not.toContain('contentLogo');
    expect(MEDIA_CARD_FRAGMENT).not.toContain('heroBackground');
    expect(MEDIA_CARD_FRAGMENT).not.toContain('logoAsset');
    expect(MEDIA_CARD_FRAGMENT).not.toContain('backgroundAsset');
  });

  it('HERO_FRAGMENT composes the card fragment plus a synopsis', () => {
    // Fragment composition: HERO extends MEDIA_CARD (DRY, design decision #6).
    expect(HERO_FRAGMENT).toContain(MEDIA_CARD_FRAGMENT);
    expect(HERO_FRAGMENT).toContain('"synopsis": coalesce(description[$lang], description.es, "")');
  });

  it('HERO_FRAGMENT projects contentLogo and heroBackground in buildImage shape', () => {
    // Both document types share these field names on purpose, so a plain
    // dereference works — no coalesce(book field, news field) needed.
    expect(HERO_FRAGMENT).toContain(
      '"logoAsset": contentLogo.asset->{ url, "metadata": { "lqip": metadata.lqip } }',
    );
    expect(HERO_FRAGMENT).toContain(
      '"backgroundAsset": heroBackground.asset->{ url, "metadata": { "lqip": metadata.lqip } }',
    );
  });

  it('SPOTLIGHT_FRAGMENT composes the hero fragment', () => {
    expect(SPOTLIGHT_FRAGMENT).toContain(HERO_FRAGMENT);
    // Transitively includes the card fields (featured is in the base card).
    expect(SPOTLIGHT_FRAGMENT).toContain('coalesce(featured, false)');
  });
});

// ---------------------------------------------------------------------------
// toAsset — shared normalizer for every projected image asset (cover, hero
// logo, hero backdrop). An unrenderable asset must collapse to `undefined` so
// the caller omits the key instead of shipping a broken <img>.
// ---------------------------------------------------------------------------
describe('toAsset', () => {
  it('keeps url and metadata when both are present', () => {
    expect(toAsset({ url: 'https://cdn/a.jpg', metadata: { lqip: 'data:x' } })).toEqual({
      url: 'https://cdn/a.jpg',
      metadata: { lqip: 'data:x' },
    });
  });

  it('omits metadata when it is absent or not an object', () => {
    expect(toAsset({ url: 'https://cdn/a.jpg' })).toEqual({ url: 'https://cdn/a.jpg' });
    expect(toAsset({ url: 'https://cdn/a.jpg', metadata: 'nope' })).toEqual({
      url: 'https://cdn/a.jpg',
    });
  });

  it('returns undefined for a missing, blank, or non-string url', () => {
    expect(toAsset({})).toBeUndefined();
    expect(toAsset({ url: '' })).toBeUndefined();
    expect(toAsset({ url: 42 })).toBeUndefined();
    expect(toAsset({ metadata: { lqip: 'data:x' } })).toBeUndefined();
  });

  it('returns undefined for a null/undefined or non-object input', () => {
    // An unset Sanity image field dereferences to null.
    expect(toAsset(null)).toBeUndefined();
    expect(toAsset(undefined)).toBeUndefined();
    expect(toAsset('https://cdn/a.jpg')).toBeUndefined();
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
        themes: ['architecture'],
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
      themes: ['architecture'],
      featured: true,
    });
  });

  it('maps the optional hero art assets when the projection resolves them', async () => {
    fetchMock.mockResolvedValue([
      {
        _id: 'b3',
        kind: 'book',
        title: 'With Hero Art',
        slug: 'with-hero-art',
        tagline: '',
        featured: true,
        asset: { url: 'https://cdn/cover.jpg' },
        logoAsset: { url: 'https://cdn/logo.png', metadata: { lqip: 'data:l' } },
        backgroundAsset: { url: 'https://cdn/backdrop.jpg' },
      },
    ]);
    const [item] = await getHeroItems('es');
    expect(item?.logoAsset).toEqual({
      url: 'https://cdn/logo.png',
      metadata: { lqip: 'data:l' },
    });
    expect(item?.backgroundAsset).toEqual({ url: 'https://cdn/backdrop.jpg' });
    // The cover keeps its own slot — hero art never overwrites it.
    expect(item?.asset).toEqual({ url: 'https://cdn/cover.jpg' });
  });

  it('drops hero art assets whose dereference resolved to null', async () => {
    // Unset image fields dereference to null, which is the common case for every
    // document created before these fields existed.
    fetchMock.mockResolvedValue([
      {
        _id: 'b4',
        kind: 'book',
        title: 'No Hero Art',
        slug: 'no-hero-art',
        tagline: '',
        featured: true,
        asset: { url: 'https://cdn/cover.jpg' },
        logoAsset: null,
        backgroundAsset: null,
      },
    ]);
    const [item] = await getHeroItems('es');
    expect(item?.logoAsset).toBeUndefined();
    expect(item?.backgroundAsset).toBeUndefined();
    expect(item?.asset).toEqual({ url: 'https://cdn/cover.jpg' });
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
    expect(item?.themes).toEqual([]);
    expect(item?.logoAsset).toBeUndefined();
    expect(item?.backgroundAsset).toBeUndefined();
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

  it('groups mixed book + news items into rows by theme', async () => {
    fetchMock.mockResolvedValue([
      { _id: 'b1', kind: 'book', title: 'Book A', slug: 'a', tagline: '', featured: false, themes: ['testing'] },
      { _id: 'n1', kind: 'news', title: 'News B', slug: 'b', tagline: '', featured: false, themes: ['testing'] },
      { _id: 'b2', kind: 'book', title: 'Book C', slug: 'c', tagline: '', featured: false, themes: ['frontend'] },
    ]);
    const rows = await getRowsByTheme('es');
    expect(rows).toHaveLength(2);
    const testing = rows.find((r) => r.themeTag === 'testing');
    expect(testing?.items).toHaveLength(2);
    // Mixed content types share one row (spec: Mixed-type editorial row).
    expect(testing?.items.map((i) => i.kind)).toEqual(['book', 'news']);
    expect(rows.find((r) => r.themeTag === 'frontend')?.items).toHaveLength(1);
  });

  it('fans a multi-theme document into one row per theme', async () => {
    // A single document carrying several themes must appear in every matching
    // row (spec: themes are a multi-select array).
    fetchMock.mockResolvedValue([
      { _id: 'b1', kind: 'book', title: 'Multi', slug: 'multi', tagline: '', featured: false, themes: ['mas-vistos', 'frontend'] },
      { _id: 'b2', kind: 'book', title: 'Solo', slug: 'solo', tagline: '', featured: false, themes: ['frontend'] },
    ]);
    const rows = await getRowsByTheme('es');
    expect(rows.map((r) => r.themeTag).sort()).toEqual(['frontend', 'mas-vistos']);
    expect(rows.find((r) => r.themeTag === 'mas-vistos')?.items).toHaveLength(1);
    expect(rows.find((r) => r.themeTag === 'frontend')?.items).toHaveLength(2);
  });

  it('preserves first-seen tag order', async () => {
    fetchMock.mockResolvedValue([
      { _id: '1', kind: 'book', title: 'X', slug: 'x', tagline: '', featured: false, themes: ['backend'] },
      { _id: '2', kind: 'book', title: 'Y', slug: 'y', tagline: '', featured: false, themes: ['career'] },
    ]);
    const rows = await getRowsByTheme('es');
    expect(rows.map((r) => r.themeTag)).toEqual(['backend', 'career']);
  });

  it('returns [] when no document carries a theme', async () => {
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
// themeTitle — slug → display title (override map + generic transform).
// ---------------------------------------------------------------------------
describe('themeTitle', () => {
  it('uses the override map for reserved themes (multi-word label)', () => {
    expect(themeTitle('recomendados')).toBe('Libros Recomendados');
  });

  it('capitalizes a plain single-word slug', () => {
    expect(themeTitle('frontend')).toBe('Frontend');
    expect(themeTitle('backend')).toBe('Backend');
  });

  it('turns hyphens/underscores into spaces and capitalizes each word', () => {
    expect(themeTitle('clean-arch')).toBe('Clean Arch');
    expect(themeTitle('data_science')).toBe('Data Science');
  });

  it('returns an empty string for an empty slug', () => {
    expect(themeTitle('')).toBe('');
  });

  it('exposes the reserved themes in home order', () => {
    expect(RESERVED_THEMES).toEqual(['recomendados']);
  });
});

// ---------------------------------------------------------------------------
// getBooksBySlugs — hydrate an ordered slug list (backs "Más descargados").
// ---------------------------------------------------------------------------
describe('getBooksBySlugs', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    sanityCache.clear();
  });

  it('returns [] without querying for an empty slug list', async () => {
    expect(await getBooksBySlugs([], 'es')).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('re-sorts the GROQ result back into the requested slug order', async () => {
    // Supabase ranking order is [top, mid, low]; GROQ returns them shuffled.
    fetchMock.mockResolvedValue([
      { _id: '2', kind: 'book', title: 'Mid', slug: 'mid', tagline: '', featured: false },
      { _id: '3', kind: 'book', title: 'Low', slug: 'low', tagline: '', featured: false },
      { _id: '1', kind: 'book', title: 'Top', slug: 'top', tagline: '', featured: false },
    ]);
    const items = await getBooksBySlugs(['top', 'mid', 'low'], 'es');
    expect(items.map((i) => i.slug)).toEqual(['top', 'mid', 'low']);
  });

  it('drops slugs that resolved to no book', async () => {
    fetchMock.mockResolvedValue([
      { _id: '1', kind: 'book', title: 'Top', slug: 'top', tagline: '', featured: false },
    ]);
    const items = await getBooksBySlugs(['top', 'missing'], 'es');
    expect(items.map((i) => i.slug)).toEqual(['top']);
  });

  it('passes the slug list and lang to the GROQ query', async () => {
    fetchMock.mockResolvedValue([]);
    await getBooksBySlugs(['a', 'b'], 'en');
    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), {
      lang: 'en',
      slugs: ['a', 'b'],
    });
  });

  it('returns [] (fail-safe) on a Sanity error', async () => {
    fetchMock.mockRejectedValue(new Error('boom'));
    expect(await getBooksBySlugs(['a'], 'es')).toEqual([]);
  });
});
