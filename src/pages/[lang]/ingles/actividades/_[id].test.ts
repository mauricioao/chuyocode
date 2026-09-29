import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createContainer } from '@/testSupport/astroContainer';

const { activityResult, heartedResult, hasHeartedActivityMock } = vi.hoisted(() => ({
  activityResult: { value: null as unknown },
  heartedResult: { value: false },
  hasHeartedActivityMock: vi.fn(async () => heartedResult.value),
}));

vi.mock('@lib/activities/activities', () => ({
  getPublishedActivity: vi.fn(async () => activityResult.value),
}));

vi.mock('@lib/activities/hearts', () => ({
  hasHeartedActivity: hasHeartedActivityMock,
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
  heartedResult.value = false;
  hasHeartedActivityMock.mockClear();
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

  it('renders one framed card (practice player redesign — fullHeight layout, no page-level scroll at lg)', async () => {
    activityResult.value = { id: 'abc', title: 'x', level: null, blocks: [] };
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
    });
    const html = await res.text();
    expect(html).toContain('data-testid="practice-card"');
    // `fullHeight` (BaseLayout's own prop) is what turns off page scroll at `lg:`.
    expect(html).toContain('lg:h-dvh');
  });

  it('keeps the level text inside the same header row as the back button and title', async () => {
    activityResult.value = { id: 'abc', title: 'Present simple', level: 'A2', blocks: [] };
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
    });
    const html = await res.text();
    const cardStart = html.indexOf('data-testid="practice-card"');
    const backButton = html.indexOf('data-back-button', cardStart);
    const title = html.indexOf('Present simple', backButton);
    const level = html.indexOf('A2', title);
    expect(backButton).toBeGreaterThan(cardStart);
    expect(title).toBeGreaterThan(backButton);
    expect(level).toBeGreaterThan(title);
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

  it('shows a read-only count for an anonymous visitor', async () => {
    activityResult.value = { id: 'abc', title: 'x', level: null, blocks: [], authorId: 'someone-else', heartCount: 2 };
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: null },
    });
    const html = await res.text();
    expect(html).toContain('data-testid="activity-heart-readonly"');
    expect(html).not.toContain('data-testid="activity-heart-button"');
  });
});
