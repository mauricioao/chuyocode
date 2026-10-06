import { describe, it, expect } from 'vitest';
import { resolveCloseAction, shouldStartFullScreen, readFullScreenPreference, writeFullScreenPreference } from './deskWindow';

describe('resolveCloseAction', () => {
  const origin = 'https://chuyocode.test';
  const hub = '/es/ingles';

  it('prefers history.back() when the previous page is exactly the close target, same origin', () => {
    const action = resolveCloseAction('https://chuyocode.test/es/ingles', origin, 2, hub);
    expect(action).toEqual({ kind: 'back' });
  });

  it('falls back to a plain href when there is no previous history entry', () => {
    const action = resolveCloseAction('https://chuyocode.test/es/ingles', origin, 1, hub);
    expect(action).toEqual({ kind: 'href', href: hub });
  });

  it('falls back to a plain href when the referrer is a different path', () => {
    const action = resolveCloseAction('https://chuyocode.test/es/ingles/actividades', origin, 2, hub);
    expect(action).toEqual({ kind: 'href', href: hub });
  });

  it('falls back to a plain href when the referrer is cross-origin', () => {
    const action = resolveCloseAction('https://other.test/es/ingles', origin, 2, hub);
    expect(action).toEqual({ kind: 'href', href: hub });
  });

  it('falls back to a plain href when there is no referrer at all (direct visit)', () => {
    const action = resolveCloseAction('', origin, 2, hub);
    expect(action).toEqual({ kind: 'href', href: hub });
  });

  it('falls back to a plain href on a malformed referrer, never throws', () => {
    const action = resolveCloseAction('not a url', origin, 2, hub);
    expect(action).toEqual({ kind: 'href', href: hub });
  });

  it('resolves the guest close target (ChuyoCode home) the exact same way', () => {
    const home = '/es/';
    const action = resolveCloseAction('https://chuyocode.test/es/', origin, 2, home);
    expect(action).toEqual({ kind: 'back' });
  });
});

describe('shouldStartFullScreen', () => {
  it('starts full screen only when the stored value is exactly "true"', () => {
    expect(shouldStartFullScreen('true')).toBe(true);
    expect(shouldStartFullScreen('false')).toBe(false);
    expect(shouldStartFullScreen(null)).toBe(false);
    expect(shouldStartFullScreen('yes')).toBe(false);
  });
});

describe('readFullScreenPreference / writeFullScreenPreference', () => {
  function fakeStorage() {
    const store = new Map<string, string>();
    return {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    };
  }

  it('round-trips true through a working storage', () => {
    const storage = fakeStorage();
    writeFullScreenPreference(true, storage);
    expect(readFullScreenPreference(storage)).toBe(true);
  });

  it('round-trips false through a working storage', () => {
    const storage = fakeStorage();
    writeFullScreenPreference(true, storage);
    writeFullScreenPreference(false, storage);
    expect(readFullScreenPreference(storage)).toBe(false);
  });

  it('degrades to false (never throws) when the storage read throws', () => {
    const storage = {
      getItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readFullScreenPreference(storage)).toBe(false);
  });

  it('is a no-op (never throws) when the storage write throws', () => {
    const storage = {
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(() => writeFullScreenPreference(true, storage)).not.toThrow();
  });
});
