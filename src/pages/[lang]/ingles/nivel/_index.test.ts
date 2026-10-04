/**
 * Route test for the placement-test draft (`/[lang]/ingles/nivel`, hidden —
 * see the page's own header). Already sign-in gated by the middleware (same
 * posture as `/[lang]/ingles/aventura`'s own test) — this file only covers
 * the page itself, not the gate.
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

import NivelPage from './index.astro';

async function render(lang: string) {
  const container = await createContainer();
  return container.renderToResponse(NivelPage, {
    locals: { user: null, lang: lang === 'es' || lang === 'en' ? lang : undefined },
    params: { lang },
    request: new Request(`https://chuyocode.test/${lang}/ingles/nivel`),
  });
}

describe('ingles/nivel/index.astro (hidden placement-test draft)', () => {
  it('returns 404 for an unsupported language', async () => {
    const res = await render('fr');
    expect(res.status).toBe(404);
  });

  it('returns 200 for a supported language, in Spanish', async () => {
    const res = await render('es');
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toContain('Nivel de inglés');
    expect(html).toContain('Comenzar el test');
  });

  it('returns 200 for a supported language, in English', async () => {
    const res = await render('en');
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toContain('English level test');
    expect(html).toContain('Start the test');
  });

  it('carries noindex, like every other /ingles/** page', async () => {
    const res = await render('es');
    const html = await res.text();

    expect(html).toContain('name="robots" content="noindex"');
  });

  it('renders a back link to the hub', async () => {
    const res = await render('es');
    const html = await res.text();

    expect(html).toContain('data-back-button');
    expect(html).toContain('href="/es/ingles"');
  });
});
