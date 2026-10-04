/**
 * Tests for `src/lib/activities/duplicate.ts` ("Duplicar y adaptar", D7).
 * `./activities` and `./storage` are mocked — this file proves the
 * orchestration (rate limits checked before any copy, image paths rewritten
 * to the caller's own uploads folder, fresh block/zone ids, provenance
 * passed through); `activities.test.ts`/`storage.test.ts` already cover
 * their own modules' own behavior.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Block } from './blocks';

const {
  getPublishedActivityMock,
  createActivityMock,
  copyToUploadsBucketMock,
  countUserUploadsMock,
  countState,
} = vi.hoisted(() => ({
  getPublishedActivityMock: vi.fn(),
  createActivityMock: vi.fn(),
  copyToUploadsBucketMock: vi.fn(),
  countUserUploadsMock: vi.fn(),
  countState: { result: { count: 0 as number | null, error: null as unknown }, available: true },
}));

vi.mock('./activities', () => ({
  getPublishedActivity: getPublishedActivityMock,
  createActivity: createActivityMock,
}));

vi.mock('./storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./storage')>();
  return {
    ...actual,
    copyToUploadsBucket: copyToUploadsBucketMock,
    countUserUploads: countUserUploadsMock,
  };
});

vi.mock('../supabase', () => ({
  createServiceClient: () => {
    if (!countState.available) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
    const builder = {
      eq: () => builder,
      not: () => builder,
      gte: () => Promise.resolve(countState.result),
    };
    return { from: () => ({ select: () => builder }) };
  },
}));

import { duplicateActivity, buildDuplicateTitle, MAX_DUPLICATES_PER_DAY, clearDuplicateClient } from './duplicate';
import { MAX_UPLOADS_PER_USER } from './storage';

const ORIGINAL_ID = 'a1a1a1a1-0000-4000-8000-000000000001';
const CALLER_ID = 'b2b2b2b2-0000-4000-8000-000000000002';

function worksheetBlocks(imagePath: string): Block[] {
  return [
    {
      id: 'block-1',
      type: 'worksheet',
      rotation: 0,
      image: { path: imagePath, width: 800, height: 600 },
      zones: [{ id: 'zone-1', x: 0.1, y: 0.1, w: 0.2, h: 0.1, kind: 'text', answers: ['hola'] }],
    },
  ];
}

function originalActivity(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: ORIGINAL_ID,
    title: 'Mi actividad original',
    level: 'B1',
    blocks: worksheetBlocks(`activity-images/${ORIGINAL_ID}/f1f1f1f1-0000-4000-8000-0000000000f1.webp`),
    authorId: 'some-author',
    heartCount: 0,
    viewTotal: 0,
    source: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  countState.available = true;
  countState.result = { count: 0, error: null };
  getPublishedActivityMock.mockResolvedValue(originalActivity());
  createActivityMock.mockResolvedValue('new-activity-id');
  copyToUploadsBucketMock.mockResolvedValue(true);
  countUserUploadsMock.mockResolvedValue(0);
  clearDuplicateClient();
});

describe('buildDuplicateTitle', () => {
  it('appends " (copia)" to the original title', () => {
    expect(buildDuplicateTitle('Present simple')).toBe('Present simple (copia)');
  });

  it('truncates a long title so the total stays <= 120 chars', () => {
    const longTitle = 'x'.repeat(200);
    const title = buildDuplicateTitle(longTitle);
    expect(title.length).toBeLessThanOrEqual(120);
    expect(title.endsWith(' (copia)')).toBe(true);
  });
});

describe('duplicateActivity', () => {
  it('returns not_found when the original is not live (or does not exist)', async () => {
    getPublishedActivityMock.mockResolvedValue(null);
    const result = await duplicateActivity(ORIGINAL_ID, CALLER_ID);
    expect(result).toEqual({ ok: false, error: 'not_found' });
    expect(createActivityMock).not.toHaveBeenCalled();
  });

  it('duplicates a ChuyoCode-owned original (NULL authorId, 0020 account deletion transfer) same as any other', async () => {
    getPublishedActivityMock.mockResolvedValue(originalActivity({ authorId: null }));
    const result = await duplicateActivity(ORIGINAL_ID, CALLER_ID);
    expect(result).toEqual({ ok: true, id: 'new-activity-id' });
  });

  it('returns daily_limit at the daily cap, before any copy or create', async () => {
    countState.result = { count: MAX_DUPLICATES_PER_DAY, error: null };
    const result = await duplicateActivity(ORIGINAL_ID, CALLER_ID);
    expect(result).toEqual({ ok: false, error: 'daily_limit' });
    expect(copyToUploadsBucketMock).not.toHaveBeenCalled();
    expect(createActivityMock).not.toHaveBeenCalled();
  });

  it('fails CLOSED to daily_limit when the daily count itself cannot be read', async () => {
    countState.result = { count: null, error: { message: 'down' } };
    const result = await duplicateActivity(ORIGINAL_ID, CALLER_ID);
    expect(result).toEqual({ ok: false, error: 'daily_limit' });
  });

  it('returns upload_limit when copying every image would exceed the per-user cap', async () => {
    countUserUploadsMock.mockResolvedValue(MAX_UPLOADS_PER_USER);
    const result = await duplicateActivity(ORIGINAL_ID, CALLER_ID);
    expect(result).toEqual({ ok: false, error: 'upload_limit' });
    expect(copyToUploadsBucketMock).not.toHaveBeenCalled();
  });

  it('fails CLOSED to upload_limit when the upload count itself cannot be read', async () => {
    countUserUploadsMock.mockResolvedValue(null);
    const result = await duplicateActivity(ORIGINAL_ID, CALLER_ID);
    expect(result).toEqual({ ok: false, error: 'upload_limit' });
  });

  it('returns copy_failed when a storage copy fails, never creating the activity', async () => {
    copyToUploadsBucketMock.mockResolvedValue(false);
    const result = await duplicateActivity(ORIGINAL_ID, CALLER_ID);
    expect(result).toEqual({ ok: false, error: 'copy_failed' });
    expect(createActivityMock).not.toHaveBeenCalled();
  });

  it('returns create_failed when the new activity insert fails', async () => {
    createActivityMock.mockResolvedValue(null);
    const result = await duplicateActivity(ORIGINAL_ID, CALLER_ID);
    expect(result).toEqual({ ok: false, error: 'create_failed' });
  });

  it('copies each unique worksheet image into the caller\'s own uploads folder', async () => {
    await duplicateActivity(ORIGINAL_ID, CALLER_ID);
    expect(copyToUploadsBucketMock).toHaveBeenCalledTimes(1);
    const [fromPath, toPath] = copyToUploadsBucketMock.mock.calls[0] as [string, string];
    expect(fromPath).toBe(`activity-images/${ORIGINAL_ID}/f1f1f1f1-0000-4000-8000-0000000000f1.webp`);
    expect(toPath.startsWith(`activity-uploads/${CALLER_ID}/`)).toBe(true);
  });

  it('copies each unique image only once even if several blocks share it', async () => {
    const sharedPath = `activity-images/${ORIGINAL_ID}/f1f1f1f1-0000-4000-8000-0000000000f1.webp`;
    getPublishedActivityMock.mockResolvedValue(
      originalActivity({
        blocks: [
          { id: 'b1', type: 'worksheet', rotation: 0, image: { path: sharedPath, width: 800, height: 600 }, zones: [] },
          { id: 'b2', type: 'worksheet', rotation: 0, image: { path: sharedPath, width: 800, height: 600 }, zones: [] },
        ],
      }),
    );
    await duplicateActivity(ORIGINAL_ID, CALLER_ID);
    expect(copyToUploadsBucketMock).toHaveBeenCalledTimes(1);
  });

  it('rewrites the worksheet image path in the new blocks to the copy destination', async () => {
    await duplicateActivity(ORIGINAL_ID, CALLER_ID);
    const newBlocks = createActivityMock.mock.calls[0][1].blocks as Block[];
    const worksheet = newBlocks[0] as Extract<Block, { type: 'worksheet' }>;
    expect(worksheet.image?.path.startsWith(`activity-uploads/${CALLER_ID}/`)).toBe(true);
  });

  it('assigns fresh ids to every block and zone', async () => {
    await duplicateActivity(ORIGINAL_ID, CALLER_ID);
    const newBlocks = createActivityMock.mock.calls[0][1].blocks as Block[];
    const worksheet = newBlocks[0] as Extract<Block, { type: 'worksheet' }>;
    expect(worksheet.id).not.toBe('block-1');
    expect(worksheet.zones[0].id).not.toBe('zone-1');
  });

  it('titles the copy "<original> (copia)"', async () => {
    await duplicateActivity(ORIGINAL_ID, CALLER_ID);
    expect(createActivityMock).toHaveBeenCalledWith(
      CALLER_ID,
      expect.objectContaining({ title: 'Mi actividad original (copia)' }),
    );
  });

  it('carries over the original level', async () => {
    await duplicateActivity(ORIGINAL_ID, CALLER_ID);
    expect(createActivityMock).toHaveBeenCalledWith(CALLER_ID, expect.objectContaining({ level: 'B1' }));
  });

  it('records provenance via sourceActivityId', async () => {
    await duplicateActivity(ORIGINAL_ID, CALLER_ID);
    expect(createActivityMock).toHaveBeenCalledWith(
      CALLER_ID,
      expect.objectContaining({ sourceActivityId: ORIGINAL_ID }),
    );
  });

  it('returns the new activity id on success', async () => {
    const result = await duplicateActivity(ORIGINAL_ID, CALLER_ID);
    expect(result).toEqual({ ok: true, id: 'new-activity-id' });
  });

  it('leaves a quiz block\'s own internal ids untouched, only its own top-level id refreshed', async () => {
    getPublishedActivityMock.mockResolvedValue(
      originalActivity({
        blocks: [
          {
            id: 'quiz-1',
            type: 'quiz',
            payload: { slots: [{ id: 'slot-1', input: 'text', label: 'x', answer: ['y'] }], pools: {} },
          },
        ],
      }),
    );
    await duplicateActivity(ORIGINAL_ID, CALLER_ID);
    const newBlocks = createActivityMock.mock.calls[0][1].blocks as Block[];
    const quiz = newBlocks[0] as Extract<Block, { type: 'quiz' }>;
    expect(quiz.id).not.toBe('quiz-1');
    expect(quiz.payload.slots[0].id).toBe('slot-1');
  });

  it('returns not_found without touching storage/create when the service client is unavailable', async () => {
    countState.available = false;
    const result = await duplicateActivity(ORIGINAL_ID, CALLER_ID);
    expect(result).toEqual({ ok: false, error: 'create_failed' });
    expect(getPublishedActivityMock).not.toHaveBeenCalled();
  });
});
