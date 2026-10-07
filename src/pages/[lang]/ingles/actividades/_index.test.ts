import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createContainer } from '@/testSupport/astroContainer';

// `loadDeskSceneData` (the desk behind the window, "desktop" redesign PART
// 6a, carried over to this window by the community-list-as-a-window pass)
// pulls in `@lib/profile` -> `@lib/access` -> `@lib/supabase` -> `loadEnv`,
// which reads `import.meta.env` — stub it before any module that calls it,
// same posture as `actividades/_[id].test.ts`.
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

const { pageResult, dailyCandidatesResult, publishedMock, getActivityCount } = vi.hoisted(() => {
  const empty = { activities: [] as unknown[], total: 0 };
  return {
    pageResult: { value: empty },
    dailyCandidatesResult: { value: empty },
    publishedMock: vi.fn(async (opts: { orden?: string }) =>
      opts.orden === 'gustadas' ? dailyCandidatesResult.value : pageResult.value,
    ),
    getActivityCount: vi.fn(async () => null as number | null),
  };
});

vi.mock('@lib/activities/activities', () => ({
  getPublishedActivities: publishedMock,
  getActivityCount,
  ACTIVITIES_PAGE_SIZE: 20,
}));

vi.mock('@lib/activities/storage', () => ({
  publicImageUrl: (path: string) => `https://public.example/${path}?redirect=1`,
}));

import ExplorePage from './index.astro';

async function render(
  url: string,
  { params, locals }: { params: Record<string, string>; locals?: Record<string, unknown> },
) {
  const container = await createContainer();
  return container.renderToResponse(ExplorePage, {
    locals: { user: { id: 'user-1' }, ...locals } as unknown as App.Locals,
    params,
    request: new Request(url),
  });
}

function card(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'act-1',
    title: 'Mi actividad',
    level: 'B1',
    blockCount: 3,
    publishedAt: '2026-01-01T00:00:00Z',
    thumbnailPath: null,
    heartCount: 0,
    viewTotal: 0,
    viewedByViewer: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  pageResult.value = { activities: [], total: 0 };
  dailyCandidatesResult.value = { activities: [], total: 0 };
  getActivityCount.mockResolvedValue(null);
});

describe('GET /[lang]/ingles/actividades — routing', () => {
  it('404s for an unsupported lang segment', async () => {
    const res = await render('https://chuyocode.test/fr/ingles/actividades', {
      params: { lang: 'fr' },
      locals: { lang: undefined },
    });
    expect(res.status).toBe(404);
  });
});

describe('GET /[lang]/ingles/actividades — renders as a window over the desk (community-list-as-a-window pass)', () => {
  it('renders the DeskWindow shell, titled "Actividades de la comunidad", with its red/yellow lights pointed at the hub', async () => {
    const res = await render('https://chuyocode.test/es/ingles/actividades', { params: { lang: 'es' } });
    const html = await res.text();
    expect(html).toContain('data-desk-window');
    expect(html).toContain('data-close-target="/es/ingles"');
    expect(html).toContain('Actividades de la comunidad');
  });

  it('renders the desk behind the window for a signed-in visitor, never inert', async () => {
    const res = await render('https://chuyocode.test/es/ingles/actividades', { params: { lang: 'es' } });
    const html = await res.text();
    expect(html).toContain('data-desk');
    expect(html).not.toMatch(/<section[^>]*data-desk[^>]*\binert\b[^>]*>/);
  });

  it('opens full screen with no desk behind it for a guest (TEMP/parity branch — unreachable in production, the route is gated)', async () => {
    const res = await render('https://chuyocode.test/es/ingles/actividades', {
      params: { lang: 'es' },
      locals: { user: null },
    });
    const html = await res.text();
    expect(html).toMatch(/<section[^>]*data-desk-window[^>]*data-fullscreen="true"[^>]*>/);
    expect(html).toContain('data-close-target="/es/"');
    expect(html).not.toContain('Para ti hoy');
  });

  it('has a "+" create-activity shortcut in the title bar, linking to the creator', async () => {
    const res = await render('https://chuyocode.test/es/ingles/actividades', { params: { lang: 'es' } });
    const html = await res.text();
    const testidIndex = html.indexOf('data-testid="community-create-link"');
    const start = html.lastIndexOf('<a', testidIndex);
    const createLink = html.slice(start, html.indexOf('</a>', testidIndex));
    expect(createLink).toContain('href="/es/crear"');
    expect(createLink).toContain('aria-label="Crear actividad"');
  });
});

