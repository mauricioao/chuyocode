import { describe, it, expect } from 'vitest';
import BaseLayout from './BaseLayout.astro';
import { UI_LABELS } from '@lib/i18n';
import { createContainer } from '@/testSupport/astroContainer';

// `fullHeight` (floating side toolbar pass, owner request: the editor page
// must not scroll at the page level) is OPT-IN — every other page keeps
// rendering exactly the same `body`/`main` classes it always has.
describe('BaseLayout — full-height mode is opt-in', () => {
  it('defaults to normal document flow: no lg:h-dvh, no lg:overflow-hidden on body/main', async () => {
    const container = await createContainer();
    const html = await container.renderToString(BaseLayout, {
      props: { lang: 'es' },
      slots: { default: '<div>content</div>' },
    });
    expect(html).toContain('min-h-screen');
    expect(html).not.toContain('h-dvh');
    expect(html).not.toContain('lg:overflow-hidden');
  });

  it('opting in adds lg:-only non-scrolling body/main classes, on top of (not instead of) the normal-flow ones', async () => {
    const container = await createContainer();
    const html = await container.renderToString(BaseLayout, {
      props: { lang: 'es', fullHeight: true },
      slots: { default: '<div>content</div>' },
    });
    // Narrow screens still get the normal-flow classes (owner request: below
    // lg, every page — including this one — keeps ordinary scrolling).
    expect(html).toContain('min-h-screen');
    // lg+ gets the bounded, non-scrolling pair.
    expect(html).toContain('lg:h-dvh');
    expect(html).toContain('lg:overflow-hidden');
    expect(html).toContain('lg:min-h-0');
  });
});

// Navigation-without-flicker PR: only the main content cross-fades on
// navigation; header/footer/progress bar are excluded (persisted or
// animate="none") so there is never a double-content cross-fade.
describe('BaseLayout — navigation transitions (navigation-without-flicker PR)', () => {
  it('mounts the navigation progress bar', async () => {
    const container = await createContainer();
    const html = await container.renderToString(BaseLayout, {
      props: { lang: 'es' },
      slots: { default: '<div>content</div>' },
    });
    expect(html).toContain('id="nav-progress-bar"');
  });

  it('gives <main> its own transition scope (a fade), distinct from the rest of the page', async () => {
    const container = await createContainer();
    const html = await container.renderToString(BaseLayout, {
      props: { lang: 'es' },
      slots: { default: '<div>content</div>' },
    });
    const mainOpenTag = html.slice(html.indexOf('<main'), html.indexOf('>', html.indexOf('<main')) + 1);
    expect(mainOpenTag).toContain('data-astro-transition-scope');
  });

  it('excludes the footer from the page fade animation', async () => {
    const container = await createContainer();
    const html = await container.renderToString(BaseLayout, {
      props: { lang: 'es' },
      slots: { default: '<div>content</div>' },
    });
    const footerOpenTag = html.slice(html.indexOf('<footer'), html.indexOf('>', html.indexOf('<footer')) + 1);
    expect(footerOpenTag).toContain('data-astro-transition-scope');
  });

  it('persists the header across navigations', async () => {
    const container = await createContainer();
    const html = await container.renderToString(BaseLayout, {
      props: { lang: 'es' },
      slots: { default: '<div>content</div>' },
    });
    expect(html).toContain('data-astro-transition-persist');
  });
});

