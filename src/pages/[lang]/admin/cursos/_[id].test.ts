import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createContainer } from '@/testSupport/astroContainer';

const { requireRoleMock, getCourseForEditMock, listOwnersMock } = vi.hoisted(() => ({
  requireRoleMock: vi.fn(),
  getCourseForEditMock: vi.fn(),
  listOwnersMock: vi.fn(),
}));
vi.mock('@lib/roles', () => ({ requireRole: requireRoleMock }));
vi.mock('@lib/courses/admin', () => ({
  getCourseForEdit: getCourseForEditMock,
  listOwners: listOwnersMock,
}));

import AdminCursoEditPage from './[id].astro';

const MODERATOR = { id: 'mod-1' };
const COURSE = {
  id: 'c1',
  slug: 'react-basico',
  title: 'React básico',
  subtitle: null,
  description: null,
  level: null,
  status: 'draft' as const,
  included_in_premium: true,
  price_cents: null,
  currency: 'USD',
  published_at: null,
  modules: [],
};

async function render(
  url: string,
  { params, locals }: { params: Record<string, string>; locals?: Record<string, unknown> },
) {
  const container = await createContainer();
  return container.renderToResponse(AdminCursoEditPage, {
    locals: { user: null, ...locals } as unknown as App.Locals,
    params,
    request: new Request(url),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  requireRoleMock.mockResolvedValue(null);
  getCourseForEditMock.mockResolvedValue(null);
  listOwnersMock.mockResolvedValue([]);
});

describe('GET /[lang]/admin/cursos/[id] — anonymous gate', () => {
  it('redirects to sign-in', async () => {
    const res = await render('https://chuyocode.test/es/admin/cursos/c1', { params: { lang: 'es', id: 'c1' } });
    expect(res.status).toBe(303);
  });

  it('never loads the course for an anonymous visitor', async () => {
    await render('https://chuyocode.test/es/admin/cursos/c1', { params: { lang: 'es', id: 'c1' } });
    expect(getCourseForEditMock).not.toHaveBeenCalled();
  });
});

describe('GET /[lang]/admin/cursos/[id] — moderator gate', () => {
  it('404s a signed-in non-moderator', async () => {
    const res = await render('https://chuyocode.test/es/admin/cursos/c1', {
      params: { lang: 'es', id: 'c1' },
      locals: { user: { id: 'user-1' } },
    });
    expect(res.status).toBe(404);
  });
});

describe('GET /[lang]/admin/cursos/[id] — existence', () => {
  it('404s when the course does not exist', async () => {
    requireRoleMock.mockResolvedValue(MODERATOR);
    getCourseForEditMock.mockResolvedValue(null);
    const res = await render('https://chuyocode.test/es/admin/cursos/missing', {
      params: { lang: 'es', id: 'missing' },
      locals: { user: { id: 'mod-1' } },
    });
    expect(res.status).toBe(404);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });
});

describe('GET /[lang]/admin/cursos/[id] — moderator render', () => {
  it('200s and renders the edit panel with the course title', async () => {
    requireRoleMock.mockResolvedValue(MODERATOR);
    getCourseForEditMock.mockResolvedValue(COURSE);
    listOwnersMock.mockResolvedValue([{ userId: 'u1', email: 'owner@example.com', source: 'grant', createdAt: '2024-01-01T00:00:00.000Z' }]);

    const res = await render('https://chuyocode.test/es/admin/cursos/c1', {
      params: { lang: 'es', id: 'c1' },
      locals: { user: { id: 'mod-1' } },
    });

    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('React básico');
    expect(html).toContain('data-testid="course-fields-form"');
    expect(html).toContain('owner@example.com');
  });

  it('is never publicly cacheable', async () => {
    requireRoleMock.mockResolvedValue(MODERATOR);
    getCourseForEditMock.mockResolvedValue(COURSE);
    const res = await render('https://chuyocode.test/es/admin/cursos/c1', {
      params: { lang: 'es', id: 'c1' },
      locals: { user: { id: 'mod-1' } },
    });
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });
});