describe('GET /[lang]/ingles/actividades — empty states', () => {
  it('renders the generic empty message with no filters active', async () => {
    const res = await render('https://chuyocode.test/es/ingles/actividades', { params: { lang: 'es' } });
    const html = await res.text();
    expect(html).toContain('Todavía no hay actividades publicadas.');
    expect(html).not.toContain('Limpiar filtros');
  });

  it('shows the llama emoji sticker next to the empty message', async () => {
    const res = await render('https://chuyocode.test/es/ingles/actividades', { params: { lang: 'es' } });
    const html = await res.text();
    expect(html).toContain('/images/emoji/llama-v1-64.webp');
  });

  it('renders the filtered empty message with a "Limpiar filtros" link when a level filter is active', async () => {
    const res = await render('https://chuyocode.test/es/ingles/actividades?nivel=B1', { params: { lang: 'es' } });
    const html = await res.text();
    expect(html).toContain('No hay actividades que coincidan con estos filtros.');
    expect(html).toContain('Limpiar filtros');
    expect(html).toContain('href="/es/ingles/actividades"');
  });

  it('shows "Limpiar filtros" for a search query with no results', async () => {
    const res = await render('https://chuyocode.test/es/ingles/actividades?q=zzz', { params: { lang: 'es' } });
    const html = await res.text();
    expect(html).toContain('Limpiar filtros');
  });

  it('treats an invalid nivel as no filter, without 404ing', async () => {
    const res = await render('https://chuyocode.test/es/ingles/actividades?nivel=zz', { params: { lang: 'es' } });
    expect(res.status).toBe(200);
    expect(publishedMock).toHaveBeenCalledWith(
      expect.objectContaining({ level: null, page: 1 }),
    );
  });
});

describe('GET /[lang]/ingles/actividades — listing', () => {
  it('renders each card with title, level, block count, thumbnail, hearts, views', async () => {
    pageResult.value = {
      activities: [card({ thumbnailPath: 'activity-images/aaaa/bbbb.webp', heartCount: 7, viewTotal: 42 })],
      total: 1,
    };
    const res = await render('https://chuyocode.test/es/ingles/actividades', { params: { lang: 'es' } });
    const html = await res.text();
    expect(html).toContain('Mi actividad');
    expect(html).toContain('href="/es/ingles/actividades/act-1"');
    expect(html).toContain('https://public.example/activity-images/aaaa/bbbb.webp?redirect=1');
    expect(html).toContain('3 bloques');
    expect(html).toContain('data-testid="activity-card-hearts"');
    expect(html).toMatch(/data-testid="activity-card-hearts"[\s\S]*?7/);
    expect(html).toMatch(/data-testid="activity-card-views"[\s\S]*?42/);
  });

  it('shows the "Vista" badge only when the card is viewedByViewer', async () => {
    pageResult.value = {
      activities: [
        card({ id: 'seen', viewedByViewer: true }),
        card({ id: 'unseen', viewedByViewer: false }),
      ],
      total: 2,
    };
    const res = await render('https://chuyocode.test/es/ingles/actividades', { params: { lang: 'es' } });
    const html = await res.text();
    const badgeCount = html.match(/data-testid="activity-card-viewed-badge"/g)?.length ?? 0;
    expect(badgeCount).toBe(1);
  });

  it('renders a card with no thumbnail image tag when thumbnailPath is null', async () => {
    pageResult.value = { activities: [card({ level: null, thumbnailPath: null })], total: 1 };
    const res = await render('https://chuyocode.test/es/ingles/actividades', { params: { lang: 'es' } });
    const html = await res.text();
    expect(html).not.toContain('public.example');
    expect(html).toContain('Sin nivel');
  });

  it('defaults to page 1 for a non-numeric or non-positive page param', async () => {
    await render('https://chuyocode.test/es/ingles/actividades?page=-5', { params: { lang: 'es' } });
    expect(publishedMock).toHaveBeenCalledWith(expect.objectContaining({ level: null, page: 1 }));
  });
});