// Visual-theme pass ("dark brand, light product"): `theme="ingles"` is the
// one switch every Inglés route flips. Omitted (every other page, unchanged)
// keeps `<html class="dark">`; given, `<html>` gets `data-theme="ingles"`
// instead and drops `dark` — see `src/styles/global.css`'s own header for
// the two scopes this drives. Either way, the header/footer/nav progress
// bar/global scroll-to-top stay wrapped in their OWN `data-theme="brand"` +
// `class="dark"` scope, so they are forced dark regardless of the page.
describe('BaseLayout — visual-theme scope (theme prop)', () => {
  it('defaults <html> to the dark scope: class="dark", no data-theme', async () => {
    const container = await createContainer();
    const html = await container.renderToString(BaseLayout, {
      props: { lang: 'es' },
      slots: { default: '<div>content</div>' },
    });
    const htmlTag = html.slice(html.indexOf('<html'), html.indexOf('>', html.indexOf('<html')) + 1);
    expect(htmlTag).toContain('class="scroll-smooth dark"');
    expect(htmlTag).not.toContain('data-theme');
  });

  it('theme="ingles" swaps <html> to data-theme="ingles" and drops the dark class', async () => {
    const container = await createContainer();
    const html = await container.renderToString(BaseLayout, {
      props: { lang: 'es', theme: 'ingles' },
      slots: { default: '<div>content</div>' },
    });
    const htmlTag = html.slice(html.indexOf('<html'), html.indexOf('>', html.indexOf('<html')) + 1);
    expect(htmlTag).toContain('data-theme="ingles"');
    expect(htmlTag).toContain('class="scroll-smooth"');
    // Not just absent from a longer class list — no `dark` token at all.
    expect(htmlTag).not.toMatch(/class="[^"]*\bdark\b[^"]*"/);
  });

  it('wraps the header, footer, nav progress bar and global scroll-to-top in the brand scope, even on a theme="ingles" page', async () => {
    const container = await createContainer();
    const html = await container.renderToString(BaseLayout, {
      props: { lang: 'es', theme: 'ingles' },
      slots: { default: '<div>content</div>' },
    });
    const brandWrappers = html.match(/data-theme="brand" class="dark contents"/g) ?? [];
    // Nav progress bar, header, footer, global scroll-to-top — exactly four.
    expect(brandWrappers).toHaveLength(4);
    // Each wrapper actually precedes the chrome it protects, in document order.
    expect(html.indexOf('data-theme="brand"')).toBeLessThan(html.indexOf('id="nav-progress-bar"'));
    expect(html.indexOf('data-theme="brand"', html.indexOf('id="nav-progress-bar"'))).toBeLessThan(
      html.indexOf('<header'),
    );
    expect(html.indexOf('data-theme="brand"', html.indexOf('<header'))).toBeLessThan(html.indexOf('<footer'));
  });

  it('still wraps the chrome in the brand scope on an ordinary (non-Inglés) page', async () => {
    const container = await createContainer();
    const html = await container.renderToString(BaseLayout, {
      props: { lang: 'es' },
      slots: { default: '<div>content</div>' },
    });
    expect(html.match(/data-theme="brand" class="dark contents"/g) ?? []).toHaveLength(4);
  });
});

// Presentation mode v1 ("Preguntas"): `bare` drops the site chrome (nav
// progress bar, header, footer, global scroll-to-top) so a page can be
// exactly its own full-bleed content. Opt-in — every page that omits it
// keeps every existing chrome wrapper, unchanged (asserted above).
describe('BaseLayout — bare mode (no site chrome)', () => {
  it('defaults to the full chrome: omitting `bare` changes nothing', async () => {
    const container = await createContainer();
    const html = await container.renderToString(BaseLayout, {
      props: { lang: 'es' },
      slots: { default: '<div>content</div>' },
    });
    expect(html.match(/data-theme="brand" class="dark contents"/g) ?? []).toHaveLength(4);
  });

  it('drops the nav progress bar, header, footer and global scroll-to-top', async () => {
    const container = await createContainer();
    const html = await container.renderToString(BaseLayout, {
      props: { lang: 'es', bare: true },
      slots: { default: '<div>content</div>' },
    });
    expect(html.match(/data-theme="brand" class="dark contents"/g) ?? []).toHaveLength(0);
    expect(html).not.toContain('id="nav-progress-bar"');
    expect(html).not.toContain('<header');
    expect(html).not.toContain('<footer');
  });

  it('keeps the skip-link, the toast host, and the slot content inside <main>', async () => {
    const container = await createContainer();
    const html = await container.renderToString(BaseLayout, {
      props: { lang: 'es', bare: true },
      slots: { default: '<div data-testid="bare-content">content</div>' },
    });
    expect(html).toContain('skip-link');
    expect(html).toContain('data-testid="bare-content"');
    const mainStart = html.indexOf('<main');
    const contentIndex = html.indexOf('data-testid="bare-content"');
    expect(contentIndex).toBeGreaterThan(mainStart);
  });

  it('composes with theme="ingles" (the one current caller, presentar.astro)', async () => {
    const container = await createContainer();
    const html = await container.renderToString(BaseLayout, {
      props: { lang: 'es', bare: true, theme: 'ingles' },
      slots: { default: '<div>content</div>' },
    });
    const htmlTag = html.slice(html.indexOf('<html'), html.indexOf('>', html.indexOf('<html')) + 1);
    expect(htmlTag).toContain('data-theme="ingles"');
    expect(html.match(/data-theme="brand" class="dark contents"/g) ?? []).toHaveLength(0);
  });
});

