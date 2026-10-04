/**
 * Tests for `src/lib/activities/moderation.ts` (PR E, "Moderation").
 *
 * Each table gets its own FIFO queue of "builders" (`push(table, result)`),
 * consumed in the exact order the module under test calls `.from(table)` —
 * mirrors `activities.test.ts`'s shared-builder style, but keyed per table
 * since these functions read from several tables in one call.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

function makeBuilder(result: unknown) {
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    neq: () => builder,
    in: () => builder,
    not: () => builder,
    order: () => builder,
    limit: () => builder,
    update: () => builder,
    maybeSingle: () => Promise.resolve(result),
    then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(onFulfilled, onRejected),
  };
  return builder;
}

const { state } = vi.hoisted(() => ({
  state: {
    available: true,
    queues: {} as Record<string, unknown[]>,
    rpcResult: { data: null as unknown, error: null as unknown },
    rpcCalls: [] as Array<{ fn: string; args: unknown }>,
    getUserById: vi.fn(async (id: string) => ({ data: { user: { id, email: `${id}@example.com` } }, error: null })),
  },
}));

function push(table: string, result: unknown) {
  (state.queues[table] ??= []).push(makeBuilder(result));
}

vi.mock('../supabase', () => ({
  createServiceClient: () => {
    if (!state.available) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
    return {
      from: (table: string) => {
        const q = state.queues[table];
        if (!q || q.length === 0) throw new Error(`no queued result for table ${table}`);
        return q.shift();
      },
      rpc: async (fn: string, args: unknown) => {
        state.rpcCalls.push({ fn, args });
        return state.rpcResult;
      },
      auth: { admin: { getUserById: state.getUserById } },
    };
  },
}));

import {
  getReviewQueue,
  getPendingModerationCount,
  approveRevision,
  rejectRevision,
  restoreActivity,
  removeActivity,
  recordReport,
  clearModerationClient,
} from './moderation';
import type { Block } from './blocks';
import { UPLOADS_BUCKET } from './paths';

const AUTHOR = 'a1a1a1a1-0000-4000-8000-000000000001';
const OTHER_USER = 'b2b2b2b2-0000-4000-8000-000000000002';
const REVIEWER = 'c3c3c3c3-0000-4000-8000-000000000003';
const ACTIVITY = 'd4d4d4d4-0000-4000-8000-000000000004';
const REVISION = 'e5e5e5e5-0000-4000-8000-000000000005';
const IMAGE_ID = 'f6f6f6f6-0000-4000-8000-000000000006';

function worksheetBlocks(imagePath: string): Block[] {
  return [
    {
      id: 'b1',
      type: 'worksheet',
      rotation: 0,
      image: { path: imagePath, width: 800, height: 600 },
      zones: [{ id: 'z1', x: 0.1, y: 0.1, w: 0.2, h: 0.1, kind: 'text', answers: ['hola'] }],
    },
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  state.available = true;
  state.queues = {};
  state.rpcResult = { data: null, error: null };
  state.rpcCalls = [];
  clearModerationClient();
});

describe('getReviewQueue', () => {
  it('returns empty lists when the service-role key is unconfigured', async () => {
    state.available = false;
    expect(await getReviewQueue()).toEqual({ pending: [], reported: [] });
  });

  it('builds a first-publication pending item with no published sibling', async () => {
    push('activity_revisions', {
      data: [{ id: REVISION, activity_id: ACTIVITY, blocks: worksheetBlocks(`${UPLOADS_BUCKET}/${AUTHOR}/${IMAGE_ID}.webp`), created_by: AUTHOR, rights_accepted_at: '2026-01-01T00:00:00Z' }],
      error: null,
    });
    push('activities', { data: [{ id: ACTIVITY, title: 'Mi actividad', author_id: AUTHOR, published_revision_id: null }], error: null });
    // reported-activities query (runs in parallel)
    push('activities', { data: [], error: null });

    const queue = await getReviewQueue();
    expect(queue.pending).toHaveLength(1);
    expect(queue.pending[0]).toMatchObject({
      revisionId: REVISION,
      activityId: ACTIVITY,
      activityTitle: 'Mi actividad',
      isEdit: false,
      publishedBlocks: null,
    });
    expect(queue.pending[0].author.email).toBe(`${AUTHOR}@example.com`);
    expect(queue.reported).toEqual([]);
  });

  it('flags an edit of a live activity and attaches the published revision blocks', async () => {
    const publishedRevisionId = 'aaaaaaaa-0000-4000-8000-000000000009';
    push('activity_revisions', {
      data: [{ id: REVISION, activity_id: ACTIVITY, blocks: worksheetBlocks(`${UPLOADS_BUCKET}/${AUTHOR}/${IMAGE_ID}.webp`), created_by: AUTHOR, rights_accepted_at: null }],
      error: null,
    });
    push('activities', { data: [{ id: ACTIVITY, title: 'Editada', author_id: AUTHOR, published_revision_id: publishedRevisionId }], error: null });
    push('activity_revisions', { data: [{ id: publishedRevisionId, blocks: worksheetBlocks(`activity-images/${ACTIVITY}/${IMAGE_ID}.webp`) }], error: null });
    push('activities', { data: [], error: null });

    const queue = await getReviewQueue();
    expect(queue.pending[0].isEdit).toBe(true);
    expect(queue.pending[0].publishedBlocks).not.toBeNull();
  });

  it('lists activities hidden by reports, with their reports attached', async () => {
    push('activity_revisions', { data: [], error: null });
    push('activities', { data: [{ id: ACTIVITY, title: 'Reportada', author_id: AUTHOR }], error: null });
    push('activity_reports', {
      data: [{ id: 'r1', activity_id: ACTIVITY, reporter_id: OTHER_USER, reason: 'inappropriate', details: null, created_at: '2026-01-02T00:00:00Z' }],
      error: null,
    });

    const queue = await getReviewQueue();
    expect(queue.reported).toHaveLength(1);
    expect(queue.reported[0].reports).toHaveLength(1);
    expect(queue.reported[0].reports[0].reason).toBe('inappropriate');
  });

  it('includes a reported activity whose author was deleted (NULL author_id, 0020 account deletion transfer), showing "ChuyoCode" without a user lookup', async () => {
    push('activity_revisions', { data: [], error: null });
    push('activities', { data: [{ id: ACTIVITY, title: 'Transferida', author_id: null }], error: null });
    push('activity_reports', {
      data: [{ id: 'r1', activity_id: ACTIVITY, reporter_id: OTHER_USER, reason: 'inappropriate', details: null, created_at: '2026-01-02T00:00:00Z' }],
      error: null,
    });

    const queue = await getReviewQueue();
    expect(queue.reported).toHaveLength(1);
    expect(queue.reported[0].activityTitle).toBe('Transferida');
    expect(queue.reported[0].author).toEqual({ id: 'ChuyoCode', email: null });
    expect(state.getUserById).not.toHaveBeenCalled();
  });

  it("does not key the pending-revisions queue off the activity's own author_id (defensive: loadPendingRevisions reads only the revision's created_by)", async () => {
    // Not a reachable production combination — 0020 deletes a transferred
    // activity's own in-flight draft/pending/rejected revisions, and nobody
    // can submit a NEW one once `author_id` is null (`getActivityForEdit`
    // matches on `author_id = caller`, which no real id ever is). This only
    // locks in that `loadPendingRevisions` never grows the same bug
    // `loadReportedActivities` just had, by never requiring the ACTIVITY's
    // own author_id to be a string (only the revision's `created_by`).
    push('activity_revisions', {
      data: [{ id: REVISION, activity_id: ACTIVITY, blocks: worksheetBlocks(`${UPLOADS_BUCKET}/${AUTHOR}/${IMAGE_ID}.webp`), created_by: AUTHOR, rights_accepted_at: null }],
      error: null,
    });
    push('activities', { data: [{ id: ACTIVITY, title: 'Transferida', author_id: null, published_revision_id: null }], error: null });
    push('activities', { data: [], error: null });

    const queue = await getReviewQueue();
    expect(queue.pending).toHaveLength(1);
    expect(queue.pending[0].activityTitle).toBe('Transferida');
  });
});

describe('getPendingModerationCount', () => {
  it('returns 0 when the service-role key is unconfigured', async () => {
    state.available = false;
    expect(await getPendingModerationCount()).toBe(0);
  });

  it('sums pending revisions and reported activities counts', async () => {
    push('activity_revisions', { data: null, error: null, count: 3 });
    push('activities', { data: null, error: null, count: 2 });
    expect(await getPendingModerationCount()).toBe(5);
  });

  it('fails closed to 0 when either count query errors', async () => {
    push('activity_revisions', { data: null, error: { message: 'down' } });
    push('activities', { data: null, error: null, count: 2 });
    expect(await getPendingModerationCount()).toBe(0);
  });
});

describe('approveRevision', () => {
  it('returns not_found for a missing revision', async () => {
    push('activity_revisions', { data: null, error: null });
    const result = await approveRevision(REVISION, REVIEWER);
    expect(result).toEqual({ ok: false, error: 'not_found' });
  });

  it('returns not_pending when the revision is not pending_review', async () => {
    push('activity_revisions', { data: { id: REVISION, activity_id: ACTIVITY, status: 'draft', created_by: AUTHOR, blocks: [] }, error: null });
    const result = await approveRevision(REVISION, REVIEWER);
    expect(result).toEqual({ ok: false, error: 'not_pending' });
  });

  it('returns invalid_blocks when the stored blocks fail strict validation', async () => {
    push('activity_revisions', {
      data: { id: REVISION, activity_id: ACTIVITY, status: 'pending_review', created_by: AUTHOR, blocks: [{ id: 'b1', type: 'worksheet' }] },
      error: null,
    });
    const result = await approveRevision(REVISION, REVIEWER);
    expect(result).toEqual({ ok: false, error: 'invalid_blocks' });
  });

  it("refuses a worksheet image referencing another user's uploads folder", async () => {
    push('activity_revisions', {
      data: {
        id: REVISION,
        activity_id: ACTIVITY,
        status: 'pending_review',
        created_by: AUTHOR,
        blocks: worksheetBlocks(`${UPLOADS_BUCKET}/${OTHER_USER}/${IMAGE_ID}.webp`),
      },
      error: null,
    });
    const result = await approveRevision(REVISION, REVIEWER);
    expect(result).toEqual({ ok: false, error: 'foreign_upload' });
  });

  it('approves: copies the own-uploaded image and calls the RPC with rewritten paths', async () => {
    push('activity_revisions', {
      data: {
        id: REVISION,
        activity_id: ACTIVITY,
        status: 'pending_review',
        created_by: AUTHOR,
        blocks: worksheetBlocks(`${UPLOADS_BUCKET}/${AUTHOR}/${IMAGE_ID}.webp`),
      },
      error: null,
    });
    // storage.copyToImagesBucket -> list (not found) then copy (ok)
    push('activities', { data: [], error: null }); // unused safety net

    // storage calls go through client.storage, not client.from — mock a minimal storage surface
    // by monkeypatching createServiceClient's returned object is not trivial here, so we mock
    // copyToImagesBucket directly instead.
    const storageModule = await import('./storage');
    const copySpy = vi.spyOn(storageModule, 'copyToImagesBucket').mockResolvedValue(true);

    const result = await approveRevision(REVISION, REVIEWER);
    expect(result).toEqual({ ok: true });
    expect(copySpy).toHaveBeenCalledWith(
      `${UPLOADS_BUCKET}/${AUTHOR}/${IMAGE_ID}.webp`,
      `activity-images/${ACTIVITY}/${IMAGE_ID}.webp`,
    );
    expect(state.rpcCalls).toHaveLength(1);
    expect(state.rpcCalls[0].fn).toBe('approve_activity_revision');
    const args = state.rpcCalls[0].args as Record<string, unknown>;
    expect(args.p_revision).toBe(REVISION);
    expect(args.p_reviewer).toBe(REVIEWER);
    expect(args.p_block_types).toEqual(['worksheet']);
    expect(args.p_block_count).toBe(1);
    const blocks = args.p_blocks as Block[];
    expect((blocks[0] as { image: { path: string } }).image.path).toBe(`activity-images/${ACTIVITY}/${IMAGE_ID}.webp`);

    copySpy.mockRestore();
  });

  it('approves a quiz-only activity — no worksheet image, so no storage copy, and block_types/count are correct', async () => {
    push('activity_revisions', {
      data: {
        id: REVISION,
        activity_id: ACTIVITY,
        status: 'pending_review',
        created_by: AUTHOR,
        blocks: [
          {
            id: 'q1',
            type: 'quiz',
            payload: {
              pools: {},
              slots: [{ id: 's1', label: 'The cat ___ on the mat', input: 'text', answer: ['sits'] }],
            },
          },
        ],
      },
      error: null,
    });
    const storageModule = await import('./storage');
    const copySpy = vi.spyOn(storageModule, 'copyToImagesBucket');

    const result = await approveRevision(REVISION, REVIEWER);

    expect(result).toEqual({ ok: true });
    expect(copySpy).not.toHaveBeenCalled();
    expect(state.rpcCalls).toHaveLength(1);
    const args = state.rpcCalls[0].args as Record<string, unknown>;
    expect(args.p_block_types).toEqual(['quiz']);
    expect(args.p_block_count).toBe(1);

    copySpy.mockRestore();
  });

  it('approves a mixed worksheet+quiz activity: copies only the worksheet image, leaves the quiz\'s allow-listed media URL untouched, and reports both block types', async () => {
    push('activity_revisions', {
      data: {
        id: REVISION,
        activity_id: ACTIVITY,
        status: 'pending_review',
        created_by: AUTHOR,
        blocks: [
          ...worksheetBlocks(`${UPLOADS_BUCKET}/${AUTHOR}/${IMAGE_ID}.webp`),
          {
            id: 'q1',
            type: 'quiz',
            payload: {
              pools: {},
              slots: [{ id: 's1', label: 'x', input: 'text', answer: ['cat'] }],
              blocks: [
                { kind: 'media', id: 'm1', image: 'https://cdn.sanity.io/images/foo/bar.webp' },
                { kind: 'row', id: 'row-s1', slotId: 's1' },
              ],
            },
          },
        ],
      },
      error: null,
    });
    const storageModule = await import('./storage');
    const copySpy = vi.spyOn(storageModule, 'copyToImagesBucket').mockResolvedValue(true);

    const result = await approveRevision(REVISION, REVIEWER);

    expect(result).toEqual({ ok: true });
    expect(copySpy).toHaveBeenCalledTimes(1);
    expect(copySpy).toHaveBeenCalledWith(
      `${UPLOADS_BUCKET}/${AUTHOR}/${IMAGE_ID}.webp`,
      `activity-images/${ACTIVITY}/${IMAGE_ID}.webp`,
    );
    const args = state.rpcCalls[0].args as Record<string, unknown>;
    expect(args.p_block_types).toEqual(['worksheet', 'quiz']);
    expect(args.p_block_count).toBe(2);
    const blocks = args.p_blocks as Block[];
    const quizBlock = blocks[1] as { payload: { blocks?: { kind: string; image?: string }[] } };
    // The quiz block's own media block is untouched — only worksheet.image.path is ever rewritten.
    expect(quizBlock.payload.blocks?.find((b) => b.kind === 'media')?.image).toBe(
      'https://cdn.sanity.io/images/foo/bar.webp',
    );

    copySpy.mockRestore();
  });

  it('returns copy_failed when the storage copy fails, never calling the RPC', async () => {
    push('activity_revisions', {
      data: {
        id: REVISION,
        activity_id: ACTIVITY,
        status: 'pending_review',
        created_by: AUTHOR,
        blocks: worksheetBlocks(`${UPLOADS_BUCKET}/${AUTHOR}/${IMAGE_ID}.webp`),
      },
      error: null,
    });
    const storageModule = await import('./storage');
    const copySpy = vi.spyOn(storageModule, 'copyToImagesBucket').mockResolvedValue(false);

    const result = await approveRevision(REVISION, REVIEWER);
    expect(result).toEqual({ ok: false, error: 'copy_failed' });
    expect(state.rpcCalls).toHaveLength(0);

    copySpy.mockRestore();
  });

  it('returns approve_failed when the RPC errors', async () => {
    push('activity_revisions', {
      data: {
        id: REVISION,
        activity_id: ACTIVITY,
        status: 'pending_review',
        created_by: AUTHOR,
        blocks: worksheetBlocks(`activity-images/${ACTIVITY}/${IMAGE_ID}.webp`),
      },
      error: null,
    });
    state.rpcResult = { data: null, error: { message: 'boom' } };

    const result = await approveRevision(REVISION, REVIEWER);
    expect(result).toEqual({ ok: false, error: 'approve_failed' });
  });
});

describe('rejectRevision', () => {
  it('returns invalid_note for an empty note, without touching the database', async () => {
    const result = await rejectRevision(REVISION, REVIEWER, '   ');
    expect(result).toEqual({ ok: false, error: 'invalid_note' });
  });

  it('returns invalid_note for a note over 500 chars', async () => {
    const result = await rejectRevision(REVISION, REVIEWER, 'x'.repeat(501));
    expect(result).toEqual({ ok: false, error: 'invalid_note' });
  });

  it('returns not_found for a missing revision', async () => {
    push('activity_revisions', { data: null, error: null });
    const result = await rejectRevision(REVISION, REVIEWER, 'No cumple los requisitos.');
    expect(result).toEqual({ ok: false, error: 'not_found' });
  });

  it('returns not_pending when the revision is not pending_review', async () => {
    push('activity_revisions', { data: { id: REVISION, status: 'approved' }, error: null });
    const result = await rejectRevision(REVISION, REVIEWER, 'No cumple los requisitos.');
    expect(result).toEqual({ ok: false, error: 'not_pending' });
  });

  it('calls the RPC with the trimmed note and succeeds', async () => {
    push('activity_revisions', { data: { id: REVISION, status: 'pending_review' }, error: null });
    const result = await rejectRevision(REVISION, REVIEWER, '  Falta contenido.  ');
    expect(result).toEqual({ ok: true });
    expect(state.rpcCalls[0]).toEqual({
      fn: 'reject_activity_revision',
      args: { p_revision: REVISION, p_reviewer: REVIEWER, p_note: 'Falta contenido.' },
    });
  });
});

describe('restoreActivity / removeActivity', () => {
  it('restoreActivity returns not_hidden for a live (never-hidden) activity', async () => {
    push('activities', { data: { id: ACTIVITY, status: 'live', published_revision_id: 'x' }, error: null });
    expect(await restoreActivity(ACTIVITY, REVIEWER)).toEqual({ ok: false, error: 'not_hidden' });
  });

  it('restoreActivity restores a hidden activity to live', async () => {
    push('activities', { data: { id: ACTIVITY, status: 'pending_review', published_revision_id: 'x' }, error: null });
    push('activities', { error: null });
    expect(await restoreActivity(ACTIVITY, REVIEWER)).toEqual({ ok: true });
  });

  it('removeActivity returns not_found for a missing activity', async () => {
    push('activities', { data: null, error: null });
    expect(await removeActivity(ACTIVITY, REVIEWER)).toEqual({ ok: false, error: 'not_found' });
  });

  it('removeActivity removes a hidden activity', async () => {
    push('activities', { data: { id: ACTIVITY, status: 'pending_review', published_revision_id: 'x' }, error: null });
    push('activities', { error: null });
    expect(await removeActivity(ACTIVITY, REVIEWER)).toEqual({ ok: true });
  });
});

describe('recordReport', () => {
  it('returns invalid_reason for an unknown reason', async () => {
    expect(await recordReport(ACTIVITY, OTHER_USER, 'not_a_reason', null)).toEqual({
      ok: false,
      error: 'invalid_reason',
    });
  });

  it('returns invalid_details when details exceed 500 chars', async () => {
    expect(await recordReport(ACTIVITY, OTHER_USER, 'other', 'x'.repeat(501))).toEqual({
      ok: false,
      error: 'invalid_details',
    });
  });

  it('returns not_found for an activity that is not live', async () => {
    push('activities', { data: null, error: null });
    expect(await recordReport(ACTIVITY, OTHER_USER, 'other', null)).toEqual({ ok: false, error: 'not_found' });
  });

  it("refuses a report from the activity's own author", async () => {
    push('activities', { data: { id: ACTIVITY, author_id: AUTHOR }, error: null });
    expect(await recordReport(ACTIVITY, AUTHOR, 'other', null)).toEqual({ ok: false, error: 'self_report' });
  });

  it('records a report and returns whether it hid the activity', async () => {
    push('activities', { data: { id: ACTIVITY, author_id: AUTHOR }, error: null });
    state.rpcResult = { data: true, error: null };
    const result = await recordReport(ACTIVITY, OTHER_USER, 'inappropriate', '  spam  ');
    expect(result).toEqual({ ok: true, hidden: true });
    expect(state.rpcCalls[0]).toEqual({
      fn: 'record_activity_report',
      args: { p_activity: ACTIVITY, p_reporter: OTHER_USER, p_reason: 'inappropriate', p_details: 'spam' },
    });
  });

  it('is idempotent (200/hidden:false) even when the RPC reports no new hide', async () => {
    push('activities', { data: { id: ACTIVITY, author_id: AUTHOR }, error: null });
    state.rpcResult = { data: false, error: null };
    const result = await recordReport(ACTIVITY, OTHER_USER, 'other', null);
    expect(result).toEqual({ ok: true, hidden: false });
  });
});
