/**
 * Integration tests for `POST /api/admin/cursos`. See
 * `admin/actividades/[revisionId]/_rechazar.test.ts`'s header for the
 * mocking rationale (direct `POST(ctx)` calls, no Astro container needed).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';

const { requireRoleMock, createCourseMock } = vi.hoisted(() => ({
  requireRoleMock: vi.fn(),
  createCourseMock: vi.fn(),
}));

vi.mock('@lib/roles', () => ({ requireRole: requireRoleMock }));
vi.mock('@lib/courses/admin', () => ({ createCourse: createCourseMock }));

import { POST } from './index';

const MODERATOR: User = { id: '11111111-1111-1111-1111-111111111111' } as User;
const CALLER: User = { id: '22222222-2222-2222-2222-222222222222' } as User;

function ctx(args: { user?: User | null; body?: unknown; rawBody?: string }) {
  const { user = CALLER, body = { slug: 'react-basico', title: 'React básico' }, rawBody } = args;
  const request = new Request('https://chuyo.test/api/admin/cursos', {
    method: 'POST',
    body: rawBody ?? JSON.stringify(body),
  });
  return { params: {}, request, locals: { user } } as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  requireRoleMock.mockResolvedValue(MODERATOR);
  createCourseMock.mockResolvedValue({ ok: true, value: { id: 'c1', slug: 'react-basico', title: 'React básico', status: 'draft' } });
});

describe('POST /api/admin/cursos — identity', () => {
  it('401s an anonymous caller', async () => {
    const res = await POST(ctx({ user: null }));
    expect(res.status).toBe(401);
    expect(requireRoleMock).not.toHaveBeenCalled();
  });

  it('404s a signed-in non-moderator, never a 403', async () => {
    requireRoleMock.mockResolvedValue(null);
    const res = await POST(ctx({}));
    expect(res.status).toBe(404);
    expect(createCourseMock).not.toHaveBeenCalled();
  });

  it('is never publicly cacheable', async () => {
    const res = await POST(ctx({}));
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });
});

describe('POST /api/admin/cursos — body', () => {
  it('400s on unparsable JSON', async () => {
    const res = await POST(ctx({ rawBody: '{not json' }));
    expect(res.status).toBe(400);
  });

  it('400s when slug is missing', async () => {
    const res = await POST(ctx({ body: { title: 'X' } }));
    expect(res.status).toBe(400);
  });

  it('400s when title is missing', async () => {
    const res = await POST(ctx({ body: { slug: 'x' } }));
    expect(res.status).toBe(400);
  });

  it('400s when a field has the wrong type', async () => {
    const res = await POST(ctx({ body: { slug: 'x', title: 'X', price_cents: 'free' } }));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/admin/cursos — outcomes', () => {
  it('201s with the created course', async () => {
    const res = await POST(ctx({}));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ course: { id: 'c1', slug: 'react-basico', title: 'React básico', status: 'draft' } });
  });

  it.each(['invalid_slug', 'invalid_title', 'invalid_subtitle', 'invalid_level', 'invalid_price'])(
    '422s on validation error %s',
    async (error) => {
      createCourseMock.mockResolvedValue({ ok: false, error });
      const res = await POST(ctx({}));
      expect(res.status).toBe(422);
    },
  );

  it('409s on a duplicate slug', async () => {
    createCourseMock.mockResolvedValue({ ok: false, error: 'duplicate_slug' });
    const res = await POST(ctx({}));
    expect(res.status).toBe(409);
  });

  it('500s on a db error', async () => {
    createCourseMock.mockResolvedValue({ ok: false, error: 'db_error' });
    const res = await POST(ctx({}));
    expect(res.status).toBe(500);
  });
});
