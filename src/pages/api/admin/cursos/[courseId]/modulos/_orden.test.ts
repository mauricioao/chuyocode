import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';

const { requireRoleMock, reorderModulesMock } = vi.hoisted(() => ({
  requireRoleMock: vi.fn(),
  reorderModulesMock: vi.fn(),
}));

vi.mock('@lib/roles', () => ({ requireRole: requireRoleMock }));
vi.mock('@lib/courses/admin', () => ({ reorderModules: reorderModulesMock }));

import { POST } from './orden';

const MODERATOR: User = { id: '11111111-1111-1111-1111-111111111111' } as User;
const CALLER: User = { id: '22222222-2222-2222-2222-222222222222' } as User;
const COURSE_ID = '33333333-3333-3333-3333-333333333333';

function ctx(args: { courseId?: string; user?: User | null; body?: unknown; rawBody?: string }) {
  const { courseId = COURSE_ID, user = CALLER, body = { moduleIds: ['m1', 'm2'] }, rawBody } = args;
  const request = new Request(`https://chuyo.test/api/admin/cursos/${courseId}/modulos/orden`, {
    method: 'POST',
    body: rawBody ?? JSON.stringify(body),
  });
  return { params: { courseId }, request, locals: { user } } as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  requireRoleMock.mockResolvedValue(MODERATOR);
  reorderModulesMock.mockResolvedValue({ ok: true, value: true });
});

describe('POST /api/admin/cursos/[courseId]/modulos/orden — identity', () => {
  it('401s an anonymous caller', async () => {
    expect((await POST(ctx({ user: null }))).status).toBe(401);
  });

  it('404s a signed-in non-moderator', async () => {
    requireRoleMock.mockResolvedValue(null);
    expect((await POST(ctx({}))).status).toBe(404);
  });

  it('404s a malformed courseId', async () => {
    expect((await POST(ctx({ courseId: 'x' }))).status).toBe(404);
    expect(reorderModulesMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/admin/cursos/[courseId]/modulos/orden — body', () => {
  it('400s on unparsable JSON', async () => {
    expect((await POST(ctx({ rawBody: '{not json' }))).status).toBe(400);
  });

  it('400s when moduleIds is not a string array', async () => {
    expect((await POST(ctx({ body: { moduleIds: [1, 2] } }))).status).toBe(400);
    expect((await POST(ctx({ body: {} }))).status).toBe(400);
  });

  it('passes moduleIds through in order', async () => {
    await POST(ctx({ body: { moduleIds: ['b', 'a'] } }));
    expect(reorderModulesMock).toHaveBeenCalledWith(COURSE_ID, ['b', 'a']);
  });
});

describe('POST /api/admin/cursos/[courseId]/modulos/orden — outcomes', () => {
  it('200s with { ok: true }', async () => {
    const res = await POST(ctx({}));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('422s on invalid_order', async () => {
    reorderModulesMock.mockResolvedValue({ ok: false, error: 'invalid_order' });
    expect((await POST(ctx({}))).status).toBe(422);
  });

  it('500s on a db error', async () => {
    reorderModulesMock.mockResolvedValue({ ok: false, error: 'db_error' });
    expect((await POST(ctx({}))).status).toBe(500);
  });
});
