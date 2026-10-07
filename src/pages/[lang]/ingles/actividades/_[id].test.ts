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

const { activityResult, heartedResult, hasHeartedActivityMock } = vi.hoisted(() => ({
  activityResult: { value: null as unknown },
  heartedResult: { value: false },
  hasHeartedActivityMock: vi.fn(async () => heartedResult.value),
}));

const getActivityCount = vi.fn();
const getPublishedActivities = vi.fn();
vi.mock('@lib/activities/activities', () => ({
  getPublishedActivity: vi.fn(async () => activityResult.value),
  getActivityCount: (...args: unknown[]) => getActivityCount(...args),
  getPublishedActivities: (...args: unknown[]) => getPublishedActivities(...args),
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
  heartedResult.value = false;
  hasHeartedActivityMock.mockClear();
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
  it('renders the friendly guest banner with a sign-up link back to this page', async () => {
    activityResult.value = { id: 'abc', title: 'x', level: null, blocks: [], authorId: 'someone-else' };
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: null },
    });
    const html = await res.text();
    expect(html).toContain('data-testid="guest-banner"');
    expect(html).toContain('Estás jugando como invitado');
    expect(html).toContain('data-testid="guest-sign-up-link"');
    expect(html).toContain('href="/es/auth/entrar?mode=signup&amp;next=%2Fes%2Fingles%2Factividades%2Fabc"');
  });

  it('shows no guest banner for a signed-in visitor', async () => {
    activityResult.value = { id: 'abc', title: 'x', level: null, blocks: [], authorId: 'someone-else' };
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
    });
    const html = await res.text();
    expect(html).not.toContain('data-testid="guest-banner"');
  });

  it('renders the English guest banner copy and sign-up label', async () => {
    activityResult.value = { id: 'abc', title: 'x', level: null, blocks: [], authorId: 'someone-else' };
    const res = await render('https://chuyocode.test/en/ingles/actividades/abc', {
      params: { lang: 'en', id: 'abc' },
      locals: { user: null },
    });
    const html = await res.text();
    // The apostrophe is HTML-entity-escaped by the renderer (`&#39;`).
    expect(html).toContain('playing as a guest');
    expect(html).toContain('>Sign up<');
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
// (`aria-label`, never only the native `title`) and a hover/focus tooltip
// (`role="tooltip"`, wired via `aria-describedby`) carrying that same label.
// PART 6a moved this whole action bar into the window's title bar
// (`actions` slot) — the buttons themselves are unchanged.
describe('GET /[lang]/ingles/actividades/[id] — action bar icon buttons with tooltips (T2)', () => {
  it('Presentar and Imprimir (plain Astro links) carry an accessible name and a linked tooltip', async () => {
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

    expect(html).toContain('aria-label="Imprimir"');
    expect(html).toContain('aria-describedby="action-print-tooltip"');
    expect(html).toContain('id="action-print-tooltip"');

    expect(html).toContain('role="tooltip"');
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

  it('the Duplicar/Reportar guest fallback links also carry an accessible name and a linked tooltip', async () => {
    activityResult.value = { id: 'abc', title: 'x', level: null, blocks: [], authorId: 'someone-else' };
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: null },
    });
    const html = await res.text();

    expect(html).toContain('data-testid="activity-duplicate-guest"');
    expect(html).toContain('aria-label="Duplicar"');
    expect(html).toContain('aria-describedby="action-duplicate-guest-tooltip"');

    expect(html).toContain('data-testid="activity-report-guest"');
    expect(html).toContain('aria-label="Reportar"');
    expect(html).toContain('aria-describedby="action-report-guest-tooltip"');
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