describe('GET /[lang]/ingles/actividades — filters passed through to the query', () => {
  it('passes q, nivel, tipo, orden, novistas, and viewerId through', async () => {
    await render(
      'https://chuyocode.test/es/ingles/actividades?q=present&nivel=A2&tipo=worksheet&orden=gustadas&novistas=1',
      { params: { lang: 'es' } },
    );
    expect(publishedMock).toHaveBeenCalledWith({
      level: 'A2',
      page: 1,
      q: 'present',
      tipo: 'worksheet',
      orden: 'gustadas',
      novistas: true,
      viewerId: 'user-1',
    });
  });

  it('treats an invalid tipo as no filter', async () => {
    await render('https://chuyocode.test/es/ingles/actividades?tipo=video', { params: { lang: 'es' } });
    expect(publishedMock).toHaveBeenCalledWith(expect.objectContaining({ tipo: null }));
  });

  it('treats an invalid orden as recientes', async () => {
    await render('https://chuyocode.test/es/ingles/actividades?orden=populares', { params: { lang: 'es' } });
    expect(publishedMock).toHaveBeenCalledWith(expect.objectContaining({ orden: 'recientes' }));
  });

  it('trims a q value and treats a blank q as no search', async () => {
    await render('https://chuyocode.test/es/ingles/actividades?q=%20%20%20', { params: { lang: 'es' } });
    expect(publishedMock).toHaveBeenCalledWith(expect.objectContaining({ q: null }));
  });

  it('passes a null viewerId for an anonymous request', async () => {
    await render('https://chuyocode.test/es/ingles/actividades', {
      params: { lang: 'es' },
      locals: { user: null },
    });
    expect(publishedMock).toHaveBeenCalledWith(expect.objectContaining({ viewerId: null }));
  });
});

describe('GET /[lang]/ingles/actividades — filter bar reflects the current URL', () => {
  it('preserves the typed search value in the input', async () => {
    const res = await render('https://chuyocode.test/es/ingles/actividades?q=present+simple', { params: { lang: 'es' } });
    const html = await res.text();
    expect(html).toContain('value="present simple"');
  });

  it('marks the active level option selected', async () => {
    const res = await render('https://chuyocode.test/es/ingles/actividades?nivel=B1', { params: { lang: 'es' } });
    const html = await res.text();
    expect(html).toMatch(/<option value="B1" selected/);
  });

  it('marks the active sort option selected', async () => {
    const res = await render('https://chuyocode.test/es/ingles/actividades?orden=vistas', { params: { lang: 'es' } });
    const html = await res.text();
    expect(html).toMatch(/<option value="vistas" selected/);
  });

  it('checks the novistas checkbox when active', async () => {
    const res = await render('https://chuyocode.test/es/ingles/actividades?novistas=1', { params: { lang: 'es' } });
    const html = await res.text();
    expect(html).toMatch(/name="novistas"[^>]*checked/);
  });

  it('marks the active type option selected', async () => {
    const res = await render('https://chuyocode.test/es/ingles/actividades?tipo=quiz', { params: { lang: 'es' } });
    const html = await res.text();
    expect(html).toMatch(/<option value="quiz" selected/);
  });
});

