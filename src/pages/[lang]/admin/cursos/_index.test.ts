import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createContainer } from '@/testSupport/astroContainer';

const { requireRoleMock, listCoursesMock } = vi.hoisted(() => ({
  requireRoleMock: vi.fn(),
  listCoursesMock: vi.fn(),
}));
vi.mock('@lib/roles', () => ({ requireRole: requireRoleMock }));
vi.mock('@lib/courses/admin', () => ({ listCourses: listCoursesMock }));

import AdminCursosPage from './index.astro';

const MODERATOR = { id: 'mod-1' };

async function render(
  url: string,
  { params, locals }: { params: Record<string, string>; locals?: Record<string, unknown> },
) {
  const container = await createContainer();
  return container.renderToResponse(AdminCursosPage, {
    locals: { user: null, ...locals } as unknown as App.Locals,
    params,
    request: new Request(url),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  requireRoleMock.mockResolvedValue(null);
  listCoursesMock.mockResolvedValue([]);
});

describe('GET /[lang]/admin/cursos — routing', () => {
  it('404s for an unsupported lang segment', async () => {
    const res = await render('https://chuyocode.test/fr/admin/cursos', { params: { lang: 'fr' } });
    expect(res.status).toBe(404);
  });
});

describe('GET /[lang]/admin/cursos — anonymous gate', () => {
  it('redirects to sign-in', async () => {
    const res = await render('https://chuyocode.test/es/admin/cursos', { params: { lang: 'es' } });
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/es/auth/entrar?next=%2Fes%2Fadmin%2Fcursos');
  });

  it('is never publicly cacheable', async () => {
    const res = await render('https://chuyocode.test/es/admin/cursos', { params: { lang: 'es' } });
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  it('never checks the moderator role or loads courses for an anonymous visitor', async () => {
    await render('https://chuyocode.test/es/admin/cursos', { params: { lang: 'es' } });
    expect(requireRoleMock).not.toHaveBeenCalled();
    expect(listCoursesMock).not.toHaveBeenCalled();
  });
});

describe('GET /[lang]/admin/cursos — moderator gate', () => {
  it('404s a signed-in non-moderator, never a 403', async () => {
    const res = await render('https://chuyocode.test/es/admin/cursos', {
      params: { lang: 'es' },
      locals: { user: { id: 'user-1' } },
    });
    expect(res.status).toBe(404);
    expect(listCoursesMock).not.toHaveBeenCalled();
  });
});

describe('GET /[lang]/admin/cursos — moderator render', () => {
  it('200s, shows the empty state, and renders the create form', async () => {
    requireRoleMock.mockResolvedValue(MODERATOR);
    const res = await render('https://chuyocode.test/es/admin/cursos', {
      params: { lang: 'es' },
      locals: { user: { id: 'mod-1' } },
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-testid="course-list-empty"');
    expect(html).toContain('data-testid="course-create-form"');
  });

  it('lists an existing course with its status and slug', async () => {
    requireRoleMock.mockResolvedValue(MODERATOR);
    listCoursesMock.mockResolvedValue([
      { id: 'c1', slug: 'react-basico', title: 'React básico', status: 'draft', included_in_premium: true, price_cents: null },
    ]);
    const res = await render('https://chuyocode.test/es/admin/cursos', {
      params: { lang: 'es' },
      locals: { user: { id: 'mod-1' } },
    });
    const html = await res.text();
    expect(html).toContain('React básico');
    expect(html).toContain('react-basico');
    expect(html).toContain('data-testid="course-list-item-c1"');
  });

  it('is never publicly cacheable for a moderator either', async () => {
    requireRoleMock.mockResolvedValue(MODERATOR);
    const res = await render('https://chuyocode.test/es/admin/cursos', {
      params: { lang: 'es' },
      locals: { user: { id: 'mod-1' } },
    });
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });
});
