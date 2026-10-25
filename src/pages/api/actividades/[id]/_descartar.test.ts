/**
 * Integration tests for `POST /api/actividades/[id]/descartar` — offer to
 * discard a content-less draft (T4, "offer to discard"). Same shared
 * chainable-builder mock as `_eliminar.test.ts`, extended with
 * `order`/`limit` for the latest-revision fetch (`_guardar.test.ts`'s own
 * pattern), plus an `rpc` mock for the atomic `discard_empty_draft` check-
 * and-flip (migration 0023).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';

const { clientState, maybeSingleMock, writeOutcomes, fromMock, eqMock, updateMock, rpcMock } = vi.hoisted(() => {
  const maybeSingleMock = vi.fn();
  // One affected row by default — the ordinary case where nothing raced the
  // LEGACY fallback discard's final UPDATE. A test simulates the optimistic-
  // concurrency miss by pushing `{ data: [], error: null }` instead.
  const writeOutcomes: Array<{ data?: unknown; error: { message: string } | null }> = [];
  // Default: the RPC succeeds and removes the draft — the ordinary case.
  // A test overrides this to exercise 'changed'/'not_found'/an rpc error.
  // Explicitly typed (rather than inferred from the default alone) so a
  // test's own `mockResolvedValueOnce({ data: null, error: {...} })` —
  // a different, but equally valid, shape of this same union — still
  // type-checks.
  const rpcMock = vi.fn<
    () => Promise<{ data: string | null; error: { message: string; code?: string } | null }>
  >(() => Promise.resolve({ data: 'removed', error: null }));

  const builder: Record<string, unknown> = {
    maybeSingle: maybeSingleMock,
    then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
      Promise.resolve(writeOutcomes.shift() ?? { data: [{ id: 'row' }], error: null }).then(onFulfilled, onRejected),
  };
  const eqMock = vi.fn(() => builder);
  const orderMock = vi.fn(() => builder);
  const limitMock = vi.fn(() => builder);
  const selectMock = vi.fn(() => builder);
  const updateMock = vi.fn((_payload: Record<string, unknown>) => builder);
  builder.eq = eqMock;
  builder.order = orderMock;
  builder.limit = limitMock;
  builder.select = selectMock;
  builder.update = updateMock;

  const fromMock = vi.fn(() => builder);
  return {
    clientState: { available: true },
    maybeSingleMock,
    writeOutcomes,
    fromMock,
    eqMock,
    updateMock,
    rpcMock,
  };
});

vi.mock('@lib/supabase', () => ({
  createServiceClient: () => {
    if (!clientState.available) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
    }
    return { from: fromMock, rpc: rpcMock };
  },
}));

import { POST } from './descartar';

const AUTHOR: User = { id: '11111111-1111-1111-1111-111111111111' } as User;
const ACTIVITY_ID = '22222222-2222-2222-2222-222222222222';
/** The activity's `updated_at` as read in step 1 — the optimistic-concurrency token the final UPDATE filters on. */
const UPDATED_AT = '2026-01-01T00:00:00.000Z';

function ctx(args: { id?: string; user?: User | null }) {
  const { id = ACTIVITY_ID, user = AUTHOR } = args;
  const request = new Request(`https://chuyo.test/api/actividades/${id}/descartar`, { method: 'POST' });
  return { params: { id }, request, locals: { user } } as unknown as Parameters<typeof POST>[0];
}

/** The exact literal shape `ActivityStartIsland.tsx` POSTs for "Une las parejas" — content-less. */
const EMPTY_BLOCKS = [{ id: 'q1', type: 'quiz', template: 'match', payload: { pools: {}, slots: [] } }];

const BLOCKS_WITH_CONTENT = [
  {
    id: 'q1',
    type: 'quiz',
    template: 'match',
    payload: { pools: {}, slots: [{ id: 's1', label: 'cat', input: 'text', answer: ['gato'] }] },
  },
];

const LATEST_REVISION_ID = 'rev-1';

