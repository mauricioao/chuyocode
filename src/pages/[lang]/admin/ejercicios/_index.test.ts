import { describe, it, expect, vi, beforeEach } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';

const { requireRoleMock } = vi.hoisted(() => ({ requireRoleMock: vi.fn() }));
vi.mock('@lib/roles', () => ({ requireRole: requireRoleMock }));

import AdminEjerciciosPage from './index.astro';

const MODERATOR = { id: 'mod-1' };

/** Render the curated-exercise authoring page with route params + middleware locals. */
async function render(
  url: string,
  { params, locals }: { params: Record<string, string>; locals?: Record<string, unknown> },
) {
  const container = await AstroContainer.create();
  return container.renderToResponse(AdminEjerciciosPage, {
    locals: { user: null, ...locals },
    params,
    request: new Request(url),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  requireRoleMock.mockResolvedValue(null);
});

describe('GET /[lang]/admin/ejercicios — routing', () => {
  it('404s for an unsupported lang segment', async () => {
    const res = await render('https://chuyocode.test/fr/admin/ejercicios', { params: { lang: 'fr' } });
    expect(res.status).toBe(404);
  });
});

describe('GET /[lang]/admin/ejercicios — anonymous gate', () => {
  it('redirects to sign-in rather than rendering the authoring markup', async () => {
    const res = await render('https://chuyocode.test/es/admin/ejercicios', { params: { lang: 'es' } });

    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/es/auth/entrar?next=%2Fes%2Fadmin%2Fejercicios');
  });

  it('never ships authoring markup to an anonymous visitor', async () => {
    const res = await render('https://chuyocode.test/es/admin/ejercicios', { params: { lang: 'es' } });
    const html = await res.text();

    expect(html).not.toContain('data-testid="exercise-author-island"');
    expect(html).not.toContain('data-testid="add-row-block"');
  });

  it('is never publicly cacheable, even on the redirect path', async () => {
    const res = await render('https://chuyocode.test/es/admin/ejercicios', { params: { lang: 'es' } });
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  it('never checks the moderator role for an anonymous visitor', async () => {
    await render('https://chuyocode.test/es/admin/ejercicios', { params: { lang: 'es' } });
    expect(requireRoleMock).not.toHaveBeenCalled();
  });
});

describe('GET /[lang]/admin/ejercicios — moderator gate', () => {
  it('404s a signed-in non-moderator, never a 403', async () => {
    requireRoleMock.mockResolvedValue(null);
    const res = await render('https://chuyocode.test/es/admin/ejercicios', {
      params: { lang: 'es' },
      locals: { user: { id: 'user-1' } },
    });
    expect(res.status).toBe(404);
  });

  it('is never publicly cacheable on the 404 path', async () => {
    requireRoleMock.mockResolvedValue(null);
    const res = await render('https://chuyocode.test/es/admin/ejercicios', {
      params: { lang: 'es' },
      locals: { user: { id: 'user-1' } },
    });
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });
});

/**
 * NOTE: the moderator branch mounts `ExerciseAuthorIsland` (`client:load`),
 * which `AstroContainer` cannot render without the `@astrojs/react` server
 * renderer configured — the same documented limitation as the pre-move
 * `crear/index.test.ts`. The island itself is fully covered at the unit
 * level; the authenticated-moderator PAGE render (markup + island mounted
 * together) is left for a manual/Playwright pass — see the apply report.
 */
describe.skip('GET /[lang]/admin/ejercicios — the authoring form (island, needs @astrojs/react in AstroContainer)', () => {
  it('renders the authoring island for a moderator', async () => {
    requireRoleMock.mockResolvedValue(MODERATOR);
    const res = await render('https://chuyocode.test/es/admin/ejercicios', {
      params: { lang: 'es' },
      locals: { user: { id: 'user-1' } },
    });
    const html = await res.text();
    expect(html).toContain('data-testid="exercise-author-island"');
  });
});
