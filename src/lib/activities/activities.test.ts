/**
 * Data-access tests for src/lib/activities/activities.ts (create + edit-loader
 * + the author's own workspace listing).
 *
 * The Supabase service client is mocked so no network happens, mirroring the
 * mock-chain style of `exercises.test.ts`: one shared, chainable builder
 * object backs every `.from(...)` call, `.maybeSingle()` resolves whatever a
 * test queues next, and awaiting the builder directly (no `.maybeSingle()`)
 * resolves to the NEXT queued `awaitResults` entry (shifted off, like
 * `_guardar.test.ts`'s `writeOutcomes`) — the shape a plain `.insert(...)`
 * (no `.select()`) or a plain `.select()...order()` list read is awaited as.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const {
  clientState,
  maybeSingleMock,
  awaitResults,
  eqMock,
  neqMock,
  orderMock,
  limitMock,
  rangeMock,
  inMock,
  containsMock,
  ilikeMock,
  notMock,
  insertMock,
  selectMock,
  fromMock,
} = vi.hoisted(() => {
  const maybeSingleMock = vi.fn();
  const awaitResults: unknown[] = [];

  const builder: Record<string, unknown> = {
    maybeSingle: maybeSingleMock,
    then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
      Promise.resolve(awaitResults.shift() ?? { error: null }).then(onFulfilled, onRejected),
  };
  const eqMock = vi.fn(() => builder);
  const neqMock = vi.fn(() => builder);
  const orderMock = vi.fn(() => builder);
  const limitMock = vi.fn(() => builder);
  const rangeMock = vi.fn(() => builder);
  const inMock = vi.fn(() => builder);
  const containsMock = vi.fn(() => builder);
  const ilikeMock = vi.fn(() => builder);
  const notMock = vi.fn(() => builder);
  const selectMock = vi.fn(() => builder);
  const insertMock = vi.fn((_payload: Record<string, unknown>) => builder);
  builder.eq = eqMock;
  builder.neq = neqMock;
  builder.order = orderMock;
  builder.limit = limitMock;
  builder.range = rangeMock;
  builder.in = inMock;
  builder.contains = containsMock;
  builder.ilike = ilikeMock;
  builder.not = notMock;
  builder.select = selectMock;
  builder.insert = insertMock;

  const fromMock = vi.fn(() => builder);
  return {
    clientState: { available: true },
    maybeSingleMock,
    awaitResults,
    eqMock,
    neqMock,
    orderMock,
    limitMock,
    rangeMock,
    inMock,
    containsMock,
    ilikeMock,
    notMock,
    insertMock,
    selectMock,
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

import {
  createActivity,
  getActivityForEdit,
  getActivitiesByAuthor,
  getPublishedActivities,
  getPublishedActivity,
  ACTIVITIES_PAGE_SIZE,
  clearActivitiesClient,
} from './activities';
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
  awaitResults.length = 0;
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
    awaitResults.push({ error: null });

    const id = await createActivity(AUTHOR_ID, { title: 'Sin título', level: null, blocks: SOME_BLOCKS });

    expect(id).toBe(ACTIVITY_ID);
    expect(insertMock).toHaveBeenNthCalledWith(1, {
      author_id: AUTHOR_ID,
      title: 'Sin título',
      level: null,
      source_activity_id: null,
    });
    expect(insertMock).toHaveBeenNthCalledWith(2, {
      activity_id: ACTIVITY_ID,
      blocks: SOME_BLOCKS,
      created_by: AUTHOR_ID,
      status: 'draft',
    });
  });

  it('records the source activity id when duplicating ("Duplicar y adaptar" D7)', async () => {
    const SOURCE_ID = '99999999-9999-9999-9999-999999999999';
    maybeSingleMock.mockResolvedValueOnce({ data: { id: ACTIVITY_ID }, error: null });
    awaitResults.push({ error: null });

    await createActivity(AUTHOR_ID, {
      title: 'Sin título (copia)',
      level: null,
      blocks: SOME_BLOCKS,
      sourceActivityId: SOURCE_ID,
    });

    expect(insertMock).toHaveBeenNthCalledWith(1, {
      author_id: AUTHOR_ID,
      title: 'Sin título (copia)',
      level: null,
      source_activity_id: SOURCE_ID,
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
    awaitResults.push({ error: { message: 'revision failed' } });
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

  it('reopens a latest revision with an in-progress zone (no answer yet) — creator polish round 3', async () => {
    const worksheetWithEmptyZone: Block[] = [
      {
        id: 'block-1',
        type: 'worksheet',
        rotation: 0,
        image: {
          path: `activity-uploads/${AUTHOR_ID}/33333333-3333-3333-3333-333333333333.webp`,
          width: 800,
          height: 600,
        },
        zones: [{ id: 'z1', x: 0.1, y: 0.1, w: 0.2, h: 0.1, kind: 'text', answers: [] }],
      },
    ];
    maybeSingleMock
      .mockResolvedValueOnce({
        data: { id: ACTIVITY_ID, title: 'Mi actividad', level: 'B1', status: 'draft', review_note: null },
        error: null,
      })
      .mockResolvedValueOnce({ data: { id: 'rev-1', blocks: worksheetWithEmptyZone, status: 'draft' }, error: null });

    const result = await getActivityForEdit(ACTIVITY_ID, AUTHOR_ID);
    expect(result?.blocks).toEqual(worksheetWithEmptyZone);
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
      source: null,
    });
  });

  it('resolves the source activity for the credit line when source_activity_id is set ("Duplicar y adaptar" D7)', async () => {
    const SOURCE_ID = '99999999-9999-9999-9999-999999999999';
    maybeSingleMock
      .mockResolvedValueOnce({
        data: {
          id: ACTIVITY_ID,
          title: 'Copia',
          level: 'B1',
          status: 'draft',
          review_note: null,
          source_activity_id: SOURCE_ID,
        },
        error: null,
      })
      .mockResolvedValueOnce({ data: { id: 'rev-1', blocks: SOME_BLOCKS, status: 'draft' }, error: null })
      .mockResolvedValueOnce({ data: { id: SOURCE_ID, title: 'Original', visible: true }, error: null });

    const result = await getActivityForEdit(ACTIVITY_ID, AUTHOR_ID);
    expect(result?.source).toEqual({ id: SOURCE_ID, title: 'Original', visible: true });
  });

  it('drops the credit line (source: null) when the source lookup fails, without failing the whole read', async () => {
    const SOURCE_ID = '99999999-9999-9999-9999-999999999999';
    maybeSingleMock
      .mockResolvedValueOnce({
        data: {
          id: ACTIVITY_ID,
          title: 'Copia',
          level: 'B1',
          status: 'draft',
          review_note: null,
          source_activity_id: SOURCE_ID,
        },
        error: null,
      })
      .mockResolvedValueOnce({ data: { id: 'rev-1', blocks: SOME_BLOCKS, status: 'draft' }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'down' } });

    const result = await getActivityForEdit(ACTIVITY_ID, AUTHOR_ID);
    expect(result?.source).toBeNull();
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

const LIVE_ID = '66666666-6666-6666-6666-666666666666';
const DRAFT_ID = '77777777-7777-7777-7777-777777777777';

describe('getActivitiesByAuthor', () => {
  it('returns [] and never queries when authorId is empty', async () => {
    expect(await getActivitiesByAuthor('')).toEqual([]);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('returns [] when the service client is unavailable', async () => {
    clientState.available = false;
    expect(await getActivitiesByAuthor(AUTHOR_ID)).toEqual([]);
  });

  it('returns [] when the fetch errors', async () => {
    awaitResults.push({ data: null, error: { message: 'down' } });
    expect(await getActivitiesByAuthor(AUTHOR_ID)).toEqual([]);
  });

  it('returns [] when the data is not an array', async () => {
    awaitResults.push({ data: null, error: null });
    expect(await getActivitiesByAuthor(AUTHOR_ID)).toEqual([]);
  });

  it('excludes removed activities from the query', async () => {
    awaitResults.push({ data: [], error: null });
    await getActivitiesByAuthor(AUTHOR_ID);
    expect(neqMock).toHaveBeenCalledWith('status', 'removed');
  });

  it('orders by updated_at desc, id asc (total order)', async () => {
    awaitResults.push({ data: [], error: null });
    await getActivitiesByAuthor(AUTHOR_ID);
    expect(orderMock).toHaveBeenNthCalledWith(1, 'updated_at', { ascending: false });
    expect(orderMock).toHaveBeenNthCalledWith(2, 'id', { ascending: true });
  });

  it('skips a malformed row (missing id) and keeps the rest', async () => {
    awaitResults.push({
      data: [
        { id: '', title: 'broken', status: 'draft', level: null, review_note: null, block_count: 0, updated_at: null },
        { id: DRAFT_ID, title: 'Buena', status: 'draft', level: null, review_note: null, block_count: 2, updated_at: '2026-01-01T00:00:00Z' },
      ],
      error: null,
    });
    const result = await getActivitiesByAuthor(AUTHOR_ID);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(DRAFT_ID);
  });

  it('normalizes an out-of-taxonomy level to null', async () => {
    awaitResults.push({
      data: [{ id: DRAFT_ID, title: 'x', status: 'draft', level: 'not-a-level', review_note: null, block_count: 0, updated_at: null }],
      error: null,
    });
    const result = await getActivitiesByAuthor(AUTHOR_ID);
    expect(result[0].level).toBeNull();
  });

  it('never queries the pending-revision check when nothing is live', async () => {
    awaitResults.push({
      data: [{ id: DRAFT_ID, title: 'x', status: 'draft', level: null, review_note: null, block_count: 1, updated_at: null }],
      error: null,
    });
    const result = await getActivitiesByAuthor(AUTHOR_ID);
    expect(result[0].hasPendingRevision).toBe(false);
    expect(inMock).not.toHaveBeenCalled();
  });

  it('flags hasPendingRevision only for a live activity with a fresh pending_review revision', async () => {
    awaitResults.push({
      data: [
        { id: LIVE_ID, title: 'Publicada con cambios', status: 'live', level: 'B1', review_note: null, block_count: 3, updated_at: null },
        { id: DRAFT_ID, title: 'Borrador', status: 'draft', level: null, review_note: null, block_count: 1, updated_at: null },
      ],
      error: null,
    });
    awaitResults.push({ data: [{ activity_id: LIVE_ID }], error: null });

    const result = await getActivitiesByAuthor(AUTHOR_ID);
    expect(inMock).toHaveBeenCalledWith('activity_id', [LIVE_ID]);
    const live = result.find((r) => r.id === LIVE_ID);
    const draft = result.find((r) => r.id === DRAFT_ID);
    expect(live?.hasPendingRevision).toBe(true);
    expect(draft?.hasPendingRevision).toBe(false);
  });

  it('does not flag a live activity with no pending revision', async () => {
    awaitResults.push({
      data: [{ id: LIVE_ID, title: 'Publicada', status: 'live', level: null, review_note: null, block_count: 3, updated_at: null }],
      error: null,
    });
    awaitResults.push({ data: [], error: null });

    const result = await getActivitiesByAuthor(AUTHOR_ID);
    expect(result[0].hasPendingRevision).toBe(false);
  });

  it('falls back to unflagged rows when the pending-revision check itself errors', async () => {
    awaitResults.push({
      data: [{ id: LIVE_ID, title: 'Publicada', status: 'live', level: null, review_note: null, block_count: 3, updated_at: null }],
      error: null,
    });
    awaitResults.push({ data: null, error: { message: 'down' } });

    const result = await getActivitiesByAuthor(AUTHOR_ID);
    expect(result).toHaveLength(1);
    expect(result[0].hasPendingRevision).toBe(false);
  });

  it('surfaces the rejection reviewNote', async () => {
    awaitResults.push({
      data: [
        {
          id: DRAFT_ID,
          title: 'Rechazada',
          status: 'rejected',
          level: null,
          review_note: 'Falta una zona.',
          block_count: 1,
          updated_at: null,
        },
      ],
      error: null,
    });
    const result = await getActivitiesByAuthor(AUTHOR_ID);
    expect(result[0].reviewNote).toBe('Falta una zona.');
  });

  it('returns [] when the query throws', async () => {
    fromMock.mockImplementationOnce(() => {
      throw new Error('network down');
    });
    expect(await getActivitiesByAuthor(AUTHOR_ID)).toEqual([]);
  });
});

const PUBLISHED_REVISION_ID = '88888888-8888-8888-8888-888888888888';
const OTHER_REVISION_ID = '99999999-9999-9999-9999-999999999999';

const THUMBNAIL_IMAGE_PATH =
  'activity-images/11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222.webp';

function worksheetForThumbnail(path: string) {
  return {
    id: 'w1',
    type: 'worksheet',
    rotation: 0,
    image: { path, width: 800, height: 600 },
    zones: [],
  };
}

describe('getPublishedActivities', () => {
  it('returns an empty page when the service client is unavailable', async () => {
    clientState.available = false;
    expect(await getPublishedActivities({ level: null, page: 1 })).toEqual({ activities: [], total: 0 });
  });

  it('returns an empty page when the fetch errors', async () => {
    awaitResults.push({ data: null, error: { message: 'down' }, count: null });
    expect(await getPublishedActivities({ level: null, page: 1 })).toEqual({ activities: [], total: 0 });
  });

  it('only reads visible activities', async () => {
    awaitResults.push({ data: [], error: null, count: 0 });
    await getPublishedActivities({ level: null, page: 1 });
    expect(selectMock).toHaveBeenCalledWith(
      'id, title, level, block_count, published_at, published_revision_id, heart_count, view_total',
      { count: 'exact' },
    );
  });

  it('always filters on visible=true, and does not filter by level when none is given', async () => {
    awaitResults.push({ data: [], error: null, count: 0 });
    await getPublishedActivities({ level: null, page: 1 });
    expect(eqMock).toHaveBeenCalledWith('visible', true);
    expect(eqMock).not.toHaveBeenCalledWith('level', expect.anything());
  });

  it('filters by level when one is given', async () => {
    awaitResults.push({ data: [], error: null, count: 0 });
    await getPublishedActivities({ level: 'B1', page: 1 });
    expect(eqMock).toHaveBeenCalledWith('level', 'B1');
  });

  it('ranges the first page from 0..PAGE_SIZE-1', async () => {
    awaitResults.push({ data: [], error: null, count: 0 });
    await getPublishedActivities({ level: null, page: 1 });
    expect(rangeMock).toHaveBeenCalledWith(0, ACTIVITIES_PAGE_SIZE - 1);
  });

  it('ranges page 2 from PAGE_SIZE..2*PAGE_SIZE-1', async () => {
    awaitResults.push({ data: [], error: null, count: 0 });
    await getPublishedActivities({ level: null, page: 2 });
    expect(rangeMock).toHaveBeenCalledWith(ACTIVITIES_PAGE_SIZE, 2 * ACTIVITIES_PAGE_SIZE - 1);
  });

  it('treats a non-positive page as page 1', async () => {
    awaitResults.push({ data: [], error: null, count: 0 });
    await getPublishedActivities({ level: null, page: -3 });
    expect(rangeMock).toHaveBeenCalledWith(0, ACTIVITIES_PAGE_SIZE - 1);
  });

  it('filters by tipo via contains on block_types', async () => {
    awaitResults.push({ data: [], error: null, count: 0 });
    await getPublishedActivities({ level: null, page: 1, tipo: 'worksheet' });
    expect(containsMock).toHaveBeenCalledWith('block_types', ['worksheet']);
  });

  it('does not filter by tipo when none is given', async () => {
    awaitResults.push({ data: [], error: null, count: 0 });
    await getPublishedActivities({ level: null, page: 1 });
    expect(containsMock).not.toHaveBeenCalled();
  });

  it('searches by title_search via ilike with a lowercased, escaped, wrapped pattern', async () => {
    awaitResults.push({ data: [], error: null, count: 0 });
    await getPublishedActivities({ level: null, page: 1, q: '50%_OFF' });
    expect(ilikeMock).toHaveBeenCalledWith('title_search', '%50\\%\\_off%');
  });

  it('folds accents in the search query, matching the title_search generated column', async () => {
    awaitResults.push({ data: [], error: null, count: 0 });
    await getPublishedActivities({ level: null, page: 1, q: 'Canción' });
    expect(ilikeMock).toHaveBeenCalledWith('title_search', '%cancion%');
  });

  it('ignores a blank q', async () => {
    awaitResults.push({ data: [], error: null, count: 0 });
    await getPublishedActivities({ level: null, page: 1, q: '   ' });
    expect(ilikeMock).not.toHaveBeenCalled();
  });

  it('sorts by published_at desc by default (recientes)', async () => {
    awaitResults.push({ data: [], error: null, count: 0 });
    await getPublishedActivities({ level: null, page: 1 });
    expect(orderMock).toHaveBeenCalledWith('published_at', { ascending: false });
    expect(orderMock).not.toHaveBeenCalledWith('heart_count', expect.anything());
    expect(orderMock).not.toHaveBeenCalledWith('view_total', expect.anything());
  });

  it('sorts by heart_count desc, then published_at desc, for orden=gustadas', async () => {
    awaitResults.push({ data: [], error: null, count: 0 });
    await getPublishedActivities({ level: null, page: 1, orden: 'gustadas' });
    expect(orderMock).toHaveBeenCalledWith('heart_count', { ascending: false });
    expect(orderMock).toHaveBeenCalledWith('published_at', { ascending: false });
  });

  it('sorts by view_total desc, then published_at desc, for orden=vistas', async () => {
    awaitResults.push({ data: [], error: null, count: 0 });
    await getPublishedActivities({ level: null, page: 1, orden: 'vistas' });
    expect(orderMock).toHaveBeenCalledWith('view_total', { ascending: false });
    expect(orderMock).toHaveBeenCalledWith('published_at', { ascending: false });
  });

  it('excludes already-viewed activities in SQL when novistas is set', async () => {
    awaitResults.push({ data: [{ activity_id: 'seen-1' }, { activity_id: 'seen-2' }], error: null });
    awaitResults.push({ data: [], error: null, count: 0 });
    await getPublishedActivities({ level: null, page: 1, novistas: true, viewerId: 'viewer-1' });
    expect(notMock).toHaveBeenCalledWith('id', 'in', '(seen-1,seen-2)');
  });

  it('is a no-op when novistas is set without a viewerId (an anonymous read)', async () => {
    awaitResults.push({ data: [], error: null, count: 0 });
    await getPublishedActivities({ level: null, page: 1, novistas: true });
    expect(notMock).not.toHaveBeenCalled();
  });

  it('applies no exclusion when the caller has viewed nothing yet', async () => {
    awaitResults.push({ data: [], error: null });
    awaitResults.push({ data: [], error: null, count: 0 });
    await getPublishedActivities({ level: null, page: 1, novistas: true, viewerId: 'viewer-1' });
    expect(notMock).not.toHaveBeenCalled();
  });

  it('degrades to no exclusion when the novistas lookup itself fails', async () => {
    awaitResults.push({ data: null, error: { message: 'down' } });
    awaitResults.push({ data: [], error: null, count: 0 });
    const result = await getPublishedActivities({ level: null, page: 1, novistas: true, viewerId: 'viewer-1' });
    expect(notMock).not.toHaveBeenCalled();
    expect(result).toEqual({ activities: [], total: 0 });
  });

  it('maps heart_count and view_total onto each card, defaulting to 0 when missing', async () => {
    awaitResults.push({
      data: [
        {
          id: 'a1',
          title: 'x',
          level: null,
          block_count: 1,
          published_at: null,
          published_revision_id: PUBLISHED_REVISION_ID,
          heart_count: 9,
          view_total: 33,
        },
      ],
      error: null,
      count: 1,
    });
    awaitResults.push({ data: [], error: null });
    const result = await getPublishedActivities({ level: null, page: 1 });
    expect(result.activities[0].heartCount).toBe(9);
    expect(result.activities[0].viewTotal).toBe(33);
  });

  it('marks viewedByViewer for activities the caller has already opened', async () => {
    awaitResults.push({
      data: [
        { id: 'a1', title: 'x', level: null, block_count: 1, published_at: null, published_revision_id: PUBLISHED_REVISION_ID },
        { id: 'a2', title: 'y', level: null, block_count: 1, published_at: null, published_revision_id: OTHER_REVISION_ID },
      ],
      error: null,
      count: 2,
    });
    awaitResults.push({ data: [{ activity_id: 'a1' }], error: null });
    awaitResults.push({ data: [], error: null });
    const result = await getPublishedActivities({ level: null, page: 1, viewerId: 'viewer-1' });
    expect(result.activities.find((a) => a.id === 'a1')?.viewedByViewer).toBe(true);
    expect(result.activities.find((a) => a.id === 'a2')?.viewedByViewer).toBe(false);
  });

  it('defaults viewedByViewer to false without a viewerId, and skips the lookup entirely', async () => {
    awaitResults.push({
      data: [{ id: 'a1', title: 'x', level: null, block_count: 1, published_at: null, published_revision_id: PUBLISHED_REVISION_ID }],
      error: null,
      count: 1,
    });
    awaitResults.push({ data: [], error: null });
    const result = await getPublishedActivities({ level: null, page: 1 });
    expect(result.activities[0].viewedByViewer).toBe(false);
  });

  it('degrades to no badges when the per-page viewed-lookup fails', async () => {
    awaitResults.push({
      data: [{ id: 'a1', title: 'x', level: null, block_count: 1, published_at: null, published_revision_id: PUBLISHED_REVISION_ID }],
      error: null,
      count: 1,
    });
    awaitResults.push({ data: null, error: { message: 'down' } });
    awaitResults.push({ data: [], error: null });
    const result = await getPublishedActivities({ level: null, page: 1, viewerId: 'viewer-1' });
    expect(result.activities[0].viewedByViewer).toBe(false);
  });

  it('skips a malformed row (missing published_revision_id) and keeps the rest', async () => {
    awaitResults.push({
      data: [
        { id: 'a1', title: 'Sin revisión', level: null, block_count: 1, published_at: null, published_revision_id: null },
        { id: 'a2', title: 'Buena', level: null, block_count: 1, published_at: null, published_revision_id: PUBLISHED_REVISION_ID },
      ],
      error: null,
      count: 2,
    });
    awaitResults.push({ data: [], error: null });
    const result = await getPublishedActivities({ level: null, page: 1 });
    expect(result.activities).toHaveLength(1);
    expect(result.activities[0].id).toBe('a2');
    expect(result.total).toBe(2);
  });

  it('normalizes an out-of-taxonomy level to null', async () => {
    awaitResults.push({
      data: [{ id: 'a1', title: 'x', level: 'zz', block_count: 0, published_at: null, published_revision_id: PUBLISHED_REVISION_ID }],
      error: null,
      count: 1,
    });
    awaitResults.push({ data: [], error: null });
    const result = await getPublishedActivities({ level: null, page: 1 });
    expect(result.activities[0].level).toBeNull();
  });

  it('never queries revisions when the page is empty', async () => {
    awaitResults.push({ data: [], error: null, count: 0 });
    await getPublishedActivities({ level: null, page: 1 });
    expect(inMock).not.toHaveBeenCalled();
  });

  it('resolves the thumbnail from the first worksheet block of the published revision', async () => {
    awaitResults.push({
      data: [{ id: 'a1', title: 'Con hoja', level: null, block_count: 1, published_at: null, published_revision_id: PUBLISHED_REVISION_ID }],
      error: null,
      count: 1,
    });
    awaitResults.push({
      data: [{ id: PUBLISHED_REVISION_ID, blocks: [worksheetForThumbnail(THUMBNAIL_IMAGE_PATH)] }],
      error: null,
    });

    const result = await getPublishedActivities({ level: null, page: 1 });
    expect(inMock).toHaveBeenCalledWith('id', [PUBLISHED_REVISION_ID]);
    expect(result.activities[0].thumbnailPath).toBe(THUMBNAIL_IMAGE_PATH);
  });

  it('leaves thumbnailPath null when the published revision has no worksheet block', async () => {
    awaitResults.push({
      data: [{ id: 'a1', title: 'Sin hoja', level: null, block_count: 1, published_at: null, published_revision_id: PUBLISHED_REVISION_ID }],
      error: null,
      count: 1,
    });
    awaitResults.push({
      data: [{ id: PUBLISHED_REVISION_ID, blocks: [] }],
      error: null,
    });

    const result = await getPublishedActivities({ level: null, page: 1 });
    expect(result.activities[0].thumbnailPath).toBeNull();
  });

  it('matches each activity to its OWN revision, not a different one on the same page', async () => {
    awaitResults.push({
      data: [
        { id: 'a1', title: 'Uno', level: null, block_count: 1, published_at: null, published_revision_id: PUBLISHED_REVISION_ID },
        { id: 'a2', title: 'Dos', level: null, block_count: 1, published_at: null, published_revision_id: OTHER_REVISION_ID },
      ],
      error: null,
      count: 2,
    });
    awaitResults.push({
      data: [
        { id: PUBLISHED_REVISION_ID, blocks: [worksheetForThumbnail(THUMBNAIL_IMAGE_PATH)] },
        { id: OTHER_REVISION_ID, blocks: [] },
      ],
      error: null,
    });

    const result = await getPublishedActivities({ level: null, page: 1 });
    expect(result.activities.find((a) => a.id === 'a1')?.thumbnailPath).toBe(THUMBNAIL_IMAGE_PATH);
    expect(result.activities.find((a) => a.id === 'a2')?.thumbnailPath).toBeNull();
  });

  it('degrades to unthumbnailed rows when the revisions read itself fails', async () => {
    awaitResults.push({
      data: [{ id: 'a1', title: 'x', level: null, block_count: 1, published_at: null, published_revision_id: PUBLISHED_REVISION_ID }],
      error: null,
      count: 1,
    });
    awaitResults.push({ data: null, error: { message: 'down' } });

    const result = await getPublishedActivities({ level: null, page: 1 });
    expect(result.activities).toHaveLength(1);
    expect(result.activities[0].thumbnailPath).toBeNull();
  });

  it('returns an empty page when the query throws', async () => {
    fromMock.mockImplementationOnce(() => {
      throw new Error('network down');
    });
    expect(await getPublishedActivities({ level: null, page: 1 })).toEqual({ activities: [], total: 0 });
  });
});

describe('getPublishedActivity', () => {
  it('returns null when id is empty', async () => {
    expect(await getPublishedActivity('')).toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('returns null when the service client is unavailable', async () => {
    clientState.available = false;
    expect(await getPublishedActivity(ACTIVITY_ID)).toBeNull();
  });

  it('returns null when the fetch errors', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: null, error: { message: 'down' } });
    expect(await getPublishedActivity(ACTIVITY_ID)).toBeNull();
  });

  it('returns null when no visible activity matches (does not exist, or not live)', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: null, error: null });
    expect(await getPublishedActivity(ACTIVITY_ID)).toBeNull();
  });

  it('filters on visible = true, not on ownership', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: null, error: null });
    await getPublishedActivity(ACTIVITY_ID);
    expect(eqMock).toHaveBeenCalledWith('visible', true);
    expect(eqMock).not.toHaveBeenCalledWith('author_id', expect.anything());
  });

  it('embeds through the named FK (activities_published_revision_id_fkey)', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: null, error: null });
    await getPublishedActivity(ACTIVITY_ID);
    expect(selectMock).toHaveBeenCalledWith(
      'id, title, level, author_id, heart_count, view_total, source_activity_id, activity_revisions!activities_published_revision_id_fkey(blocks)',
    );
  });

  it('returns null when the embedded revision is malformed blocks', async () => {
    maybeSingleMock.mockResolvedValueOnce({
      data: { id: ACTIVITY_ID, title: 'x', level: null, author_id: AUTHOR_ID, activity_revisions: { blocks: 'not-an-array' } },
      error: null,
    });
    expect(await getPublishedActivity(ACTIVITY_ID)).toBeNull();
  });

  it('returns null when there is no embedded revision at all', async () => {
    maybeSingleMock.mockResolvedValueOnce({
      data: { id: ACTIVITY_ID, title: 'x', level: null, author_id: AUTHOR_ID, activity_revisions: null },
      error: null,
    });
    expect(await getPublishedActivity(ACTIVITY_ID)).toBeNull();
  });

  it('returns null when author_id is missing (a boundary read, checked not assumed)', async () => {
    maybeSingleMock.mockResolvedValueOnce({
      data: { id: ACTIVITY_ID, title: 'x', level: null, activity_revisions: { blocks: SOME_BLOCKS } },
      error: null,
    });
    expect(await getPublishedActivity(ACTIVITY_ID)).toBeNull();
  });

  it('returns the activity + published blocks on success (object-shaped embed)', async () => {
    maybeSingleMock.mockResolvedValueOnce({
      data: {
        id: ACTIVITY_ID,
        title: 'Mi actividad',
        level: 'B1',
        author_id: AUTHOR_ID,
        heart_count: 5,
        view_total: 42,
        activity_revisions: { blocks: SOME_BLOCKS },
      },
      error: null,
    });
    const result = await getPublishedActivity(ACTIVITY_ID);
    expect(result).toEqual({
      id: ACTIVITY_ID,
      title: 'Mi actividad',
      level: 'B1',
      blocks: SOME_BLOCKS,
      authorId: AUTHOR_ID,
      heartCount: 5,
      viewTotal: 42,
      source: null,
    });
  });

  it('resolves the source activity for the published credit line when source_activity_id is set ("Duplicar y adaptar" D7)', async () => {
    const SOURCE_ID = '99999999-9999-9999-9999-999999999999';
    maybeSingleMock
      .mockResolvedValueOnce({
        data: {
          id: ACTIVITY_ID,
          title: 'Copia',
          level: 'B1',
          author_id: AUTHOR_ID,
          activity_revisions: { blocks: SOME_BLOCKS },
          source_activity_id: SOURCE_ID,
        },
        error: null,
      })
      .mockResolvedValueOnce({ data: { id: SOURCE_ID, title: 'Original', visible: false }, error: null });

    const result = await getPublishedActivity(ACTIVITY_ID);
    expect(result?.source).toEqual({ id: SOURCE_ID, title: 'Original', visible: false });
  });

  it('defaults heartCount and viewTotal to 0 when missing from the row', async () => {
    maybeSingleMock.mockResolvedValueOnce({
      data: { id: ACTIVITY_ID, title: 'x', level: null, author_id: AUTHOR_ID, activity_revisions: { blocks: [] } },
      error: null,
    });
    const result = await getPublishedActivity(ACTIVITY_ID);
    expect(result?.heartCount).toBe(0);
    expect(result?.viewTotal).toBe(0);
  });

  it('tolerates an array-shaped embed defensively', async () => {
    maybeSingleMock.mockResolvedValueOnce({
      data: { id: ACTIVITY_ID, title: 'Mi actividad', level: null, author_id: AUTHOR_ID, activity_revisions: [{ blocks: SOME_BLOCKS }] },
      error: null,
    });
    const result = await getPublishedActivity(ACTIVITY_ID);
    expect(result?.blocks).toEqual(SOME_BLOCKS);
  });

  it('normalizes an out-of-taxonomy level to null', async () => {
    maybeSingleMock.mockResolvedValueOnce({
      data: { id: ACTIVITY_ID, title: 'x', level: 'zz', author_id: AUTHOR_ID, activity_revisions: { blocks: [] } },
      error: null,
    });
    const result = await getPublishedActivity(ACTIVITY_ID);
    expect(result?.level).toBeNull();
  });

  it('returns null when the client throws', async () => {
    maybeSingleMock.mockImplementationOnce(() => {
      throw new Error('network down');
    });
    expect(await getPublishedActivity(ACTIVITY_ID)).toBeNull();
  });
});
