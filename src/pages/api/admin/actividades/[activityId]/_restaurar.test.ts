/**
 * Integration tests for `POST /api/admin/actividades/[activityId]/restaurar`.
 * See `_aprobar.test.ts`'s header for the mocking rationale.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';

const { requireRoleMock, restoreActivityMock, removeActivityMock } = vi.hoisted(() => ({
  requireRoleMock: vi.fn(),
  restoreActivityMock: vi.fn(),
  removeActivityMock: vi.fn(),
}));

vi.mock('@lib/roles', () => ({ requireRole: requireRoleMock }));
vi.mock('@lib/activities/moderation', () => ({
  restoreActivity: restoreActivityMock,
  removeActivity: removeActivityMock,
}));

import { POST } from './restaurar';

const MODERATOR: User = { id: '11111111-1111-1111-1111-111111111111' } as User;
const CALLER: User = { id: '22222222-2222-2222-2222-222222222222' } as User;
const ACTIVITY_ID = '33333333-3333-3333-3333-333333333333';

function ctx(args: { activityId?: string; user?: User | null; body?: unknown; rawBody?: string }) {
  const { activityId = ACTIVITY_ID, user = CALLER, body = { action: 'restore' }, rawBody } = args;
  const request = new Request(`https://chuyo.test/api/admin/actividades/${activityId}/restaurar`, {
    method: 'POST',
    body: rawBody ?? JSON.stringify(body),
  });
  return { params: { activityId }, request, locals: { user } } as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  requireRoleMock.mockResolvedValue(MODERATOR);
  restoreActivityMock.mockResolvedValue({ ok: true });
  removeActivityMock.mockResolvedValue({ ok: true });
});

describe('POST /api/admin/actividades/[activityId]/restaurar — identity', () => {
  it('401s an anonymous caller', async () => {
    const res = await POST(ctx({ user: null }));
    expect(res.status).toBe(401);
  });

  it('404s a signed-in non-moderator, never a 403', async () => {
    requireRoleMock.mockResolvedValue(null);
    const res = await POST(ctx({}));
    expect(res.status).toBe(404);
  });

  it('404s a malformed activityId', async () => {
    const res = await POST(ctx({ activityId: 'not-a-uuid' }));
    expect(res.status).toBe(404);
  });
});

describe('POST /api/admin/actividades/[activityId]/restaurar — body', () => {
  it('400s on unparsable JSON', async () => {
    const res = await POST(ctx({ rawBody: '{not json' }));
    expect(res.status).toBe(400);
  });

  it('400s on an unknown action', async () => {
    const res = await POST(ctx({ body: { action: 'delete-forever' } }));
    expect(res.status).toBe(400);
    expect(restoreActivityMock).not.toHaveBeenCalled();
    expect(removeActivityMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/admin/actividades/[activityId]/restaurar — restore', () => {
  it('calls restoreActivity with the moderator id and 200s', async () => {
    const res = await POST(ctx({ body: { action: 'restore' } }));
    expect(restoreActivityMock).toHaveBeenCalledWith(ACTIVITY_ID, MODERATOR.id);
    expect(removeActivityMock).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
  });

  it('422s when the activity is not hidden', async () => {
    restoreActivityMock.mockResolvedValue({ ok: false, error: 'not_hidden' });
    const res = await POST(ctx({ body: { action: 'restore' } }));
    expect(res.status).toBe(422);
  });

  it('404s when the activity does not exist', async () => {
    restoreActivityMock.mockResolvedValue({ ok: false, error: 'not_found' });
    const res = await POST(ctx({ body: { action: 'restore' } }));
    expect(res.status).toBe(404);
  });

  it('500s on restore_failed', async () => {
    restoreActivityMock.mockResolvedValue({ ok: false, error: 'restore_failed' });
    const res = await POST(ctx({ body: { action: 'restore' } }));
    expect(res.status).toBe(500);
  });
});

describe('POST /api/admin/actividades/[activityId]/restaurar — remove', () => {
  it('calls removeActivity with the moderator id and 200s', async () => {
    const res = await POST(ctx({ body: { action: 'remove' } }));
    expect(removeActivityMock).toHaveBeenCalledWith(ACTIVITY_ID, MODERATOR.id);
    expect(restoreActivityMock).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
  });

  it('500s on remove_failed', async () => {
    removeActivityMock.mockResolvedValue({ ok: false, error: 'remove_failed' });
    const res = await POST(ctx({ body: { action: 'remove' } }));
    expect(res.status).toBe(500);
  });
});
