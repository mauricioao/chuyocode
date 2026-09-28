/**
 * Data-access tests for src/lib/activities/activities.ts (create + edit-loader).
 *
 * The Supabase service client is mocked so no network happens, mirroring the
 * mock-chain style of `exercises.test.ts`: one shared, chainable builder
 * object backs every `.from(...)` call, `.maybeSingle()` resolves whatever a
 * test queues next, and awaiting the builder directly (no `.maybeSingle()`)
 * resolves to `awaitResult.value` — the shape a plain `.insert(...)` (no
 * `.select()`) is awaited as.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { clientState, maybeSingleMock, awaitResult, neqMock, orderMock, limitMock, insertMock, fromMock } =
  vi.hoisted(() => {
    const maybeSingleMock = vi.fn();
    const awaitResult: { value: unknown } = { value: { error: null } };

    const builder: Record<string, unknown> = {
      maybeSingle: maybeSingleMock,
      then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
        Promise.resolve(awaitResult.value).then(onFulfilled, onRejected),
    };
    const eqMock = vi.fn(() => builder);
    const neqMock = vi.fn(() => builder);
    const orderMock = vi.fn(() => builder);
    const limitMock = vi.fn(() => builder);
    const selectMock = vi.fn(() => builder);
    const insertMock = vi.fn((_payload: Record<string, unknown>) => builder);
    builder.eq = eqMock;
    builder.neq = neqMock;
    builder.order = orderMock;
    builder.limit = limitMock;
    builder.select = selectMock;
    builder.insert = insertMock;

    const fromMock = vi.fn(() => builder);
    return {
      clientState: { available: true },
      maybeSingleMock,
      awaitResult,
      neqMock,
      orderMock,
      limitMock,
      insertMock,
      fromMock,
    };
  });

vi.mock('../supabase', () => ({
  createServiceClient: () => {
    if (!clientState.available) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
    }
    return { from: fromMock };
  },
}));

import { createActivity, getActivityForEdit, clearActivitiesClient } from './activities';
import type { Block } from './blocks';

const AUTHOR_ID = '11111111-1111-1111-1111-111111111111';
const ACTIVITY_ID = '22222222-2222-2222-2222-222222222222';

const SOME_BLOCKS: Block[] = [
  {
    id: 'block-1',
    type: 'worksheet',
    rotation: 0,
    image: {
      path: `activity-uploads/${AUTHOR_ID}/33333333-3333-3333-3333-333333333333.webp`,
      width: 800,
      height: 600,
    },
    zones: [],
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  clientState.available = true;
  awaitResult.value = { error: null };
  clearActivitiesClient();
});

describe('createActivity', () => {
  it('returns null when the service client is unavailable', async () => {
    clientState.available = false;
    const id = await createActivity(AUTHOR_ID, { title: 'Sin título', level: null, blocks: SOME_BLOCKS });
    expect(id).toBeNull();
  });

  it('returns null when authorId is empty', async () => {
    const id = await createActivity('', { title: 'Sin título', level: null, blocks: SOME_BLOCKS });
    expect(id).toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('inserts the activity row, then its first draft revision, and returns the new id', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: { id: ACTIVITY_ID }, error: null });
    awaitResult.value = { error: null };

    const id = await createActivity(AUTHOR_ID, { title: 'Sin título', level: null, blocks: SOME_BLOCKS });

    expect(id).toBe(ACTIVITY_ID);
    expect(insertMock).toHaveBeenNthCalledWith(1, {
      author_id: AUTHOR_ID,
      title: 'Sin título',
      level: null,
    });
    expect(insertMock).toHaveBeenNthCalledWith(2, {
      activity_id: ACTIVITY_ID,
      blocks: SOME_BLOCKS,
      created_by: AUTHOR_ID,
      status: 'draft',
    });
  });

  it('returns null when the activity insert fails', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    const id = await createActivity(AUTHOR_ID, { title: 'Sin título', level: null, blocks: SOME_BLOCKS });
    expect(id).toBeNull();
  });

  it('returns null when the activity insert returns no row', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: null, error: null });
    const id = await createActivity(AUTHOR_ID, { title: 'Sin título', level: null, blocks: SOME_BLOCKS });
    expect(id).toBeNull();
  });

  it('returns null when the revision insert fails, after the activity row was created', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: { id: ACTIVITY_ID }, error: null });
    awaitResult.value = { error: { message: 'revision failed' } };
    const id = await createActivity(AUTHOR_ID, { title: 'Sin título', level: null, blocks: SOME_BLOCKS });
    expect(id).toBeNull();
  });

  it('returns null when the client throws', async () => {
    maybeSingleMock.mockImplementationOnce(() => {
      throw new Error('network down');
    });
    const id = await createActivity(AUTHOR_ID, { title: 'Sin título', level: null, blocks: SOME_BLOCKS });
    expect(id).toBeNull();
  });
});

describe('getActivityForEdit', () => {
  it('returns null when either id or authorId is empty', async () => {
    expect(await getActivityForEdit('', AUTHOR_ID)).toBeNull();
    expect(await getActivityForEdit(ACTIVITY_ID, '')).toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('returns null when the service client is unavailable', async () => {
    clientState.available = false;
    expect(await getActivityForEdit(ACTIVITY_ID, AUTHOR_ID)).toBeNull();
  });

  it('returns null when no activity row matches (id, authorId) — same shape as "not owned"', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: null, error: null });
    expect(await getActivityForEdit(ACTIVITY_ID, AUTHOR_ID)).toBeNull();
  });

  it('excludes a removed activity from its own author edit surface', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: null, error: null });
    await getActivityForEdit(ACTIVITY_ID, AUTHOR_ID);
    expect(neqMock).toHaveBeenCalledWith('status', 'removed');
  });

  it('returns null when the activity fetch errors', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: null, error: { message: 'down' } });
    expect(await getActivityForEdit(ACTIVITY_ID, AUTHOR_ID)).toBeNull();
  });

  it('returns null when no revision exists for an existing activity', async () => {
    maybeSingleMock
      .mockResolvedValueOnce({ data: { id: ACTIVITY_ID, title: 'Sin título', level: null }, error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    expect(await getActivityForEdit(ACTIVITY_ID, AUTHOR_ID)).toBeNull();
  });

  it('returns null when the latest revision has malformed blocks', async () => {
    maybeSingleMock
      .mockResolvedValueOnce({
        data: { id: ACTIVITY_ID, title: 'Sin título', level: null, status: 'draft', review_note: null },
        error: null,
      })
      .mockResolvedValueOnce({ data: { id: 'rev-1', blocks: 'not-an-array', status: 'draft' }, error: null });
    expect(await getActivityForEdit(ACTIVITY_ID, AUTHOR_ID)).toBeNull();
  });

  it('returns the activity + its latest revision blocks on success', async () => {
    maybeSingleMock
      .mockResolvedValueOnce({
        data: { id: ACTIVITY_ID, title: 'Mi actividad', level: 'B1', status: 'draft', review_note: null },
        error: null,
      })
      .mockResolvedValueOnce({ data: { id: 'rev-1', blocks: SOME_BLOCKS, status: 'draft' }, error: null });

    const result = await getActivityForEdit(ACTIVITY_ID, AUTHOR_ID);

    expect(result).toEqual({
      id: ACTIVITY_ID,
      title: 'Mi actividad',
      level: 'B1',
      blocks: SOME_BLOCKS,
      revisionId: 'rev-1',
      revisionStatus: 'draft',
      status: 'draft',
      reviewNote: null,
    });
  });

  it('surfaces the activity status and reviewer note (rejected)', async () => {
    maybeSingleMock
      .mockResolvedValueOnce({
        data: {
          id: ACTIVITY_ID,
          title: 'Mi actividad',
          level: null,
          status: 'rejected',
          review_note: 'Falta una zona en la hoja 2.',
        },
        error: null,
      })
      .mockResolvedValueOnce({ data: { id: 'rev-1', blocks: [], status: 'rejected' }, error: null });

    const result = await getActivityForEdit(ACTIVITY_ID, AUTHOR_ID);
    expect(result?.status).toBe('rejected');
    expect(result?.reviewNote).toBe('Falta una zona en la hoja 2.');
  });

  it('normalizes an out-of-taxonomy level to null', async () => {
    maybeSingleMock
      .mockResolvedValueOnce({
        data: { id: ACTIVITY_ID, title: 'x', level: 'not-a-level', status: 'draft', review_note: null },
        error: null,
      })
      .mockResolvedValueOnce({ data: { id: 'rev-1', blocks: [], status: 'draft' }, error: null });

    const result = await getActivityForEdit(ACTIVITY_ID, AUTHOR_ID);
    expect(result?.level).toBeNull();
  });

  it('orders by created_at desc and limits to 1 so the LATEST revision is read', async () => {
    maybeSingleMock
      .mockResolvedValueOnce({
        data: { id: ACTIVITY_ID, title: 'x', level: null, status: 'draft', review_note: null },
        error: null,
      })
      .mockResolvedValueOnce({ data: { id: 'rev-1', blocks: [], status: 'draft' }, error: null });

    await getActivityForEdit(ACTIVITY_ID, AUTHOR_ID);

    expect(orderMock).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(limitMock).toHaveBeenCalledWith(1);
  });

  it('returns null when the client throws', async () => {
    maybeSingleMock.mockImplementationOnce(() => {
      throw new Error('network down');
    });
    expect(await getActivityForEdit(ACTIVITY_ID, AUTHOR_ID)).toBeNull();
  });
});