describe('GET /[lang]/ingles/actividades — unified search header (community-search-unify)', () => {
  it('renders the search as a real GET form targeting this page, in the title actions row', async () => {
    const res = await render('https://chuyocode.test/es/ingles/actividades', { params: { lang: 'es' } });
    const html = await res.text();
    expect(html).toMatch(/<form[^>]*method="get"[^>]*action="\/es\/ingles\/actividades"[^>]*role="search"/);
  });

  it('removes the old always-visible filter bar and its mobile <details> disclosure', async () => {
    const res = await render('https://chuyocode.test/es/ingles/actividades', { params: { lang: 'es' } });
    const html = await res.text();
    expect(html).not.toContain('filters-details');
    expect(html).not.toContain('filters-summary');
    expect(html).not.toContain('filterSubmit');
  });

  it('renders the funnel filters trigger next to the search, with no active-count badge when nothing is filtering', async () => {
    const res = await render('https://chuyocode.test/es/ingles/actividades', { params: { lang: 'es' } });
    const html = await res.text();
    expect(html).toContain('data-testid="filters-trigger"');
    expect(html).not.toContain('data-testid="filters-badge"');
  });

  it('shows a badge with the number of active filters among nivel/tipo/orden/novistas', async () => {
    const res = await render(
      'https://chuyocode.test/es/ingles/actividades?nivel=A2&tipo=quiz&orden=gustadas&novistas=1',
      { params: { lang: 'es' } },
    );
    const html = await res.text();
    const badgeMatch = html.match(/data-testid="filters-badge"[^>]*>([^<]*)</);
    expect(badgeMatch?.[1].trim()).toBe('4');
  });

  it('does not count an active search (`q`) toward the filters badge', async () => {
    const res = await render('https://chuyocode.test/es/ingles/actividades?q=present', { params: { lang: 'es' } });
    const html = await res.text();
    expect(html).not.toContain('data-testid="filters-badge"');
  });

  it('never duplicates a named filter field across the search form and the filters panel', async () => {
    const res = await render('https://chuyocode.test/es/ingles/actividades', { params: { lang: 'es' } });
    const html = await res.text();
    for (const name of ['nivel', 'orden', 'novistas']) {
      const count = (html.match(new RegExp(`name="${name}"`, 'g')) ?? []).length;
      expect(count).toBe(1);
    }
    // `tipo` is now a <select> — one `name="tipo"` on the element itself.
    const tipoCount = (html.match(/name="tipo"/g) ?? []).length;
    expect(tipoCount).toBe(1);
  });

  it('preserves the active search as a hidden `q` in the filters panel form, so Aplicar never drops it', async () => {
    const res = await render('https://chuyocode.test/es/ingles/actividades?q=present+simple&nivel=A2', {
      params: { lang: 'es' },
    });
    const html = await res.text();
    expect(html).toMatch(/<input type="hidden" name="q" value="present simple"/);
  });

  it('preserves the active filters as hidden inputs on the search form, so a new search never drops them', async () => {
    const res = await render('https://chuyocode.test/es/ingles/actividades?nivel=A2&tipo=quiz', {
      params: { lang: 'es' },
    });
    const html = await res.text();
    expect(html).toMatch(/<input type="hidden" name="nivel" value="A2"/);
    expect(html).toMatch(/<input type="hidden" name="tipo" value="quiz"/);
  });

  it('hides the "no las he visto" toggle for an anonymous visitor', async () => {
    const res = await render('https://chuyocode.test/es/ingles/actividades', {
      params: { lang: 'es' },
      locals: { user: null },
    });
    const html = await res.text();
    expect(html).not.toMatch(/name="novistas"/);
  });
});

describe('GET /[lang]/ingles/actividades — active filter chips', () => {
  it('renders no chips row when no filter is active', async () => {
    const res = await render('https://chuyocode.test/es/ingles/actividades', { params: { lang: 'es' } });
    const html = await res.text();
    expect(html).not.toContain('data-testid="active-filter-chips"');
  });

  it('does not render a chip for an active search alone', async () => {
    const res = await render('https://chuyocode.test/es/ingles/actividades?q=present', { params: { lang: 'es' } });
    const html = await res.text();
    expect(html).not.toContain('data-testid="active-filter-chips"');
  });

  it('renders one chip per active filter, each dropping only its own param', async () => {
    const res = await render(
      'https://chuyocode.test/es/ingles/actividades?q=present&nivel=A2&tipo=quiz&orden=gustadas&novistas=1',
      { params: { lang: 'es' } },
    );
    const html = await res.text();
    expect(html).toContain('data-testid="active-filter-chips"');

    const nivelHref = html.match(/data-testid="filter-chip-nivel"[^>]*href="([^"]*)"/)?.[1]
      ?? html.match(/href="([^"]*)"[^>]*data-testid="filter-chip-nivel"/)?.[1];
    expect(nivelHref).toBeDefined();
    expect(nivelHref).not.toContain('nivel=');
    expect(nivelHref).toContain('q=present');
    expect(nivelHref).toContain('tipo=quiz');
    expect(nivelHref).toContain('orden=gustadas');
    expect(nivelHref).toContain('novistas=1');

    const tipoHref = html.match(/data-testid="filter-chip-tipo"[^>]*href="([^"]*)"/)?.[1]
      ?? html.match(/href="([^"]*)"[^>]*data-testid="filter-chip-tipo"/)?.[1];
    expect(tipoHref).toBeDefined();
    expect(tipoHref).not.toContain('tipo=');
    expect(tipoHref).toContain('nivel=A2');

    const ordenHref = html.match(/data-testid="filter-chip-orden"[^>]*href="([^"]*)"/)?.[1]
      ?? html.match(/href="([^"]*)"[^>]*data-testid="filter-chip-orden"/)?.[1];
    expect(ordenHref).toBeDefined();
    expect(ordenHref).not.toContain('orden=');

    const novistasHref = html.match(/data-testid="filter-chip-novistas"[^>]*href="([^"]*)"/)?.[1]
      ?? html.match(/href="([^"]*)"[^>]*data-testid="filter-chip-novistas"/)?.[1];
    expect(novistasHref).toBeDefined();
    expect(novistasHref).not.toContain('novistas=');
  });
});