// SEO basics pass: canonical/hreflang/robots/og:locale are derived from
// `Astro.site` + `Astro.url.pathname` (`@lib/seo.ts`), not from per-page
// props — a `request` controls both for these tests. `Astro.site` comes from
// the REAL `astro.config.mjs` (vitest.astro.config.ts wraps Astro's
// `getViteConfig()`), and `process.env.URL` is unset in this test run, so it
// resolves to the literal `https://chuyocode.netlify.app` fallback.
describe('BaseLayout — canonical + hreflang (SEO basics pass)', () => {
  it('renders a canonical link built from `site`, not the request host', async () => {
    const container = await createContainer();
    const html = await container.renderToString(BaseLayout, {
      props: { lang: 'es' },
      slots: { default: '<div>content</div>' },
      request: new Request('https://some-preview-deploy.netlify.app/es/libros'),
    });
    expect(html).toContain(
      '<link rel="canonical" href="https://chuyocode.netlify.app/es/libros">',
    );
  });

  it('drops the query string from the canonical URL', async () => {
    const container = await createContainer();
    const html = await container.renderToString(BaseLayout, {
      props: { lang: 'es' },
      slots: { default: '<div>content</div>' },
      request: new Request('https://chuyocode.netlify.app/es/ingles/actividades?orden=gustadas'),
    });
    expect(html).toContain(
      '<link rel="canonical" href="https://chuyocode.netlify.app/es/ingles/actividades">',
    );
  });

  it('emits es/en hreflang alternates plus x-default pointing at es', async () => {
    const container = await createContainer();
    const html = await container.renderToString(BaseLayout, {
      props: { lang: 'en' },
      slots: { default: '<div>content</div>' },
      request: new Request('https://chuyocode.netlify.app/en/libros'),
    });
    expect(html).toContain(
      '<link rel="alternate" hreflang="es" href="https://chuyocode.netlify.app/es/libros">',
    );
    expect(html).toContain(
      '<link rel="alternate" hreflang="en" href="https://chuyocode.netlify.app/en/libros">',
    );
    expect(html).toContain(
      '<link rel="alternate" hreflang="x-default" href="https://chuyocode.netlify.app/es/libros">',
    );
  });

  it('sets og:url and og:locale from the current lang, plus the alternate locale', async () => {
    const container = await createContainer();
    const html = await container.renderToString(BaseLayout, {
      props: { lang: 'es' },
      slots: { default: '<div>content</div>' },
      request: new Request('https://chuyocode.netlify.app/es/libros'),
    });
    expect(html).toContain(
      '<meta property="og:url" content="https://chuyocode.netlify.app/es/libros">',
    );
    expect(html).toContain('<meta property="og:locale" content="es_PE">');
    expect(html).toContain('<meta property="og:locale:alternate" content="en_US">');
  });
});

// Gated sections are rendered (the gate decides who sees them) but excluded
// from search results — `noindex` is a pure path rule (`@lib/seo.ts`), so a
// `request` URL alone decides it here, with no need to render the real
// gated page and its own auth/session machinery.
describe('BaseLayout — noindex on gated paths (SEO basics pass)', () => {
  it('adds <meta name="robots" content="noindex"> on an auth page', async () => {
    const container = await createContainer();
    const html = await container.renderToString(BaseLayout, {
      props: { lang: 'es' },
      slots: { default: '<div>content</div>' },
      request: new Request('https://chuyocode.netlify.app/es/auth/entrar'),
    });
    expect(html).toContain('<meta name="robots" content="noindex">');
  });

  it('omits the robots meta on a public page', async () => {
    const container = await createContainer();
    const html = await container.renderToString(BaseLayout, {
      props: { lang: 'es' },
      slots: { default: '<div>content</div>' },
      request: new Request('https://chuyocode.netlify.app/es/libros'),
    });
    expect(html).not.toContain('name="robots"');
  });

  it('omits the robots meta on the guest-play practice page, even though it is under ingles/**', async () => {
    const container = await createContainer();
    const html = await container.renderToString(BaseLayout, {
      props: { lang: 'es' },
      slots: { default: '<div>content</div>' },
      request: new Request('https://chuyocode.netlify.app/es/ingles/actividades/abc123'),
    });
    expect(html).not.toContain('name="robots"');
  });

  it('adds the robots meta on the gated activities catalog (no id)', async () => {
    const container = await createContainer();
    const html = await container.renderToString(BaseLayout, {
      props: { lang: 'es' },
      slots: { default: '<div>content</div>' },
      request: new Request('https://chuyocode.netlify.app/es/ingles/actividades'),
    });
    expect(html).toContain('<meta name="robots" content="noindex">');
  });
});

// Stop shipping the whole i18n dictionary on every page (perf pass): the
// global `ScrollToTop` — hydrated on EVERY page — now receives only its own
// `{ scrollToTop }` string as a plain prop, computed here server-side from
// `UI_LABELS[lang].common`, instead of importing the full dictionary itself.
describe('BaseLayout — global ScrollToTop labels (i18n props pass)', () => {
  it('passes the Spanish scrollToTop label', async () => {
    const container = await createContainer();
    const html = await container.renderToString(BaseLayout, {
      props: { lang: 'es' },
      slots: { default: '<div>content</div>' },
    });
    expect(html).toContain(UI_LABELS.es.common.scrollToTop);
  });

  it('passes the English scrollToTop label, never the Spanish one', async () => {
    const container = await createContainer();
    const html = await container.renderToString(BaseLayout, {
      props: { lang: 'en' },
      slots: { default: '<div>content</div>' },
    });
    expect(html).toContain(UI_LABELS.en.common.scrollToTop);
    expect(html).not.toContain(UI_LABELS.es.common.scrollToTop);
  });
});
