import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';

const { requireRoleMock, updateCourseMock } = vi.hoisted(() => ({
  requireRoleMock: vi.fn(),
  updateCourseMock: vi.fn(),
}));

vi.mock('@lib/roles', () => ({ requireRole: requireRoleMock }));
vi.mock('@lib/courses/admin', () => ({ updateCourse: updateCourseMock }));

import { POST } from './actualizar';

const MODERATOR: User = { id: '11111111-1111-1111-1111-111111111111' } as User;
const CALLER: User = { id: '22222222-2222-2222-2222-222222222222' } as User;
const COURSE_ID = '33333333-3333-3333-3333-333333333333';

function ctx(args: { courseId?: string; user?: User | null; body?: unknown; rawBody?: string }) {
  const { courseId = COURSE_ID, user = CALLER, body = { title: 'Nuevo título' }, rawBody } = args;
  const request = new Request(`https://chuyo.test/api/admin/cursos/${courseId}/actualizar`, {
    method: 'POST',
    body: rawBody ?? JSON.stringify(body),
  });
  return { params: { courseId }, request, locals: { user } } as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  requireRoleMock.mockResolvedValue(MODERATOR);
  updateCourseMock.mockResolvedValue({ ok: true, value: true });
});

describe('POST /api/admin/cursos/[courseId]/actualizar — identity', () => {
  it('401s an anonymous caller', async () => {
    expect((await POST(ctx({ user: null }))).status).toBe(401);
  });

  it('404s a signed-in non-moderator', async () => {
    requireRoleMock.mockResolvedValue(null);
    expect((await POST(ctx({}))).status).toBe(404);
  });

  it('404s a malformed courseId', async () => {
    const res = await POST(ctx({ courseId: 'not-a-uuid' }));
    expect(res.status).toBe(404);
    expect(updateCourseMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/admin/cursos/[courseId]/actualizar — body', () => {
  it('400s on unparsable JSON', async () => {
    expect((await POST(ctx({ rawBody: '{not json' }))).status).toBe(400);
  });

  it('400s when a field has the wrong type', async () => {
    expect((await POST(ctx({ body: { title: 5 } }))).status).toBe(400);
  });

  it('accepts a partial patch', async () => {
    const res = await POST(ctx({ body: { included_in_premium: false } }));
    expect(res.status).toBe(200);
    expect(updateCourseMock).toHaveBeenCalledWith(COURSE_ID, { included_in_premium: false });
  });
});

describe('POST /api/admin/cursos/[courseId]/actualizar — outcomes', () => {
  it('200s with { ok: true } on success', async () => {
    const res = await POST(ctx({}));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it.each(['invalid_slug', 'invalid_title', 'invalid_subtitle', 'invalid_level', 'invalid_price'])(
    '422s on validation error %s',
    async (error) => {
      updateCourseMock.mockResolvedValue({ ok: false, error });
      expect((await POST(ctx({}))).status).toBe(422);
    },
  );

  it('409s on a duplicate slug', async () => {
    updateCourseMock.mockResolvedValue({ ok: false, error: 'duplicate_slug' });
    expect((await POST(ctx({}))).status).toBe(409);
  });

  it('500s on a db error', async () => {
    updateCourseMock.mockResolvedValue({ ok: false, error: 'db_error' });
    expect((await POST(ctx({}))).status).toBe(500);
  });
});
