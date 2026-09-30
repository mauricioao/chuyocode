import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';

const { requireRoleMock, reorderLessonsMock } = vi.hoisted(() => ({
  requireRoleMock: vi.fn(),
  reorderLessonsMock: vi.fn(),
}));

vi.mock('@lib/roles', () => ({ requireRole: requireRoleMock }));
vi.mock('@lib/courses/admin', () => ({ reorderLessons: reorderLessonsMock }));

import { POST } from './orden';

const MODERATOR: User = { id: '11111111-1111-1111-1111-111111111111' } as User;
const CALLER: User = { id: '22222222-2222-2222-2222-222222222222' } as User;
const COURSE_ID = '33333333-3333-3333-3333-333333333333';
const MODULE_ID = '44444444-4444-4444-4444-444444444444';

function ctx(args: { courseId?: string; moduleId?: string; user?: User | null; body?: unknown; rawBody?: string }) {
  const { courseId = COURSE_ID, moduleId = MODULE_ID, user = CALLER, body = { lessonIds: ['l1', 'l2'] }, rawBody } = args;
  const request = new Request(`https://chuyo.test/api/admin/cursos/${courseId}/modulos/${moduleId}/lecciones/orden`, {
    method: 'POST',
    body: rawBody ?? JSON.stringify(body),
  });
  return { params: { courseId, moduleId }, request, locals: { user } } as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  requireRoleMock.mockResolvedValue(MODERATOR);
  reorderLessonsMock.mockResolvedValue({ ok: true, value: true });
});

describe('POST .../lecciones/orden — identity', () => {
  it('401s an anonymous caller', async () => {
    expect((await POST(ctx({ user: null }))).status).toBe(401);
  });

  it('404s a signed-in non-moderator', async () => {
    requireRoleMock.mockResolvedValue(null);
    expect((await POST(ctx({}))).status).toBe(404);
  });

  it('404s a malformed moduleId', async () => {
    expect((await POST(ctx({ moduleId: 'x' }))).status).toBe(404);
    expect(reorderLessonsMock).not.toHaveBeenCalled();
  });
});

describe('POST .../lecciones/orden — body', () => {
  it('400s when lessonIds is not a string array', async () => {
    expect((await POST(ctx({ body: {} }))).status).toBe(400);
  });

  it('passes lessonIds through in order', async () => {
    await POST(ctx({ body: { lessonIds: ['b', 'a'] } }));
    expect(reorderLessonsMock).toHaveBeenCalledWith(MODULE_ID, ['b', 'a']);
  });
});

describe('POST .../lecciones/orden — outcomes', () => {
  it('200s with { ok: true }', async () => {
    const res = await POST(ctx({}));
    expect(res.status).toBe(200);
  });

  it('422s on invalid_order', async () => {
    reorderLessonsMock.mockResolvedValue({ ok: false, error: 'invalid_order' });
    expect((await POST(ctx({}))).status).toBe(422);
  });

  it('500s on a db error', async () => {
    reorderLessonsMock.mockResolvedValue({ ok: false, error: 'db_error' });
    expect((await POST(ctx({}))).status).toBe(500);
  });
});
