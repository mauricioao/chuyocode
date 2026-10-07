import { describe, expect, it } from 'vitest';
import {
  DESK_HELPER_QUEUE_STORAGE_KEY,
  readTipQueue,
  shuffle,
  takeNextTipId,
  writeTipQueue,
} from './deskHelperQueue';

function fakeStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
  };
}

describe('shuffle', () => {
  it('returns every item exactly once, in some order', () => {
    const items = [1, 2, 3, 4, 5];
    const result = shuffle(items);
    expect([...result].sort()).toEqual(items);
  });

  it('does not mutate the input array', () => {
    const items = [1, 2, 3];
    shuffle(items);
    expect(items).toEqual([1, 2, 3]);
  });

  it('is deterministic given a fixed random source', () => {
    const items = ['a', 'b', 'c', 'd'];
    const random = () => 0; // always picks index 0 at every step -> reverses the list
    expect(shuffle(items, random)).toEqual(shuffle(items, random));
  });
});

describe('takeNextTipId', () => {
  it('returns null/empty for an empty id list', () => {
    expect(takeNextTipId([], [])).toEqual({ id: null, queue: [] });
  });

  it('pops the front of a non-empty queue, leaving the rest', () => {
    expect(takeNextTipId(['b', 'c'], ['a', 'b', 'c'])).toEqual({ id: 'b', queue: ['c'] });
  });

  it('shuffles a fresh queue from allIds once the queue is empty', () => {
    const allIds = ['a', 'b', 'c'];
    const { id, queue } = takeNextTipId([], allIds);
    expect(allIds).toContain(id);
    expect(queue).toHaveLength(allIds.length - 1);
    expect(new Set([id, ...queue])).toEqual(new Set(allIds));
  });

  it('excludes the on-screen tip ONLY when reshuffling, so "Otro tip" never immediately repeats it', () => {
    const allIds = ['a', 'b', 'c'];
    const { id } = takeNextTipId([], allIds, { excludeOnReshuffle: 'a', random: () => 0 });
    expect(id).not.toBe('a');
  });

  it('falls back to the unfiltered set when excluding would empty a single-tip list', () => {
    const { id } = takeNextTipId([], ['only'], { excludeOnReshuffle: 'only' });
    expect(id).toBe('only');
  });

  it('never repeats an id across one full cycle, then reshuffles for the next', () => {
    const allIds = ['a', 'b', 'c', 'd', 'e'];
    let queue: string[] = [];
    const seen: string[] = [];
    for (let i = 0; i < allIds.length; i++) {
      const result = takeNextTipId(queue, allIds);
      queue = result.queue;
      seen.push(result.id as string);
    }
    expect(new Set(seen)).toEqual(new Set(allIds));
    expect(seen).toHaveLength(allIds.length);

    // The cycle just finished (queue is empty again) — the next call reshuffles.
    expect(queue).toEqual([]);
    const next = takeNextTipId(queue, allIds);
    expect(allIds).toContain(next.id);
  });
});

describe('readTipQueue / writeTipQueue (persistence)', () => {
  it('round-trips through a working storage', () => {
    const storage = fakeStorage();
    writeTipQueue(['a', 'b'], storage);
    expect(readTipQueue(storage)).toEqual(['a', 'b']);
  });

  it('returns an empty queue when nothing is stored yet', () => {
    expect(readTipQueue(fakeStorage())).toEqual([]);
  });

  it('degrades to an empty queue for malformed JSON, never throws', () => {
    const storage = fakeStorage();
    storage.setItem(DESK_HELPER_QUEUE_STORAGE_KEY, 'not json');
    expect(() => readTipQueue(storage)).not.toThrow();
    expect(readTipQueue(storage)).toEqual([]);
  });

  it('returns an empty queue when the stored JSON is not an array', () => {
    const storage = fakeStorage();
    storage.setItem(DESK_HELPER_QUEUE_STORAGE_KEY, JSON.stringify({ not: 'an array' }));
    expect(readTipQueue(storage)).toEqual([]);
  });

  it('filters out non-string entries', () => {
    const storage = fakeStorage();
    storage.setItem(DESK_HELPER_QUEUE_STORAGE_KEY, JSON.stringify(['a', 1, null, 'b']));
    expect(readTipQueue(storage)).toEqual(['a', 'b']);
  });

  it('degrades to a no-op (never throws) when the storage read/write throws', () => {
    const throwingStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(() => readTipQueue(throwingStorage)).not.toThrow();
    expect(readTipQueue(throwingStorage)).toEqual([]);
    expect(() => writeTipQueue(['a'], throwingStorage)).not.toThrow();
  });
});
