import { describe, it, expect, vi } from 'vitest';
import { createContainer } from '@/testSupport/astroContainer';

// The home page SSR-fetches every discovery section directly from
// `@lib/sanity` / `@lib/downloads`. Mock both wholesale so the test drives
// static, predictable data with no network — same approach as
// `mis-actividades/_index.test.ts`. Empty results collapse every discovery
// section (design decision #8), which keeps this test focused on the new
// Inglés section instead of unrelated Sanity row/spotlight markup.
vi.mock('@lib/sanity', () => ({
  getHeroItems: vi.fn(async () => []),
  getRowsByTheme: vi.fn(async () => []),
  getSpotlights: vi.fn(async () => []),
  themeTitle: (slug: string) => slug,
  // Matches the real constant; with `getRowsByTheme` resolving to `[]` by
  // default no reserved row renders, so only the order test below adds one.
  RESERVED_THEMES: ['recomendados'],
}));

vi.mock('@lib/downloads', () => ({
  getMostDownloaded: vi.fn(async () => []),
}));

import HomePage from './index.astro';
import { getRowsByTheme } from '@lib/sanity';

describe('GET /[lang]/ — section order', () => {
  it('places the Inglés section right below "Libros Recomendados"', async () => {
    vi.mocked(getRowsByTheme).mockResolvedValueOnce([
      {
        themeTag: 'recomendados',
        items: [
          {
            _id: 'book-1',
            kind: 'book',
            title: 'Libro de prueba',
            slug: 'libro-de-prueba',
            href: '/es/libros/libro-de-prueba',
            asset: null,
          },
        ],
      },
    ] as unknown as Awaited<ReturnType<typeof getRowsByTheme>>);

    const res = await render('https://chuyocode.test/es/', {
      params: { lang: 'es' },
      locals: { lang: 'es' },
    });
    const html = await res.text();

    const recommendedAt = html.indexOf('Libro de prueba');
    const inglesAt = html.indexOf('data-testid="home-ingles-section"');
    expect(recommendedAt).toBeGreaterThan(-1);
    expect(inglesAt).toBeGreaterThan(recommendedAt);
  });
});

/** Render the home page with route params + middleware locals. */
async function render(
  url: string,
  { params, locals }: { params: Record<string, string>; locals?: Record<string, unknown> },
) {
  const container = await createContainer();
  return container.renderToResponse(HomePage, {
    // `App.Locals.user` is required, never optional — default to an
    // anonymous visitor; a caller may override it.
    locals: { user: null, ...locals },
    params,
    request: new Request(url),
  });
}

describe('GET /[lang]/ — Inglés banner', () => {
  const cases = [
    {
      lang: 'es',
      label: 'Inglés · English',
      title: 'Aprende y enseña inglés jugando',
      intro: 'Actividades interactivas para enseñar y practicar inglés, en español.',
      teachersCta: 'Crear mi actividad',
      learnersCta: 'Explorar actividades',
      note: 'Crear y jugar es gratis.',
    },
    {
      lang: 'en',
      label: 'English · Inglés',
      title: 'Learn and teach English through play',
      intro: 'Interactive activities to teach and practice English, explained in Spanish.',
      teachersCta: 'Create my activity',
      learnersCta: 'Explore activities',
      note: 'Creating and playing is free.',
    },
  ] as const;

  for (const c of cases) {
    it(`renders the copy and both entry points (${c.lang})`, async () => {
      const res = await render(`https://chuyocode.test/${c.lang}/`, {
        params: { lang: c.lang },
        locals: { lang: c.lang },
      });
      expect(res.status).toBe(200);
      const html = await res.text();

      for (const text of [c.label, c.title, c.intro, c.note, c.teachersCta, c.learnersCta]) {
        expect(html).toContain(text);
      }
      expect(html).toMatch(/<h2[^>]*id="home-ingles-heading"[^>]*>/);
      expect(html).toContain(`href="/${c.lang}/crear"`);
      expect(html).toContain(`href="/${c.lang}/ingles/actividades"`);
    });
  }

  it('scopes the light Inglés palette to the banner only', async () => {
    const res = await render('https://chuyocode.test/es/', {
      params: { lang: 'es' },
      locals: { lang: 'es' },
    });
    const html = await res.text();
    expect(html).toMatch(/<section[^>]*data-testid="home-ingles-section"[^>]*data-theme="ingles"/);
    expect(html).not.toMatch(/<html[^>]*data-theme="ingles"/);
  });

  it('serves the art as lazy, art-directed AVIF and WebP with a reserved box', async () => {
    const res = await render('https://chuyocode.test/es/', {
      params: { lang: 'es' },
      locals: { lang: 'es' },
    });
    const html = await res.text();

    expect(html).toContain('ingles-banner-v1-desktop-1920.avif 1920w');
    expect(html).toContain('ingles-banner-v1-desktop-1920.webp 1920w');
    expect(html).toContain('ingles-banner-v1-mobile-1080.avif 1080w');
    expect(html).toContain('ingles-banner-v1-mobile-1080.webp 1080w');
    expect(html).toMatch(/<source[^>]*media="\(min-width: 768px\)"[^>]*type="image\/avif"/);

    const img = html.match(/<img[^>]*data-testid="home-ingles-banner-image"[^>]*>/)?.[0] ?? '';
    expect(img).toContain('loading="lazy"');
    expect(img).toContain('decoding="async"');
    expect(img).toContain('alt=""');
    expect(img).toContain('width="1536"');
    expect(img).toContain('height="2752"');
  });
});

