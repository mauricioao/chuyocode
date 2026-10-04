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
  RESERVED_THEMES: [],
}));

vi.mock('@lib/downloads', () => ({
  getMostDownloaded: vi.fn(async () => []),
}));

import HomePage from './index.astro';

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

describe('GET /[lang]/ — Inglés section (es)', () => {
  it('renders the section heading, intro and both cards', async () => {
    const res = await render('https://chuyocode.test/es/', {
      params: { lang: 'es' },
      locals: { lang: 'es' },
    });
    expect(res.status).toBe(200);
    const html = await res.text();

    expect(html).toContain('Inglés en ChuyoCode');
    expect(html).toContain(
      'Actividades interactivas para enseñar y practicar inglés, en español.',
    );

    expect(html).toContain('Para docentes');
    expect(html).toContain('Tu ficha, ahora interactiva');
    expect(html).toContain(
      'Sube tu ficha o PDF, marca las respuestas y proyéctala en clase. Gratis.',
    );

    expect(html).toContain('Para aprender');
    expect(html).toContain('Practica a tu ritmo');
    expect(html).toContain(
      'Actividades y juegos por nivel, con explicaciones en español cuando te equivocas.',
    );
  });

  it('renders both CTAs with the correct hrefs', async () => {
    const res = await render('https://chuyocode.test/es/', {
      params: { lang: 'es' },
      locals: { lang: 'es' },
    });
    const html = await res.text();

    expect(html).toContain('data-testid="home-ingles-cta-crear"');
    expect(html).toContain('href="/es/crear"');
    expect(html).toContain('Crear mi actividad');

    expect(html).toContain('data-testid="home-ingles-cta-actividades"');
    expect(html).toContain('href="/es/ingles/actividades"');
    expect(html).toContain('Explorar actividades');
  });
});

describe('GET /[lang]/ — Inglés section (en)', () => {
  it('renders the section heading, intro and both cards', async () => {
    const res = await render('https://chuyocode.test/en/', {
      params: { lang: 'en' },
      locals: { lang: 'en' },
    });
    expect(res.status).toBe(200);
    const html = await res.text();

    expect(html).toContain('English on ChuyoCode');
    expect(html).toContain(
      'Interactive activities to teach and practice English, explained in Spanish.',
    );

    expect(html).toContain('For teachers');
    expect(html).toContain('Your worksheet, now interactive');
    expect(html).toContain(
      'Upload your worksheet or PDF, mark the answers and project it in class. Free.',
    );

    expect(html).toContain('For learners');
    expect(html).toContain('Practice at your own pace');
    expect(html).toContain(
      'Activities and games by level, with explanations in Spanish when you get it wrong.',
    );
  });

  it('renders both CTAs with the correct hrefs', async () => {
    const res = await render('https://chuyocode.test/en/', {
      params: { lang: 'en' },
      locals: { lang: 'en' },
    });
    const html = await res.text();

    expect(html).toContain('data-testid="home-ingles-cta-crear"');
    expect(html).toContain('href="/en/crear"');
    expect(html).toContain('Create my activity');

    expect(html).toContain('data-testid="home-ingles-cta-actividades"');
    expect(html).toContain('href="/en/ingles/actividades"');
    expect(html).toContain('Explore activities');
  });
});

describe('GET /[lang]/ — public cache safety', () => {
  // The home page applies `publicCachePolicy()` on the assumption its markup
  // is byte-identical for every visitor (see `src/lib/httpCache.ts` and
  // `src/pages/[lang]/auth/entrar.astro`'s header for the hazard this guards
  // against). The new Inglés section must not break that invariant: it reads
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
