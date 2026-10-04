import { describe, it, expect, afterEach, vi } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import Footer from './Footer.astro';
import { UI_LABELS } from '@lib/i18n';

// PR 4 (nav-structure) — design decision #9.
// Footer is a pure Astro component (no island), so the Container API renders
// it fully. These tests pin the secondary links to the real, localized legal
// route `/[lang]/legal/[page]` (they previously 404'd at /terminos, /privacidad).

// Astro escapes text content, so a label containing `&` (e.g. "Terms &
// Conditions") renders as `&amp;` in the HTML. Escape the expected label the
// same way before matching so the assertion checks the localized label, not a
// specific punctuation encoding.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

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
    expect(html).toContain(escapeHtml(UI_LABELS.en.footer.terms));
    expect(html).toContain(escapeHtml(UI_LABELS.en.footer.privacy));
  });
});

// Credits page link (visual-identity decision, 2026-10-04).
describe('Footer.astro — credits link', () => {
  it('links to /[lang]/creditos next to the legal links', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(Footer, {
      props: { lang: 'es' },
    });
    expect(html).toContain('href="/es/creditos"');
    expect(html).toContain(UI_LABELS.es.footer.credits);
  });

  it('localizes the credits link label and base path for en', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(Footer, {
      props: { lang: 'en' },
    });
    expect(html).toContain('href="/en/creditos"');
    expect(html).toContain(UI_LABELS.en.footer.credits);
  });
});

// SEO basics pass: the copyright year used to be a hardcoded "2026" literal
// in the markup — it would have gone stale the moment the calendar turned.
// Pinning the system clock to a year that is NOT today's proves the value is
// actually computed, not a coincidence of running this test in 2026.
describe('Footer.astro — copyright year', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('computes the year from the current date instead of a hardcoded value', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-06-15T00:00:00Z'));

    const container = await AstroContainer.create();
    const html = await container.renderToString(Footer, {
      props: { lang: 'es' },
    });

    expect(html).toContain('2030 ChuyoCode');
    expect(html).not.toContain('2026 ChuyoCode');
  });
});
