import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createContainer } from '@/testSupport/astroContainer';

// `loadDeskSceneData` (the desk behind the window, "desktop" redesign PART
// 6a) pulls in `@lib/profile` -> `@lib/access` -> `@lib/supabase` ->
// `loadEnv`, which reads `import.meta.env` — stub it before any module that
// calls it, same posture as `src/pages/[lang]/ingles/_ingles.test.ts`.
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

const { activityResult, heartedResult, hasHeartedActivityMock, editActivityResult } = vi.hoisted(() => ({
  activityResult: { value: null as unknown },
  heartedResult: { value: false },
  hasHeartedActivityMock: vi.fn(async () => heartedResult.value),
  // Author preview (R1, "the author can open their own unpublished
  // activity"): `getActivityForEdit` is the FALLBACK read, tried only once
  // `getPublishedActivity` returns `null` AND a user is signed in — see
  // this file's own "author preview" describe block below.
  editActivityResult: { value: null as unknown },
}));

const getActivityCount = vi.fn();
const getPublishedActivities = vi.fn();
const getActivityForEditMock = vi.fn(async (..._args: unknown[]) => editActivityResult.value);
vi.mock('@lib/activities/activities', () => ({
  getPublishedActivity: vi.fn(async () => activityResult.value),
  getActivityForEdit: (...args: unknown[]) => getActivityForEditMock(...args),
  getActivityCount: (...args: unknown[]) => getActivityCount(...args),
  getPublishedActivities: (...args: unknown[]) => getPublishedActivities(...args),
  // N4: the "Mis actividades" folder's own read, same module — the desk
  // behind this window's HOST shell loads it too (`loadDeskSceneData`).
  getActivitiesByAuthor: vi.fn(async () => []),
}));

vi.mock('@lib/activities/hearts', () => ({
  hasHeartedActivity: hasHeartedActivityMock,
}));

vi.mock('@lib/activities/storage', () => ({
  publicImageUrl: (path: string) => `https://public.example/${path}`,
}));

import PracticePage from './[id].astro';

/**
 * Window-manager architecture (`@lib/deskWindowsState`'s own header): this
 * whole suite is about the WINDOW's own CONTENT (the activity, its hearts/
 * report/duplicate actions, the title bar) — which only ever renders for an
 * EMBEDDED request now (`?ventana=1`, `@lib/ui/embeddedWindow`'s own
 * header), so `render` simulates one by default. `GET … — HOST shell`
 * below is the one describe block that deliberately omits it, to cover the
 * OTHER shape (desk + window manager) a plain signed-in visit now renders.
 */
async function render(
  url: string,
  { params, locals, embedded = true }: { params: Record<string, string>; locals?: Record<string, unknown>; embedded?: boolean },
) {
  const container = await createContainer();
  const requestUrl = new URL(url);
  if (embedded) requestUrl.searchParams.set('ventana', '1');
  return container.renderToResponse(PracticePage, {
    locals: { user: { id: 'user-1' }, ...locals } as unknown as App.Locals,
    params,
    request: new Request(requestUrl),
  });
}

beforeEach(() => {
  activityResult.value = null;
  editActivityResult.value = null;
  heartedResult.value = false;
  hasHeartedActivityMock.mockClear();
  getActivityForEditMock.mockClear();
  getActivityCount.mockReset();
  getPublishedActivities.mockReset();
  getActivityCount.mockResolvedValue(null);
  getPublishedActivities.mockResolvedValue({ activities: [], total: 0 });
});

describe('GET /[lang]/ingles/actividades/[id] — routing', () => {
  it('404s for an unsupported lang segment', async () => {
    const res = await render('https://chuyocode.test/fr/ingles/actividades/abc', {
      params: { lang: 'fr', id: 'abc' },
      locals: { lang: undefined },
    });
    expect(res.status).toBe(404);
  });

  it('404s when no visible activity matches (does not exist, or not live)', async () => {
    activityResult.value = null;
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
    });
    expect(res.status).toBe(404);
  });

  it('never ships the practice markup on the 404 path', async () => {
    activityResult.value = null;
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
    });
    const html = await res.text();
    expect(html).not.toContain('data-testid="worksheet-player"');
  });
});

describe('GET /[lang]/ingles/actividades/[id] — published render', () => {
  it('renders the activity title, level, and its worksheet block', async () => {
    activityResult.value = {
      id: 'abc',
      title: 'Present simple: ir de compras',
      level: 'A2',
      blocks: [
        {
          id: 'w1',
          type: 'worksheet',
          rotation: 0,
          image: { path: 'activity-images/abc/img-1.webp', width: 800, height: 400 },
          zones: [{ id: 'z1', x: 0.1, y: 0.1, w: 0.2, h: 0.1, kind: 'text', answers: ['cat'] }],
        },
      ],
    };

    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
    });

    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Present simple: ir de compras');
    expect(html).toContain('A2');
    expect(html).toContain('data-testid="worksheet-player"');
  });

  it('renders "Sin nivel" (the window\'s level chip) when the activity has no level', async () => {
    activityResult.value = { id: 'abc', title: 'x', level: null, blocks: [] };
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
    });
    const html = await res.text();
    expect(html).toContain('Sin nivel');
  });

  it('renders the window shell: a dialog with three named "traffic light" buttons and the title', async () => {
    activityResult.value = { id: 'abc', title: 'x', level: null, blocks: [] };
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
    });
    const html = await res.text();
    expect(html).toContain('data-desk-window');
    expect(html).toContain('role="dialog"');
    // PART 6c (owner spec 2026-10-07): non-modal floating window — no `aria-modal`.
    expect(html).not.toContain('aria-modal');
    expect(html).toContain('aria-label="Cerrar"');
    expect(html).toContain('aria-label="Minimizar"');
    expect(html).toContain('aria-label="Pantalla completa"');
  });

  it('keeps the lights, title and level chip in the same title bar, in that order ("desktop" redesign PART 6a — the red light replaces the old back button)', async () => {
    activityResult.value = { id: 'abc', title: 'Present simple', level: 'A2', blocks: [] };
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
    });
    const html = await res.text();
    const windowStart = html.indexOf('data-desk-window');
    const close = html.indexOf('aria-label="Cerrar"', windowStart);
    const title = html.indexOf('Present simple', close);
    const chip = html.indexOf('A2', title);
    expect(windowStart).toBeGreaterThan(-1);
    expect(close).toBeGreaterThan(windowStart);
    expect(title).toBeGreaterThan(close);
    expect(chip).toBeGreaterThan(title);
  });

  it('renders a quiz block through the real quiz practice renderer', async () => {
    activityResult.value = {
      id: 'abc',
      title: 'x',
      level: null,
      blocks: [
        {
          id: 'q1',
          type: 'quiz',
          payload: {
            pools: { opts: [{ id: 'a', text: 'x' }] },
            slots: [{ id: 's1', label: 'x', input: 'choice', pool: 'opts', answer: ['a'] }],
          },
        },
      ],
    };
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
    });
    const html = await res.text();
    expect(html).toContain('data-testid="quiz-practice-q1"');
  });

  it('returns 200 in English', async () => {
    activityResult.value = { id: 'abc', title: 'x', level: null, blocks: [] };
    const res = await render('https://chuyocode.test/en/ingles/actividades/abc', {
      params: { lang: 'en', id: 'abc' },
    });
    expect(res.status).toBe(200);
  });
});

