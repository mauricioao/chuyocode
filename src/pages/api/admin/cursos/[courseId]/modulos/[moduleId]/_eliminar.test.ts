import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';

const { requireRoleMock, deleteModuleMock } = vi.hoisted(() => ({
  requireRoleMock: vi.fn(),
  deleteModuleMock: vi.fn(),
}));

vi.mock('@lib/roles', () => ({ requireRole: requireRoleMock }));
vi.mock('@lib/courses/admin', () => ({ deleteModule: deleteModuleMock }));

import { POST } from './eliminar';

const MODERATOR: User = { id: '11111111-1111-1111-1111-111111111111' } as User;
const CALLER: User = { id: '22222222-2222-2222-2222-222222222222' } as User;
const COURSE_ID = '33333333-3333-3333-3333-333333333333';
const MODULE_ID = '44444444-4444-4444-4444-444444444444';

function ctx(args: { courseId?: string; moduleId?: string; user?: User | null }) {
  const { courseId = COURSE_ID, moduleId = MODULE_ID, user = CALLER } = args;
  const request = new Request(`https://chuyo.test/api/admin/cursos/${courseId}/modulos/${moduleId}/eliminar`, {
    method: 'POST',
  });
  return { params: { courseId, moduleId }, request, locals: { user } } as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  requireRoleMock.mockResolvedValue(MODERATOR);
  deleteModuleMock.mockResolvedValue({ ok: true, value: true });
});

describe('POST .../modulos/[moduleId]/eliminar — identity', () => {
  it('401s an anonymous caller', async () => {
    expect((await POST(ctx({ user: null }))).status).toBe(401);
  });

  it('404s a signed-in non-moderator', async () => {
    requireRoleMock.mockResolvedValue(null);
    expect((await POST(ctx({}))).status).toBe(404);
  });

  it('404s a malformed moduleId', async () => {
    expect((await POST(ctx({ moduleId: 'x' }))).status).toBe(404);
    expect(deleteModuleMock).not.toHaveBeenCalled();
  });
});

describe('POST .../modulos/[moduleId]/eliminar — outcomes', () => {
  it('200s with { ok: true }', async () => {
    const res = await POST(ctx({}));
    expect(res.status).toBe(200);
    expect(deleteModuleMock).toHaveBeenCalledWith(MODULE_ID);
  });

  it('500s on a db error', async () => {
    deleteModuleMock.mockResolvedValue({ ok: false, error: 'db_error' });
    expect((await POST(ctx({}))).status).toBe(500);
  });
});
