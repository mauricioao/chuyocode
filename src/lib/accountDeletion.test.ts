/**
 * Tests for `src/lib/accountDeletion.ts`. `./activities/storage` and
 * `./supabase` are mocked — this file proves the ORCHESTRATION (RPC before
 * storage before `deleteUser`, and that a failure at each step stops
 * everything after it); `storage.test.ts` already covers
 * `removeAllUserUploads`'s own behavior.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { rpcMock, deleteUserMock, removeAllUserUploadsMock, clientState } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  deleteUserMock: vi.fn(),
  removeAllUserUploadsMock: vi.fn(),
  clientState: { available: true },
}));

vi.mock('./activities/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./activities/storage')>();
  return { ...actual, removeAllUserUploads: removeAllUserUploadsMock };
});

vi.mock('./supabase', () => ({
  createServiceClient: () => {
    if (!clientState.available) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
    }
    return {
      rpc: rpcMock,
      auth: { admin: { deleteUser: deleteUserMock } },
    };
  },
}));

import { deleteAccount, clearAccountDeletionClient } from './accountDeletion';

const USER_ID = 'c3c3c3c3-0000-4000-8000-000000000003';

beforeEach(() => {
  vi.clearAllMocks();
  clientState.available = true;
  rpcMock.mockResolvedValue({ data: null, error: null });
  removeAllUserUploadsMock.mockResolvedValue(true);
  deleteUserMock.mockResolvedValue({ data: {}, error: null });
  clearAccountDeletionClient();
});

describe('deleteAccount — success', () => {
  it('calls the RPC, clears storage, then deletes the auth user, in that order', async () => {
    const calls: string[] = [];
    rpcMock.mockImplementation(async () => {
      calls.push('rpc');
      return { data: null, error: null };
    });
    removeAllUserUploadsMock.mockImplementation(async () => {
      calls.push('storage');
      return true;
    });
    deleteUserMock.mockImplementation(async () => {
      calls.push('deleteUser');
      return { data: {}, error: null };
    });

    const result = await deleteAccount(USER_ID);

    expect(result).toEqual({ ok: true });
    expect(calls).toEqual(['rpc', 'storage', 'deleteUser']);
  });

  it('calls the RPC with p_user set to the given userId', async () => {
    await deleteAccount(USER_ID);
    expect(rpcMock).toHaveBeenCalledWith('transfer_and_purge_user', { p_user: USER_ID });
  });

  it('clears storage for the given userId', async () => {
    await deleteAccount(USER_ID);
    expect(removeAllUserUploadsMock).toHaveBeenCalledWith(USER_ID);
  });

  it('deletes the auth user by the given userId', async () => {
    await deleteAccount(USER_ID);
    expect(deleteUserMock).toHaveBeenCalledWith(USER_ID);
  });
});

describe('deleteAccount — failures stop everything after them', () => {
  it('returns purge_failed and never touches storage or deleteUser when the RPC errors', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'boom' } });

    const result = await deleteAccount(USER_ID);

    expect(result).toEqual({ ok: false, error: 'purge_failed' });
    expect(removeAllUserUploadsMock).not.toHaveBeenCalled();
    expect(deleteUserMock).not.toHaveBeenCalled();
  });

  it('returns purge_failed when the RPC call throws', async () => {
    rpcMock.mockRejectedValue(new Error('network down'));

    const result = await deleteAccount(USER_ID);

    expect(result).toEqual({ ok: false, error: 'purge_failed' });
    expect(removeAllUserUploadsMock).not.toHaveBeenCalled();
    expect(deleteUserMock).not.toHaveBeenCalled();
  });

  it('returns purge_failed when the service-role key is unconfigured', async () => {
    clientState.available = false;

    const result = await deleteAccount(USER_ID);

    expect(result).toEqual({ ok: false, error: 'purge_failed' });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('returns storage_cleanup_failed and never calls deleteUser when storage cleanup fails (RPC already ran)', async () => {
    removeAllUserUploadsMock.mockResolvedValue(false);

    const result = await deleteAccount(USER_ID);

    expect(result).toEqual({ ok: false, error: 'storage_cleanup_failed' });
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(deleteUserMock).not.toHaveBeenCalled();
  });

  it('returns delete_user_failed when auth.admin.deleteUser errors (RPC and storage already ran)', async () => {
    deleteUserMock.mockResolvedValue({ data: null, error: { message: 'gone' } });

    const result = await deleteAccount(USER_ID);

    expect(result).toEqual({ ok: false, error: 'delete_user_failed' });
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(removeAllUserUploadsMock).toHaveBeenCalledTimes(1);
  });

  it('returns delete_user_failed when auth.admin.deleteUser throws', async () => {
    deleteUserMock.mockRejectedValue(new Error('network down'));

    const result = await deleteAccount(USER_ID);

    expect(result).toEqual({ ok: false, error: 'delete_user_failed' });
  });
});
