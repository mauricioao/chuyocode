import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createContainer } from '@/testSupport/astroContainer';

const { activityResult } = vi.hoisted(() => ({
  activityResult: { value: null as unknown },
}));

vi.mock('@lib/activities/activities', () => ({
  getPublishedActivity: vi.fn(async () => activityResult.value),
}));

import PresentarPage from './presentar.astro';

async function render(
  url: string,
  { params, locals }: { params: Record<string, string>; locals?: Record<string, unknown> },
) {
  const container = await createContainer();
  return container.renderToResponse(PresentarPage, {
    locals: { user: { id: 'user-1' }, ...locals } as unknown as App.Locals,
    params,
    request: new Request(url),
  });
}

beforeEach(() => {
  activityResult.value = null;
});

const QUIZ_ACTIVITY = {
  id: 'abc',
  title: 'Present simple: ir de compras',
  level: 'A2',
  blocks: [
    {
      id: 'q1',
      type: 'quiz',
      payload: {
        pools: { opts: [{ id: 'a', text: 'sit' }, { id: 'b', text: 'sits' }] },
        slots: [{ id: 's1', label: 'The cat ___ on the mat', input: 'choice', pool: 'opts', answer: ['b'] }],
      },
    },
  ],
};

const WORKSHEET_ONLY_ACTIVITY = {
  id: 'abc',
  title: 'x',
  level: null,
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

const EMPTY_QUIZ_ACTIVITY = {
  id: 'abc',
  title: 'x',
  level: null,
  blocks: [{ id: 'q1', type: 'quiz', payload: { pools: {}, slots: [] } }],
};

describe('GET /[lang]/ingles/actividades/[id]/presentar — routing', () => {
  it('404s for an unsupported lang segment', async () => {
    const res = await render('https://chuyocode.test/fr/ingles/actividades/abc/presentar', {
      params: { lang: 'fr', id: 'abc' },
      locals: { lang: undefined },
    });
    expect(res.status).toBe(404);
  });

  it('404s when no visible activity matches — the same status the practice page gives (mirrors [id].astro)', async () => {
    activityResult.value = null;
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc/presentar', {
      params: { lang: 'es', id: 'abc' },
    });
    expect(res.status).toBe(404);
  });

  it('404s with private cache headers', async () => {
    activityResult.value = null;
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc/presentar', {
      params: { lang: 'es', id: 'abc' },
    });
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });
});

describe('GET /[lang]/ingles/actividades/[id]/presentar — defensive quiz gate', () => {
  it('404s when the activity has no blocks at all', async () => {
    activityResult.value = { ...WORKSHEET_ONLY_ACTIVITY, blocks: [] };
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc/presentar', {
      params: { lang: 'es', id: 'abc' },
    });
    expect(res.status).toBe(404);
  });

  it('404s when the activity only has worksheet blocks', async () => {
    activityResult.value = WORKSHEET_ONLY_ACTIVITY;
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc/presentar', {
      params: { lang: 'es', id: 'abc' },
    });
    expect(res.status).toBe(404);
  });

  it('404s when the only quiz block has zero questions', async () => {
    activityResult.value = EMPTY_QUIZ_ACTIVITY;
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc/presentar', {
      params: { lang: 'es', id: 'abc' },
    });
    expect(res.status).toBe(404);
  });
});

describe('GET /[lang]/ingles/actividades/[id]/presentar — rendering', () => {
  it('returns 200 with private cache headers for an activity with at least one question', async () => {
    activityResult.value = QUIZ_ACTIVITY;
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc/presentar', {
      params: { lang: 'es', id: 'abc' },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  it('renders the activity title and level on the cover slide', async () => {
    activityResult.value = QUIZ_ACTIVITY;
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc/presentar', {
      params: { lang: 'es', id: 'abc' },
    });
    const html = await res.text();
    expect(html).toContain('Present simple: ir de compras');
    expect(html).toContain('A2');
    expect(html).toContain('data-testid="presentation-slide-cover"');
  });

  it('renders the cover QR code, pointing at the practice page (not this presentation page)', async () => {
    activityResult.value = QUIZ_ACTIVITY;
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc/presentar', {
      params: { lang: 'es', id: 'abc' },
    });
    const html = await res.text();
    expect(html).toContain('data-testid="presentation-cover-qr"');
  });

  it('has no site header/footer chrome (bare layout)', async () => {
    activityResult.value = QUIZ_ACTIVITY;
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc/presentar', {
      params: { lang: 'es', id: 'abc' },
    });
    const html = await res.text();
    expect(html).not.toContain('<header');
    expect(html).not.toContain('<footer');
  });

  it('never ships the worksheet block to the client — only quiz blocks are presentable', async () => {
    activityResult.value = {
      ...QUIZ_ACTIVITY,
      blocks: [WORKSHEET_ONLY_ACTIVITY.blocks[0], ...QUIZ_ACTIVITY.blocks],
    };
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc/presentar', {
      params: { lang: 'es', id: 'abc' },
    });
    const html = await res.text();
    expect(html).not.toContain('activity-images/abc/img-1.webp');
  });

  it('returns 200 in English', async () => {
    activityResult.value = QUIZ_ACTIVITY;
    const res = await render('https://chuyocode.test/en/ingles/actividades/abc/presentar', {
      params: { lang: 'en', id: 'abc' },
    });
    expect(res.status).toBe(200);
  });
});

// Guest play: this route has no user-dependent branching of its own (no
// hearts/report/duplicate here) — it only needed the login gate removed
// (`@lib/access`'s `isPublicActivityRoute`, covered by `middleware.test.ts`).
// This confirms the page's own frontmatter already renders correctly with no
// session at all.
describe('GET /[lang]/ingles/actividades/[id]/presentar — guest play (anonymous visitor)', () => {
  it('returns 200 with private cache headers for an anonymous visitor', async () => {
    activityResult.value = QUIZ_ACTIVITY;
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc/presentar', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: null },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    const html = await res.text();
    expect(html).toContain('data-testid="presentation-slide-cover"');
  });

  it('404s an anonymous visit to a draft/unpublished activity, same as a missing one', async () => {
    activityResult.value = null;
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc/presentar', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: null },
    });
    expect(res.status).toBe(404);
  });

  it('still renders the cover QR (pointing at the now-public practice page) for an anonymous visitor', async () => {
    activityResult.value = QUIZ_ACTIVITY;
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc/presentar', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: null },
    });
    const html = await res.text();
    expect(html).toContain('data-testid="presentation-cover-qr"');
    expect(html).toContain('/es/ingles/actividades/abc');
  });
});
