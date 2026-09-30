import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';

const { requireRoleMock, createModuleMock } = vi.hoisted(() => ({
  requireRoleMock: vi.fn(),
  createModuleMock: vi.fn(),
}));

vi.mock('@lib/roles', () => ({ requireRole: requireRoleMock }));
vi.mock('@lib/courses/admin', () => ({ createModule: createModuleMock }));

import { POST } from './index';

const MODERATOR: User = { id: '11111111-1111-1111-1111-111111111111' } as User;
const CALLER: User = { id: '22222222-2222-2222-2222-222222222222' } as User;
const COURSE_ID = '33333333-3333-3333-3333-333333333333';

function ctx(args: { courseId?: string; user?: User | null; body?: unknown; rawBody?: string }) {
  const { courseId = COURSE_ID, user = CALLER, body = { title: 'Módulo 1' }, rawBody } = args;
  const request = new Request(`https://chuyo.test/api/admin/cursos/${courseId}/modulos`, {
    method: 'POST',
    body: rawBody ?? JSON.stringify(body),
  });
  return { params: { courseId }, request, locals: { user } } as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  requireRoleMock.mockResolvedValue(MODERATOR);
  createModuleMock.mockResolvedValue({ ok: true, value: { id: 'm1' } });
});

describe('POST /api/admin/cursos/[courseId]/modulos — identity', () => {
  it('401s an anonymous caller', async () => {
    expect((await POST(ctx({ user: null }))).status).toBe(401);
  });

  it('404s a signed-in non-moderator', async () => {
    requireRoleMock.mockResolvedValue(null);
    expect((await POST(ctx({}))).status).toBe(404);
  });

  it('404s a malformed courseId', async () => {
    expect((await POST(ctx({ courseId: 'not-a-uuid' }))).status).toBe(404);
    expect(createModuleMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/admin/cursos/[courseId]/modulos — body', () => {
  it('400s on unparsable JSON', async () => {
    expect((await POST(ctx({ rawBody: '{not json' }))).status).toBe(400);
  });

  it('400s when title is not a string', async () => {
    expect((await POST(ctx({ body: { title: 5 } }))).status).toBe(400);
  });
});

describe('POST /api/admin/cursos/[courseId]/modulos — outcomes', () => {
  it('201s with the new id', async () => {
    const res = await POST(ctx({}));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: 'm1' });
  });

  it('422s on invalid_title', async () => {
    createModuleMock.mockResolvedValue({ ok: false, error: 'invalid_title' });
    expect((await POST(ctx({}))).status).toBe(422);
  });

  it('500s on a db error', async () => {
    createModuleMock.mockResolvedValue({ ok: false, error: 'db_error' });
    expect((await POST(ctx({}))).status).toBe(500);
  });
});