// "Desktop" redesign PART 6a (owner spec 2026-10-06): the practice page
// renders as a WINDOW over the desk, keeping its own real URL. The desk
// renders behind it for a signed-in visitor (same data/component the hub
// itself uses) and NOT AT ALL for a guest, who cannot see the gated hub —
// their red/yellow lights go to the ChuyoCode home instead.
describe('GET /[lang]/ingles/actividades/[id] — the desk behind the window (PART 6a)', () => {
  // PART 6c (owner spec 2026-10-07): never `inert` anymore — the floating
  // window is non-modal, and the desk behind it stays fully usable.
  //
  // Window-manager architecture: the desk no longer renders BEHIND an
  // embedded window at all (embedded never has a desk — see this file's own
  // header) — it renders behind the HOST shell instead, a plain signed-in
  // visit with no `?ventana=1` (`embedded: false` below).
  it('renders the desk behind the host shell, never inert, for a signed-in visitor', async () => {
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
      embedded: false,
    });
    const html = await res.text();
    expect(html).toContain('data-desk');
    expect(html).not.toMatch(/<section[^>]*data-desk[^>]*\binert\b[^>]*>/);
    // The hub's own folders/widgets landmarks, proving the SAME desk renders.
    expect(html).toContain('Para ti hoy');
    expect(html).toContain('Tu escritorio');
    expect(html).toContain('data-desk-window-manager');
    expect(html).not.toContain('role="dialog"'); // the window itself only renders embedded — getPublishedActivity was never even called.
  });

  // Robustness fix (owner report): a direct visit to a window route used to
  // render the desk WITHOUT the floating helper — only the hub's own
  // frontmatter rendered it. `DeskHost.astro` now renders it on every host
  // shell, not just the hub.
  it('renders the floating helper on the host shell too, not hub-only anymore', async () => {
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
      embedded: false,
    });
    const html = await res.text();
    expect(html).toContain('id="desk-helper"');
  });

  // UI round 2 (owner feedback, 2026-10-12): on the real desk Vanina
  // rendered in front of the calendar widget, not beside any window — root
  // cause: a fixed, viewport-relative offset (the window's OLD static
  // desktop inset), never anchored to an actual window element, so she
  // still painted at that same screen position even with no window open.
  // Removed; see `DeskWindowManager.astro`'s own history for the removed
  // markup (`957fc59`).
  it('never renders a Vanina peek on the host shell (removed, UI round 2)', async () => {
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
      embedded: false,
    });
    const html = await res.text();
    expect(html).not.toContain('desk-window-manager-vanina-peek');
  });

  it('renders no desk at all behind the window for a guest', async () => {
    activityResult.value = { id: 'abc', title: 'x', level: null, blocks: [], authorId: 'someone-else' };
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: null },
    });
    const html = await res.text();
    // `data-desk-window` (the window shell itself, always present) is NOT a
    // false positive here — it is checked separately via the hub-only
    // landmarks below, never via a bare `data-desk` substring.
    expect(html).not.toContain('Para ti hoy');
    expect(html).not.toContain('Tu escritorio');
  });

  it('never calls getPublishedActivity for the HOST shell (the manager loads the window data itself, not twice)', async () => {
    const { getPublishedActivity } = await import('@lib/activities/activities');
    vi.mocked(getPublishedActivity).mockClear();
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
      embedded: false,
    });
    await res.text();
    expect(getPublishedActivity).not.toHaveBeenCalled();
  });

  it('varies on Sec-Fetch-Dest, so a cache never serves the shell to the embedded request (or vice versa)', async () => {
    activityResult.value = { id: 'abc', title: 'x', level: null, blocks: [] };
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
    });
    expect(res.headers.get('vary')).toContain('Sec-Fetch-Dest');
  });

  it("sends a signed-in visitor's close/minimize lights to the Inglés hub", async () => {
    activityResult.value = { id: 'abc', title: 'x', level: null, blocks: [] };
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
    });
    const html = await res.text();
    expect(html).toContain('data-close-target="/es/ingles"');
  });

  it("sends a guest's close/minimize lights to the ChuyoCode home, never the gated hub", async () => {
    activityResult.value = { id: 'abc', title: 'x', level: null, blocks: [], authorId: 'someone-else' };
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: null },
    });
    const html = await res.text();
    expect(html).toContain('data-close-target="/es/"');
    expect(html).not.toContain('data-close-target="/es/ingles"');
  });

  it('opens full screen for a guest (no plain-background gap behind it, since there is no desk to fill it)', async () => {
    activityResult.value = { id: 'abc', title: 'x', level: null, blocks: [], authorId: 'someone-else' };
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: null },
    });
    const html = await res.text();
    expect(html).toMatch(/<section[^>]*data-desk-window[^>]*data-fullscreen="true"[^>]*>/);
    expect(html).toContain('aria-pressed="true"');
  });

  // Scroll bug fix (owner report: "se rompe el scroll y no deja llegar a la
  // parte superior" — confirmed root cause: a descendant's `scrollIntoView()`
  // can still scroll an `overflow: hidden` ancestor programmatically, even
  // with no visible scrollbar for a visitor to undo it with — see
  // `QuizBlockEditor.test.tsx`'s own header). The window's own body wrapper
  // and dialog section both exist only to clip content, never to scroll —
  // `overflow: clip` keeps the same visual clipping but can never be
  // scrolled.
  it("clips the window's own dialog section and body wrapper with overflow-clip, never overflow-hidden", async () => {
    activityResult.value = { id: 'abc', title: 'x', level: null, blocks: [] };
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
    });
    const html = await res.text();
    const bodyMatch = html.match(/class="([^"]*)"[^>]*data-desk-window-body/);
    expect(bodyMatch?.[1]).toContain('overflow-clip');
    expect(bodyMatch?.[1]).not.toContain('overflow-hidden');

    const sectionMatch = html.match(/<section[^>]*id="desk-window"[^>]*class="([^"]*)"/);
    expect(sectionMatch?.[1]).toContain('overflow-clip');
    expect(sectionMatch?.[1]).not.toContain('overflow-hidden');
  });

  it('does NOT force full screen for a signed-in visitor (the desk fills the space behind it)', async () => {
    activityResult.value = { id: 'abc', title: 'x', level: null, blocks: [] };
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
    });
    const html = await res.text();
    expect(html).not.toContain('data-fullscreen');
    expect(html).toContain('aria-pressed="false"');
  });

  // Visual-polish pass, DIRECCION-VISUAL.md §4.2 "asoma en la ventana del
  // ejercicio": `DeskWindow.astro` can render Vanina peeking from its own
  // outer left edge, but ONLY for the legacy, non-`embedded` desktop-inset
  // shape (see that component's own guard, `!forceFullScreen && !embedded`).
  // Window-manager architecture (this whole suite's own header): a
  // signed-in visitor's real window content is ALWAYS `embedded` now — the
  // HOST iframe element draws the desktop inset instead, so Vanina never
  // renders from in here. `DeskWindowManager.test.ts` covers the real,
  // reachable case (the HOST shell, signed-in only).
  it('never renders the legacy window-edge Vanina peek on an embedded window (the HOST iframe owns that chrome now)', async () => {
    activityResult.value = { id: 'abc', title: 'x', level: null, blocks: [] };
    const signedIn = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
    });
    expect(await signedIn.text()).not.toContain('data-testid="desk-window-vanina-peek"');
  });

  // The "‹" back arrow to the community list is GONE (owner spec 2026-10-07,
  // "ya no será necesario el botón de regresar, sácalo, porque tiene los 3
  // botones de colores" — the three traffic lights already cover it).
  it('never renders a back arrow, signed-in or guest', async () => {
    activityResult.value = { id: 'abc', title: 'x', level: null, blocks: [] };
    const signedIn = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
    });
    expect(await signedIn.text()).not.toContain('data-testid="desk-window-back"');

    activityResult.value = { id: 'abc', title: 'x', level: null, blocks: [], authorId: 'someone-else' };
    const guest = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: null },
    });
    expect(await guest.text()).not.toContain('data-testid="desk-window-back"');
  });
});

