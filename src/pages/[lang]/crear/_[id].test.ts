import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createContainer } from '@/testSupport/astroContainer';

// `loadDeskSceneData` (the desk behind the window, "desktop" redesign PART
// 6b, same loader the practice window already uses) pulls in `@lib/profile`
// -> `@lib/access` -> `@lib/supabase` -> `loadEnv`, which reads
// `import.meta.env` — stub it before any module that calls it, same posture
// as `src/pages/[lang]/ingles/actividades/_[id].test.ts`.
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

const { editableActivity } = vi.hoisted(() => ({
  editableActivity: { value: null as unknown },
}));

const getActivityCount = vi.fn();
const getPublishedActivities = vi.fn();
vi.mock('@lib/activities/activities', () => ({
  getActivityForEdit: vi.fn(async () => editableActivity.value),
  getActivityCount: (...args: unknown[]) => getActivityCount(...args),
  getPublishedActivities: (...args: unknown[]) => getPublishedActivities(...args),
}));

// The desk behind the window shares the hub's own exercise count — mocked
// here so no network happens, same posture as the hub's own test file.
const getExerciseCount = vi.fn();
vi.mock('@lib/exercises', () => ({
  getExerciseCount: (...args: unknown[]) => getExerciseCount(...args),
}));

vi.mock('@lib/activities/storage', () => ({
  publicImageUrl: (path: string) => `https://public.example/${path}`,
}));

import EditPage from './[id].astro';

async function render(
  url: string,
  { params, locals }: { params: Record<string, string>; locals?: Record<string, unknown> },
) {
  const container = await createContainer();
  return container.renderToResponse(EditPage, {
    locals: { user: null, ...locals },
    params,
    request: new Request(url),
  });
}

beforeEach(() => {
  editableActivity.value = null;
  getActivityCount.mockReset();
  getPublishedActivities.mockReset();
  getExerciseCount.mockReset();
  getActivityCount.mockResolvedValue(null);
  getPublishedActivities.mockResolvedValue({ activities: [], total: 0 });
  getExerciseCount.mockResolvedValue(null);
});

describe('GET /[lang]/crear/[id] — routing', () => {
  it('404s for an unsupported lang segment', async () => {
    const res = await render('https://chuyocode.test/fr/crear/abc', { params: { lang: 'fr', id: 'abc' } });
    expect(res.status).toBe(404);
  });
});

describe('GET /[lang]/crear/[id] — anonymous gate', () => {
  it('redirects to sign-in with next pointing back at this exact edit URL', async () => {
    const res = await render('https://chuyocode.test/es/crear/abc', { params: { lang: 'es', id: 'abc' } });
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/es/auth/entrar?next=%2Fes%2Fcrear%2Fabc');
  });

  it('is never publicly cacheable', async () => {
    const res = await render('https://chuyocode.test/es/crear/abc', { params: { lang: 'es', id: 'abc' } });
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });
});

describe('GET /[lang]/crear/[id] — ownership re-verified server-side', () => {
  it('404s when the activity does not exist or is not owned by the caller — same shape either way', async () => {
    editableActivity.value = null;
    const res = await render('https://chuyocode.test/es/crear/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
    });
    expect(res.status).toBe(404);
  });

  it('never ships the editor markup on the 404 path', async () => {
    editableActivity.value = null;
    const res = await render('https://chuyocode.test/es/crear/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
    });
    const html = await res.text();
    expect(html).not.toContain('data-testid="activity-editor-island"');
  });

  it('is never publicly cacheable — WHICH id 404s depends on who is asking', async () => {
    editableActivity.value = null;
    const res = await render('https://chuyocode.test/es/crear/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
    });
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });
});

