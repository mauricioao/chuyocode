import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createContainer } from '@/testSupport/astroContainer';

const { requireRoleMock, getReviewQueueMock } = vi.hoisted(() => ({
  requireRoleMock: vi.fn(),
  getReviewQueueMock: vi.fn(),
}));
vi.mock('@lib/roles', () => ({ requireRole: requireRoleMock }));
vi.mock('@lib/activities/moderation', () => ({ getReviewQueue: getReviewQueueMock }));

import AdminActividadesPage from './index.astro';

const MODERATOR = { id: 'mod-1' };

async function render(
  url: string,
  { params, locals }: { params: Record<string, string>; locals?: Record<string, unknown> },
) {
  const container = await createContainer();
  return container.renderToResponse(AdminActividadesPage, {
    locals: { user: null, ...locals } as unknown as App.Locals,
    params,
    request: new Request(url),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  requireRoleMock.mockResolvedValue(null);
  getReviewQueueMock.mockResolvedValue({ pending: [], reported: [] });
});

describe('GET /[lang]/admin/actividades — routing', () => {
  it('404s for an unsupported lang segment', async () => {
    const res = await render('https://chuyocode.test/fr/admin/actividades', { params: { lang: 'fr' } });
    expect(res.status).toBe(404);
  });
});

describe('GET /[lang]/admin/actividades — anonymous gate', () => {
  it('redirects to sign-in rather than rendering the queue', async () => {
    const res = await render('https://chuyocode.test/es/admin/actividades', { params: { lang: 'es' } });
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/es/auth/entrar?next=%2Fes%2Fadmin%2Factividades');
  });

  it('is never publicly cacheable, even on the redirect path', async () => {
    const res = await render('https://chuyocode.test/es/admin/actividades', { params: { lang: 'es' } });
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  it('never checks the moderator role for an anonymous visitor', async () => {
    await render('https://chuyocode.test/es/admin/actividades', { params: { lang: 'es' } });
    expect(requireRoleMock).not.toHaveBeenCalled();
  });

  it('never loads the queue for an anonymous visitor', async () => {
    await render('https://chuyocode.test/es/admin/actividades', { params: { lang: 'es' } });
    expect(getReviewQueueMock).not.toHaveBeenCalled();
  });
});

describe('GET /[lang]/admin/actividades — moderator gate', () => {
  it('404s a signed-in non-moderator, never a 403', async () => {
    requireRoleMock.mockResolvedValue(null);
    const res = await render('https://chuyocode.test/es/admin/actividades', {
      params: { lang: 'es' },
      locals: { user: { id: 'user-1' } },
    });
    expect(res.status).toBe(404);
  });

  it('never loads the queue for a non-moderator', async () => {
    requireRoleMock.mockResolvedValue(null);
    await render('https://chuyocode.test/es/admin/actividades', {
      params: { lang: 'es' },
      locals: { user: { id: 'user-1' } },
    });
    expect(getReviewQueueMock).not.toHaveBeenCalled();
  });

  it('is never publicly cacheable on the 404 path', async () => {
    requireRoleMock.mockResolvedValue(null);
    const res = await render('https://chuyocode.test/es/admin/actividades', {
      params: { lang: 'es' },
      locals: { user: { id: 'user-1' } },
    });
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });
});

describe('GET /[lang]/admin/actividades — moderator render', () => {
  it('200s and renders the queue island for a moderator', async () => {
    requireRoleMock.mockResolvedValue(MODERATOR);
    getReviewQueueMock.mockResolvedValue({
      pending: [
        {
          revisionId: 'rev-1',
          activityId: 'act-1',
          activityTitle: 'Una actividad',
          author: { id: 'a1', email: 'a@example.com' },
          submittedAt: null,
          isEdit: false,
          blocks: [],
          publishedBlocks: null,
        },
      ],
      reported: [],
    });

    const res = await render('https://chuyocode.test/es/admin/actividades', {
      params: { lang: 'es' },
      locals: { user: { id: 'mod-1' } },
    });

    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Una actividad');
    expect(html).toContain('data-testid="moderation-tab-pending"');
  });

  it('is never publicly cacheable for a moderator either', async () => {
    requireRoleMock.mockResolvedValue(MODERATOR);
    const res = await render('https://chuyocode.test/es/admin/actividades', {
      params: { lang: 'es' },
      locals: { user: { id: 'mod-1' } },
    });
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });
});
