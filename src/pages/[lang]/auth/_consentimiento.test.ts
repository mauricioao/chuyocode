import { describe, it, expect, vi } from 'vitest';
import { createContainer } from '@/testSupport/astroContainer';
import { UI_LABELS } from '@lib/i18n';

// `@lib/ageConsent` itself (real module) eagerly imports `@lib/supabase`,
// which reads required Sanity/Supabase env vars at import time — same
// reason `cursos/[slug]/_index.test.ts` mocks `@lib/access` wholesale rather
// than letting its `./supabase` import resolve for real. `hasRecordedConsent`
// is a pure predicate (already unit-tested in `ageConsent.test.ts`); this
// mock re-implements its exact check so this page test can stay about
// ROUTING, not re-prove that logic.
vi.mock('@lib/ageConsent', () => ({
  hasRecordedConsent: (
    user: { app_metadata?: { ageConsent?: { acceptedAt?: unknown } } } | null,
  ) => typeof user?.app_metadata?.ageConsent?.acceptedAt === 'string',
}));

import ConsentimientoPage from './consentimiento.astro';

/** Render the consent screen with route params + middleware locals. */
async function render(
  url: string,
  { params, locals }: { params: Record<string, string>; locals?: Record<string, unknown> },
) {
  const container = await createContainer();
  return container.renderToResponse(ConsentimientoPage, {
    locals: { user: null, ...locals },
    params,
    request: new Request(url),
  });
}

const CONSENTED_USER = {
  id: 'user-1',
  app_metadata: { ageConsent: { acceptedAt: '2026-10-04T00:00:00.000Z', version: 'v1' } },
};

describe('GET /[lang]/auth/consentimiento — routing', () => {
  it('404s for an unsupported lang segment', async () => {
    const res = await render('https://chuyocode.test/fr/auth/consentimiento', {
      params: { lang: 'fr' },
    });

    expect(res.status).toBe(404);
  });
});

describe('GET /[lang]/auth/consentimiento — anonymous visitors', () => {
  it('303s to entrar, carrying the original next (not a pointer back to this page)', async () => {
    const res = await render(
      'https://chuyocode.test/es/auth/consentimiento?next=%2Fes%2Fingles',
      { params: { lang: 'es' } },
    );

    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/es/auth/entrar?next=%2Fes%2Fingles');
  });

  it('303s to entrar with the default-locale home as next when none was given', async () => {
    const res = await render('https://chuyocode.test/es/auth/consentimiento', {
      params: { lang: 'es' },
    });

    expect(res.headers.get('location')).toBe('/es/auth/entrar?next=%2Fes%2F');
  });

  it('is never publicly cacheable', async () => {
    const res = await render('https://chuyocode.test/es/auth/consentimiento', {
      params: { lang: 'es' },
    });

    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });
});

describe('GET /[lang]/auth/consentimiento — already consented (no dead end)', () => {
  it('303s straight to next, skipping the screen', async () => {
    const res = await render(
      'https://chuyocode.test/es/auth/consentimiento?next=%2Fes%2Fingles',
      { params: { lang: 'es' }, locals: { user: CONSENTED_USER } },
    );

    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/es/ingles');
  });

  it('303s home when no next was given', async () => {
    const res = await render('https://chuyocode.test/es/auth/consentimiento', {
      params: { lang: 'es' },
      locals: { user: CONSENTED_USER },
    });

    expect(res.headers.get('location')).toBe('/es/');
  });
});

describe('GET /[lang]/auth/consentimiento — signed in, not yet consented', () => {
  it('renders the consent form', async () => {
    const res = await render('https://chuyocode.test/es/auth/consentimiento', {
      params: { lang: 'es' },
      locals: { user: { id: 'user-2' } },
    });
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toContain('data-testid="consent-form"');
  });

  it('links to the Spanish legal pages', async () => {
    const res = await render('https://chuyocode.test/es/auth/consentimiento', {
      params: { lang: 'es' },
      locals: { user: { id: 'user-2' } },
    });
    const html = await res.text();

    expect(html).toContain('href="/es/legal/terms"');
    expect(html).toContain('href="/es/legal/privacy"');
    expect(html).toContain(UI_LABELS.es.auth.consent.termsLinkText);
    expect(html).toContain(UI_LABELS.es.auth.consent.privacyLinkText);
  });

  it('renders in English for lang=en, linking the English legal pages', async () => {
    const res = await render('https://chuyocode.test/en/auth/consentimiento', {
      params: { lang: 'en' },
      locals: { user: { id: 'user-2' }, lang: 'en' },
    });
    const html = await res.text();

    expect(html).toContain('href="/en/legal/terms"');
    expect(html).toContain('href="/en/legal/privacy"');
    expect(html).toContain(UI_LABELS.en.auth.consent.continue);
  });

  it('is never publicly cacheable', async () => {
    const res = await render('https://chuyocode.test/es/auth/consentimiento', {
      params: { lang: 'es' },
      locals: { user: { id: 'user-2' } },
    });

    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  it('uses the light visual scope (BaseLayout theme="ingles"), not the site-wide dark default', async () => {
    const res = await render('https://chuyocode.test/es/auth/consentimiento', {
      params: { lang: 'es' },
      locals: { user: { id: 'user-2' } },
    });
    const html = await res.text();

    expect(html).toContain('data-theme="ingles"');
  });
});
