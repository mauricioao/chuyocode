/**
 * Unit tests for the download counter layer (src/lib/downloads.ts).
 *
 * The Supabase service client is mocked so no network happens: `rpc` drives
 * incrementDownload, and `from().select().order().limit()` drives the ranking
 * read. `getBooksBySlugs` (from ./sanity) is mocked so getMostDownloaded can be
 * tested in isolation and its slug-order preservation verified.
 *
 * env is mocked with a MUTABLE service-role key so tests can simulate the
 * "unconfigured key" path (createServiceClient throws → downloads no-op).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// The service client is provided by ./supabase. We mock createServiceClient so
// tests control both the happy path (returns a fake client) and the
// "unconfigured key" path (throws, exactly like the real MissingServiceRoleKey
// error). Mutating env at runtime wouldn't work: supabase.ts captures env once
// at import, so the key-missing path must be simulated at the factory instead.
const { clientState, rpcMock, limitMock, orderMock, fromMock } = vi.hoisted(
  () => {
    const limitMock = vi.fn();
    const orderMock = vi.fn(() => ({ limit: limitMock }));
    const selectMock = vi.fn(() => ({ order: orderMock }));
    const fromMock = vi.fn(() => ({ select: selectMock }));
    return {
      clientState: { available: true },
      rpcMock: vi.fn(),
      limitMock,
      orderMock,
      fromMock,
    };
  },
);

vi.mock('./supabase', () => ({
  createServiceClient: () => {
    if (!clientState.available) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
    }
    return { rpc: rpcMock, from: fromMock };
  },
}));

// ./sanity (imported for LruCache) loads env at module init, so provide it.
vi.mock('./env', () => ({
  loadEnv: () => ({
    SANITY_PROJECT_ID: 'proj',
    SANITY_DATASET: 'production',
    SUPABASE_URL: 'https://x.supabase.co',
    SUPABASE_ANON_KEY: 'anon',
    SUPABASE_SERVICE_ROLE_KEY: 'service-key',
    AD_HMAC_SECRET: '',
  }),
}));

// ./sanity also creates a real @sanity/client at import; stub it so no network.
vi.mock('@sanity/client', () => ({
  createClient: () => ({ fetch: vi.fn() }),
}));

// Mock only getBooksBySlugs; keep the real LruCache (downloads.ts imports both).
const { getBooksBySlugsMock } = vi.hoisted(() => ({
  getBooksBySlugsMock: vi.fn(),
}));
vi.mock('./sanity', async (importActual) => {
  const actual = await importActual<typeof import('./sanity')>();
  return { ...actual, getBooksBySlugs: getBooksBySlugsMock };
});

import {
  incrementDownload,
  getMostDownloadedSlugs,
  getMostDownloaded,
  clearDownloadsCache,
  INCREMENT_RPC,
  DOWNLOADS_TABLE,
} from './downloads';

beforeEach(() => {
  vi.clearAllMocks();
  clientState.available = true;
  clearDownloadsCache();
});

describe('incrementDownload', () => {
  it('calls the increment RPC with the slug and returns true on success', async () => {
    rpcMock.mockResolvedValue({ error: null });
    const ok = await incrementDownload('el-libro');
    expect(ok).toBe(true);
    expect(rpcMock).toHaveBeenCalledWith(INCREMENT_RPC, { book_slug: 'el-libro' });
  });

  it('returns false (never throws) when the RPC errors', async () => {
    rpcMock.mockResolvedValue({ error: { message: 'boom' } });
    expect(await incrementDownload('x')).toBe(false);
  });

  it('returns false when the RPC throws', async () => {
    rpcMock.mockRejectedValue(new Error('network'));
    expect(await incrementDownload('x')).toBe(false);
  });

  it('returns false for an empty slug without touching Supabase', async () => {
    expect(await incrementDownload('')).toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('returns false when the service-role key is unconfigured', async () => {
    clientState.available = false;
    expect(await incrementDownload('x')).toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe('getMostDownloadedSlugs', () => {
  it('returns rows ordered by count from Supabase', async () => {
    limitMock.mockResolvedValue({
      data: [
        { slug: 'a', count: 50 },
        { slug: 'b', count: 20 },
      ],
      error: null,
    });
    const rows = await getMostDownloadedSlugs(5);
    expect(rows).toEqual([
      { slug: 'a', count: 50 },
      { slug: 'b', count: 20 },
    ]);
    expect(fromMock).toHaveBeenCalledWith(DOWNLOADS_TABLE);
    expect(orderMock).toHaveBeenCalledWith('count', { ascending: false });
    expect(limitMock).toHaveBeenCalledWith(5);
  });

  it('drops rows with a blank slug and coerces non-number counts', async () => {
    limitMock.mockResolvedValue({
      data: [
        { slug: '', count: 99 },
        { slug: 'b', count: '7' },
      ],
      error: null,
    });
    expect(await getMostDownloadedSlugs()).toEqual([{ slug: 'b', count: 7 }]);
  });

  it('returns [] (fail-safe) on a Supabase error', async () => {
    limitMock.mockResolvedValue({ data: null, error: { message: 'down' } });
    expect(await getMostDownloadedSlugs()).toEqual([]);
  });

  it('returns [] when the service-role key is unconfigured', async () => {
    clientState.available = false;
    expect(await getMostDownloadedSlugs()).toEqual([]);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('serves a second identical call from cache (no extra query)', async () => {
    limitMock.mockResolvedValue({ data: [{ slug: 'a', count: 1 }], error: null });
    await getMostDownloadedSlugs(10);
    await getMostDownloadedSlugs(10);
    expect(fromMock).toHaveBeenCalledTimes(1);
  });

  it('a successful increment invalidates the ranking cache', async () => {
    limitMock.mockResolvedValue({ data: [{ slug: 'a', count: 1 }], error: null });
    await getMostDownloadedSlugs(10);
    rpcMock.mockResolvedValue({ error: null });
    await incrementDownload('a'); // clears the cache
    await getMostDownloadedSlugs(10);
    expect(fromMock).toHaveBeenCalledTimes(2);
  });
});

describe('getMostDownloaded', () => {
  it('returns [] without hydrating when there are no download rows', async () => {
    limitMock.mockResolvedValue({ data: [], error: null });
    expect(await getMostDownloaded('es', 10)).toEqual([]);
    expect(getBooksBySlugsMock).not.toHaveBeenCalled();
  });

  it('hydrates the ranked slugs via getBooksBySlugs in ranking order', async () => {
    limitMock.mockResolvedValue({
      data: [
        { slug: 'top', count: 100 },
        { slug: 'second', count: 40 },
      ],
      error: null,
    });
    getBooksBySlugsMock.mockResolvedValue([
      { _id: '1', slug: 'top', title: 'Top' },
      { _id: '2', slug: 'second', title: 'Second' },
    ]);
    const items = await getMostDownloaded('es', 10);
    expect(getBooksBySlugsMock).toHaveBeenCalledWith(['top', 'second'], 'es');
    expect(items.map((i) => i.slug)).toEqual(['top', 'second']);
  });
});
