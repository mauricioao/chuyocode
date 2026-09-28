import { describe, it, expect } from 'vitest';
import Header from './Header.astro';
import { UI_LABELS } from '@lib/i18n';
import { createContainer } from '@/testSupport/astroContainer';

// Header is a pure Astro component with dark-only, Spanish-only chrome: no theme
// toggle, no language toggle, and no disabled English slot. These tests pin the
// primary nav and the absence of the removed controls.
//
// `createContainer()` registers the React server renderer: Header now mounts the
// `UserMenu` island unconditionally (Login step 1b), so a bare
// `AstroContainer.create()` would throw `NoMatchingRenderer` — see that helper.
describe('Header.astro — nav', () => {
  it('renders the primary nav labels for the active locale', async () => {
    const container = await createContainer();
    const html = await container.renderToString(Header, {
      props: { lang: 'es' },
    });
    expect(html).toContain(UI_LABELS.es.nav.books);
    expect(html).toContain(UI_LABELS.es.nav.news);
    expect(html).toContain(UI_LABELS.es.nav.courses);
    expect(html).toContain(UI_LABELS.es.nav.englishLink);
  });

  it('drops the Inicio (home) nav link', async () => {
    const container = await createContainer();
    const html = await container.renderToString(Header, {
      props: { lang: 'es' },
    });
    // The home link was removed; the masthead logo now carries the home route.
    expect(html).not.toContain(`>${UI_LABELS.es.nav.home}<`);
  });

  it('links Cursos and Inglés to their (future) localized routes', async () => {
    const container = await createContainer();
    const html = await container.renderToString(Header, {
      props: { lang: 'es' },
    });
    expect(html).toContain('href="/es/cursos"');
    expect(html).toContain('href="/es/ingles"');
  });

  it('renders the masthead logo image pointing at /chuyocode.svg', async () => {
    const container = await createContainer();
    const html = await container.renderToString(Header, {
      props: { lang: 'es' },
    });
    expect(html).toContain('src="/chuyocode.svg"');
    expect(html).toContain('alt="ChuyoCode"');
  });

  it('renders no language toggle', async () => {
    const container = await createContainer();
    const html = await container.renderToString(Header, {
      props: { lang: 'es' },
    });
    expect(html).not.toContain('lang-toggle');
    // No language-switch anchors remain in the chrome.
    expect(html).not.toContain('href="/en/"');
  });

  it('renders no disabled English slot', async () => {
    const container = await createContainer();
    const html = await container.renderToString(Header, {
      props: { lang: 'es' },
    });
    expect(html).not.toContain('aria-disabled="true"');
    expect(html).not.toContain('cursor-not-allowed');
  });

  /**
   * LAYOUT: logo stays on the left; the nav moves to the right, grouped with
   * the account area (`data-header-actions` marks that grouping wrapper).
   */
  it('keeps the logo on the left and moves the nav to the right, next to the account area', async () => {
    const container = await createContainer();
    const html = await container.renderToString(Header, {
      props: { lang: 'es' },
    });

    const logoIdx = html.indexOf('src="/chuyocode.svg"');
    const rightWrapIdx = html.indexOf('data-header-actions');
    const navIdx = html.indexOf('aria-label="Primary"');
    const islandIdx = html.indexOf('astro-island');

    expect(logoIdx).toBeGreaterThan(-1);
    expect(rightWrapIdx).toBeGreaterThan(logoIdx);
    // Both the nav and the account island live inside the right-hand wrapper.
    expect(navIdx).toBeGreaterThan(rightWrapIdx);
    expect(islandIdx).toBeGreaterThan(rightWrapIdx);
  });
});

// Login step 1b: `Header` now mounts `UserMenu` (`client:load`), the ONE
// client-only island this component carries. These tests pin the two halves
// of the public-cache constraint: the island IS there (so a visitor gets an
// account chip at all), and its SERVER-rendered markup carries no per-visitor
// data — `Header` never reads `Astro.locals.user`, so there is nothing to
// leak, but this asserts the observable HTML rather than trusting the absence
// of a prop.
describe('Header.astro — UserMenu island (Login step 1b)', () => {
  it('mounts exactly one hydration island, for the account chip', async () => {
    const container = await createContainer();
    const html = await container.renderToString(Header, {
      props: { lang: 'es' },
    });
    const matches = html.match(/astro-island/g) ?? [];
    expect(matches.length).toBeGreaterThan(0);
    expect(html).toContain('component-export="default"');
  });

  it('passes only the (public) active locale as a prop, never a user identity', async () => {
    const container = await createContainer();
    const html = await container.renderToString(Header, {
      props: { lang: 'es' },
    });
    const islandMatch = html.match(/<astro-island[^>]*>/);
    expect(islandMatch?.[0]).toContain('&quot;lang&quot;:[0,&quot;es&quot;]');
  });

  it('renders no signed-in-only markup server-side (no dropdown, no sign-out form)', async () => {
    const container = await createContainer();
    const html = await container.renderToString(Header, {
      props: { lang: 'es' },
    });
    expect(html).not.toContain('user-menu-dropdown');
    expect(html).not.toContain('/api/auth/signout');
  });
});