describe('GET /[lang]/ingles/actividades/[id] — report button (PR E, Moderation)', () => {
  it('renders it for a signed-in visitor who is not the author', async () => {
    activityResult.value = { id: 'abc', title: 'x', level: null, blocks: [], authorId: 'someone-else' };
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
    });
    const html = await res.text();
    expect(html).toContain('data-testid="report-activity-button"');
  });

  it("hides it from the activity's own author", async () => {
    activityResult.value = { id: 'abc', title: 'x', level: null, blocks: [], authorId: 'user-1' };
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
    });
    const html = await res.text();
    expect(html).not.toContain('data-testid="report-activity-button"');
  });

  it('hides the interactive button from an anonymous visitor, showing a sign-in link instead', async () => {
    activityResult.value = { id: 'abc', title: 'x', level: null, blocks: [], authorId: 'someone-else' };
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: null },
    });
    const html = await res.text();
    expect(html).not.toContain('data-testid="report-activity-button"');
    expect(html).toContain('data-testid="activity-report-guest"');
    expect(html).toContain('href="/es/auth/entrar?next=%2Fes%2Fingles%2Factividades%2Fabc"');
  });

  it('shows neither the button nor the guest link for the activity\'s own author', async () => {
    activityResult.value = { id: 'abc', title: 'x', level: null, blocks: [], authorId: 'user-1' };
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
    });
    const html = await res.text();
    expect(html).not.toContain('data-testid="report-activity-button"');
    expect(html).not.toContain('data-testid="activity-report-guest"');
  });
});

describe('GET /[lang]/ingles/actividades/[id] — heart control (Descubrir)', () => {
  it('renders the interactive heart button for a signed-in visitor who is not the author', async () => {
    activityResult.value = { id: 'abc', title: 'x', level: null, blocks: [], authorId: 'someone-else', heartCount: 5 };
    heartedResult.value = true;
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
    });
    const html = await res.text();
    expect(html).toContain('data-testid="activity-heart-button"');
    expect(html).not.toContain('data-testid="activity-heart-readonly"');
    expect(hasHeartedActivityMock).toHaveBeenCalledWith('abc', 'user-1');
  });

  it("shows a read-only count for the activity's own author, never the interactive button", async () => {
    activityResult.value = { id: 'abc', title: 'x', level: null, blocks: [], authorId: 'user-1', heartCount: 7 };
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
    });
    const html = await res.text();
    expect(html).toContain('data-testid="activity-heart-readonly"');
    expect(html).not.toContain('data-testid="activity-heart-button"');
    expect(html).toContain('7');
    expect(hasHeartedActivityMock).not.toHaveBeenCalled();
  });

  it('shows the count for an anonymous visitor as a link to sign-in, not the inert read-only span', async () => {
    activityResult.value = { id: 'abc', title: 'x', level: null, blocks: [], authorId: 'someone-else', heartCount: 2 };
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: null },
    });
    const html = await res.text();
    expect(html).not.toContain('data-testid="activity-heart-readonly"');
    expect(html).not.toContain('data-testid="activity-heart-button"');
    expect(html).toContain('data-testid="activity-heart-guest"');
    expect(html).toContain('2');
    expect(html).toContain('href="/es/auth/entrar?next=%2Fes%2Fingles%2Factividades%2Fabc"');
    expect(hasHeartedActivityMock).not.toHaveBeenCalled();
  });
});