describe('GET /[lang]/crear/[id] — owner render', () => {
  it('renders the editor island seeded from the stored activity', async () => {
    editableActivity.value = {
      id: 'abc',
      title: 'Mi actividad',
      level: 'B1',
      blocks: [],
      revisionId: 'rev-1',
      revisionStatus: 'draft',
      status: 'draft',
      reviewNote: null,
    };

    const res = await render('https://chuyocode.test/es/crear/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-testid="activity-editor-island"');
    expect(html).toContain('Mi actividad');
  });

  // "Desktop" redesign PART 6b: the editor renders as a WINDOW over the
  // desk, same shell the practice page's own PART 6a already uses — the OLD
  // back button (both the floating `lg:` one and `ActivityEditorIsland`'s
  // own mobile-inline copy) is gone; the red light replaces it.
  //
  // PART 6c (owner spec 2026-10-07): both lights now target the HUB
  // (`/es/ingles`), not `/es/mis-actividades` — minimize so the tray chip is
  // actually visible there, close ALWAYS (never `history.back()` to the old
  // tracked-previous-path fallback — the removed `closeUsesTrackedPath`/
  // `resolveTrackedCloseAction` behaviour, `@lib/ui/deskWindow.ts`). The
  // window is also non-modal now — no `aria-modal`.
  it('renders the window shell: a dialog with three named "traffic light" buttons, closing straight to the hub', async () => {
    editableActivity.value = {
      id: 'abc',
      title: 'Mi actividad',
      level: 'B1',
      blocks: [],
      revisionId: 'rev-1',
      revisionStatus: 'draft',
      status: 'draft',
      reviewNote: null,
    };
    const res = await render('https://chuyocode.test/es/crear/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
    });
    const html = await res.text();
    expect(html).toContain('data-desk-window');
    expect(html).toContain('role="dialog"');
    expect(html).not.toContain('aria-modal');
    expect(html).toContain('aria-label="Cerrar"');
    expect(html).toContain('aria-label="Minimizar"');
    expect(html).toContain('aria-label="Pantalla completa"');
    expect(html).toContain('href="/es/ingles"');
    expect(html).not.toContain('href="/es/mis-actividades"');
    expect(html).not.toContain('data-back-button');
  });

  it('shows the activity title in the window title bar, and the muted autosave status next to it', async () => {
    editableActivity.value = {
      id: 'abc',
      title: 'Mi actividad',
      level: 'B1',
      blocks: [],
      revisionId: 'rev-1',
      revisionStatus: 'draft',
      status: 'draft',
      reviewNote: null,
    };
    const res = await render('https://chuyocode.test/es/crear/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
    });
    const html = await res.text();
    expect(html).toContain('id="desk-window-title"');
    const titleIndex = html.indexOf('id="desk-window-title"');
    expect(html.slice(titleIndex, titleIndex + 400)).toContain('Mi actividad');
    expect(html).toContain('id="desk-window-status"');
    expect(html).toContain('Guardado hace un momento');
  });

  // "No side bands" polish (owner report: the grey canvas sat as a centred
  // column with the window's own white body colour showing through on
  // either side at wide viewports) — the body surface must span the
  // window's full width, with only the shared `ROW_PADDING_X` inset.
  it('renders the body as one edge-to-edge grey surface, never a centred max-width column', async () => {
    editableActivity.value = {
      id: 'abc',
      title: 'Mi actividad',
      level: 'B1',
      blocks: [],
      revisionId: 'rev-1',
      revisionStatus: 'draft',
      status: 'draft',
      reviewNote: null,
    };
    const res = await render('https://chuyocode.test/es/crear/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
    });
    const html = await res.text();
    expect(html).not.toContain('max-w-6xl');
    expect(html).toMatch(/class="[^"]*\bw-full\b[^"]*\bbg-muted\b[^"]*"/);
  });

  it('falls back to "Nueva actividad" in the title bar for a brand-new, still-untitled activity', async () => {
    editableActivity.value = {
      id: 'abc',
      title: '',
      level: null,
      blocks: [],
      revisionId: 'rev-1',
      revisionStatus: 'draft',
      status: 'draft',
      reviewNote: null,
    };
    const res = await render('https://chuyocode.test/es/crear/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
    });
    const html = await res.text();
    const titleIndex = html.indexOf('id="desk-window-title"');
    expect(html.slice(titleIndex, titleIndex + 400)).toContain('Nueva actividad');
  });

  // Escape is the editor's OWN shortcut (deselecting the current zone) —
  // the window must never ALSO close on it.
  it('never closes on Escape (closeOnEscape=false) — only the red/yellow lights do', async () => {
    editableActivity.value = {
      id: 'abc',
      title: 'x',
      level: null,
      blocks: [],
      revisionId: 'rev-1',
      revisionStatus: 'draft',
      status: 'draft',
      reviewNote: null,
    };
    const res = await render('https://chuyocode.test/es/crear/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
    });
    const html = await res.text();
    expect(html).toContain('data-close-on-escape="false"');
  });

  it('minimizes to a tray chip keyed by the activity id', async () => {
    editableActivity.value = {
      id: 'abc',
      title: 'x',
      level: null,
      blocks: [],
      revisionId: 'rev-1',
      revisionStatus: 'draft',
      status: 'draft',
      reviewNote: null,
    };
    const res = await render('https://chuyocode.test/es/crear/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
    });
    const html = await res.text();
    expect(html).toContain('data-tray-id="abc"');
  });

  // PART 6b polish: the review-state badge itself now renders INSIDE the
  // window title bar's own EDITABLE title group — a `createPortal` target
  // (`DESK_WINDOW_TITLE_GROUP_ID`, `ActivityEditorIsland.tsx`'s own header)
  // that only resolves once this island actually hydrates client-side, same
  // established posture as the title bar's own "Ver como presentación"/
  // "Enviar a revisión" actions (`DESK_WINDOW_ACTIONS_ID`) — neither ever
  // appears in the raw SSR markup either. What SSR DOES still guarantee is
  // that the stored status/note reach the island at all: the Astro island's
  // own serialized hydration props carry them verbatim (`initialStatus`,
  // `initialReviewNote`) — `ActivityEditorIsland.test.tsx`'s own
  // "review-state badge" suite is what proves the rendered badge text from
  // those props.
  it('seeds the review-state badge from the stored activity status and note (via the island\'s own hydration props)', async () => {
    editableActivity.value = {
      id: 'abc',
      title: 'Mi actividad',
      level: 'B1',
      blocks: [],
      revisionId: 'rev-1',
      revisionStatus: 'rejected',
      status: 'rejected',
      reviewNote: 'Falta una zona en la hoja 2.',
    };

    const res = await render('https://chuyocode.test/es/crear/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
    });
    const html = await res.text();
    expect(html).toContain('initialStatus');
    expect(html).toContain('rejected');
    expect(html).toContain('Falta una zona en la hoja 2.');
  });
});