beforeEach(() => {
  vi.clearAllMocks();
  clientState.available = true;
  writeOutcomes.length = 0;
  rpcMock.mockReset().mockResolvedValue({ data: 'removed', error: null });
  maybeSingleMock
    .mockReset()
    // 1st call: the owner+draft activity select (now also reads `updated_at`,
    // the optimistic-concurrency token, kept for the legacy fallback). 2nd
    // call: the latest revision fetch (now also reads `id`, the RPC's own
    // `p_expected_revision`).
    .mockResolvedValueOnce({ data: { id: ACTIVITY_ID, updated_at: UPDATED_AT }, error: null })
    .mockResolvedValueOnce({ data: { id: LATEST_REVISION_ID, blocks: EMPTY_BLOCKS }, error: null });
});

describe('POST /api/actividades/[id]/descartar — identity', () => {
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

describe('POST /api/actividades/[id]/descartar — unavailable', () => {
  it('503s discard_unavailable without a service client', async () => {
    clientState.available = false;
    const res = await POST(ctx({}));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe('discard_unavailable');
  });
});

describe('POST /api/actividades/[id]/descartar — ownership + draft status (404 for every other case)', () => {
  it('404s when no (id, author_id, status=draft) row matches', async () => {
    maybeSingleMock.mockReset().mockResolvedValueOnce({ data: null, error: null });
    const res = await POST(ctx({}));
    expect(res.status).toBe(404);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('filters the select by status=draft — a live/pending/rejected/removed activity can never be discarded this way', async () => {
    await POST(ctx({}));
    expect(eqMock.mock.calls.slice(0, 3)).toEqual([
      ['id', ACTIVITY_ID],
      ['author_id', AUTHOR.id],
      ['status', 'draft'],
    ]);
  });
});

describe('POST /api/actividades/[id]/descartar — content guard', () => {
  it('409s has_content when the latest revision has real content, and never updates or calls the rpc', async () => {
    maybeSingleMock
      .mockReset()
      .mockResolvedValueOnce({ data: { id: ACTIVITY_ID }, error: null })
      .mockResolvedValueOnce({ data: { id: LATEST_REVISION_ID, blocks: BLOCKS_WITH_CONTENT }, error: null });
    const res = await POST(ctx({}));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('has_content');
    expect(updateMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('409s has_content when the latest revision blocks fail to parse, and never updates or calls the rpc', async () => {
    maybeSingleMock
      .mockReset()
      .mockResolvedValueOnce({ data: { id: ACTIVITY_ID }, error: null })
      .mockResolvedValueOnce({ data: { id: LATEST_REVISION_ID, blocks: [{ type: 'nonsense' }] }, error: null });
    const res = await POST(ctx({}));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('has_content');
    expect(updateMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/actividades/[id]/descartar — discard_empty_draft RPC (migration 0023, atomic path)', () => {
  it('calls the rpc with the activity id, author, and the RAW (unparsed) latest revision id/blocks', async () => {
    await POST(ctx({}));
    expect(rpcMock).toHaveBeenCalledWith('discard_empty_draft', {
      p_activity: ACTIVITY_ID,
      p_author: AUTHOR.id,
      p_expected_revision: LATEST_REVISION_ID,
      p_expected_blocks: EMPTY_BLOCKS,
    });
  });

  it("200s ok:true when the rpc returns 'removed', never touching .update directly", async () => {
    rpcMock.mockReset().mockResolvedValueOnce({ data: 'removed', error: null });
    const res = await POST(ctx({}));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("409s concurrent_change when the rpc returns 'changed', never touching .update directly", async () => {
    rpcMock.mockReset().mockResolvedValueOnce({ data: 'changed', error: null });
    const res = await POST(ctx({}));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('concurrent_change');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("404s when the rpc returns 'not_found', never touching .update directly", async () => {
    rpcMock.mockReset().mockResolvedValueOnce({ data: 'not_found', error: null });
    const res = await POST(ctx({}));
    expect(res.status).toBe(404);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('500s discard_failed on an unrecognized rpc return value', async () => {
    rpcMock.mockReset().mockResolvedValueOnce({ data: 'something-else', error: null });
    const res = await POST(ctx({}));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('discard_failed');
  });

  it('500s discard_failed on a plain rpc error (not one of the missing-function codes)', async () => {
    rpcMock.mockReset().mockResolvedValueOnce({ data: null, error: { message: 'boom', code: 'XXYYY' } });
    const res = await POST(ctx({}));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('discard_failed');
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('marks every response private/no-store', async () => {
    const res = await POST(ctx({ user: null }));
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });
});

describe('POST /api/actividades/[id]/descartar — RPC missing (migration 0023 not applied)', () => {
  // The exact PostgREST "no matching function" code; `42883` (Postgres'
  // own undefined-function error) is covered by its own test below.
  beforeEach(() => {
    rpcMock.mockReset().mockResolvedValue({ data: null, error: { message: 'missing', code: 'PGRST202' } });
  });

  it('logs a warning and falls back to the optimistic UPDATE path', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    writeOutcomes.push({ data: [{ id: ACTIVITY_ID }], error: null });
    const res = await POST(ctx({}));
    expect(res.status).toBe(200);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('200s and sets status to removed for a fresh, content-less mold', async () => {
    // Explicit about the affected-rows path: the UPDATE hits exactly the row
    // read in step 1, nothing raced it, so the affected-rows select comes
    // back with that one row.
    writeOutcomes.push({ data: [{ id: ACTIVITY_ID }], error: null });
    const res = await POST(ctx({}));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('updates with exactly { status: removed, updated_at }, filtered by id/author/status=draft/updated_at', async () => {
    writeOutcomes.push({ data: [{ id: ACTIVITY_ID }], error: null });
    await POST(ctx({}));
    expect(updateMock).toHaveBeenCalledWith({ status: 'removed', updated_at: expect.any(String) });
    // The LAST four `.eq()` calls belong to this update chain — the first
    // three (asserted above) belong to the activity select. The trailing
    // `updated_at` filter is the optimistic-concurrency check itself, using
    // the exact value step 1 read.
    expect(eqMock.mock.calls.slice(-4)).toEqual([
      ['id', ACTIVITY_ID],
      ['author_id', AUTHOR.id],
      ['status', 'draft'],
      ['updated_at', UPDATED_AT],
    ]);
  });

  it('409s concurrent_change, private/no-store, when the update affects zero rows', async () => {
    // Simulates a `guardar` that committed a revision and bumped `updated_at`
    // between step 1's read and this UPDATE: the `updated_at` filter misses
    // the row, so the affected-rows select comes back empty.
    writeOutcomes.push({ data: [], error: null });
    const res = await POST(ctx({}));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('concurrent_change');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  it('500s discard_failed when the fallback update fails', async () => {
    writeOutcomes.push({ error: { message: 'boom' } });
    const res = await POST(ctx({}));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('discard_failed');
  });

  it('also falls back on the Postgres "undefined function" code (42883)', async () => {
    rpcMock.mockReset().mockResolvedValue({ data: null, error: { message: 'missing', code: '42883' } });
    writeOutcomes.push({ data: [{ id: ACTIVITY_ID }], error: null });
    const res = await POST(ctx({}));
    expect(res.status).toBe(200);
  });
});

describe('POST /api/actividades/[id]/descartar — failures', () => {
  it('500s discard_failed when the activity select errors', async () => {
    maybeSingleMock.mockReset().mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    const res = await POST(ctx({}));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('discard_failed');
  });

  it('500s discard_failed when the revision select errors', async () => {
    maybeSingleMock
      .mockReset()
      .mockResolvedValueOnce({ data: { id: ACTIVITY_ID, updated_at: UPDATED_AT }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    const res = await POST(ctx({}));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('discard_failed');
  });
});