describe('GET /[lang]/ingles/actividades/[id] — "Duplicar" (D7)', () => {
  it('renders it for any signed-in visitor, INCLUDING the activity\'s own author', async () => {
    activityResult.value = { id: 'abc', title: 'x', level: null, blocks: [], authorId: 'user-1' };
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
    });
    const html = await res.text();
    expect(html).toContain('data-testid="duplicate-activity-button"');
  });

  it('hides the interactive button from an anonymous visitor, showing a sign-in link instead', async () => {
    activityResult.value = { id: 'abc', title: 'x', level: null, blocks: [], authorId: 'someone-else' };
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: null },
    });
    const html = await res.text();
    expect(html).not.toContain('data-testid="duplicate-activity-button"');
    expect(html).toContain('data-testid="activity-duplicate-guest"');
    expect(html).toContain('href="/es/auth/entrar?next=%2Fes%2Fingles%2Factividades%2Fabc"');
  });
});

describe('GET /[lang]/ingles/actividades/[id] — ChuyoCode-owned activity (NULL authorId, 0020 account deletion transfer)', () => {
  it('renders 200 and offers heart/report/duplicate to a signed-in visitor — nobody owns a ChuyoCode activity', async () => {
    activityResult.value = { id: 'abc', title: 'x', level: null, blocks: [], authorId: null, heartCount: 3 };
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-testid="activity-heart-button"');
    expect(html).toContain('data-testid="report-activity-button"');
    expect(html).toContain('data-testid="duplicate-activity-button"');
  });

  it('still renders the guest fallback (200) for an anonymous visitor', async () => {
    activityResult.value = { id: 'abc', title: 'x', level: null, blocks: [], authorId: null, heartCount: 3 };
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: null },
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-testid="activity-heart-guest"');
    expect(html).toContain('data-testid="activity-duplicate-guest"');
  });
});

describe('GET /[lang]/ingles/actividades/[id] — "Compartir" (D8)', () => {
  it('renders the share trigger with a WhatsApp link encoding the title and the page URL', async () => {
    activityResult.value = { id: 'abc', title: 'Present simple', level: null, blocks: [], authorId: 'someone-else' };
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
    });
    const html = await res.text();
    expect(html).toContain('data-testid="exercise-share"');
    const expectedHref = `https://wa.me/?text=${encodeURIComponent(
      'Present simple https://chuyocode.test/es/ingles/actividades/abc',
    )}`;
    expect(html).toContain(expectedHref.replace(/&/g, '&amp;'));
  });

  // Guest play made this route (and its images) reachable without an
  // account, so the dialog no longer claims the recipient needs to sign in
  // — that used to be true (the whole route was gated) and no longer is.
  it('does not claim the recipient needs to sign in', async () => {
    activityResult.value = { id: 'abc', title: 'x', level: null, blocks: [], authorId: 'someone-else' };
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
    });
    const html = await res.text();
    expect(html).not.toContain('data-testid="exercise-share-note"');
    expect(html).not.toContain('iniciar sesión');
  });
});

describe('GET /[lang]/ingles/actividades/[id] — guest play (anonymous visitor)', () => {
  // The guest invite moved off the top of the page and into the result
  // screen (UX-INGLES.md 6.3, build item N1) — `GameResult.tsx` renders it
  // client-side only once a round ends, so the server-rendered page never
  // has a top banner for anyone, guest or signed-in. `GameResult.test.tsx`
  // covers the invite's own copy/link; this only checks the wiring that
  // gets it there — the island receives a `guest` prop (serialized into its
  // own `astro-island` props) only for an anonymous visitor.
  it('renders no top guest banner for an anonymous visitor, and wires the sign-up href to the practice island instead', async () => {
    activityResult.value = { id: 'abc', title: 'x', level: null, blocks: [], authorId: 'someone-else' };
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: null },
    });
    const html = await res.text();
    expect(html).not.toContain('data-testid="guest-banner"');
    expect(html).toContain('signUpHref&quot;:[0,&quot;/es/auth/entrar?mode=signup&amp;next=%2Fes%2Fingles%2Factividades%2Fabc&quot;');
  });

  it('renders no top guest banner for a signed-in visitor either, and wires no guest prop', async () => {
    activityResult.value = { id: 'abc', title: 'x', level: null, blocks: [], authorId: 'someone-else' };
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
    });
    const html = await res.text();
    expect(html).not.toContain('data-testid="guest-banner"');
    expect(html).not.toContain('signUpHref');
  });

  it('never mounts the per-user "Ya lo viste" view badge for an anonymous visitor', async () => {
    activityResult.value = { id: 'abc', title: 'x', level: null, blocks: [], authorId: 'someone-else' };
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: null },
    });
    const html = await res.text();
    expect(html).not.toContain('ActivityViewBadge');
  });

  it('still mounts the view badge island for a signed-in visitor', async () => {
    activityResult.value = { id: 'abc', title: 'x', level: null, blocks: [], authorId: 'someone-else' };
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
    });
    const html = await res.text();
    expect(html).toContain('ActivityViewBadge');
  });

  it('the window carries the activity id as its own minimize-to-tray id for a signed-in visitor', async () => {
    activityResult.value = { id: 'abc', title: 'x', level: null, blocks: [], authorId: 'someone-else' };
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
    });
    const html = await res.text();
    expect(html).toMatch(/<section[^>]*data-desk-window[^>]*data-tray-id="abc"[^>]*>/);
  });

  it('a guest window carries no tray id (no desk/tray behind a guest)', async () => {
    activityResult.value = { id: 'abc', title: 'x', level: null, blocks: [], authorId: 'someone-else' };
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: null },
    });
    const html = await res.text();
    expect(html).not.toContain('data-tray-id');
  });

  it('still renders the practice island (playing/checking answers keep working) for a guest', async () => {
    activityResult.value = {
      id: 'abc',
      title: 'x',
      level: null,
      authorId: 'someone-else',
      blocks: [
        {
          id: 'w1',
          type: 'worksheet',
          rotation: 0,
          image: { path: 'activity-images/abc/img-1.webp', width: 800, height: 400 },
          zones: [{ id: 'z1', x: 0.1, y: 0.1, w: 0.2, h: 0.1, kind: 'text', answers: ['cat'] }],
        },
      ],
    };
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: null },
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-testid="worksheet-player"');
  });

  it('still renders the Compartir, Imprimir and Presentar entry points for a guest', async () => {
    activityResult.value = {
      id: 'abc',
      title: 'x',
      level: null,
      authorId: 'someone-else',
      blocks: [
        {
          id: 'q1',
          type: 'quiz',
          payload: {
            pools: { opts: [{ id: 'a', text: 'x' }] },
            slots: [{ id: 's1', label: 'x', input: 'choice', pool: 'opts', answer: ['a'] }],
          },
        },
      ],
    };
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: null },
    });
    const html = await res.text();
    expect(html).toContain('data-testid="exercise-share"');
    expect(html).toContain('data-testid="activity-print-link"');
    expect(html).toContain('data-testid="activity-present-link"');
  });

  it('404s an anonymous visit to a draft/unpublished activity, same as a missing one', async () => {
    activityResult.value = null;
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: null },
    });
    expect(res.status).toBe(404);
  });
});

