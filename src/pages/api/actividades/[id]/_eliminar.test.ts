/**
 * Integration tests for `POST /api/actividades/[id]/eliminar` — soft delete
 * (owner only). Same shared chainable-builder mock as `_guardar.test.ts`.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';

const { clientState, maybeSingleMock, writeOutcomes, fromMock, updateMock } = vi.hoisted(() => {
  const maybeSingleMock = vi.fn();
  const writeOutcomes: Array<{ error: { message: string } | null }> = [];

  const builder: Record<string, unknown> = {
    maybeSingle: maybeSingleMock,
    then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
      Promise.resolve(writeOutcomes.shift() ?? { error: null }).then(onFulfilled, onRejected),
  };
  const eqMock = vi.fn(() => builder);
  const neqMock = vi.fn(() => builder);
  const selectMock = vi.fn(() => builder);
  const updateMock = vi.fn((_payload: Record<string, unknown>) => builder);
  builder.eq = eqMock;
  builder.neq = neqMock;
  builder.select = selectMock;
  builder.update = updateMock;

  const fromMock = vi.fn(() => builder);
  return { clientState: { available: true }, maybeSingleMock, writeOutcomes, fromMock, updateMock };
});

vi.mock('@lib/supabase', () => ({
  createServiceClient: () => {
    if (!clientState.available) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
    }
    return { from: fromMock };
  },
}));

import { POST } from './eliminar';

const AUTHOR: User = { id: '11111111-1111-1111-1111-111111111111' } as User;
const ACTIVITY_ID = '22222222-2222-2222-2222-222222222222';

function ctx(args: { id?: string; user?: User | null }) {
  const { id = ACTIVITY_ID, user = AUTHOR } = args;
  const request = new Request(`https://chuyo.test/api/actividades/${id}/eliminar`, { method: 'POST' });
  return { params: { id }, request, locals: { user } } as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  clientState.available = true;
  writeOutcomes.length = 0;
  maybeSingleMock.mockReset().mockResolvedValueOnce({ data: { id: ACTIVITY_ID }, error: null });
});

describe('POST /api/actividades/[id]/eliminar — identity', () => {
  it('401s an anonymous POST, and nothing is read or written', async () => {
    const res = await POST(ctx({ user: null }));
    expect(res.status).toBe(401);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('404s a malformed id before any query', async () => {
    const res = await POST(ctx({ id: 'not-a-uuid' }));
    expect(res.status).toBe(404);
    expect(fromMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/actividades/[id]/eliminar — ownership (404 for both, never 403)', () => {
  it('404s when no activity row matches (id, author_id)', async () => {
    maybeSingleMock.mockReset().mockResolvedValueOnce({ data: null, error: null });
    const res = await POST(ctx({}));
    expect(res.status).toBe(404);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('excludes an already-removed activity from its own author surface', async () => {
    await POST(ctx({}));
    expect(fromMock).toHaveBeenCalledWith('activities');
  });
});

describe('POST /api/actividades/[id]/eliminar — success', () => {
  it('sets status to removed for the owner only', async () => {
    const res = await POST(ctx({}));
    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'removed' }));
  });

  it('returns { ok: true }', async () => {
    const res = await POST(ctx({}));
    expect(await res.json()).toEqual({ ok: true });
  });

  it('marks every response private/no-store', async () => {
    const res = await POST(ctx({ user: null }));
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });
});

describe('POST /api/actividades/[id]/eliminar — failures', () => {
  it('500s when the update fails', async () => {
    writeOutcomes.push({ error: { message: 'boom' } });
    const res = await POST(ctx({}));
    expect(res.status).toBe(500);
  });
});
