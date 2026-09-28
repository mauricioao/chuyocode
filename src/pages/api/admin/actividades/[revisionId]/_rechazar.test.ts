/**
 * Integration tests for `POST /api/admin/actividades/[revisionId]/rechazar`.
 * See `_aprobar.test.ts`'s header for the mocking rationale.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';

const { requireRoleMock, rejectRevisionMock } = vi.hoisted(() => ({
  requireRoleMock: vi.fn(),
  rejectRevisionMock: vi.fn(),
}));

vi.mock('@lib/roles', () => ({ requireRole: requireRoleMock }));
vi.mock('@lib/activities/moderation', () => ({ rejectRevision: rejectRevisionMock }));

import { POST } from './rechazar';

const MODERATOR: User = { id: '11111111-1111-1111-1111-111111111111' } as User;
const CALLER: User = { id: '22222222-2222-2222-2222-222222222222' } as User;
const REVISION_ID = '33333333-3333-3333-3333-333333333333';

function ctx(args: { revisionId?: string; user?: User | null; body?: unknown; rawBody?: string }) {
  const { revisionId = REVISION_ID, user = CALLER, body = { note: 'No cumple los requisitos.' }, rawBody } = args;
  const request = new Request(`https://chuyo.test/api/admin/actividades/${revisionId}/rechazar`, {
    method: 'POST',
    body: rawBody ?? JSON.stringify(body),
  });
  return { params: { revisionId }, request, locals: { user } } as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  requireRoleMock.mockResolvedValue(MODERATOR);
  rejectRevisionMock.mockResolvedValue({ ok: true });
});

describe('POST /api/admin/actividades/[revisionId]/rechazar — identity', () => {
  it('401s an anonymous caller', async () => {
    const res = await POST(ctx({ user: null }));
    expect(res.status).toBe(401);
    expect(requireRoleMock).not.toHaveBeenCalled();
  });

  it('404s a signed-in non-moderator, never a 403', async () => {
    requireRoleMock.mockResolvedValue(null);
    const res = await POST(ctx({}));
    expect(res.status).toBe(404);
  });

  it('404s a malformed revisionId', async () => {
    const res = await POST(ctx({ revisionId: 'not-a-uuid' }));
    expect(res.status).toBe(404);
    expect(rejectRevisionMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/admin/actividades/[revisionId]/rechazar — body', () => {
  it('400s on unparsable JSON', async () => {
    const res = await POST(ctx({ rawBody: '{not json' }));
    expect(res.status).toBe(400);
  });

  it('400s when note is not a string', async () => {
    const res = await POST(ctx({ body: { note: 5 } }));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/admin/actividades/[revisionId]/rechazar — outcomes', () => {
  it('passes the moderator id and the note through', async () => {
    await POST(ctx({ body: { note: 'Falta contenido.' } }));
    expect(rejectRevisionMock).toHaveBeenCalledWith(REVISION_ID, MODERATOR.id, 'Falta contenido.');
  });

  it('200s with { ok: true } on success', async () => {
    const res = await POST(ctx({}));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('404s when the revision does not exist', async () => {
    rejectRevisionMock.mockResolvedValue({ ok: false, error: 'not_found' });
    const res = await POST(ctx({}));
    expect(res.status).toBe(404);
  });

  it.each(['not_pending', 'invalid_note'])('422s on validation error %s', async (error) => {
    rejectRevisionMock.mockResolvedValue({ ok: false, error });
    const res = await POST(ctx({}));
    expect(res.status).toBe(422);
  });

  it('500s on reject_failed', async () => {
    rejectRevisionMock.mockResolvedValue({ ok: false, error: 'reject_failed' });
    const res = await POST(ctx({}));
    expect(res.status).toBe(500);
  });
});
