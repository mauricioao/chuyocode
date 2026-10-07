import { describe, it, expect } from 'vitest';
import {
  DESK_WINDOWS_STORAGE_KEY,
  parsePersistedDeskWindows,
  serializePersistedDeskWindows,
  readPersistedDeskWindows,
  writePersistedDeskWindows,
} from './deskWindowsPersistence';
import { MAX_DESK_WINDOWS, type DeskWindowEntry, type DeskWindowsState } from '../deskWindowsState';

function entry(overrides: Partial<DeskWindowEntry> = {}): DeskWindowEntry {
  return {
    id: 'community',
    kind: 'community',
    href: '/es/ingles/actividades',
    title: 'Comunidad',
    minimized: false,
    maximized: false,
    offset: { x: 0, y: 0 },
    z: 1,
    ...overrides,
  };
}

function fakeStorage(seed: Record<string, string> = {}) {
  const store = new Map(Object.entries(seed));
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    _store: store,
  };
}

describe('parsePersistedDeskWindows', () => {
  it('returns null for null/empty input', () => {
    expect(parsePersistedDeskWindows(null)).toBeNull();
    expect(parsePersistedDeskWindows('')).toBeNull();
  });

  it('returns null for corrupted JSON', () => {
    expect(parsePersistedDeskWindows('{not json')).toBeNull();
  });

  it('returns null for a well-formed but shapeless value (not {windows, nextZ})', () => {
    expect(parsePersistedDeskWindows('[]')).toBeNull();
    expect(parsePersistedDeskWindows('{"windows": "nope", "nextZ": 1}')).toBeNull();
    expect(parsePersistedDeskWindows('{"windows": [], "nextZ": "nope"}')).toBeNull();
  });

  it('returns null when every entry is malformed (degrades to first-visit, never throws)', () => {
    const raw = JSON.stringify({ windows: [{ id: 'x' }], nextZ: 2 });
    expect(parsePersistedDeskWindows(raw)).toBeNull();
  });

  it('filters out individually malformed entries, keeping the valid ones', () => {
    const good = entry();
    const raw = JSON.stringify({ windows: [good, { id: 'bad' }], nextZ: 2 });
    const result = parsePersistedDeskWindows(raw);
    expect(result?.windows).toEqual([good]);
    expect(result?.nextZ).toBe(2);
  });

  it('round-trips a full valid state', () => {
    const state: DeskWindowsState = {
      windows: [
        entry({ id: 'community', z: 1 }),
        entry({ id: 'activity:abc', kind: 'activity', href: '/es/ingles/actividades/abc', title: 'x', z: 2, minimized: true, offset: { x: 10, y: 20 } }),
      ],
      nextZ: 3,
    };
    const raw = serializePersistedDeskWindows(state);
    expect(parsePersistedDeskWindows(raw)).toEqual(state);
  });

  it('re-clamps a tampered/over-cap value to the MAX_DESK_WINDOWS highest-z entries', () => {
    const windows = Array.from({ length: MAX_DESK_WINDOWS + 2 }, (_, i) =>
      entry({ id: `activity:${i}`, kind: 'activity', href: `/es/ingles/actividades/${i}`, z: i + 1 }),
    );
    const raw = JSON.stringify({ windows, nextZ: windows.length + 1 });
    const result = parsePersistedDeskWindows(raw);
    expect(result?.windows).toHaveLength(MAX_DESK_WINDOWS);
    // Keeps the HIGHEST-z (most recently used) entries — the lowest-z ones
    // (ids 0 and 1) are the ones dropped.
    expect(result?.windows.map((w) => w.id)).not.toContain('activity:0');
    expect(result?.windows.map((w) => w.id)).not.toContain('activity:1');
    expect(result?.windows.map((w) => w.id)).toContain(`activity:${windows.length - 1}`);
  });
});

describe('readPersistedDeskWindows / writePersistedDeskWindows', () => {
  it('writes under the documented storage key, and reads it back', () => {
    const storage = fakeStorage();
    const state: DeskWindowsState = { windows: [entry()], nextZ: 2 };
    writePersistedDeskWindows(state, storage);

    expect(storage._store.has(DESK_WINDOWS_STORAGE_KEY)).toBe(true);
    expect(readPersistedDeskWindows(storage)).toEqual(state);
  });

  it('read degrades to null when storage throws (private browsing/quota/disabled)', () => {
    const throwingStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readPersistedDeskWindows(throwingStorage)).toBeNull();
  });

  it('write is a silent no-op when storage throws', () => {
    const throwingStorage = {
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(() => writePersistedDeskWindows({ windows: [entry()], nextZ: 2 }, throwingStorage)).not.toThrow();
  });
});