describe('GET /[lang]/ingles/actividades/[id] — "Presentar" (presentation mode v1)', () => {
  it('links to the presentation page when the activity has at least one quiz question', async () => {
    activityResult.value = {
      id: 'abc',
      title: 'x',
      level: null,
      authorId: 'someone-else',
      blocks: [
        {
          id: 'q1',
          type: 'quiz',
          payload: {
            pools: { opts: [{ id: 'a', text: 'x' }] },
            slots: [{ id: 's1', label: 'x', input: 'choice', pool: 'opts', answer: ['a'] }],
          },
        },
      ],
    };
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
    });
    const html = await res.text();
    expect(html).toContain('data-testid="activity-present-link"');
    expect(html).toContain('href="/es/ingles/actividades/abc/presentar"');
  });

  it('shows the link for an activity with only worksheet blocks (the worksheet zoom tour, sprint week 3)', async () => {
    activityResult.value = {
      id: 'abc',
      title: 'x',
      level: null,
      authorId: 'someone-else',
      blocks: [
        {
          id: 'w1',
          type: 'worksheet',
          rotation: 0,
          image: { path: 'activity-images/abc/img-1.webp', width: 800, height: 400 },
          zones: [{ id: 'z1', x: 0.1, y: 0.1, w: 0.2, h: 0.1, kind: 'text', answers: ['cat'] }],
        },
      ],
    };
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
    });
    const html = await res.text();
    expect(html).toContain('data-testid="activity-present-link"');
  });

  it('hides the link for an activity with only an EMPTY worksheet block (no zones yet)', async () => {
    activityResult.value = {
      id: 'abc',
      title: 'x',
      level: null,
      authorId: 'someone-else',
      blocks: [
        {
          id: 'w1',
          type: 'worksheet',
          rotation: 0,
          image: { path: 'activity-images/abc/img-1.webp', width: 800, height: 400 },
          zones: [],
        },
      ],
    };
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
    });
    const html = await res.text();
    expect(html).not.toContain('data-testid="activity-present-link"');
  });

  it('hides the link for an activity with no blocks at all', async () => {
    activityResult.value = { id: 'abc', title: 'x', level: null, blocks: [], authorId: 'someone-else' };
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
    });
    const html = await res.text();
    expect(html).not.toContain('data-testid="activity-present-link"');
  });
});

describe('GET /[lang]/ingles/actividades/[id] — "Imprimir" (D6)', () => {
  it('links to the print-optimized page for this activity', async () => {
    activityResult.value = { id: 'abc', title: 'x', level: null, blocks: [], authorId: 'someone-else' };
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
    });
    const html = await res.text();
    expect(html).toContain('data-testid="activity-print-link"');
    expect(html).toContain('href="/es/ingles/actividades/abc/imprimir"');
  });
});

describe('GET /[lang]/ingles/actividades/[id] — "Basado en" credit line (D7)', () => {
  it('shows nothing extra when the activity has no source', async () => {
    activityResult.value = { id: 'abc', title: 'x', level: null, blocks: [], authorId: 'someone-else', source: null };
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
    });
    const html = await res.text();
    expect(html).not.toContain('data-testid="activity-based-on"');
  });

  it('shows a link to the source when it is still live', async () => {
    activityResult.value = {
      id: 'abc',
      title: 'Copia',
      level: null,
      blocks: [],
      authorId: 'someone-else',
      source: { id: 'orig-1', title: 'Original', visible: true },
    };
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
    });
    const html = await res.text();
    expect(html).toContain('data-testid="activity-based-on"');
    expect(html).toContain('Original');
    expect(html).toContain('href="/es/ingles/actividades/orig-1"');
  });

  it('shows the title with no link once the source is no longer live', async () => {
    activityResult.value = {
      id: 'abc',
      title: 'Copia',
      level: null,
      blocks: [],
      authorId: 'someone-else',
      source: { id: 'orig-1', title: 'Original', visible: false },
    };
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
    });
    const html = await res.text();
    expect(html).toContain('data-testid="activity-based-on"');
    expect(html).toContain('Original');
    expect(html).not.toContain('href="/es/ingles/actividades/orig-1"');
  });
});

