import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createContainer } from '@/testSupport/astroContainer';

const { requireRoleMock, getPlanMock, getCourseDetailBySlugMock, ownsState } = vi.hoisted(() => ({
  requireRoleMock: vi.fn(),
  getPlanMock: vi.fn(),
  getCourseDetailBySlugMock: vi.fn(),
  ownsState: { owns: false },
}));

vi.mock('@lib/roles', () => ({ requireRole: requireRoleMock }));
vi.mock('@lib/access', () => ({ getPlan: getPlanMock }));
vi.mock('@lib/courses/catalog', () => ({ getCourseDetailBySlug: getCourseDetailBySlugMock }));
// `@lib/courses/access` itself is NOT mocked — its pure predicates
// (courseVisible/courseAccess/canViewLesson) run for real, exercising the
// exact same logic `access.test.ts` already unit-tests in isolation. Only
// its supabase dependency is faked, so `ownsCourse`'s one query resolves to
// `ownsState.owns` without needing real Supabase env vars in this test run.
vi.mock('@lib/supabase', () => ({
  createServiceClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve(ownsState.owns ? { data: { id: 'p1' }, error: null } : { data: null, error: null }),
          }),
        }),
      }),
    }),
  }),
}));

import CourseLandingPage from './index.astro';

const USER = { id: 'u1' };

function courseFixture(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'c1',
    slug: 'react-basico',
    title: 'React básico',
    subtitle: 'De cero a productivo',
    description: 'Aprendé React desde cero.',
    level: 'A2',
    coverPath: null,
    status: 'published',
    includedInPremium: true,
    priceCents: 1999,
    currency: 'USD',
    modules: [
      {
        id: 'm1',
        position: 0,
        title: 'Módulo 1',
        lessons: [
          { id: 'l1', position: 0, title: 'Introducción', kind: 'text', content: {}, duration_min: 5, is_preview: true },
          { id: 'l2', position: 1, title: 'Componentes', kind: 'video', content: {}, duration_min: 10, is_preview: false },
        ],
      },
    ],
    ...overrides,
  };
}

async function render(url: string, params: Record<string, string>, locals: Record<string, unknown> = {}) {
  const container = await createContainer();
  return container.renderToResponse(CourseLandingPage, {
    locals: { user: USER, ...locals } as unknown as App.Locals,
    params,
    request: new Request(url),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  requireRoleMock.mockResolvedValue(null);
  getPlanMock.mockResolvedValue('free');
  ownsState.owns = false;
  getCourseDetailBySlugMock.mockResolvedValue(courseFixture());
});

describe('GET /[lang]/cursos/[slug] — existence', () => {
  it('404s when the course does not exist', async () => {
    getCourseDetailBySlugMock.mockResolvedValue(null);
    const res = await render('https://chuyocode.test/es/cursos/missing', { lang: 'es', slug: 'missing' });
    expect(res.status).toBe(404);
  });

  it('404s a draft course for a non-moderator', async () => {
    getCourseDetailBySlugMock.mockResolvedValue(courseFixture({ status: 'draft' }));
    const res = await render('https://chuyocode.test/es/cursos/react-basico', { lang: 'es', slug: 'react-basico' });
    expect(res.status).toBe(404);
  });

  it('renders a draft course for a moderator, with a preview notice', async () => {
    requireRoleMock.mockResolvedValue({ id: 'mod-1' });
    getCourseDetailBySlugMock.mockResolvedValue(courseFixture({ status: 'draft' }));
    const res = await render('https://chuyocode.test/es/cursos/react-basico', { lang: 'es', slug: 'react-basico' });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-testid="moderator-preview-notice"');
  });
});

describe('GET /[lang]/cursos/[slug] — syllabus', () => {
  it('shows a preview tag on a preview lesson and a lock on a non-viewable one', async () => {
    const res = await render('https://chuyocode.test/es/cursos/react-basico', { lang: 'es', slug: 'react-basico' });
    const html = await res.text();
    expect(html).toContain('data-testid="syllabus-lesson-l1"');
    expect(html).toContain('data-testid="syllabus-lesson-l2"');
    // l1 is a preview lesson: no lock, shows the tag.
    const l1Match = html.match(/syllabus-lesson-l1"[\s\S]*?<\/li>/)?.[0] ?? '';
    expect(l1Match).not.toContain('🔒');
    // l2 is not preview and the visitor is free/not owning: locked.
    const l2Match = html.match(/syllabus-lesson-l2"[\s\S]*?<\/li>/)?.[0] ?? '';
    expect(l2Match).toContain('🔒');
  });
});

describe('GET /[lang]/cursos/[slug] — CTA', () => {
  it('shows disabled Premium/lifetime CTAs with a "payments soon" note for a free, non-owning visitor', async () => {
    const res = await render('https://chuyocode.test/es/cursos/react-basico', { lang: 'es', slug: 'react-basico' });
    const html = await res.text();
    expect(html).toContain('data-testid="cta-premium"');
    expect(html).toContain('data-testid="cta-buy-lifetime"');
    const ctaTag = html.match(/<button[^>]*cta-premium[^>]*>/)?.[0] ?? '';
    expect(ctaTag).toContain('disabled');
    expect(html).toContain('Pagos próximamente');
    expect(html).not.toContain('data-testid="cta-start"');
    expect(html).not.toContain('data-testid="cta-continue"');
  });

  it('omits the lifetime CTA when the course has no individual price', async () => {
    getCourseDetailBySlugMock.mockResolvedValue(courseFixture({ priceCents: null }));
    const res = await render('https://chuyocode.test/es/cursos/react-basico', { lang: 'es', slug: 'react-basico' });
    const html = await res.text();
    expect(html).not.toContain('data-testid="cta-buy-lifetime"');
  });

  it('shows "Empezar" linking to the first lesson for a premium plan', async () => {
    getPlanMock.mockResolvedValue('premium');
    const res = await render('https://chuyocode.test/es/cursos/react-basico', { lang: 'es', slug: 'react-basico' });
    const html = await res.text();
    expect(html).toContain('data-testid="cta-start"');
    expect(html).toContain('href="/es/cursos/react-basico/l1"');
  });

  it('shows "Continuar" for an owner, even on a free plan', async () => {
    ownsState.owns = true;
    const res = await render('https://chuyocode.test/es/cursos/react-basico', { lang: 'es', slug: 'react-basico' });
    const html = await res.text();
    expect(html).toContain('data-testid="cta-continue"');
  });
});