describe('GET /[lang]/ — public cache safety', () => {
  // The home page applies `publicCachePolicy()` on the assumption its markup
  // is byte-identical for every visitor (see `src/lib/httpCache.ts` and
  // `src/pages/[lang]/auth/entrar.astro`'s header for the hazard this guards
  // against). The Inglés banner must not break that invariant: it reads
  // no `Astro.locals.user`, only localized copy and plain links.
  it('renders byte-identical HTML for an anonymous and a signed-in visitor', async () => {
    const resAnon = await render('https://chuyocode.test/es/', {
      params: { lang: 'es' },
      locals: { lang: 'es', user: null },
    });
    const resUser = await render('https://chuyocode.test/es/', {
      params: { lang: 'es' },
      locals: { lang: 'es', user: { id: 'user-1' } },
    });

    const htmlAnon = await resAnon.text();
    const htmlUser = await resUser.text();
    expect(htmlUser).toBe(htmlAnon);
  });

  it('keeps the public edge-cache header', async () => {
    const res = await render('https://chuyocode.test/es/', {
      params: { lang: 'es' },
      locals: { lang: 'es' },
    });
    expect(res.headers.get('CDN-Cache-Control')).toBe(
      'public, s-maxage=3600, stale-while-revalidate=86400',
    );
  });
});

describe('GET /[lang]/ — meta description', () => {
  it('mentions English for es', async () => {
    const res = await render('https://chuyocode.test/es/', {
      params: { lang: 'es' },
      locals: { lang: 'es' },
    });
    const html = await res.text();
    expect(html).toContain(
      '<meta name="description" content="ChuyoCode: inglés y tecnología en tu idioma.',
    );
  });

  it('mentions English for en', async () => {
    const res = await render('https://chuyocode.test/en/', {
      params: { lang: 'en' },
      locals: { lang: 'en' },
    });
    const html = await res.text();
    expect(html).toContain(
      '<meta name="description" content="ChuyoCode: English and technology in your language.',
    );
  });
});

// SEO basics pass: Organization + WebSite JSON-LD, home page only. `site`
// comes from the real astro.config.mjs (vitest.astro.config.ts wraps Astro's
// own getViteConfig()); `process.env.URL` is unset in this test run, so it
// resolves to the literal `https://chuyocode.netlify.app` fallback.
describe('GET /[lang]/ — structured data (JSON-LD)', () => {
  it('renders valid Organization and WebSite JSON-LD', async () => {
    const res = await render('https://chuyocode.test/es/', {
      params: { lang: 'es' },
      locals: { lang: 'es' },
    });
    const html = await res.text();

    const blocks = [
      ...html.matchAll(
        /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
      ),
    ].map((m) => JSON.parse(m[1]) as Record<string, unknown>);

    const organization = blocks.find((b) => b['@type'] === 'Organization');
    const website = blocks.find((b) => b['@type'] === 'WebSite');

    expect(organization).toMatchObject({
      '@context': 'https://schema.org',
      name: 'ChuyoCode',
      url: 'https://chuyocode.netlify.app/',
      logo: 'https://chuyocode.netlify.app/chuyocode.svg',
    });
    expect(website).toMatchObject({
      '@context': 'https://schema.org',
      name: 'ChuyoCode',
      url: 'https://chuyocode.netlify.app/',
    });
  });
});
