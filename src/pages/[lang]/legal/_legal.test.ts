import { describe, it, expect, afterEach, vi } from 'vitest';

// env.ts reads import.meta.env — stub it before any module that calls loadEnv().
// LEGAL_OWNER_* are non-blank, realistic placeholders: this file both proves
// the "last updated" date (unaffected by owner identity) AND proves the
// owner-identity props actually reach the page (RUC/city/email render,
// below) — the `[page].astro` fallback to a neutral label for an UNSET env
// var is pre-existing, unchanged behavior and not re-tested here.
vi.mock('@lib/env', () => ({
  loadEnv: () => ({
    SANITY_PROJECT_ID: 'test-proj',
    SANITY_DATASET: 'production',
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_ANON_KEY: 'test-anon',
    SUPABASE_SERVICE_ROLE_KEY: '',
    AD_HMAC_SECRET: '',
    LEGAL_OWNER_NAME: 'ChuyoCode SAC',
    LEGAL_OWNER_RUC: '20123456789',
    LEGAL_OWNER_CITY: 'Lima',
    LEGAL_OWNER_EMAIL: 'legal@chuyocode.test',
  }),
}));

import { createContainer } from '@/testSupport/astroContainer';
import { isValidLang, type Lang } from '@lib/i18n';
import LegalPage from './[page].astro';

async function render(params: Record<string, string | undefined>) {
  const container = await createContainer();
  const langParam = params.lang ?? 'es';
  const lang: Lang = isValidLang(langParam) ? langParam : 'es';
  return container.renderToResponse(LegalPage, {
    // `App.Locals.user` is required, never optional: this render is anonymous.
    locals: { user: null, lang },
    params,
    request: new Request('https://chuyocode.netlify.app/es/legal/terms'),
  });
}

// SEO basics pass: "last updated" used to be `new Date()` at render time,
// silently advancing every day even when the document's own copy had not
// changed. It is now a fixed per-document constant (`LAST_UPDATED` in
// `[page].astro`) — these tests pin the system clock to a DIFFERENT date
// than that constant to prove the displayed date does not drift with it.
describe('legal/[page].astro — fixed "last updated" date (SEO basics pass)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the fixed date for terms, localized in Spanish', async () => {
    const res = await render({ lang: 'es', page: 'terms' });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('4 de octubre de 2026');
  });

  it('renders the fixed date for privacy, localized in English', async () => {
    const res = await render({ lang: 'en', page: 'privacy' });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('October 4, 2026');
  });

  it('renders the fixed date for reembolsos (refund policy), localized in Spanish', async () => {
    const res = await render({ lang: 'es', page: 'reembolsos' });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('4 de octubre de 2026');
  });

  it('renders the fixed date for reembolsos (refund policy), localized in English', async () => {
    const res = await render({ lang: 'en', page: 'reembolsos' });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('October 4, 2026');
  });

  it('does not drift with the render-time clock', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2031-01-01T00:00:00Z'));

    const res = await render({ lang: 'es', page: 'terms' });
    const html = await res.text();

    expect(html).toContain('4 de octubre de 2026');
    expect(html).not.toContain('enero de 2031');
  });

  it('404s for an unknown page segment', async () => {
    const res = await render({ lang: 'es', page: 'unknown' });
    expect(res.status).toBe(404);
  });
});

// Third legal document (RefundsContent.astro). `reembolsos` is a NEW valid
// segment in `LEGAL_PAGES` — it used to 404 like any other unknown segment.
describe('legal/[page].astro — reembolsos (Refund Policy)', () => {
  it('renders the localized title and its own content, in es', async () => {
    const res = await render({ lang: 'es', page: 'reembolsos' });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Política de reembolsos');
    expect(html).toContain('Tu derecho a reembolso');
  });

  it('renders the localized title and its own content, in en', async () => {
    const res = await render({ lang: 'en', page: 'reembolsos' });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Refund policy');
    expect(html).toContain('Your right to a refund');
  });
});