// T2 (practice page action bar redesign): Compartir/Duplicar/Reportar/
// Presentar/Imprimir became icon buttons, each with an accessible name
// (`aria-label`, never only the native `title`). PART 6a moved this whole
// action bar into the window's title bar (`actions` slot). N6 FOLLOW-UP
// (2026-10-12): Imprimir/Duplicar/Reportar (and Compartir/Presentar's OWN
// phone-only copies inside "Más") dropped the hover/focus tooltip — they
// now carry an ALWAYS-visible text label instead (`MENU_ITEM_CLASS`, see
// `iconTooltip.ts`'s own header) — only the STANDALONE `sm:`-and-up
// Compartir/Presentar triggers, "Modo enfoque" and "Más" itself keep the
// tooltip pattern (see the dedicated "N6 follow-up" describe block below
// for the full breakpoint/menu-label contract).
describe('GET /[lang]/ingles/actividades/[id] — action bar icon buttons with tooltips (T2)', () => {
  it('the standalone Presentar trigger (`sm:` and up) carries an accessible name and a linked tooltip', async () => {
    activityResult.value = {
      id: 'abc',
      title: 'x',
      level: null,
      authorId: 'someone-else',
      blocks: [
        {
          id: 'q1',
          type: 'quiz',
          payload: {
            pools: { opts: [{ id: 'a', text: 'x' }] },
            slots: [{ id: 's1', label: 'x', input: 'choice', pool: 'opts', answer: ['a'] }],
          },
        },
      ],
    };
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
    });
    const html = await res.text();

    expect(html).toContain('aria-label="Presentar"');
    expect(html).toContain('aria-describedby="action-present-tooltip"');
    expect(html).toContain('id="action-present-tooltip"');
    expect(html).toContain('role="tooltip"');

    // Imprimir (now "Más"-only, N6 follow-up): an accessible name, but no
    // tooltip id left — a visible text label replaces it instead.
    expect(html).toContain('aria-label="Imprimir"');
    expect(html).not.toContain('action-print-tooltip');
  });

  // "Modo enfoque" (full-screen exercise mode, owner spec 2026-10-07): a
  // plain vanilla `<button>` (no `href` — nothing to navigate to), wired up
  // by id from `ActivityPracticeIsland`'s own separate hydration island.
  // Deliberately NOT labeled "Pantalla completa" like the window's own green
  // light — see `i18n.ts`'s own comment on why that would collide.
  it('renders the "Modo enfoque" toggle button, wired by id, never labeled the same as the window\'s own full-screen light', async () => {
    activityResult.value = { id: 'abc', title: 'x', level: null, blocks: [] };
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
    });
    const html = await res.text();
    expect(html).toMatch(/<button[^>]*id="activity-focus-mode-toggle"[^>]*>/);
    expect(html).toContain('data-testid="activity-focus-mode-toggle"');
    expect(html).toContain('aria-label="Modo enfoque"');
    expect(html).toContain('aria-pressed="false"');
    // The window's own green "full screen" light still exists, as a SEPARATE
    // control — this button never reuses its exact accessible name.
    const greenLightIndex = html.indexOf('data-desk-window-fullscreen');
    const toggleIndex = html.indexOf('id="activity-focus-mode-toggle"');
    expect(greenLightIndex).toBeGreaterThan(-1);
    expect(toggleIndex).toBeGreaterThan(-1);
    expect(greenLightIndex).not.toBe(toggleIndex);
  });

  // N6 follow-up: these are "Más"-only now too — a visible text label
  // replaces the old hover/focus tooltip (see the dedicated describe block
  // below for the full assertion on that visible label).
  it('the Duplicar/Reportar guest fallback links carry an accessible name, no separate tooltip', async () => {
    activityResult.value = { id: 'abc', title: 'x', level: null, blocks: [], authorId: 'someone-else' };
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: null },
    });
    const html = await res.text();

    expect(html).toContain('data-testid="activity-duplicate-guest"');
    expect(html).toContain('aria-label="Duplicar"');
    expect(html).not.toContain('action-duplicate-guest-tooltip');

    expect(html).toContain('data-testid="activity-report-guest"');
    expect(html).toContain('aria-label="Reportar"');
    expect(html).not.toContain('action-report-guest-tooltip');
  });

  it('Compartir (ShareDialog) renders icon-only with iconOnly, keeping the share dialog itself unchanged', async () => {
    activityResult.value = { id: 'abc', title: 'x', level: null, blocks: [], authorId: 'someone-else' };
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
    });
    const html = await res.text();

    expect(html).toContain('data-testid="exercise-share"');
    // The island receives `iconOnly: true` as a prop (server-rendered island
    // payload), not visible text next to the icon in the static markup.
    expect(html).toContain('&quot;iconOnly&quot;:[0,true]');
  });
});

// N6 (fewer equal-weight buttons while playing): at every width, the title
// bar now shows ❤ + Compartir + Presentar + the focus-mode toggle directly,
// with Imprimir/Duplicar/Reportar moved into the "Más" menu — reusing the
// SAME phone dropdown pattern at every width, instead of the old
// desktop-only flat row.
describe('GET /[lang]/ingles/actividades/[id] — N6: fewer equal-weight buttons, "Más" at every width', () => {
  it('keeps Compartir, Presentar and the focus-mode toggle OUTSIDE the "Más" panel', async () => {
    activityResult.value = {
      id: 'abc',
      title: 'x',
      level: null,
      authorId: 'someone-else',
      blocks: [
        {
          id: 'q1',
          type: 'quiz',
          payload: {
            pools: { opts: [{ id: 'a', text: 'x' }] },
            slots: [{ id: 's1', label: 'x', input: 'choice', pool: 'opts', answer: ['a'] }],
          },
        },
      ],
    };
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
    });
    const html = await res.text();
    const morePanel = html.indexOf('data-desk-window-more-content');
    expect(morePanel).toBeGreaterThan(-1);

    expect(html.indexOf('data-testid="exercise-share"')).toBeGreaterThan(-1);
    expect(html.indexOf('data-testid="exercise-share"')).toBeLessThan(morePanel);
    expect(html.indexOf('data-testid="activity-present-link"')).toBeLessThan(morePanel);
    expect(html.indexOf('id="activity-focus-mode-toggle"')).toBeLessThan(morePanel);
  });

  it('holds only Imprimir, Duplicar and Reportar inside "Más", in that order', async () => {
    activityResult.value = { id: 'abc', title: 'x', level: null, blocks: [], authorId: 'someone-else' };
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
    });
    const html = await res.text();
    const morePanel = html.indexOf('data-desk-window-more-content');
    const print = html.indexOf('data-testid="activity-print-link"');
    const duplicate = html.indexOf('data-testid="duplicate-activity-button"');
    const report = html.indexOf('data-testid="report-activity-button"');

    expect(print).toBeGreaterThan(morePanel);
    expect(duplicate).toBeGreaterThan(print);
    expect(report).toBeGreaterThan(duplicate);

    // Never duplicated OUTSIDE the panel (one copy of each action, same
    // posture PART 6a already documented).
    expect(html.indexOf('data-testid="activity-print-link"', print + 1)).toBe(-1);
  });

  it('the "Más" trigger is no longer desktop-only (no `desk:hidden` on it)', async () => {
    activityResult.value = { id: 'abc', title: 'x', level: null, blocks: [], authorId: 'someone-else' };
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
    });
    const html = await res.text();
    const triggerMatch = html.match(/<label[^>]*data-testid="activity-window-more-trigger"[^>]*class="([^"]*)"/);
    expect(triggerMatch?.[1]).toBeTruthy();
    expect(triggerMatch?.[1]).not.toContain('desk:hidden');
  });

  it('every item keeps its own test id/behavior for a guest, now inside "Más"', async () => {
    activityResult.value = { id: 'abc', title: 'x', level: null, blocks: [], authorId: 'someone-else' };
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: null },
    });
    const html = await res.text();
    const morePanel = html.indexOf('data-desk-window-more-content');
    expect(html.indexOf('data-testid="activity-duplicate-guest"')).toBeGreaterThan(morePanel);
    expect(html.indexOf('data-testid="activity-report-guest"')).toBeGreaterThan(morePanel);
    // Compartir/Presentar/focus-mode stay outside, same as for a signed-in visitor.
    expect(html.indexOf('data-testid="exercise-share"')).toBeLessThan(morePanel);
  });
});

