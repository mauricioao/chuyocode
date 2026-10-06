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

// Premium pricing page link (owner decision 2026-10-04) — footer only, never
// the header (that stays untouched by this change).
describe('Footer.astro — Premium link', () => {
  it('links to /[lang]/premium in es', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(Footer, {
      props: { lang: 'es' },
    });
    expect(html).toContain('href="/es/premium"');
    expect(html).toContain(escapeHtml(UI_LABELS.es.footer.premium));
  });

  it('links to /[lang]/premium in en', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(Footer, {
      props: { lang: 'en' },
    });
    expect(html).toContain('href="/en/premium"');
    expect(html).toContain(escapeHtml(UI_LABELS.en.footer.premium));
  });
});

// Refund Policy link (third legal document, RefundsContent.astro). The
// `reembolsos` slug is deliberately the SAME in both languages — see
// `legal/[page].astro`'s own `LEGAL_PAGES` comment.
describe('Footer.astro — Refunds link', () => {
  it('links to /[lang]/legal/reembolsos in es', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(Footer, {
      props: { lang: 'es' },
    });
    expect(html).toContain('href="/es/legal/reembolsos"');
    expect(html).toContain(escapeHtml(UI_LABELS.es.footer.reembolsos));
  });

  it('links to /[lang]/legal/reembolsos in en', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(Footer, {
      props: { lang: 'en' },
    });
    expect(html).toContain('href="/en/legal/reembolsos"');
    expect(html).toContain(escapeHtml(UI_LABELS.en.footer.reembolsos));
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

// "Desktop" redesign PART 1 scope extension (owner spec 2026-10-06, item A):
// the Inglés footer became a full-width bar carrying every item the footer
// has today, with a bold copyright line. The SITE branch (default `ingles`
// prop, every test above) is unaffected.
describe('Footer.astro — Inglés full-width bar (desktop redesign PART 1, item A)', () => {
  it('renders a full-width bar — no rounded/bordered floating panel, no page-margin inset wrapper', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(Footer, {
      props: { lang: 'es', ingles: true },
    });
    const footerOpenTag = html.slice(html.indexOf('<footer'), html.indexOf('>', html.indexOf('<footer')) + 1);
    expect(footerOpenTag).toContain('border-t');
    expect(footerOpenTag).not.toContain('rounded-card');
    expect(html).not.toContain('data-chrome-collapse');
  });

  it('renders the bold copyright line', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(Footer, {
      props: { lang: 'es', ingles: true },
    });
    // `[^>]*` (not just `""`) between the class attribute and the tag's own
    // closing `>`: the container renderer may add its own extra attributes
    // (e.g. `data-astro-source-file`) after `class="..."`.
    expect(html).toMatch(/<p class="[^"]*font-bold[^"]*"[^>]*>&copy;/);
  });

  it('carries every item the SITE footer has today: Premium, legal links, credits', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(Footer, {
      props: { lang: 'es', ingles: true },
    });
    expect(html).toContain('href="/es/premium"');
    expect(html).toContain('href="/es/legal/terms"');
    expect(html).toContain('href="/es/legal/privacy"');
    expect(html).toContain('href="/es/legal/reembolsos"');
    expect(html).toContain('href="/es/creditos"');
  });

  it('still carries data-chrome-footer, for the (now non-collapsing) chrome-visibility hook', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(Footer, {
      props: { lang: 'es', ingles: true },
    });
    expect(html).toContain('data-chrome-footer');
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
