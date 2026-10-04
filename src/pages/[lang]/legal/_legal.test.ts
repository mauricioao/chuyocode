import { describe, it, expect, afterEach, vi } from 'vitest';

// env.ts reads import.meta.env — stub it before any module that calls loadEnv().
// LEGAL_OWNER_* left blank on purpose: the page falls back to a neutral
// label, which keeps this test focused on the "last updated" date.
vi.mock('@lib/env', () => ({
  loadEnv: () => ({
    SANITY_PROJECT_ID: 'test-proj',
    SANITY_DATASET: 'production',
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_ANON_KEY: 'test-anon',
    SUPABASE_SERVICE_ROLE_KEY: '',
    AD_HMAC_SECRET: '',
    LEGAL_OWNER_NAME: '',
    LEGAL_OWNER_RUC: '',
    LEGAL_OWNER_CITY: '',
    LEGAL_OWNER_EMAIL: '',
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
