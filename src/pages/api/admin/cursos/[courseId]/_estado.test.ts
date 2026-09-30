import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';

const { requireRoleMock, setCourseStatusMock } = vi.hoisted(() => ({
  requireRoleMock: vi.fn(),
  setCourseStatusMock: vi.fn(),
}));

vi.mock('@lib/roles', () => ({ requireRole: requireRoleMock }));
vi.mock('@lib/courses/admin', () => ({ setCourseStatus: setCourseStatusMock }));

import { POST } from './estado';

const MODERATOR: User = { id: '11111111-1111-1111-1111-111111111111' } as User;
const CALLER: User = { id: '22222222-2222-2222-2222-222222222222' } as User;
const COURSE_ID = '33333333-3333-3333-3333-333333333333';

function ctx(args: { courseId?: string; user?: User | null; body?: unknown; rawBody?: string }) {
  const { courseId = COURSE_ID, user = CALLER, body = { status: 'published' }, rawBody } = args;
  const request = new Request(`https://chuyo.test/api/admin/cursos/${courseId}/estado`, {
    method: 'POST',
    body: rawBody ?? JSON.stringify(body),
  });
  return { params: { courseId }, request, locals: { user } } as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  requireRoleMock.mockResolvedValue(MODERATOR);
  setCourseStatusMock.mockResolvedValue({ ok: true, value: true });
});

describe('POST /api/admin/cursos/[courseId]/estado — identity', () => {
  it('401s an anonymous caller', async () => {
    expect((await POST(ctx({ user: null }))).status).toBe(401);
  });

  it('404s a signed-in non-moderator', async () => {
    requireRoleMock.mockResolvedValue(null);
    expect((await POST(ctx({}))).status).toBe(404);
  });

  it('404s a malformed courseId', async () => {
    expect((await POST(ctx({ courseId: 'not-a-uuid' }))).status).toBe(404);
    expect(setCourseStatusMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/admin/cursos/[courseId]/estado — body', () => {
  it('400s on unparsable JSON', async () => {
    expect((await POST(ctx({ rawBody: '{not json' }))).status).toBe(400);
  });

  it('400s on an unrecognized status literal', async () => {
    expect((await POST(ctx({ body: { status: 'live' } }))).status).toBe(400);
  });

  it.each(['draft', 'published', 'archived'])('accepts %s', async (status) => {
    const res = await POST(ctx({ body: { status } }));
    expect(res.status).toBe(200);
    expect(setCourseStatusMock).toHaveBeenCalledWith(COURSE_ID, status);
  });
});

describe('POST /api/admin/cursos/[courseId]/estado — outcomes', () => {
  it('422s on invalid_status', async () => {
    setCourseStatusMock.mockResolvedValue({ ok: false, error: 'invalid_status' });
    expect((await POST(ctx({}))).status).toBe(422);
  });

  it('500s on a db error', async () => {
    setCourseStatusMock.mockResolvedValue({ ok: false, error: 'db_error' });
    expect((await POST(ctx({}))).status).toBe(500);
  });
});
