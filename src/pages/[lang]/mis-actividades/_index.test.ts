import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createContainer } from '@/testSupport/astroContainer';

// `loadDeskSceneData` (the desk behind the window, N4) pulls in
// `@lib/profile` -> `@lib/access` -> `@lib/supabase` -> `loadEnv`, which
// reads `import.meta.env` — stub it before any module that calls it, same
// posture as `crear/_index.test.ts`.
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

const { activitiesResult } = vi.hoisted(() => ({ activitiesResult: { value: [] as unknown[] } }));

const getActivityCount = vi.fn();
const getPublishedActivities = vi.fn();
vi.mock('@lib/activities/activities', () => ({
  getActivitiesByAuthor: vi.fn(async () => activitiesResult.value),
  // The desk behind the HOST shell (`loadDeskSceneData`) reads both of these too.
  getActivityCount: (...args: unknown[]) => getActivityCount(...args),
  getPublishedActivities: (...args: unknown[]) => getPublishedActivities(...args),
}));

vi.mock('@lib/activities/storage', () => ({
  publicImageUrl: (path: string) => `https://public.example/${path}`,
}));

import MisActividadesPage from './index.astro';

/**
 * Window-manager architecture (`@lib/deskWindowsState`'s own header): this
 * whole suite is about the WINDOW's own CONTENT (the listing, the
 * delete/share actions) — which only ever renders for an EMBEDDED request
 * now (`?ventana=1`, `@lib/ui/embeddedWindow`'s own header), so `render`
 * simulates one by default. `GET … — HOST shell` below is the one describe
 * block that deliberately omits it.
 */
async function render(
  url: string,
  { params, locals, embedded = true }: { params: Record<string, string>; locals?: Record<string, unknown>; embedded?: boolean },
) {
  const container = await createContainer();
  const requestUrl = new URL(url);
  if (embedded) requestUrl.searchParams.set('ventana', '1');
  return container.renderToResponse(MisActividadesPage, {
    locals: { user: null, ...locals },
    params,
    request: new Request(requestUrl),
  });
}

beforeEach(() => {
  activitiesResult.value = [];
  getActivityCount.mockReset();
  getPublishedActivities.mockReset();
  getActivityCount.mockResolvedValue(null);
  getPublishedActivities.mockResolvedValue({ activities: [], total: 0 });
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

describe('GET /[lang]/mis-actividades — renders as a window over the desk (N4)', () => {
  it('renders the DeskWindow shell, titled "Mis actividades", with its red/yellow lights pointed at the hub', async () => {
    const res = await render('https://chuyocode.test/es/mis-actividades', {
      params: { lang: 'es' },
      locals: { user: { id: 'user-1' } },
    });
    const html = await res.text();
    expect(html).toContain('data-desk-window');
    expect(html).toContain('data-close-target="/es/ingles"');
    expect(html).toContain('Mis actividades');
  });

  it('renders the empty state inside the window when the author has nothing', async () => {
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

  // Window-manager architecture: the desk no longer renders BEHIND an
  // embedded window at all — it renders behind the HOST shell instead, a
  // plain signed-in visit with no `?ventana=1` (`embedded: false` below).
  it('renders the desk behind the HOST shell for a signed-in visitor, with the "Mis actividades" folder on it', async () => {
    const res = await render('https://chuyocode.test/es/mis-actividades', {
      params: { lang: 'es' },
      locals: { user: { id: 'user-1' } },
      embedded: false,
    });
    const html = await res.text();
    expect(html).toContain('Tu escritorio');
    expect(html).toContain('data-desk-window-manager');
    expect(html).not.toMatch(/<section[^>]*data-desk[^>]*\binert\b[^>]*>/);
    expect(html).not.toContain('role="dialog"'); // this route itself only renders embedded.
    expect(html).toContain('Mis actividades');
  });

  it('varies on Sec-Fetch-Dest, so a cache never serves the shell to the embedded request', async () => {
    const res = await render('https://chuyocode.test/es/mis-actividades', {
      params: { lang: 'es' },
      locals: { user: { id: 'user-1' } },
      embedded: false,
    });
    expect(res.headers.get('vary')).toContain('Sec-Fetch-Dest');
  });
});

describe('GET /[lang]/mis-actividades — "Compartir" per row (D8)', () => {
  it('gives a LIVE activity a share block computed from the request origin', async () => {
    activitiesResult.value = [
      {
        id: 'act-live',
        title: 'Publicada',
        level: 'B1',
        status: 'live',
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
    expect(html).toContain('data-testid="activity-share-act-live"');
    const expectedUrl = 'https://chuyocode.test/es/ingles/actividades/act-live';
    const expectedWhatsapp = `https://wa.me/?text=${encodeURIComponent(`Publicada ${expectedUrl}`)}`;
    expect(html).toContain(expectedWhatsapp.replace(/&/g, '&amp;'));
  });

  it('never gives a non-live activity a share block', async () => {
    activitiesResult.value = [
      {
        id: 'act-draft',
        title: 'Borrador',
        level: null,
        status: 'draft',
        blockCount: 0,
        reviewNote: null,
        hasPendingRevision: false,
      },
    ];
    const res = await render('https://chuyocode.test/es/mis-actividades', {
      params: { lang: 'es' },
      locals: { user: { id: 'user-1' } },
    });
    const html = await res.text();
    expect(html).not.toContain('data-testid="activity-share-act-draft"');
  });
});
