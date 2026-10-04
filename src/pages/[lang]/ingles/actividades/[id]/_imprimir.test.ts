import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createContainer } from '@/testSupport/astroContainer';

const { activityResult } = vi.hoisted(() => ({
  activityResult: { value: null as unknown },
}));

vi.mock('@lib/activities/activities', () => ({
  getPublishedActivity: vi.fn(async () => activityResult.value),
}));

import PrintPage from './imprimir.astro';

async function render(
  url: string,
  { params, locals }: { params: Record<string, string>; locals?: Record<string, unknown> },
) {
  const container = await createContainer();
  return container.renderToResponse(PrintPage, {
    locals: { user: { id: 'user-1' }, ...locals } as unknown as App.Locals,
    params,
    request: new Request(url),
  });
}

beforeEach(() => {
  activityResult.value = null;
});

const WORKSHEET_ACTIVITY = {
  id: 'abc',
  title: 'Present simple: ir de compras',
  level: 'A2',
  blocks: [
    {
      id: 'w1',
      type: 'worksheet',
      rotation: 0,
      image: { path: 'activity-images/abc/img-1.webp', width: 800, height: 400 },
      zones: [
        { id: 'z1', x: 0.1, y: 0.1, w: 0.2, h: 0.1, kind: 'text', answers: ['cat'], explanation: 'Because it is the animal.' },
        { id: 'z2', x: 0.5, y: 0.1, w: 0.2, h: 0.1, kind: 'choice', answers: ['b'], options: ['a', 'b', 'c'] },
      ],
    },
    {
      id: 'q1',
      type: 'quiz',
      payload: {
        pools: { opts: [{ id: 'a', text: 'sit' }, { id: 'b', text: 'sits' }] },
        slots: [
          {
            id: 's1',
            label: 'The cat ___ on the mat',
            input: 'choice',
            pool: 'opts',
            answer: ['b'],
            explanation: 'Third person -s.',
          },
        ],
      },
    },
  ],
};

describe('GET /[lang]/ingles/actividades/[id]/imprimir — routing', () => {
  it('404s for an unsupported lang segment', async () => {
    const res = await render('https://chuyocode.test/fr/ingles/actividades/abc/imprimir', {
      params: { lang: 'fr', id: 'abc' },
      locals: { lang: undefined },
    });
    expect(res.status).toBe(404);
  });

  it('404s when no visible activity matches (mirrors the practice page)', async () => {
    activityResult.value = null;
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc/imprimir', {
      params: { lang: 'es', id: 'abc' },
    });
    expect(res.status).toBe(404);
  });

  it('404s with private cache headers', async () => {
    activityResult.value = null;
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc/imprimir', {
      params: { lang: 'es', id: 'abc' },
    });
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });
});

describe('GET /[lang]/ingles/actividades/[id]/imprimir — rendering', () => {
  it('returns 200 with private cache headers for a visible activity', async () => {
    activityResult.value = WORKSHEET_ACTIVITY;
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc/imprimir', {
      params: { lang: 'es', id: 'abc' },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  it('returns 200 for a ChuyoCode-owned activity (NULL authorId, 0020 account deletion transfer)', async () => {
    activityResult.value = { ...WORKSHEET_ACTIVITY, authorId: null };
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc/imprimir', {
      params: { lang: 'es', id: 'abc' },
    });
    expect(res.status).toBe(200);
  });

  it('renders the title and level', async () => {
    activityResult.value = WORKSHEET_ACTIVITY;
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc/imprimir', {
      params: { lang: 'es', id: 'abc' },
    });
    const html = await res.text();
    expect(html).toContain('Present simple: ir de compras');
    expect(html).toContain('A2');
  });

  it('renders every block in order', async () => {
    activityResult.value = WORKSHEET_ACTIVITY;
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc/imprimir', {
      params: { lang: 'es', id: 'abc' },
    });
    const html = await res.text();
    const worksheetIndex = html.indexOf('data-testid="print-block-w1"');
    const quizIndex = html.indexOf('data-testid="print-block-q1"');
    expect(worksheetIndex).toBeGreaterThan(-1);
    expect(quizIndex).toBeGreaterThan(worksheetIndex);
  });

  it('renders a quiz blank as underscores and its choices as a)/b)/c)', async () => {
    activityResult.value = WORKSHEET_ACTIVITY;
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc/imprimir', {
      params: { lang: 'es', id: 'abc' },
    });
    const html = await res.text();
    expect(html).toContain('The cat ________ on the mat');
    expect(html).toContain('a) sit');
    expect(html).toContain('b) sits');
  });

  it('has no site header/footer/nav chrome (bare print layout)', async () => {
    activityResult.value = WORKSHEET_ACTIVITY;
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc/imprimir', {
      params: { lang: 'es', id: 'abc' },
    });
    const html = await res.text();
    expect(html).not.toContain('data-testid="site-header"');
    expect(html).not.toContain('data-testid="site-footer"');
  });

  it('renders a print button that calls window.print()', async () => {
    activityResult.value = WORKSHEET_ACTIVITY;
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc/imprimir', {
      params: { lang: 'es', id: 'abc' },
    });
    const html = await res.text();
    expect(html).toContain('data-testid="print-button"');
    expect(html).toContain('window.print()');
  });
});

describe('GET /[lang]/ingles/actividades/[id]/imprimir — answer key (?respuestas=1)', () => {
  it('shows no answer key by default', async () => {
    activityResult.value = WORKSHEET_ACTIVITY;
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc/imprimir', {
      params: { lang: 'es', id: 'abc' },
    });
    const html = await res.text();
    expect(html).not.toContain('data-testid="print-answer-key"');
  });

  it('offers an "Incluir respuestas" link to the answer-key URL', async () => {
    activityResult.value = WORKSHEET_ACTIVITY;
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc/imprimir', {
      params: { lang: 'es', id: 'abc' },
    });
    const html = await res.text();
    expect(html).toContain('data-testid="print-include-answers"');
    expect(html).toContain('?respuestas=1');
  });

  it('shows the answer key, zone answers in reading order, quiz answers, and explanations, only with ?respuestas=1', async () => {
    activityResult.value = WORKSHEET_ACTIVITY;
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc/imprimir?respuestas=1', {
      params: { lang: 'es', id: 'abc' },
    });
    const html = await res.text();
    expect(html).toContain('data-testid="print-answer-key"');
    expect(html).toContain('data-testid="print-answer-zone-z1"');
    expect(html).toContain('data-testid="print-answer-zone-z2"');
    // Reading order: z1 (x=0.1) comes before z2 (x=0.5) on the same row.
    const z1Index = html.indexOf('data-testid="print-answer-zone-z1"');
    const z2Index = html.indexOf('data-testid="print-answer-zone-z2"');
    expect(z1Index).toBeLessThan(z2Index);
    expect(html).toContain('cat');
    expect(html).toContain('Because it is the animal.');
    expect(html).toContain('data-testid="print-answer-question-s1"');
    expect(html).toContain('sits');
    expect(html).toContain('Third person -s.');
  });

  it('does not include the "Incluir respuestas" link once already showing answers', async () => {
    activityResult.value = WORKSHEET_ACTIVITY;
    const res = await render('https://chuyocode.test/es/ingles/actividades/abc/imprimir?respuestas=1', {
      params: { lang: 'es', id: 'abc' },
    });
    const html = await res.text();
    expect(html).not.toContain('data-testid="print-include-answers"');
  });
});
