/**
 * Integration tests for `POST /api/admin/actividades/[revisionId]/aprobar`.
 * `@lib/roles` and `@lib/activities/moderation` are mocked — the write path
 * itself is covered by `moderation.test.ts`; this file only checks the HTTP
 * translation (gate order, status codes).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';

const { requireRoleMock, approveRevisionMock } = vi.hoisted(() => ({
  requireRoleMock: vi.fn(),
  approveRevisionMock: vi.fn(),
}));

vi.mock('@lib/roles', () => ({ requireRole: requireRoleMock }));
vi.mock('@lib/activities/moderation', () => ({ approveRevision: approveRevisionMock }));

import { POST } from './aprobar';

const MODERATOR: User = { id: '11111111-1111-1111-1111-111111111111' } as User;
const CALLER: User = { id: '22222222-2222-2222-2222-222222222222' } as User;
const REVISION_ID = '33333333-3333-3333-3333-333333333333';

function ctx(args: { revisionId?: string; user?: User | null }) {
  const { revisionId = REVISION_ID, user = CALLER } = args;
  const request = new Request(`https://chuyo.test/api/admin/actividades/${revisionId}/aprobar`, { method: 'POST' });
  return { params: { revisionId }, request, locals: { user } } as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  requireRoleMock.mockResolvedValue(MODERATOR);
  approveRevisionMock.mockResolvedValue({ ok: true });
});

describe('POST /api/admin/actividades/[revisionId]/aprobar — identity', () => {
  it('401s an anonymous caller, never checking the role', async () => {
    const res = await POST(ctx({ user: null }));
    expect(res.status).toBe(401);
    expect(requireRoleMock).not.toHaveBeenCalled();
  });

  it('404s a signed-in non-moderator, never a 403', async () => {
    requireRoleMock.mockResolvedValue(null);
    const res = await POST(ctx({}));
    expect(res.status).toBe(404);
    expect(approveRevisionMock).not.toHaveBeenCalled();
  });

  it('404s a malformed revisionId, only after the role check', async () => {
    const res = await POST(ctx({ revisionId: 'not-a-uuid' }));
    expect(res.status).toBe(404);
    expect(requireRoleMock).toHaveBeenCalled();
    expect(approveRevisionMock).not.toHaveBeenCalled();
  });

  it('marks every response private/no-store', async () => {
    const res = await POST(ctx({ user: null }));
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });
});

describe('POST /api/admin/actividades/[revisionId]/aprobar — outcomes', () => {
  it('passes the moderator id, not the caller id, to approveRevision', async () => {
    await POST(ctx({}));
    expect(approveRevisionMock).toHaveBeenCalledWith(REVISION_ID, MODERATOR.id);
  });

  it('200s with { ok: true } on success', async () => {
    const res = await POST(ctx({}));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('404s when the revision does not exist', async () => {
    approveRevisionMock.mockResolvedValue({ ok: false, error: 'not_found' });
    const res = await POST(ctx({}));
    expect(res.status).toBe(404);
  });

  it.each(['not_pending', 'invalid_blocks', 'foreign_upload'])('422s on validation error %s', async (error) => {
    approveRevisionMock.mockResolvedValue({ ok: false, error });
    const res = await POST(ctx({}));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error });
  });

  it.each(['copy_failed', 'approve_failed'])('500s on server error %s', async (error) => {
    approveRevisionMock.mockResolvedValue({ ok: false, error });
    const res = await POST(ctx({}));
    expect(res.status).toBe(500);
  });
});
