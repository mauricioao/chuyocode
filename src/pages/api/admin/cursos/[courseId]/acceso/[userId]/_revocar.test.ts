import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';

const { requireRoleMock, revokeAccessMock } = vi.hoisted(() => ({
  requireRoleMock: vi.fn(),
  revokeAccessMock: vi.fn(),
}));

vi.mock('@lib/roles', () => ({ requireRole: requireRoleMock }));
vi.mock('@lib/courses/admin', () => ({ revokeAccess: revokeAccessMock }));

import { POST } from './revocar';

const MODERATOR: User = { id: '11111111-1111-1111-1111-111111111111' } as User;
const CALLER: User = { id: '22222222-2222-2222-2222-222222222222' } as User;
const COURSE_ID = '33333333-3333-3333-3333-333333333333';
const TARGET_USER_ID = '44444444-4444-4444-4444-444444444444';

function ctx(args: { courseId?: string; userId?: string; user?: User | null }) {
  const { courseId = COURSE_ID, userId = TARGET_USER_ID, user = CALLER } = args;
  const request = new Request(`https://chuyo.test/api/admin/cursos/${courseId}/acceso/${userId}/revocar`, {
    method: 'POST',
  });
  return { params: { courseId, userId }, request, locals: { user } } as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  requireRoleMock.mockResolvedValue(MODERATOR);
  revokeAccessMock.mockResolvedValue({ ok: true, value: true });
});

describe('POST /api/admin/cursos/[courseId]/acceso/[userId]/revocar — identity', () => {
  it('401s an anonymous caller', async () => {
    expect((await POST(ctx({ user: null }))).status).toBe(401);
  });

  it('404s a signed-in non-moderator', async () => {
    requireRoleMock.mockResolvedValue(null);
    expect((await POST(ctx({}))).status).toBe(404);
  });

  it('404s a malformed courseId', async () => {
    expect((await POST(ctx({ courseId: 'not-a-uuid' }))).status).toBe(404);
    expect(revokeAccessMock).not.toHaveBeenCalled();
  });

  it('404s a malformed userId', async () => {
    expect((await POST(ctx({ userId: 'not-a-uuid' }))).status).toBe(404);
    expect(revokeAccessMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/admin/cursos/[courseId]/acceso/[userId]/revocar — outcomes', () => {
  it('200s with { ok: true } on success', async () => {
    const res = await POST(ctx({}));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(revokeAccessMock).toHaveBeenCalledWith(COURSE_ID, TARGET_USER_ID);
  });

  it('500s on a db error', async () => {
    revokeAccessMock.mockResolvedValue({ ok: false, error: 'db_error' });
    expect((await POST(ctx({}))).status).toBe(500);
  });
});
