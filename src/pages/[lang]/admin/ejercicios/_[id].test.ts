import { describe, it, expect, vi, beforeEach } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';

const { editableExercise, requireRoleMock } = vi.hoisted(() => ({
  editableExercise: { value: null as unknown },
  requireRoleMock: vi.fn(),
}));

vi.mock('@lib/exercises', () => ({
  getExerciseForEdit: vi.fn(async () => editableExercise.value),
}));
vi.mock('@lib/roles', () => ({ requireRole: requireRoleMock }));

import EditPage from './[id].astro';

const MODERATOR = { id: 'mod-1' };

async function render(
  url: string,
  {
    params,
    locals,
  }: { params: Record<string, string>; locals?: Record<string, unknown> },
) {
  const container = await AstroContainer.create();
  return container.renderToResponse(EditPage, {
    locals: { user: null, ...locals },
    params,
    request: new Request(url),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  editableExercise.value = null;
  requireRoleMock.mockResolvedValue(null);
});

describe('GET /[lang]/admin/ejercicios/[id] — routing', () => {
  it('404s for an unsupported lang segment', async () => {
    const res = await render('https://chuyocode.test/fr/admin/ejercicios/abc', {
      params: { lang: 'fr', id: 'abc' },
    });
    expect(res.status).toBe(404);
  });
});

describe('GET /[lang]/admin/ejercicios/[id] — anonymous gate', () => {
  it('redirects to sign-in with next pointing back at this exact edit URL', async () => {
    const res = await render('https://chuyocode.test/es/admin/ejercicios/abc', {
      params: { lang: 'es', id: 'abc' },
    });

    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(
      '/es/auth/entrar?next=%2Fes%2Fadmin%2Fejercicios%2Fabc',
    );
  });

  it('is never publicly cacheable', async () => {
    const res = await render('https://chuyocode.test/es/admin/ejercicios/abc', {
      params: { lang: 'es', id: 'abc' },
    });
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });
});

describe('GET /[lang]/admin/ejercicios/[id] — moderator gate', () => {
  it('404s a signed-in non-moderator before any ownership check', async () => {
    requireRoleMock.mockResolvedValue(null);
    const res = await render('https://chuyocode.test/es/admin/ejercicios/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
    });
    expect(res.status).toBe(404);
  });
});

describe('GET /[lang]/admin/ejercicios/[id] — ownership re-verified server-side', () => {
  it('404s when the exercise does not exist or is not owned by the caller — same shape either way', async () => {
    requireRoleMock.mockResolvedValue(MODERATOR);
    editableExercise.value = null;

    const res = await render('https://chuyocode.test/es/admin/ejercicios/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
    });

    expect(res.status).toBe(404);
  });

  it('never ships authoring markup on the 404 path', async () => {
    requireRoleMock.mockResolvedValue(MODERATOR);
    editableExercise.value = null;

    const res = await render('https://chuyocode.test/es/admin/ejercicios/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
    });
    const html = await res.text();

    expect(html).not.toContain('data-testid="exercise-author-island"');
  });

  it('is never publicly cacheable — WHICH id 404s depends on who is asking', async () => {
    requireRoleMock.mockResolvedValue(MODERATOR);
    editableExercise.value = null;

    const res = await render('https://chuyocode.test/es/admin/ejercicios/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
    });

    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });
});

/**
 * NOTE: same `AstroContainer` / `@astrojs/react` limitation as
 * `index.test.ts` — the authenticated-moderator-and-owned render mounts the
 * island and cannot be exercised here. Covered at the unit level; left for a
 * manual/Playwright pass.
 */
describe.skip('GET /[lang]/admin/ejercicios/[id] — the authoring form for an owned exercise (island)', () => {
  it('renders the authoring island seeded from the stored payload', async () => {
    requireRoleMock.mockResolvedValue(MODERATOR);
    editableExercise.value = {
      id: 'abc',
      slug: 'cat-on-the-mat',
      skill: 'writing',
      level: 'A1',
      focus: 'present-simple',
      topic: null,
      status: 'draft',
      payload: { pools: {}, slots: [{ id: 's1', label: 'x', input: 'text', answer: ['y'] }] },
    };

    const res = await render('https://chuyocode.test/es/admin/ejercicios/abc', {
      params: { lang: 'es', id: 'abc' },
      locals: { user: { id: 'user-1' } },
    });
    const html = await res.text();
    expect(html).toContain('data-testid="exercise-author-island"');
  });
});
