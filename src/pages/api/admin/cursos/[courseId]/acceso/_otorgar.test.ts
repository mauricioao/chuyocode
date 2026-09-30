import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';

const { requireRoleMock, grantAccessMock } = vi.hoisted(() => ({
  requireRoleMock: vi.fn(),
  grantAccessMock: vi.fn(),
}));

vi.mock('@lib/roles', () => ({ requireRole: requireRoleMock }));
vi.mock('@lib/courses/admin', () => ({ grantAccess: grantAccessMock }));

import { POST } from './otorgar';

const MODERATOR: User = { id: '11111111-1111-1111-1111-111111111111' } as User;
const CALLER: User = { id: '22222222-2222-2222-2222-222222222222' } as User;
const COURSE_ID = '33333333-3333-3333-3333-333333333333';

function ctx(args: { courseId?: string; user?: User | null; body?: unknown; rawBody?: string }) {
  const { courseId = COURSE_ID, user = CALLER, body = { email: 'student@example.com' }, rawBody } = args;
  const request = new Request(`https://chuyo.test/api/admin/cursos/${courseId}/acceso/otorgar`, {
    method: 'POST',
    body: rawBody ?? JSON.stringify(body),
  });
  return { params: { courseId }, request, locals: { user } } as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  requireRoleMock.mockResolvedValue(MODERATOR);
  grantAccessMock.mockResolvedValue({ ok: true, value: true });
});

describe('POST /api/admin/cursos/[courseId]/acceso/otorgar — identity', () => {
  it('401s an anonymous caller', async () => {
    expect((await POST(ctx({ user: null }))).status).toBe(401);
  });

  it('404s a signed-in non-moderator', async () => {
    requireRoleMock.mockResolvedValue(null);
    expect((await POST(ctx({}))).status).toBe(404);
  });

  it('404s a malformed courseId', async () => {
    expect((await POST(ctx({ courseId: 'not-a-uuid' }))).status).toBe(404);
    expect(grantAccessMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/admin/cursos/[courseId]/acceso/otorgar — body', () => {
  it('400s on unparsable JSON', async () => {
    expect((await POST(ctx({ rawBody: '{not json' }))).status).toBe(400);
  });

  it('400s on a missing email', async () => {
    expect((await POST(ctx({ body: {} }))).status).toBe(400);
  });

  it('400s on a blank email', async () => {
    expect((await POST(ctx({ body: { email: '  ' } }))).status).toBe(400);
  });

  it('passes the moderator id as grantedBy', async () => {
    await POST(ctx({}));
    expect(grantAccessMock).toHaveBeenCalledWith(COURSE_ID, 'student@example.com', MODERATOR.id);
  });
});

describe('POST /api/admin/cursos/[courseId]/acceso/otorgar — outcomes', () => {
  it('200s with { ok: true } on success', async () => {
    const res = await POST(ctx({}));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('404s when no user matches the email', async () => {
    grantAccessMock.mockResolvedValue({ ok: false, error: 'user_not_found' });
    const res = await POST(ctx({}));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'user_not_found' });
  });

  it('409s when the user already owns the course', async () => {
    grantAccessMock.mockResolvedValue({ ok: false, error: 'already_owned' });
    expect((await POST(ctx({}))).status).toBe(409);
  });

  it('500s on a db error', async () => {
    grantAccessMock.mockResolvedValue({ ok: false, error: 'db_error' });
    expect((await POST(ctx({}))).status).toBe(500);
  });
});