describe('GET /[lang]/ingles/actividades — pagination preserves filters', () => {
  it('shows no pagination nav for a single page', async () => {
    pageResult.value = { activities: [card()], total: 1 };
    const res = await render('https://chuyocode.test/es/ingles/actividades', { params: { lang: 'es' } });
    const html = await res.text();
    // Scoped to the WINDOW itself: the desk behind it has its own unrelated
    // "Anterior" button (`DeskPlayerWidget`'s "previous track" control).
    const windowHtml = html.slice(html.indexOf('id="desk-window"'));
    expect(windowHtml).not.toContain('Anterior');
  });

  it('carries q/nivel/tipo/orden/novistas into the next-page link', async () => {
    pageResult.value = { activities: [card()], total: 45 }; // 3 pages at 20/page
    const res = await render(
      'https://chuyocode.test/es/ingles/actividades?q=abc&nivel=B2&tipo=quiz&orden=vistas&novistas=1',
      { params: { lang: 'es' } },
    );
    const html = await res.text();
    expect(html).toMatch(/href="\/es\/ingles\/actividades\?[^"]*page=2[^"]*"/);
    const hrefMatch = html.match(/href="(\/es\/ingles\/actividades\?[^"]*page=2[^"]*)"/);
    expect(hrefMatch).not.toBeNull();
    const href = hrefMatch![1];
    expect(href).toContain('q=abc');
    expect(href).toContain('nivel=B2');
    expect(href).toContain('tipo=quiz');
    expect(href).toContain('orden=vistas');
    expect(href).toContain('novistas=1');
  });
});

describe('GET /[lang]/ingles/actividades — actividad del día', () => {
  it('shows the highlighted card on page 1 with no filters, when a candidate exists', async () => {
    dailyCandidatesResult.value = { activities: [card({ id: 'daily-1', title: 'La actividad del día' })], total: 1 };
    const res = await render('https://chuyocode.test/es/ingles/actividades', { params: { lang: 'es' } });
    const html = await res.text();
    expect(html).toContain('La actividad del día');
    expect(html).toContain('Actividad del día');
  });

  it('renders the daily pick as the first card of the grid, not as a separate banner, and does not repeat it', async () => {
    pageResult.value = { activities: [card({ id: 'daily-1', title: 'La actividad del día' }), card({ id: 'other-1', title: 'Otra' })], total: 2 };
    dailyCandidatesResult.value = { activities: [card({ id: 'daily-1', title: 'La actividad del día' })], total: 1 };
    const res = await render('https://chuyocode.test/es/ingles/actividades', { params: { lang: 'es' } });
    const html = await res.text();

    const grid = html.slice(html.indexOf('<ul class="grid'));
    const firstItem = grid.slice(0, grid.indexOf('</li>'));
    expect(firstItem).toContain('Actividad del día');
    expect(firstItem).toContain('La actividad del día');
    // Scoped to the WINDOW body: the desk behind it legitimately shows the
    // SAME title again, in its own independent "Para ti hoy" folder preview
    // (`loadDeskSceneData`'s own hearted-pool query) — this check is about
    // the GRID never repeating its own daily pick, not about the desk.
    const windowHtml = html.slice(html.indexOf('id="desk-window"'));
    expect(windowHtml.split('La actividad del día').length - 1).toBe(1);
    expect(windowHtml.indexOf('Actividad del día')).toBeGreaterThan(windowHtml.indexOf('<ul class="grid'));
  });

  it('fetches candidates sorted by gustadas', async () => {
    dailyCandidatesResult.value = { activities: [card()], total: 1 };
    await render('https://chuyocode.test/es/ingles/actividades', { params: { lang: 'es' } });
    expect(publishedMock).toHaveBeenCalledWith(
      expect.objectContaining({ level: null, page: 1, orden: 'gustadas' }),
    );
  });

  it('hides the card when there are no candidates', async () => {
    dailyCandidatesResult.value = { activities: [], total: 0 };
    const res = await render('https://chuyocode.test/es/ingles/actividades', { params: { lang: 'es' } });
    const html = await res.text();
    expect(html).not.toContain('Actividad del día');
  });

  it('is hidden on page 2', async () => {
    pageResult.value = { activities: [card()], total: 45 };
    dailyCandidatesResult.value = { activities: [card({ id: 'daily-1', title: 'La actividad del día' })], total: 1 };
    const res = await render('https://chuyocode.test/es/ingles/actividades?page=2', { params: { lang: 'es' } });
    const html = await res.text();
    expect(html).not.toContain('Actividad del día');
    // The LIST's own candidates fetch is skipped entirely on a filtered/
    // paged view — only ONE `orden=gustadas` call happens (the desk behind
    // the window's own, independent "Para ti hoy" hearted-pool query, which
    // always runs for a signed-in visitor regardless of this page's state).
    const gustadasCalls = publishedMock.mock.calls.filter(([opts]) => opts.orden === 'gustadas');
    expect(gustadasCalls).toHaveLength(1);
  });

  it('is hidden when any filter is active', async () => {
    dailyCandidatesResult.value = { activities: [card({ id: 'daily-1', title: 'La actividad del día' })], total: 1 };
    const res = await render('https://chuyocode.test/es/ingles/actividades?nivel=B1', { params: { lang: 'es' } });
    const html = await res.text();
    expect(html).not.toContain('Actividad del día');
    const gustadasCalls = publishedMock.mock.calls.filter(([opts]) => opts.orden === 'gustadas');
    expect(gustadasCalls).toHaveLength(1);
  });
});

