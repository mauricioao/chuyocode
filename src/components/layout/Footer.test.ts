import { describe, it, expect } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import Footer from './Footer.astro';
import { UI_LABELS } from '@lib/i18n';

// PR 4 (nav-structure) — design decision #9.
// Footer is a pure Astro component (no island), so the Container API renders
// it fully. These tests pin the secondary links to the real, localized legal
// route `/[lang]/legal/[page]` (they previously 404'd at /terminos, /privacidad).
describe('Footer.astro — legal links', () => {
  it('points the terms/privacy links at /[lang]/legal/[page]', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(Footer, {
      props: { lang: 'es' },
    });
    expect(html).toContain('href="/es/legal/terms"');
    expect(html).toContain('href="/es/legal/privacy"');
    // The dead routes must be gone.
    expect(html).not.toContain('/es/terminos');
    expect(html).not.toContain('/es/privacidad');
  });

  it('localizes the link labels and base path for en', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(Footer, {
      props: { lang: 'en' },
    });
    expect(html).toContain('href="/en/legal/terms"');
    expect(html).toContain('href="/en/legal/privacy"');
    expect(html).toContain(UI_LABELS.en.footer.terms);
    expect(html).toContain(UI_LABELS.en.footer.privacy);
  });
});
