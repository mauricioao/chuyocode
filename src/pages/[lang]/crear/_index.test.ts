import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createContainer } from '@/testSupport/astroContainer';

// `loadDeskSceneData` (the desk behind the window, "desktop" redesign PART
// 6b) pulls in `@lib/profile` -> `@lib/access` -> `@lib/supabase` ->
// `loadEnv`, which reads `import.meta.env` — stub it before any module that
// calls it, same posture as `crear/_[id].test.ts`.
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

const getActivityCount = vi.fn();
const getPublishedActivities = vi.fn();
vi.mock('@lib/activities/activities', () => ({
  getActivityCount: (...args: unknown[]) => getActivityCount(...args),
  getPublishedActivities: (...args: unknown[]) => getPublishedActivities(...args),
}));

const getExerciseCount = vi.fn();
vi.mock('@lib/exercises', () => ({
  getExerciseCount: (...args: unknown[]) => getExerciseCount(...args),
}));

vi.mock('@lib/activities/storage', () => ({
  publicImageUrl: (path: string) => `https://public.example/${path}`,
}));

import CrearPage from './index.astro';

/** Render the activities start page with route params + middleware locals. */
async function render(
  url: string,
  { params, locals }: { params: Record<string, string>; locals?: Record<string, unknown> },
) {
  const container = await createContainer();
  return container.renderToResponse(CrearPage, {
    locals: { user: null, ...locals },
    params,
    request: new Request(url),
  });
}

beforeEach(() => {
  getActivityCount.mockReset();
  getPublishedActivities.mockReset();
  getExerciseCount.mockReset();
  getActivityCount.mockResolvedValue(null);
  getPublishedActivities.mockResolvedValue({ activities: [], total: 0 });
  getExerciseCount.mockResolvedValue(null);
});

describe('GET /[lang]/crear — routing', () => {
  it('404s for an unsupported lang segment', async () => {
    const res = await render('https://chuyocode.test/fr/crear', { params: { lang: 'fr' } });
    expect(res.status).toBe(404);
  });
});

describe('GET /[lang]/crear — anonymous gate', () => {
  it('redirects to sign-in rather than rendering the start screen', async () => {
    const res = await render('https://chuyocode.test/es/crear', { params: { lang: 'es' } });

    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/es/auth/entrar?next=%2Fes%2Fcrear');
  });

  it('never ships the start-screen markup to an anonymous visitor', async () => {
    const res = await render('https://chuyocode.test/es/crear', { params: { lang: 'es' } });
    const html = await res.text();
    expect(html).not.toContain('data-testid="activity-start-island"');
  });

  it('is never publicly cacheable, even on the redirect path', async () => {
    const res = await render('https://chuyocode.test/es/crear', { params: { lang: 'es' } });
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });
});

// Window-manager architecture (`@lib/deskWindowsState`'s own header): a
// plain signed-in visit is now the HOST shell (desk + the window manager,
// which opens THIS SAME route again as its own embedded iframe) — the
// window's own content (the picker, the dialog, the title bar) only ever
// renders for an EMBEDDED request (`?ventana=1` — `@lib/ui/embeddedWindow`).
describe('GET /[lang]/crear — signed-in visitor (HOST shell)', () => {
  it('renders the desk plus the window manager, never the picker itself', async () => {
    const res = await render('https://chuyocode.test/es/crear', {
      params: { lang: 'es' },
      locals: { user: { id: 'user-1' } },
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-desk');
    expect(html).toContain('data-desk-window-manager');
    expect(html).not.toContain('data-testid="activity-start-island"');
    expect(html).not.toContain('role="dialog"');
  });

  it('is never publicly cacheable', async () => {
    const res = await render('https://chuyocode.test/es/crear', {
      params: { lang: 'es' },
      locals: { user: { id: 'user-1' } },
    });
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  // PART 6c (owner spec 2026-10-07): the desk is never `inert` anymore — the
  // floating window is non-modal, and the desk behind it stays fully usable.
  it('renders the desk, never inert', async () => {
    const res = await render('https://chuyocode.test/es/crear', {
      params: { lang: 'es' },
      locals: { user: { id: 'user-1' } },
    });
    const html = await res.text();
    expect(html).toContain('data-desk');
    expect(html).not.toMatch(/<section[^>]*data-desk[^>]*\binert\b[^>]*>/);
  });

  it('varies on Sec-Fetch-Dest, so a cache never serves this shell to the embedded request', async () => {
    const res = await render('https://chuyocode.test/es/crear', {
      params: { lang: 'es' },
      locals: { user: { id: 'user-1' } },
    });
    expect(res.headers.get('vary')).toContain('Sec-Fetch-Dest');
  });
});

describe('GET /[lang]/crear — embedded (the window manager\'s own iframe content)', () => {
  it('renders the start screen with the picker, no moderator gate required, and no desk at all', async () => {
    const res = await render('https://chuyocode.test/es/crear?ventana=1', {
      params: { lang: 'es' },
      locals: { user: { id: 'user-1' } },
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-testid="activity-start-island"');
    expect(html).toContain('data-testid="picker-worksheet"');
    expect(html).toContain('data-testid="picker-questions"');
    expect(html).not.toContain('data-desk-window-manager');
    expect(html).not.toContain('data-desk>');
  });

  // "Desktop" redesign PART 6b: this start screen renders as a WINDOW now —
  // the red light replaces the old `PageTitle` `backHref` (the hub), same as
  // the editor's own window.
  //
  // PART 6c (owner spec 2026-10-07): closing ALWAYS navigates straight to
  // the hub now — never `history.back()` to wherever the author came from
  // (the old `closeUsesTrackedPath`/`resolveTrackedCloseAction` behaviour,
  // removed — `@lib/ui/deskWindow.ts`). Embedded, this is now a
  // `postMessage` the host asks `window.deskWindowCanClose` before honouring
  // — the `href` is still there for the no-JS/guest fallback.
  it('renders the window shell, closing to the Inglés hub (replacing the old back button)', async () => {
    const res = await render('https://chuyocode.test/es/crear?ventana=1', {
      params: { lang: 'es' },
      locals: { user: { id: 'user-1' } },
    });
    const html = await res.text();
    expect(html).toContain('data-desk-window');
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-label="Cerrar"');
    expect(html).toContain('href="/es/ingles"');
    expect(html).not.toContain('data-back-button');
  });

  it('shows "Nueva actividad" in the window title bar', async () => {
    const res = await render('https://chuyocode.test/es/crear?ventana=1', {
      params: { lang: 'es' },
      locals: { user: { id: 'user-1' } },
    });
    const html = await res.text();
    const titleIndex = html.indexOf('id="desk-window-title"');
    expect(titleIndex).toBeGreaterThan(-1);
    expect(html.slice(titleIndex, titleIndex + 400)).toContain('Nueva actividad');
  });
});