// Community-list-as-a-window pass (owner spec 2026-10-07) — three contracts
// the window must keep regardless of active filters: (1) minimizing it
// restores the SAME list, because the tray id/title stay fixed and the
// yellow light stores the CURRENT href (filters included) — see
// `deskWindow.test.ts`'s own `minimize()` suite for the storage mechanics
// this only needs to wire the right props INTO; (2) Escape still closes it
// (the default `closeOnEscape`, never turned off here); (3) no in-window
// link (a filter chip, a pagination link, an `ActivityCard`) ever carries
// `data-desk-window-open`, which is what would wrongly replay the scale-in
// open animation on an ordinary in-window navigation.
describe('GET /[lang]/ingles/actividades — minimize/restore and no-replay (community-list-as-a-window pass)', () => {
  it('keeps the same tray id and title with filters active, so the minimized chip always reopens to this exact window', async () => {
    pageResult.value = { activities: [card()], total: 1 };
    const filtered = await render('https://chuyocode.test/es/ingles/actividades?nivel=B1&orden=gustadas', {
      params: { lang: 'es' },
    });
    const filteredHtml = await filtered.text();
    const unfiltered = await render('https://chuyocode.test/es/ingles/actividades', { params: { lang: 'es' } });
    const unfilteredHtml = await unfiltered.text();

    for (const html of [filteredHtml, unfilteredHtml]) {
      expect(html).toContain('data-tray-id="community-activities"');
      expect(html).toContain('Actividades de la comunidad');
    }
  });

  it('never disables Escape — data-close-on-escape stays at its default (true), unlike the editor', async () => {
    const res = await render('https://chuyocode.test/es/ingles/actividades', { params: { lang: 'es' } });
    const html = await res.text();
    expect(html).not.toContain('data-close-on-escape="false"');
  });

  it('never marks a filter/pagination/card link as a desk-window opener (would wrongly replay the open animation)', async () => {
    pageResult.value = { activities: [card({ id: 'act-1', title: 'Mi actividad' })], total: 45 };
    const res = await render('https://chuyocode.test/es/ingles/actividades?nivel=B1&page=2', { params: { lang: 'es' } });
    const html = await res.text();
    const windowHtml = html.slice(html.indexOf('id="desk-window"'));
    // The ONLY `data-desk-window-open` opener anywhere on this page is the
    // title bar's own "+" shortcut to the SEPARATE creator window — never a
    // filter chip, a pagination link, or an activity card.
    const openers = windowHtml.match(/data-desk-window-open(="[^"]*")?/g) ?? [];
    expect(openers).toHaveLength(1);
    expect(windowHtml).toContain('data-desk-window-open="create"');
    expect(html).toContain('data-testid="activity-card"');
  });
});
