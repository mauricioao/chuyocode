import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createContainer } from '@/testSupport/astroContainer';

const { editableActivity } = vi.hoisted(() => ({
  editableActivity: { value: null as unknown },
}));

vi.mock('@lib/activities/activities', () => ({
  getActivityForEdit: vi.fn(async () => editableActivity.value),
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
    expect(html).toContain('data-back-button');
    expect(html).toContain('href="/es/mis-actividades"');
  });

  // Floating side toolbar pass, owner request: no page-level scroll on the
  // editor, and no dead empty row above the card where the back button used
  // to reserve its own space — see `BaseLayout.astro`'s `fullHeight` mode
  // and `ActivityEditorIsland.tsx`'s own root, now sized by that real flex
  // chain instead of a hardcoded calc tied to the site header's pixel height.
  it('sizes the editor via the real flex chain (BaseLayout fullHeight), not a hardcoded header-height calc', async () => {
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
    expect(html).not.toContain('65px');
    expect(html).not.toContain('calc(100dvh');
    // BaseLayout's opt-in non-scrolling mode is actually engaged for this page.
    expect(html).toContain('lg:h-dvh');
    expect(html).toContain('lg:overflow-hidden');
  });

  // Full-height card fix (owner report: "with one worksheet block the card
  // ends mid-screen, empty space down to the footer"). Root cause: the row
  // `[id].astro` lays the card out in used to force `lg:items-start` on
  // ITSELF, which overrides flexbox's default cross-axis STRETCH for every
  // item in that row — including `ActivityEditorIsland`'s own root div,
  // which has no explicit height of its own and so collapsed to its content
  // height instead of the row's `lg:h-full`. The fix moves the top-alignment
  // onto the `BackButton` wrapper's own `lg:self-start` and leaves the row at
  // the default stretch, so the island (and its whole internal flex-column
  // chain: root -> card -> body -> block list -> the focus-active block's
  // canvas) fills the row's real height end to end. Asserts the actual
  // classes on that chain, not just the absence of a hardcoded calc, so a
  // future edit that reintroduces a row-level `items-start` (or drops any
  // link of the chain) fails this test instead of only showing up as empty
  // space in a screenshot.
  it('stretches the editor card to the row\'s full height instead of collapsing to content (structural flex chain)', async () => {
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

    // The row itself: `lg:h-full` (a real, bounded height from `main`), and
    // crucially NO `lg:items-start` any more — that class name must not
    // appear anywhere in the page (nothing else on this page has a reason to
    // use it either).
    expect(html).toContain('lg:h-full');
    expect(html).not.toContain('lg:items-start');

    // The back button's OWN wrapper keeps itself top-aligned instead, via
    // `lg:self-start` — the row's default stretch is what everything else
    // (the island) now relies on.
    expect(html).toContain(
      'class="hidden lg:flex lg:h-(--card-header-h) lg:flex-none lg:items-center lg:self-start"',
    );

    // The island's root and the card inside it: both still `lg:min-h-0
    // lg:flex-1` (a bounded flex item, not a growing one) — the two links
    // that turn the row's real, now-stretched height into a bounded column
    // the card can never grow past.
    expect(html).toContain('data-testid="activity-editor-island"');
    expect(html).toContain('lg:min-h-0 lg:flex-1 lg:gap-2 lg:pb-0 lg:pr-16');
    expect(html).toContain('data-testid="activity-editor-card"');
    expect(html).toContain('lg:min-h-0 lg:flex-1 lg:gap-0 lg:overflow-hidden');
  });

  it('seeds the review-state badge from the stored activity status and note', async () => {
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
    expect(html).toContain('Rechazada');
    expect(html).toContain('Falta una zona en la hoja 2.');
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