// Owner identity props (LEGAL_OWNER_* from env, required by Ley 29733) reach
// every one of the three documents, not just terms/privacy.
describe('legal/[page].astro — owner identity props', () => {
  const pages = ['terms', 'privacy', 'reembolsos'] as const;

  for (const page of pages) {
    it(`renders the owner's name, RUC, city and contact email (${page})`, async () => {
      const res = await render({ lang: 'es', page });
      const html = await res.text();

      expect(html).toContain('ChuyoCode SAC');
      expect(html).toContain('20123456789');
      expect(html).toContain('Lima');
      expect(html).toContain('href="mailto:legal@chuyocode.test"');
    });
  }
});

// Public edge cache (SEO/perf pass): every legal document is byte-identical
// for every visitor of a given `lang` — same policy as the home and Premium
// pages (`publicCachePolicy`, `@lib/cache.ts`).
describe('legal/[page].astro — public caching', () => {
  it('keeps the public edge-cache header on every legal document', async () => {
    for (const page of ['terms', 'privacy', 'reembolsos'] as const) {
      const res = await render({ lang: 'es', page });
      expect(res.headers.get('CDN-Cache-Control')).toBe(
        'public, s-maxage=3600, stale-while-revalidate=86400',
      );
    }
  });
});

// Key facts each document must get right (owner's own checklist: deletion
// behavior, guest play, minors, ARCO rights, cookie names, the refund
// proposal) — a regression here is a legal-accuracy regression, not just a
// copy nit.
describe('legal/[page].astro — key facts (terms)', () => {
  it('covers minors, guest play, account deletion and the Premium founder price, in es', async () => {
    const res = await render({ lang: 'es', page: 'terms' });
    const html = await res.text();

    expect(html).toContain('si tienes menos de 14 años, necesitas ese consentimiento para crear una cuenta');
    expect(html).toContain('Juego como invitado');
    expect(html).toContain('según la licencia de la sección 4');
    expect(html).toContain('nunca tu nombre ni tu correo');
    expect(html).toContain('US$9,99 al año de por vida para los primeros 200 suscriptores');
    expect(html).toMatch(/<a[^>]+href="\/es\/legal\/reembolsos"[^>]*>\s*Política de reembolsos/);
  });

  it('covers minors, guest play, account deletion and the Premium founder price, in en', async () => {
    const res = await render({ lang: 'en', page: 'terms' });
    const html = await res.text();

    expect(html).toContain('if you are under 14, you need that consent to create an account');
    expect(html).toContain('Guest play');
    expect(html).toContain("prior account's internal identifier");
    expect(html).toContain('US$9.99/year for life for the first 200 subscribers');
    expect(html).toMatch(/<a[^>]+href="\/en\/legal\/reembolsos"[^>]*>\s*Refund Policy/);
  });
});

describe('legal/[page].astro — key facts (privacy)', () => {
  it('names the real cookies, covers minors and ARCO rights, in es', async () => {
    const res = await render({ lang: 'es', page: 'privacy' });
    const html = await res.text();

    expect(html).toContain('chu_pass');
    expect(html).toContain('chu_ad_start');
    expect(html).toContain('acceso, rectificación, cancelación y oposición');
    expect(html).toContain('consentimiento previo de su padre, madre o apoderado');
    expect(html).toContain('se eliminan tus datos personales asociados');
  });

  it('names the real cookies, covers minors and rights, in en', async () => {
    const res = await render({ lang: 'en', page: 'privacy' });
    const html = await res.text();

    expect(html).toContain('chu_pass');
    expect(html).toContain('chu_ad_start');
    expect(html).toContain('access, rectification, cancellation, and objection');
    expect(html).toContain('requires the prior consent of a parent or guardian');
    expect(html).toContain('Doing so deletes your associated personal data');
  });
});

describe('legal/[page].astro — key facts (reembolsos)', () => {
  it('states the 14-day window and Paddle as the processor, in es', async () => {
    const res = await render({ lang: 'es', page: 'reembolsos' });
    const html = await res.text();

    expect(html).toContain('14 días');
    expect(html).toContain('Paddle');
  });

  it('states the 14-day window and Paddle as the processor, in en', async () => {
    const res = await render({ lang: 'en', page: 'reembolsos' });
    const html = await res.text();

    expect(html).toContain('14 days');
    expect(html).toContain('Paddle');
  });
});
