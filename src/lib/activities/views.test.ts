import { describe, it, expect, beforeEach, vi } from 'vitest';

const { clientState, rpcMock } = vi.hoisted(() => ({
  clientState: { available: true },
  rpcMock: vi.fn(),
}));

vi.mock('../supabase', () => ({
  createServiceClient: () => {
    if (!clientState.available) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
    }
    return { rpc: rpcMock };
  },
}));

import { recordActivityView, RECORD_ACTIVITY_VIEW_FN, clearViewsClient } from './views';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const ACTIVITY_ID = '22222222-2222-2222-2222-222222222222';

beforeEach(() => {
  vi.clearAllMocks();
  clientState.available = true;
  rpcMock.mockReset();
  clearViewsClient();
});

describe('recordActivityView', () => {
  it('returns null when userId is not a uuid', async () => {
    expect(await recordActivityView('nope', ACTIVITY_ID)).toBeNull();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('returns null when activityId is not a uuid', async () => {
    expect(await recordActivityView(USER_ID, 'nope')).toBeNull();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('returns null when the service client is unavailable', async () => {
    clientState.available = false;
    expect(await recordActivityView(USER_ID, ACTIVITY_ID)).toBeNull();
  });

  it('calls the RPC with p_user/p_activity', async () => {
    rpcMock.mockResolvedValueOnce({ data: 3, error: null });
    await recordActivityView(USER_ID, ACTIVITY_ID);
    expect(rpcMock).toHaveBeenCalledWith(RECORD_ACTIVITY_VIEW_FN, { p_user: USER_ID, p_activity: ACTIVITY_ID });
  });

  it('returns the new view count on success', async () => {
    rpcMock.mockResolvedValueOnce({ data: 5, error: null });
    expect(await recordActivityView(USER_ID, ACTIVITY_ID)).toBe(5);
  });

  it('returns 1 for a first-ever view', async () => {
    rpcMock.mockResolvedValueOnce({ data: 1, error: null });
    expect(await recordActivityView(USER_ID, ACTIVITY_ID)).toBe(1);
  });

  it('returns null when the RPC errors', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    expect(await recordActivityView(USER_ID, ACTIVITY_ID)).toBeNull();
  });

  it('returns null when the RPC returns a non-number', async () => {
    rpcMock.mockResolvedValueOnce({ data: 'oops', error: null });
    expect(await recordActivityView(USER_ID, ACTIVITY_ID)).toBeNull();
  });

  it('returns null when the client throws', async () => {
    rpcMock.mockImplementationOnce(() => {
      throw new Error('network down');
    });
    expect(await recordActivityView(USER_ID, ACTIVITY_ID)).toBeNull();
  });
});
