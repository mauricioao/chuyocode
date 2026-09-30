import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createContainer } from '@/testSupport/astroContainer';

const { requireRoleMock } = vi.hoisted(() => ({
  requireRoleMock: vi.fn(),
}));
vi.mock('@lib/roles', () => ({ requireRole: requireRoleMock }));

import AdminUiPage from './index.astro';

const MODERATOR = { id: 'mod-1' };

async function render(
  url: string,
  { params, locals }: { params: Record<string, string>; locals?: Record<string, unknown> },
) {
  const container = await createContainer();
  return container.renderToResponse(AdminUiPage, {
    locals: { user: null, ...locals } as unknown as App.Locals,
    params,
    request: new Request(url),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  requireRoleMock.mockResolvedValue(null);
});

describe('GET /[lang]/admin/ui — routing', () => {
  it('404s for an unsupported lang segment', async () => {
    const res = await render('https://chuyocode.test/fr/admin/ui', { params: { lang: 'fr' } });
    expect(res.status).toBe(404);
  });
});

describe('GET /[lang]/admin/ui — anonymous gate', () => {
  it('redirects to sign-in rather than rendering the reference', async () => {
    const res = await render('https://chuyocode.test/es/admin/ui', { params: { lang: 'es' } });
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/es/auth/entrar?next=%2Fes%2Fadmin%2Fui');
  });

  it('is never publicly cacheable, even on the redirect path', async () => {
    const res = await render('https://chuyocode.test/es/admin/ui', { params: { lang: 'es' } });
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  it('never checks the moderator role for an anonymous visitor', async () => {
    await render('https://chuyocode.test/es/admin/ui', { params: { lang: 'es' } });
    expect(requireRoleMock).not.toHaveBeenCalled();
  });
});

describe('GET /[lang]/admin/ui — moderator gate', () => {
  it('404s a signed-in non-moderator, never a 403', async () => {
    requireRoleMock.mockResolvedValue(null);
    const res = await render('https://chuyocode.test/es/admin/ui', {
      params: { lang: 'es' },
      locals: { user: { id: 'user-1' } },
    });
    expect(res.status).toBe(404);
  });

  it('is never publicly cacheable on the 404 path', async () => {
    requireRoleMock.mockResolvedValue(null);
    const res = await render('https://chuyocode.test/es/admin/ui', {
      params: { lang: 'es' },
      locals: { user: { id: 'user-1' } },
    });
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });
});

describe('GET /[lang]/admin/ui — moderator render', () => {
  it('200s and renders the reference island for a moderator', async () => {
    requireRoleMock.mockResolvedValue(MODERATOR);
    const res = await render('https://chuyocode.test/es/admin/ui', {
      params: { lang: 'es' },
      locals: { user: { id: 'mod-1' } },
    });

    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-testid="ui-reference"');
    expect(html).toContain('data-testid="ui-ref-button-primary"');
  });

  it('is never publicly cacheable for a moderator either', async () => {
    requireRoleMock.mockResolvedValue(MODERATOR);
    const res = await render('https://chuyocode.test/es/admin/ui', {
      params: { lang: 'es' },
      locals: { user: { id: 'mod-1' } },
    });
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });
});
