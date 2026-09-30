import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createContainer } from '@/testSupport/astroContainer';

const { listPublishedCoursesMock } = vi.hoisted(() => ({ listPublishedCoursesMock: vi.fn() }));
vi.mock('@lib/courses/catalog', () => ({ listPublishedCourses: listPublishedCoursesMock }));

import CursosCatalogPage from './index.astro';

async function render(url: string, params: Record<string, string>, locals: Record<string, unknown> = {}) {
  const container = await createContainer();
  return container.renderToResponse(CursosCatalogPage, {
    locals: { user: { id: 'u1' }, ...locals } as unknown as App.Locals,
    params,
    request: new Request(url),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  listPublishedCoursesMock.mockResolvedValue([]);
});

describe('GET /[lang]/cursos — routing', () => {
  it('404s for an unsupported lang segment', async () => {
    const res = await render('https://chuyocode.test/fr/cursos', { lang: 'fr' });
    expect(res.status).toBe(404);
  });
});

describe('GET /[lang]/cursos — rendering', () => {
  it('shows the empty state when there are no published courses', async () => {
    const res = await render('https://chuyocode.test/es/cursos', { lang: 'es' });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-testid="catalog-empty"');
  });

  it('lists a published course with its badges', async () => {
    listPublishedCoursesMock.mockResolvedValue([
      {
        id: 'c1',
        slug: 'react-basico',
        title: 'React básico',
        subtitle: 'De cero a productivo',
        level: 'A2',
        coverPath: null,
        includedInPremium: true,
        priceCents: 1999,
        currency: 'USD',
        lessonCount: 3,
      },
    ]);
    const res = await render('https://chuyocode.test/es/cursos', { lang: 'es' });
    const html = await res.text();
    expect(html).toContain('React básico');
    expect(html).toContain('data-testid="catalog-card-react-basico"');
    expect(html).toContain('data-testid="catalog-premium-react-basico"');
    expect(html).toContain('data-testid="catalog-price-react-basico"');
    expect(html).toContain('href="/es/cursos/react-basico"');
    expect(html).toContain('3');
  });

  it('never shows the premium/price badge when the course has neither', async () => {
    listPublishedCoursesMock.mockResolvedValue([
      {
        id: 'c1',
        slug: 'x',
        title: 'X',
        subtitle: null,
        level: null,
        coverPath: null,
        includedInPremium: false,
        priceCents: null,
        currency: 'USD',
        lessonCount: 0,
      },
    ]);
    const res = await render('https://chuyocode.test/es/cursos', { lang: 'es' });
    const html = await res.text();
    expect(html).not.toContain('data-testid="catalog-premium-x"');
    expect(html).not.toContain('data-testid="catalog-price-x"');
  });
});
