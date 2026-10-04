/**
 * I/O tests for `src/lib/activities/storage.ts`. Mirrors the mock-chain style
 * of `roles.test.ts`: the Supabase service client's `.storage` surface is
 * mocked so no network happens.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { clientState, results, fromMock } = vi.hoisted(() => {
  const results: {
    createSignedUploadUrl: { data: unknown; error: unknown };
    createSignedUrl: { data: unknown; error: unknown };
    upload: { data: unknown; error: unknown };
    list: { data: unknown; error: unknown };
    copy: { data: unknown; error: unknown };
    remove: { data: unknown; error: unknown };
  } = {
    createSignedUploadUrl: { data: { signedUrl: 'https://signed/upload', token: 'tok' }, error: null },
    createSignedUrl: { data: { signedUrl: 'https://signed/read' }, error: null },
    upload: { data: {}, error: null },
    list: { data: [], error: null },
    copy: { data: { path: 'copied' }, error: null },
    remove: { data: [], error: null },
  };

  const createSignedUploadUrl = vi.fn(async () => results.createSignedUploadUrl);
  const createSignedUrl = vi.fn(async () => results.createSignedUrl);
  const upload = vi.fn(async () => results.upload);
  const list = vi.fn(async () => results.list);
  const copy = vi.fn(async () => results.copy);
  const remove = vi.fn(async () => results.remove);
  const fromMock = vi.fn(() => ({ createSignedUploadUrl, createSignedUrl, upload, list, copy, remove }));

  return {
    clientState: { available: true },
    results,
    fromMock: Object.assign(fromMock, { createSignedUploadUrl, createSignedUrl, upload, list, copy, remove }),
  };
});

vi.mock('../supabase', () => ({
  createServiceClient: () => {
    if (!clientState.available) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
    }
    return { storage: { from: fromMock } };
  },
}));

import {
  signedUploadUrl,
  signedReadUrl,
  uploadToUploadsBucket,
  countUserUploads,
  removeAllUserUploads,
  copyToImagesBucket,
  copyToUploadsBucket,
  clearStorageClient,
  MAX_UPLOADS_PER_USER,
  UPLOADS_BUCKET,
  IMAGES_BUCKET,
  uploadPath,
  approvedImagePath,
} from './storage';

const USER = 'a1b2c3d4-0000-4000-8000-000000000001';
const OBJECT = 'f1e2d3c4-0000-4000-8000-0000000000ff';

beforeEach(() => {
  vi.clearAllMocks();
  clientState.available = true;
  results.createSignedUploadUrl = { data: { signedUrl: 'https://signed/upload', token: 'tok' }, error: null };
  results.createSignedUrl = { data: { signedUrl: 'https://signed/read' }, error: null };
  results.upload = { data: {}, error: null };
  results.list = { data: [], error: null };
  results.copy = { data: { path: 'copied' }, error: null };
  results.remove = { data: [], error: null };
  clearStorageClient();
});

describe('signedUploadUrl', () => {
  it('returns the path plus a signed URL and token', async () => {
    const target = await signedUploadUrl(USER, OBJECT);
    expect(target).toEqual({ path: uploadPath(USER, OBJECT), signedUrl: 'https://signed/upload', token: 'tok' });
    expect(fromMock).toHaveBeenCalledWith(UPLOADS_BUCKET);
    expect(fromMock.createSignedUploadUrl).toHaveBeenCalledWith(`${USER}/${OBJECT}.webp`);
  });

  it('returns null for a malformed userId', async () => {
    expect(await signedUploadUrl('not-a-uuid', OBJECT)).toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('returns null when the client errors', async () => {
    results.createSignedUploadUrl = { data: null, error: { message: 'down' } };
    expect(await signedUploadUrl(USER, OBJECT)).toBeNull();
  });

  it('returns null when the service-role key is unconfigured', async () => {
    clientState.available = false;
    expect(await signedUploadUrl(USER, OBJECT)).toBeNull();
  });
});

describe('signedReadUrl', () => {
  it('signs a read URL for an uploads-bucket path', async () => {
    const url = await signedReadUrl(uploadPath(USER, OBJECT));
    expect(url).toBe('https://signed/read');
    expect(fromMock).toHaveBeenCalledWith(UPLOADS_BUCKET);
  });

  it('signs a read URL for an images-bucket path', async () => {
    const url = await signedReadUrl(approvedImagePath(USER, OBJECT));
    expect(url).toBe('https://signed/read');
    expect(fromMock).toHaveBeenCalledWith(IMAGES_BUCKET);
  });

  it('returns null for a malformed path, without calling the client', async () => {
    expect(await signedReadUrl('../../etc/passwd')).toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('returns null when the client errors', async () => {
    results.createSignedUrl = { data: null, error: { message: 'down' } };
    expect(await signedReadUrl(uploadPath(USER, OBJECT))).toBeNull();
  });

  it('returns null when the service-role key is unconfigured', async () => {
    clientState.available = false;
    expect(await signedReadUrl(uploadPath(USER, OBJECT))).toBeNull();
  });
});

describe('uploadToUploadsBucket', () => {
  const bytes = new Uint8Array([1, 2, 3]);

  it('uploads to the caller-derived path and returns it', async () => {
    const path = await uploadToUploadsBucket(USER, OBJECT, bytes);
    expect(path).toBe(uploadPath(USER, OBJECT));
    expect(fromMock).toHaveBeenCalledWith(UPLOADS_BUCKET);
    expect(fromMock.upload).toHaveBeenCalledWith(`${USER}/${OBJECT}.webp`, bytes, {
      contentType: 'image/webp',
      upsert: false,
    });
  });

  it('returns null for a malformed id', async () => {
    expect(await uploadToUploadsBucket(USER, 'not-a-uuid', bytes)).toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('returns null when the upload fails', async () => {
    results.upload = { data: null, error: { message: 'bucket full' } };
    expect(await uploadToUploadsBucket(USER, OBJECT, bytes)).toBeNull();
  });

  it('returns null when the service-role key is unconfigured', async () => {
    clientState.available = false;
    expect(await uploadToUploadsBucket(USER, OBJECT, bytes)).toBeNull();
  });
});

describe('countUserUploads', () => {
  it('counts the objects listed in the user folder', async () => {
    results.list = { data: [{ name: 'a' }, { name: 'b' }], error: null };
    expect(await countUserUploads(USER)).toBe(2);
    expect(fromMock).toHaveBeenCalledWith(UPLOADS_BUCKET);
    expect(fromMock.list).toHaveBeenCalledWith(USER, { limit: MAX_UPLOADS_PER_USER });
  });

  it('returns 0 for an empty folder', async () => {
    results.list = { data: [], error: null };
    expect(await countUserUploads(USER)).toBe(0);
  });

  it('returns null for a malformed userId', async () => {
    expect(await countUserUploads('not-a-uuid')).toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('fails CLOSED to null on a list error (never "under the cap" on an outage)', async () => {
    results.list = { data: null, error: { message: 'down' } };
    expect(await countUserUploads(USER)).toBeNull();
  });

  it('fails CLOSED to null when the service-role key is unconfigured', async () => {
    clientState.available = false;
    expect(await countUserUploads(USER)).toBeNull();
  });
});

describe('removeAllUserUploads', () => {
  it('lists then removes every object in the user folder', async () => {
    results.list = { data: [{ name: 'a.webp' }, { name: 'b.webp' }], error: null };
    expect(await removeAllUserUploads(USER)).toBe(true);
    expect(fromMock).toHaveBeenCalledWith(UPLOADS_BUCKET);
    expect(fromMock.list).toHaveBeenCalledWith(USER, { limit: MAX_UPLOADS_PER_USER });
    expect(fromMock.remove).toHaveBeenCalledWith([`${USER}/a.webp`, `${USER}/b.webp`]);
  });

  it('returns true for an already-empty folder, without calling remove', async () => {
    results.list = { data: [], error: null };
    expect(await removeAllUserUploads(USER)).toBe(true);
    expect(fromMock.remove).not.toHaveBeenCalled();
  });

  it('paginates past the MAX_UPLOADS_PER_USER (100) list limit, removing every page (more than 100 uploads)', async () => {
    const page1 = Array.from({ length: MAX_UPLOADS_PER_USER }, (_, i) => ({ name: `obj-${i}.webp` }));
    const page2 = [{ name: 'obj-last.webp' }];
    fromMock.list
      .mockResolvedValueOnce({ data: page1, error: null })
      .mockResolvedValueOnce({ data: page2, error: null });

    expect(await removeAllUserUploads(USER)).toBe(true);
    expect(fromMock.list).toHaveBeenCalledTimes(2);
    expect(fromMock.remove).toHaveBeenCalledTimes(2);
    expect(fromMock.remove).toHaveBeenNthCalledWith(1, page1.map((f) => `${USER}/${f.name}`));
    expect(fromMock.remove).toHaveBeenNthCalledWith(2, [`${USER}/obj-last.webp`]);
  });

  it('fails CLOSED to false when a later page fails to list (first page is already removed by then)', async () => {
    const page1 = Array.from({ length: MAX_UPLOADS_PER_USER }, (_, i) => ({ name: `obj-${i}.webp` }));
    fromMock.list
      .mockResolvedValueOnce({ data: page1, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'down' } });

    expect(await removeAllUserUploads(USER)).toBe(false);
    expect(fromMock.list).toHaveBeenCalledTimes(2);
    expect(fromMock.remove).toHaveBeenCalledTimes(1);
  });

  it('returns false for a malformed userId', async () => {
    expect(await removeAllUserUploads('not-a-uuid')).toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('fails CLOSED to false on a list error', async () => {
    results.list = { data: null, error: { message: 'down' } };
    expect(await removeAllUserUploads(USER)).toBe(false);
    expect(fromMock.remove).not.toHaveBeenCalled();
  });

  it('fails CLOSED to false on a remove error', async () => {
    results.list = { data: [{ name: 'a.webp' }], error: null };
    results.remove = { data: null, error: { message: 'denied' } };
    expect(await removeAllUserUploads(USER)).toBe(false);
  });

  it('fails CLOSED to false when the service-role key is unconfigured', async () => {
    clientState.available = false;
    expect(await removeAllUserUploads(USER)).toBe(false);
  });
});

describe('copyToImagesBucket', () => {
  const activityId = 'b2c3d4e5-0000-4000-8000-000000000002';
  const from = uploadPath(USER, OBJECT);
  const to = approvedImagePath(activityId, OBJECT);

  it('copies from the uploads bucket to the images bucket, destination-bucket only', async () => {
    const ok = await copyToImagesBucket(from, to);
    expect(ok).toBe(true);
    expect(fromMock).toHaveBeenCalledWith(IMAGES_BUCKET);
    expect(fromMock).toHaveBeenCalledWith(UPLOADS_BUCKET);
    expect(fromMock.copy).toHaveBeenCalledWith(`${USER}/${OBJECT}.webp`, `${activityId}/${OBJECT}.webp`, {
      destinationBucket: IMAGES_BUCKET,
    });
  });

  it('is idempotent: skips the copy when the target already exists', async () => {
    results.list = { data: [{ name: `${OBJECT}.webp` }], error: null };
    const ok = await copyToImagesBucket(from, to);
    expect(ok).toBe(true);
    expect(fromMock.copy).not.toHaveBeenCalled();
  });

  it('returns false when fromPath is not an uploads-bucket path', async () => {
    expect(await copyToImagesBucket(to, to)).toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('returns false when toPath is not an images-bucket path', async () => {
    expect(await copyToImagesBucket(from, from)).toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('returns false when the copy fails', async () => {
    results.copy = { data: null, error: { message: 'denied' } };
    expect(await copyToImagesBucket(from, to)).toBe(false);
  });

  it('returns false when the existence check fails', async () => {
    results.list = { data: null, error: { message: 'down' } };
    expect(await copyToImagesBucket(from, to)).toBe(false);
    expect(fromMock.copy).not.toHaveBeenCalled();
  });

  it('returns false when the service-role key is unconfigured', async () => {
    clientState.available = false;
    expect(await copyToImagesBucket(from, to)).toBe(false);
  });
});

describe('copyToUploadsBucket', () => {
  const activityId = 'b2c3d4e5-0000-4000-8000-000000000002';
  const otherUser = 'c3d4e5f6-0000-4000-8000-000000000003';
  const newObject = 'a9b8c7d6-0000-4000-8000-0000000000aa';
  const from = approvedImagePath(activityId, OBJECT);
  const to = uploadPath(otherUser, newObject);

  it('copies from the images bucket to the uploads bucket, destination-bucket only', async () => {
    const ok = await copyToUploadsBucket(from, to);
    expect(ok).toBe(true);
    expect(fromMock).toHaveBeenCalledWith(IMAGES_BUCKET);
    expect(fromMock.copy).toHaveBeenCalledWith(`${activityId}/${OBJECT}.webp`, `${otherUser}/${newObject}.webp`, {
      destinationBucket: UPLOADS_BUCKET,
    });
  });

  it('never checks for an existing object at the destination (always a fresh id)', async () => {
    await copyToUploadsBucket(from, to);
    expect(fromMock.list).not.toHaveBeenCalled();
  });

  it('returns false when fromPath is not an images-bucket path', async () => {
    expect(await copyToUploadsBucket(to, to)).toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('returns false when toPath is not an uploads-bucket path', async () => {
    expect(await copyToUploadsBucket(from, from)).toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('returns false when the copy fails', async () => {
    results.copy = { data: null, error: { message: 'denied' } };
    expect(await copyToUploadsBucket(from, to)).toBe(false);
  });

  it('returns false when the service-role key is unconfigured', async () => {
    clientState.available = false;
    expect(await copyToUploadsBucket(from, to)).toBe(false);
  });
});
