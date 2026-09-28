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
