/**
 * Route test for the hidden Aventura prototype
 * (`/[lang]/ingles/aventura`, never linked — see the page's own header).
 * Already sign-in gated by the middleware (same posture as
 * `/[lang]/ingles/actividades/index.astro`'s own tests) — this file only
 * covers the page itself, not the gate.
 */
import { describe, it, expect, vi } from 'vitest';
import { createContainer } from '@/testSupport/astroContainer';

vi.mock('@lib/env', () => ({
  loadEnv: () => ({
    SANITY_PROJECT_ID: 'test-proj',
    SANITY_DATASET: 'production',
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_ANON_KEY: 'test-anon',
    SUPABASE_SERVICE_ROLE_KEY: '',
    AD_HMAC_SECRET: '',
  }),
}));

import AventuraPage from './index.astro';

async function render(lang: string) {
  const container = await createContainer();
  return container.renderToResponse(AventuraPage, {
    locals: { user: null, lang: lang === 'es' || lang === 'en' ? lang : undefined },
    params: { lang },
    request: new Request(`https://chuyocode.test/${lang}/ingles/aventura`),
  });
}

describe('ingles/aventura/index.astro (hidden Aventura prototype)', () => {
  it('returns 404 for an unsupported language', async () => {
    const res = await render('fr');
    expect(res.status).toBe(404);
  });

  it('returns 200 for a supported language, in Spanish', async () => {
    const res = await render('es');
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toContain('Aventura');
    expect(html).toContain('Línea 1/24');
  });

  it('returns 200 for a supported language, in English', async () => {
    const res = await render('en');
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toContain('Adventure');
    expect(html).toContain('Line 1/24');
  });

  it('loads the "Press Start 2P" pixel font from Google Fonts, and only on this page', async () => {
    const res = await render('es');
    const html = await res.text();

    expect(html).toContain('fonts.googleapis.com');
    expect(html).toContain('Press+Start+2P');
  });

  it('renders a back link to the hub', async () => {
    const res = await render('es');
    const html = await res.text();

    expect(html).toContain('data-back-button');
    expect(html).toContain('href="/es/ingles"');
  });
});
