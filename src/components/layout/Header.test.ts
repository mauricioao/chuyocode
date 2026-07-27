import { describe, it, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import Header from './Header.astro';
import { UI_LABELS } from '@lib/i18n';

// Header is a pure Astro component with dark-only, Spanish-only chrome: no theme
// toggle, no language toggle, and no disabled English slot. These tests pin the
// primary nav and the absence of the removed controls.
describe('Header.astro — nav', () => {
  it('renders the primary nav labels for the active locale', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(Header, {
      props: { lang: 'es' },
    });
    expect(html).toContain(UI_LABELS.es.nav.books);
    expect(html).toContain(UI_LABELS.es.nav.news);
    expect(html).toContain(UI_LABELS.es.nav.courses);
    expect(html).toContain(UI_LABELS.es.nav.englishLink);
  });

  it('drops the Inicio (home) nav link', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(Header, {
      props: { lang: 'es' },
    });
    // The home link was removed; the masthead logo now carries the home route.
    expect(html).not.toContain(`>${UI_LABELS.es.nav.home}<`);
  });

  it('links Cursos and Inglés to their (future) localized routes', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(Header, {
      props: { lang: 'es' },
    });
    expect(html).toContain('href="/es/cursos"');
    expect(html).toContain('href="/es/ingles"');
  });

  it('renders the masthead logo image pointing at /chuyocode.svg', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(Header, {
      props: { lang: 'es' },
    });
    expect(html).toContain('src="/chuyocode.svg"');
    expect(html).toContain('alt="ChuyoCode"');
  });

  it('renders no language toggle', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(Header, {
      props: { lang: 'es' },
    });
    expect(html).not.toContain('lang-toggle');
    // No language-switch anchors remain in the chrome.
    expect(html).not.toContain('href="/en/"');
  });

  it('renders no disabled English slot', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(Header, {
      props: { lang: 'es' },
    });
    expect(html).not.toContain('aria-disabled="true"');
    expect(html).not.toContain('cursor-not-allowed');
  });

  it('renders no hydration island (no theme toggle)', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(Header, {
      props: { lang: 'es' },
    });
    expect(html).not.toContain('astro-island');
  });
});
