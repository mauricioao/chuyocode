import { describe, it, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import Header from './Header.astro';
import { UI_LABELS } from '@lib/i18n';

// PR 4 (nav-structure) — design decision #9.
// Header is a pure Astro component: the ThemeToggle island arrives via the
// `theme-toggle` slot, so Header rendered alone (no slot) has no island and
// the Container API renders it fully. These tests pin the disabled English
// nav slot behavior (non-interactive, badged, present in desktop + mobile).
describe('Header.astro — English nav slot', () => {
  it('renders the primary nav labels for the active locale', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(Header, {
      props: { lang: 'es' },
    });
    expect(html).toContain(UI_LABELS.es.nav.home);
    expect(html).toContain(UI_LABELS.es.nav.books);
    expect(html).toContain(UI_LABELS.es.nav.news);
  });

  it('renders a disabled, badged English slot (aria-disabled, no href)', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(Header, {
      props: { lang: 'es' },
    });
    expect(html).toContain(UI_LABELS.es.nav.english);
    expect(html).toContain(UI_LABELS.es.nav.soon);
    // Non-interactive by construction: exposed as disabled + removed from tab order.
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain('cursor-not-allowed');
    // No navigation: the English slot must not be an anchor with an href.
    expect(html).not.toContain('/es/english');
  });

  it('localizes the English badge (en -> Soon)', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(Header, {
      props: { lang: 'en' },
    });
    expect(html).toContain('Soon');
  });

  it('renders the disabled English slot in both desktop and mobile menus', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(Header, {
      props: { lang: 'es' },
    });
    // The slot is duplicated across the desktop <nav> and the mobile <nav>,
    // so the disabled marker must appear at least twice.
    const matches = html.match(/aria-disabled="true"/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('builds language switch paths without double slashes on nested pages', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(Header, {
      props: { lang: 'es' },
      request: new Request('http://localhost/es/libros'),
    });
    expect(html).toContain('href="/en/libros"');
    expect(html).not.toContain('es//');
    expect(html).not.toContain('en//');
  });

  it('renders no hydration island when the theme-toggle slot is empty', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(Header, {
      props: { lang: 'es' },
    });
    expect(html).not.toContain('astro-island');
  });
});
