import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';

const { requireRoleMock, renameModuleMock } = vi.hoisted(() => ({
  requireRoleMock: vi.fn(),
  renameModuleMock: vi.fn(),
}));

vi.mock('@lib/roles', () => ({ requireRole: requireRoleMock }));
vi.mock('@lib/courses/admin', () => ({ renameModule: renameModuleMock }));

import { POST } from './renombrar';

const MODERATOR: User = { id: '11111111-1111-1111-1111-111111111111' } as User;
const CALLER: User = { id: '22222222-2222-2222-2222-222222222222' } as User;
const COURSE_ID = '33333333-3333-3333-3333-333333333333';
const MODULE_ID = '44444444-4444-4444-4444-444444444444';

function ctx(args: { courseId?: string; moduleId?: string; user?: User | null; body?: unknown; rawBody?: string }) {
  const { courseId = COURSE_ID, moduleId = MODULE_ID, user = CALLER, body = { title: 'Nuevo nombre' }, rawBody } = args;
  const request = new Request(`https://chuyo.test/api/admin/cursos/${courseId}/modulos/${moduleId}/renombrar`, {
    method: 'POST',
    body: rawBody ?? JSON.stringify(body),
  });
  return { params: { courseId, moduleId }, request, locals: { user } } as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  requireRoleMock.mockResolvedValue(MODERATOR);
  renameModuleMock.mockResolvedValue({ ok: true, value: true });
});

describe('POST .../modulos/[moduleId]/renombrar — identity', () => {
  it('401s an anonymous caller', async () => {
    expect((await POST(ctx({ user: null }))).status).toBe(401);
  });

  it('404s a signed-in non-moderator', async () => {
    requireRoleMock.mockResolvedValue(null);
    expect((await POST(ctx({}))).status).toBe(404);
  });

  it('404s a malformed courseId', async () => {
    expect((await POST(ctx({ courseId: 'x' }))).status).toBe(404);
    expect(renameModuleMock).not.toHaveBeenCalled();
  });

  it('404s a malformed moduleId', async () => {
    expect((await POST(ctx({ moduleId: 'x' }))).status).toBe(404);
    expect(renameModuleMock).not.toHaveBeenCalled();
  });
});

describe('POST .../modulos/[moduleId]/renombrar — body', () => {
  it('400s on unparsable JSON', async () => {
    expect((await POST(ctx({ rawBody: '{not json' }))).status).toBe(400);
  });

  it('400s when title is not a string', async () => {
    expect((await POST(ctx({ body: { title: 5 } }))).status).toBe(400);
  });
});

describe('POST .../modulos/[moduleId]/renombrar — outcomes', () => {
  it('200s with { ok: true }', async () => {
    const res = await POST(ctx({}));
    expect(res.status).toBe(200);
    expect(renameModuleMock).toHaveBeenCalledWith(MODULE_ID, 'Nuevo nombre');
  });

  it('422s on invalid_title', async () => {
    renameModuleMock.mockResolvedValue({ ok: false, error: 'invalid_title' });
    expect((await POST(ctx({}))).status).toBe(422);
  });

  it('500s on a db error', async () => {
    renameModuleMock.mockResolvedValue({ ok: false, error: 'db_error' });
    expect((await POST(ctx({}))).status).toBe(500);
  });
});