describe('GET /[lang]/crear/[id] — the desk behind the window (PART 6b)', () => {
  // PART 6c (owner spec 2026-10-07): never `inert` anymore — the floating
  // window is non-modal, and the desk behind it stays fully usable.
  it('renders the SAME desk behind the window, never inert, as the hub/practice window', async () => {
    editableActivity.value = {
      id: 'abc',
      title: 'x',
      level: null,
      blocks: [],
      revisionId: 'rev-1',
      revisionStatus: 'draft',
      status: 'draft',
      reviewNote: null,
    };
    const res = await render('https://chuyocode.test/es/crear/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
    });
    const html = await res.text();
    expect(html).toContain('data-desk');
    expect(html).not.toMatch(/<section[^>]*data-desk[^>]*\binert\b[^>]*>/);
    expect(html).toContain('Para ti hoy');
    expect(html).toContain('Tu escritorio');
  });
});

describe('GET /[lang]/crear/[id] — "Duplicar y adaptar" credit line (D7)', () => {
  it('shows nothing when the activity has no source', async () => {
    editableActivity.value = {
      id: 'abc',
      title: 'Mi actividad',
      level: null,
      blocks: [],
      revisionId: 'rev-1',
      revisionStatus: 'draft',
      status: 'draft',
      reviewNote: null,
      source: null,
    };
    const res = await render('https://chuyocode.test/es/crear/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
    });
    const html = await res.text();
    expect(html).not.toContain('data-testid="activity-based-on"');
  });

  it('links to the source when it is still live', async () => {
    editableActivity.value = {
      id: 'abc',
      title: 'Copia',
      level: null,
      blocks: [],
      revisionId: 'rev-1',
      revisionStatus: 'draft',
      status: 'draft',
      reviewNote: null,
      source: { id: 'orig-1', title: 'Original', visible: true },
    };
    const res = await render('https://chuyocode.test/es/crear/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
    });
    const html = await res.text();
    expect(html).toContain('data-testid="activity-based-on"');
    expect(html).toContain('Original');
    expect(html).toContain('href="/es/ingles/actividades/orig-1"');
  });

  it('shows the title with no link once the source is no longer live', async () => {
    editableActivity.value = {
      id: 'abc',
      title: 'Copia',
      level: null,
      blocks: [],
      revisionId: 'rev-1',
      revisionStatus: 'draft',
      status: 'draft',
      reviewNote: null,
      source: { id: 'orig-1', title: 'Original', visible: false },
    };
    const res = await render('https://chuyocode.test/es/crear/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
    });
    const html = await res.text();
    expect(html).toContain('data-testid="activity-based-on"');
    expect(html).not.toContain('href="/es/ingles/actividades/orig-1"');
  });
});
