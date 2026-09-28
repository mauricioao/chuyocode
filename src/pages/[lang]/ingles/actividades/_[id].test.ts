import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createContainer } from '@/testSupport/astroContainer';

const { activityResult } = vi.hoisted(() => ({ activityResult: { value: null as unknown } }));

vi.mock('@lib/activities/activities', () => ({
  getPublishedActivity: vi.fn(async () => activityResult.value),
}));

import PracticePage from './[id].astro';

async function render(
  url: string,
  { params, locals }: { params: Record<string, string>; locals?: Record<string, unknown> },
) {
  const container = await createContainer();
  return container.renderToResponse(PracticePage, {
    locals: { user: { id: 'user-1' }, ...locals } as unknown as App.Locals,
    params,
    request: new Request(url),
  });
}

beforeEach(() => {
  activityResult.value = null;
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

  it('renders "Sin nivel" when the activity has no level', async () => {
    activityResult.value = { id: 'abc', title: 'x', level: null, blocks: [] };
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
    });
    const html = await res.text();
    expect(html).toContain('Sin nivel');
  });

  it('links back to the community feed, via the back button beside the title', async () => {
    activityResult.value = { id: 'abc', title: 'x', level: null, blocks: [] };
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
    });
    const html = await res.text();
    expect(html).toContain('data-back-button');
    expect(html).toContain('href="/es/ingles/actividades"');
  });

  it('renders a quiz block as a coming-soon placeholder', async () => {
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
    expect(html).toContain('Próximamente');
  });

  it('returns 200 in English', async () => {
    activityResult.value = { id: 'abc', title: 'x', level: null, blocks: [] };
    const res = await render('https://chuyocode.test/en/ingles/actividades/abc', {
      params: { lang: 'en', id: 'abc' },
    });
    expect(res.status).toBe(200);
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

  it('hides it from an anonymous visitor', async () => {
    activityResult.value = { id: 'abc', title: 'x', level: null, blocks: [], authorId: 'someone-else' };
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: null },
    });
    const html = await res.text();
    expect(html).not.toContain('data-testid="report-activity-button"');
  });
});
