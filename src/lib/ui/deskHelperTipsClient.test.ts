import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearDeskHelperTipsCacheForTests, loadFullTips } from './deskHelperTipsClient';

function fakeFetch(body: unknown, ok = true, status = 200) {
  return vi.fn(async () => ({
    ok,
    status,
    json: async () => body,
  })) as unknown as typeof fetch;
}

afterEach(() => {
  clearDeskHelperTipsCacheForTests();
});

describe('loadFullTips', () => {
  it('fetches the per-language endpoint', async () => {
    const tips = [{ id: 'a', character: 'bruno', html: '<em>hi</em>' }];
    const fetchImpl = fakeFetch(tips);
    const result = await loadFullTips('es', fetchImpl);
    expect(result).toEqual(tips);
    expect(fetchImpl).toHaveBeenCalledWith('/data/desk-tips-es.json');
  });

  it('caches the result: a second call for the same language does not fetch again', async () => {
    const fetchImpl = fakeFetch([{ id: 'a', character: 'bruno', html: 'x' }]);
    await loadFullTips('es', fetchImpl);
    await loadFullTips('es', fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('fetches again for a different language', async () => {
    const fetchImpl = fakeFetch([{ id: 'a', character: 'bruno', html: 'x' }]);
    await loadFullTips('es', fetchImpl);
    await loadFullTips('en', fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('shares one in-flight request across concurrent callers for the same language', async () => {
    let resolveFetch!: (value: { ok: boolean; status: number; json: () => Promise<unknown> }) => void;
    const fetchImpl = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    ) as unknown as typeof fetch;

    const first = loadFullTips('es', fetchImpl);
    const second = loadFullTips('es', fetchImpl);
    resolveFetch({ ok: true, status: 200, json: async () => [{ id: 'a', character: 'bruno', html: 'x' }] });

    await Promise.all([first, second]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('throws (never silently empties) on a non-ok response, and does not cache the failure', async () => {
    const failing = fakeFetch(null, false, 500);
    await expect(loadFullTips('es', failing)).rejects.toThrow();

    const succeeding = fakeFetch([{ id: 'a', character: 'bruno', html: 'x' }]);
    const result = await loadFullTips('es', succeeding);
    expect(result).toHaveLength(1);
  });
});