// N6 FOLLOW-UP (owner report 2026-10-12, `capturas/ux-n6-n7/practice-phone-
// 390x844-more-open.png`): the title collapsed to "V…" on a 390px phone —
// five standalone icons (❤/Compartir/Presentar/Modo enfoque/Más) left no
// room for it. Fix, by the STANDARD `sm` breakpoint (640px — not the custom
// `desk:` one the rest of this page uses):
//   - below `sm`: only ❤ and "Modo enfoque" stay standalone; Compartir and
//     Presentar rejoin "Más" (phone order: Compartir, Presentar, Imprimir,
//     Duplicar, Reportar).
//   - `sm` and up: unchanged from N6 (Compartir/Presentar standalone; "Más"
//     = Imprimir, Duplicar, Reportar).
// ONE "Más" panel (not two menus): each of Compartir/Presentar is rendered
// TWICE — once standalone (wrapped `hidden sm:contents`), once inside the
// SAME panel (phone-only, `contents sm:hidden` / `sm:hidden`) — distinct
// test ids (`exercise-share-menu`, `activity-present-link-menu`) keep the
// two nodes unambiguous. Every item inside "Más" also gained a visible
// icon+text label (`MENU_ITEM_CLASS`), replacing the old icon-only +
// hover-tooltip-only pattern that had no text at all on a touch device.
describe('GET /[lang]/ingles/actividades/[id] — N6 follow-up: phone collapse + "Más" labels', () => {
  function activityWithQuiz() {
    return {
      id: 'abc',
      title: 'x',
      level: null,
      authorId: 'someone-else',
      blocks: [
        {
          id: 'q1',
          type: 'quiz',
          payload: {
            pools: { opts: [{ id: 'a', text: 'x' }] },
            slots: [{ id: 's1', label: 'x', input: 'choice', pool: 'opts', answer: ['a'] }],
          },
        },
      ],
    };
  }

  /** The nearest `class="..."` attribute value around a given `data-testid`
   * marker, regardless of whether `class` lands before or after it in the
   * rendered attribute order (it differs between a plain Astro element and
   * a React-rendered `Button`, which puts `class` first — see this file's
   * own `triggerMatch` pattern above for the single-direction version). */
  function classNear(html: string, testid: string): string | undefined {
    const testidIdx = html.indexOf(`data-testid="${testid}"`);
    if (testidIdx === -1) return undefined;
    // The FULL enclosing tag (from its own `<` to its own `>`), regardless
    // of whether `class` lands before or after `data-testid` in it (it
    // differs between a plain Astro element and a React-rendered `Button`).
    const tagStart = html.lastIndexOf('<', testidIdx);
    const tagEnd = html.indexOf('>', testidIdx);
    if (tagStart === -1 || tagEnd === -1) return undefined;
    const tag = html.slice(tagStart, tagEnd + 1);
    return tag.match(/class="([^"]*)"/)?.[1];
  }

  it('Compartir/Presentar standalone copies are hidden below `sm`, shown `sm:` and up', async () => {
    activityResult.value = activityWithQuiz();
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
    });
    const html = await res.text();
    // Exactly two `hidden sm:contents` wrappers: one around the standalone
    // ShareDialog, one around the standalone Presentar link.
    expect((html.match(/hidden sm:contents/g) ?? []).length).toBe(2);
    expect(classNear(html, 'exercise-share')).toContain('size-9'); // the iconOnly trigger itself, untouched
  });

  it('"Modo enfoque" and "Más" stay visible at every width (never gain a `hidden`/`sm:hidden` class)', async () => {
    activityResult.value = activityWithQuiz();
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
    });
    const html = await res.text();
    const focusClass = classNear(html, 'activity-focus-mode-toggle');
    const moreClass = classNear(html, 'activity-window-more-trigger');
    for (const cls of [focusClass, moreClass]) {
      expect(cls).toBeTruthy();
      expect(cls).not.toMatch(/(^|\s)hidden(\s|$)/);
      expect(cls).not.toContain('sm:hidden');
    }
  });

  it('"Más" holds Compartir, Presentar, Imprimir, Duplicar, Reportar in that order (phone order)', async () => {
    activityResult.value = activityWithQuiz();
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
    });
    const html = await res.text();
    const morePanel = html.indexOf('data-desk-window-more-content');
    const shareMenu = html.indexOf('data-testid="exercise-share-menu"');
    const presentMenu = html.indexOf('data-testid="activity-present-link-menu"');
    const print = html.indexOf('data-testid="activity-print-link"');
    const duplicate = html.indexOf('data-testid="duplicate-activity-button"');
    const report = html.indexOf('data-testid="report-activity-button"');

    expect(morePanel).toBeGreaterThan(-1);
    expect(shareMenu).toBeGreaterThan(morePanel);
    expect(presentMenu).toBeGreaterThan(shareMenu);
    expect(print).toBeGreaterThan(presentMenu);
    expect(duplicate).toBeGreaterThan(print);
    expect(report).toBeGreaterThan(duplicate);
  });

  it('Compartir/Presentar\'s "Más" copies are phone-only (`sm:hidden`/`contents sm:hidden`)', async () => {
    activityResult.value = activityWithQuiz();
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
    });
    const html = await res.text();
    expect(html).toContain('contents sm:hidden'); // wraps the ShareDialog menu copy
    expect(classNear(html, 'activity-present-link-menu')).toContain('sm:hidden');
  });

  it('every "Más" item carries a visible icon + text label (`min-h-11`), not just a hover tooltip', async () => {
    activityResult.value = activityWithQuiz();
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
    });
    const html = await res.text();
    const items: Array<[string, string]> = [
      ['exercise-share-menu', 'Compartir'],
      ['activity-present-link-menu', 'Presentar'],
      ['activity-print-link', 'Imprimir'],
      ['duplicate-activity-button', 'Duplicar'],
      ['report-activity-button', 'Reportar'],
    ];
    for (const [testid, label] of items) {
      const cls = classNear(html, testid);
      expect(cls, `${testid} class`).toContain('min-h-11');
      const idx = html.indexOf(`data-testid="${testid}"`);
      const nearby = html.slice(idx, idx + 600);
      expect(nearby, `${testid} label`).toContain(label);
      // No separate hover-only tooltip bubble left on these — the label is
      // already visible text (iconTooltip.ts's own header on why).
      expect(nearby, `${testid} no tooltip`).not.toContain('role="tooltip"');
    }
  });

  it('the guest fallback "Más" items (Duplicar/Reportar) also carry visible labels', async () => {
    activityResult.value = activityWithQuiz();
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: null },
    });
    const html = await res.text();
    for (const [testid, label] of [
      ['activity-duplicate-guest', 'Duplicar'],
      ['activity-report-guest', 'Reportar'],
    ] as const) {
      const cls = classNear(html, testid);
      expect(cls, `${testid} class`).toContain('min-h-11');
      const idx = html.indexOf(`data-testid="${testid}"`);
      expect(html.slice(idx, idx + 600)).toContain(label);
    }
  });
});

