import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createContainer } from '@/testSupport/astroContainer';

const { pageResult, publishedMock } = vi.hoisted(() => ({
  pageResult: { value: { activities: [] as unknown[], total: 0 } },
  publishedMock: vi.fn(async () => pageResult.value),
}));

vi.mock('@lib/activities/activities', () => ({
  getPublishedActivities: publishedMock,
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

beforeEach(() => {
  vi.clearAllMocks();
  pageResult.value = { activities: [], total: 0 };
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

describe('GET /[lang]/ingles/actividades — empty states', () => {
  it('renders the generic empty message with no level filter', async () => {
    pageResult.value = { activities: [], total: 0 };
    const res = await render('https://chuyocode.test/es/ingles/actividades', { params: { lang: 'es' } });
    const html = await res.text();
    expect(html).toContain('Todavía no hay actividades publicadas.');
  });

  it('renders the level-specific empty message with a level filter', async () => {
    pageResult.value = { activities: [], total: 0 };
    const res = await render('https://chuyocode.test/es/ingles/actividades?nivel=B1', { params: { lang: 'es' } });
    const html = await res.text();
    expect(html).toContain('Todavía no hay actividades publicadas para este nivel.');
  });

  it('treats an invalid nivel as no filter, without 404ing', async () => {
    const res = await render('https://chuyocode.test/es/ingles/actividades?nivel=zz', { params: { lang: 'es' } });
    expect(res.status).toBe(200);
    expect(publishedMock).toHaveBeenCalledWith({ level: null, page: 1 });
  });
});

describe('GET /[lang]/ingles/actividades — listing', () => {
  it('renders each card with title, level, block count, and a thumbnail image when one exists', async () => {
    pageResult.value = {
      activities: [
        {
          id: 'act-1',
          title: 'Mi actividad',
          level: 'B1',
          blockCount: 3,
          publishedAt: '2026-01-01T00:00:00Z',
          thumbnailPath: 'activity-images/aaaa/bbbb.webp',
        },
      ],
      total: 1,
    };
    const res = await render('https://chuyocode.test/es/ingles/actividades', { params: { lang: 'es' } });
    const html = await res.text();
    expect(html).toContain('Mi actividad');
    expect(html).toContain('href="/es/ingles/actividades/act-1"');
    expect(html).toContain('https://public.example/activity-images/aaaa/bbbb.webp?redirect=1');
    expect(html).toContain('3 bloques');
  });

  it('renders a card with no thumbnail image tag when thumbnailPath is null', async () => {
    pageResult.value = {
      activities: [
        { id: 'act-1', title: 'Sin hoja', level: null, blockCount: 1, publishedAt: null, thumbnailPath: null },
      ],
      total: 1,
    };
    const res = await render('https://chuyocode.test/es/ingles/actividades', { params: { lang: 'es' } });
    const html = await res.text();
    expect(html).not.toContain('public.example');
    expect(html).toContain('Sin nivel');
  });

  it('passes the requested page and level through to getPublishedActivities', async () => {
    await render('https://chuyocode.test/es/ingles/actividades?nivel=A2&page=3', { params: { lang: 'es' } });
    expect(publishedMock).toHaveBeenCalledWith({ level: 'A2', page: 3 });
  });

  it('defaults to page 1 for a non-numeric or non-positive page param', async () => {
    await render('https://chuyocode.test/es/ingles/actividades?page=-5', { params: { lang: 'es' } });
    expect(publishedMock).toHaveBeenCalledWith({ level: null, page: 1 });
  });
});

describe('GET /[lang]/ingles/actividades — pagination', () => {
  it('shows no pagination nav for a single page', async () => {
    pageResult.value = {
      activities: [{ id: 'a', title: 'x', level: null, blockCount: 1, publishedAt: null, thumbnailPath: null }],
      total: 1,
    };
    const res = await render('https://chuyocode.test/es/ingles/actividades', { params: { lang: 'es' } });
    const html = await res.text();
    expect(html).not.toContain('Anterior');
  });

  it('shows Anterior/Siguiente and the current page across several pages', async () => {
    pageResult.value = {
      activities: [{ id: 'a', title: 'x', level: null, blockCount: 1, publishedAt: null, thumbnailPath: null }],
      total: 45, // 3 pages at 20/page
    };
    const res = await render('https://chuyocode.test/es/ingles/actividades?page=2', { params: { lang: 'es' } });
    const html = await res.text();
    expect(html).toContain('Anterior');
    expect(html).toContain('Siguiente');
    expect(html).toContain('Página');
    expect(html).toContain('2');
    expect(html).toContain('3');
  });
});
