import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createContainer } from '@/testSupport/astroContainer';

const { activitiesResult } = vi.hoisted(() => ({ activitiesResult: { value: [] as unknown[] } }));

vi.mock('@lib/activities/activities', () => ({
  getActivitiesByAuthor: vi.fn(async () => activitiesResult.value),
}));

import MisActividadesPage from './index.astro';

async function render(
  url: string,
  { params, locals }: { params: Record<string, string>; locals?: Record<string, unknown> },
) {
  const container = await createContainer();
  return container.renderToResponse(MisActividadesPage, {
    locals: { user: null, ...locals },
    params,
    request: new Request(url),
  });
}

beforeEach(() => {
  activitiesResult.value = [];
});

describe('GET /[lang]/mis-actividades — routing', () => {
  it('404s for an unsupported lang segment', async () => {
    const res = await render('https://chuyocode.test/fr/mis-actividades', { params: { lang: 'fr' } });
    expect(res.status).toBe(404);
  });
});

describe('GET /[lang]/mis-actividades — anonymous gate', () => {
  it('redirects to sign-in with next pointing back here', async () => {
    const res = await render('https://chuyocode.test/es/mis-actividades', { params: { lang: 'es' } });
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/es/auth/entrar?next=%2Fes%2Fmis-actividades');
  });

  it('never ships the listing markup to an anonymous visitor', async () => {
    const res = await render('https://chuyocode.test/es/mis-actividades', { params: { lang: 'es' } });
    const html = await res.text();
    expect(html).not.toContain('data-testid="mis-actividades-list"');
    expect(html).not.toContain('data-testid="mis-actividades-empty"');
  });

  it('is never publicly cacheable, even on the redirect path', async () => {
    const res = await render('https://chuyocode.test/es/mis-actividades', { params: { lang: 'es' } });
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });
});

describe('GET /[lang]/mis-actividades — signed-in visitor', () => {
  it('renders the empty state when the author has nothing', async () => {
    activitiesResult.value = [];
    const res = await render('https://chuyocode.test/es/mis-actividades', {
      params: { lang: 'es' },
      locals: { user: { id: 'user-1' } },
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-testid="mis-actividades-empty"');
  });

  it('renders the listing seeded from getActivitiesByAuthor', async () => {
    activitiesResult.value = [
      {
        id: 'act-1',
        title: 'Mi actividad',
        level: 'B1',
        status: 'draft',
        blockCount: 2,
        reviewNote: null,
        hasPendingRevision: false,
      },
    ];
    const res = await render('https://chuyocode.test/es/mis-actividades', {
      params: { lang: 'es' },
      locals: { user: { id: 'user-1' } },
    });
    const html = await res.text();
    expect(html).toContain('data-testid="mis-actividades-list"');
    expect(html).toContain('Mi actividad');
  });

  it('is never publicly cacheable', async () => {
    const res = await render('https://chuyocode.test/es/mis-actividades', {
      params: { lang: 'es' },
      locals: { user: { id: 'user-1' } },
    });
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  it('renders a back button to home, beside the title', async () => {
    const res = await render('https://chuyocode.test/es/mis-actividades', {
      params: { lang: 'es' },
      locals: { user: { id: 'user-1' } },
    });
    const html = await res.text();
    expect(html).toContain('data-back-button');
    expect(html).toContain('href="/es"');
  });
});
