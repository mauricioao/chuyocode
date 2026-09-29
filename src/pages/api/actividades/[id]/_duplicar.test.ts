/**
 * Integration tests for `POST /api/actividades/[id]/duplicar`.
 * `@lib/activities/duplicate` is mocked — the write path itself is covered
 * by `duplicate.test.ts`; this file only checks the HTTP translation (gate
 * order, status codes).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';

const { duplicateActivityMock } = vi.hoisted(() => ({
  duplicateActivityMock: vi.fn(),
}));

vi.mock('@lib/activities/duplicate', () => ({ duplicateActivity: duplicateActivityMock }));

import { POST } from './duplicar';

const CALLER: User = { id: '11111111-1111-1111-1111-111111111111' } as User;
const ORIGINAL_ID = '22222222-2222-2222-2222-222222222222';
const NEW_ID = '33333333-3333-3333-3333-333333333333';

function ctx(args: { id?: string; user?: User | null }) {
  const { id = ORIGINAL_ID, user = CALLER } = args;
  const request = new Request(`https://chuyo.test/api/actividades/${id}/duplicar`, { method: 'POST' });
  return { params: { id }, request, locals: { user } } as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  duplicateActivityMock.mockResolvedValue({ ok: true, id: NEW_ID });
});

describe('POST /api/actividades/[id]/duplicar — identity', () => {
  it('401s an anonymous caller, never calling duplicateActivity', async () => {
    const res = await POST(ctx({ user: null }));
    expect(res.status).toBe(401);
    expect(duplicateActivityMock).not.toHaveBeenCalled();
  });

  it('404s a malformed id, never calling duplicateActivity', async () => {
    const res = await POST(ctx({ id: 'not-a-uuid' }));
    expect(res.status).toBe(404);
    expect(duplicateActivityMock).not.toHaveBeenCalled();
  });

  it('marks every response private/no-store', async () => {
    const res = await POST(ctx({ user: null }));
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  it('passes the original id and the CALLER id (never the original author) to duplicateActivity', async () => {
    await POST(ctx({}));
    expect(duplicateActivityMock).toHaveBeenCalledWith(ORIGINAL_ID, CALLER.id);
  });
});

describe('POST /api/actividades/[id]/duplicar — outcomes', () => {
  it('200s with { id } on success', async () => {
    const res = await POST(ctx({}));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: NEW_ID });
  });

  it('404s when the original does not exist or is not live', async () => {
    duplicateActivityMock.mockResolvedValue({ ok: false, error: 'not_found' });
    const res = await POST(ctx({}));
    expect(res.status).toBe(404);
  });

  it.each(['daily_limit', 'upload_limit'])('429s with { error } on rate limit %s', async (error) => {
    duplicateActivityMock.mockResolvedValue({ ok: false, error });
    const res = await POST(ctx({}));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error });
  });

  it.each(['copy_failed', 'create_failed'])('500s on server error %s', async (error) => {
    duplicateActivityMock.mockResolvedValue({ ok: false, error });
    const res = await POST(ctx({}));
    expect(res.status).toBe(500);
  });
});