// Owner decision 2026-10-12 (R1): the author can open, play and present
// their OWN activity even when it is not published (draft/pending/
// rejected) -- everyone else (anonymous or any other signed-in visitor)
// keeps getting the same plain 404 as today, so an id's existence is never
// leaked. `getActivityForEdit` is tried ONLY as a fallback, once
// `getPublishedActivity` returns `null` AND a visitor is signed in -- see
// `[id].astro`'s own header.
describe('GET /[lang]/ingles/actividades/[id] -- author preview of an unpublished activity (owner decision 2026-10-12)', () => {
  const DRAFT_EDIT = {
    id: 'abc',
    title: 'Mi borrador',
    level: 'A2',
    blocks: [],
    revisionId: 'rev-1',
    revisionStatus: 'draft',
    status: 'draft',
    reviewNote: null,
    source: null,
  };

  it('404s for an anonymous visitor (never falls back to getActivityForEdit with no user)', async () => {
    activityResult.value = null;
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: null },
    });
    expect(res.status).toBe(404);
    expect(getActivityForEditMock).not.toHaveBeenCalled();
  });

  it('404s for a DIFFERENT signed-in visitor, not this activity author', async () => {
    activityResult.value = null;
    editActivityResult.value = null;
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'stranger-1' } },
    });
    expect(res.status).toBe(404);
    expect(getActivityForEditMock).toHaveBeenCalledWith('abc', 'stranger-1');
  });

  it('renders 200 with the player for the own author, a draft', async () => {
    activityResult.value = null;
    editActivityResult.value = DRAFT_EDIT;
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Mi borrador');
    expect(getActivityForEditMock).toHaveBeenCalledWith('abc', 'user-1');
  });

  it('shows the status pill in the title bar -- Borrador', async () => {
    activityResult.value = null;
    editActivityResult.value = DRAFT_EDIT;
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
    });
    const html = await res.text();
    expect(html).toContain('data-testid="desk-window-status-chip"');
    expect(html).toContain('Borrador');
  });

  it('shows En revision for a pending_review preview', async () => {
    activityResult.value = null;
    editActivityResult.value = { ...DRAFT_EDIT, status: 'pending_review', revisionStatus: 'pending_review' };
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
    });
    const html = await res.text();
    expect(html).toContain('En revisión');
  });

  it('shows Rechazada for a rejected preview', async () => {
    activityResult.value = null;
    editActivityResult.value = { ...DRAFT_EDIT, status: 'rejected', reviewNote: 'Falta algo' };
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
    });
    const html = await res.text();
    expect(html).toContain('Rechazada');
  });

  it('never shows the status pill for a normal published render', async () => {
    activityResult.value = { id: 'abc', title: 'x', level: null, blocks: [] };
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
    });
    const html = await res.text();
    expect(html).not.toContain('data-testid="desk-window-status-chip"');
  });

  it('Compartir shows the owner message instead of the share dialog content -- pending_review wording', async () => {
    activityResult.value = null;
    editActivityResult.value = { ...DRAFT_EDIT, status: 'pending_review', revisionStatus: 'pending_review' };
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
    });
    const html = await res.text();
    expect(html).toContain(
      'No se puede compartir la actividad porque está en revisión, por el momento solo está disponible para ti 😘',
    );
    expect(html).not.toContain('data-testid="exercise-qr"');
    expect(html).not.toContain('data-testid="exercise-share-copy"');
  });

  it('Compartir shows the unpublished wording for a draft/rejected preview', async () => {
    activityResult.value = null;
    editActivityResult.value = DRAFT_EDIT;
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
    });
    const html = await res.text();
    expect(html).toContain(
      'No se puede compartir la actividad porque todavía no está publicada, por el momento solo está disponible para ti 😘',
    );
  });

  it('hides heart, Duplicar and Reportar entirely for the own unpublished preview', async () => {
    activityResult.value = null;
    editActivityResult.value = DRAFT_EDIT;
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
    });
    const html = await res.text();
    expect(html).not.toContain('data-testid="activity-heart-button"');
    expect(html).not.toContain('data-testid="activity-heart-readonly"');
    expect(html).not.toContain('data-testid="activity-heart-guest"');
    expect(html).not.toContain('data-testid="duplicate-activity-button"');
    expect(html).not.toContain('data-testid="activity-duplicate-guest"');
    expect(html).not.toContain('data-testid="report-activity-button"');
    expect(html).not.toContain('data-testid="activity-report-guest"');
  });

  it('never mounts the view badge (no visto call) for the own unpublished preview', async () => {
    activityResult.value = null;
    editActivityResult.value = DRAFT_EDIT;
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
    });
    const html = await res.text();
    expect(html).not.toContain('ActivityViewBadge');
  });

  it('still offers Otra actividad via the practice island nextHref', async () => {
    activityResult.value = null;
    editActivityResult.value = DRAFT_EDIT;
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
    });
    const html = await res.text();
    expect(html).toContain('/es/ingles/actividades?nivel=A2');
  });

  it('the author preview response is never cacheable (private, no-store)', async () => {
    activityResult.value = null;
    editActivityResult.value = DRAFT_EDIT;
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
    });
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });
});
