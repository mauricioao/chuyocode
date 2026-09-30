// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { readMeCache, writeMeCache, clearMeCache } from './meCache';
import type { Profile } from './profile';

const PROFILE: Profile = {
  name: 'Juan Perez',
  email: 'juan.perez@gmail.com',
  avatarUrl: null,
  initials: 'JP',
  plan: 'free',
  isModerator: false,
  moderationPendingCount: 0,
};

beforeEach(() => {
  sessionStorage.clear();
});

describe('meCache — read/write round trip', () => {
  it('returns undefined when nothing is cached', () => {
    expect(readMeCache()).toBeUndefined();
  });

  it('round-trips a signed-in profile', () => {
    writeMeCache({ profile: PROFILE });
    expect(readMeCache()).toEqual({ profile: PROFILE });
  });

  it('round-trips a cached signed-out result (profile: null), distinct from "no cache"', () => {
    writeMeCache({ profile: null });
    expect(readMeCache()).toEqual({ profile: null });
  });
});

describe('meCache — invalidate', () => {
  it('clearMeCache removes a previously written entry', () => {
    writeMeCache({ profile: PROFILE });
    clearMeCache();
    expect(readMeCache()).toBeUndefined();
  });

  it('clearMeCache is a no-op when nothing was cached', () => {
    expect(() => clearMeCache()).not.toThrow();
    expect(readMeCache()).toBeUndefined();
  });
});

describe('meCache — malformed data never throws', () => {
  it('treats corrupt JSON as no cache', () => {
    sessionStorage.setItem('chuyocode:me:v1', '{not json');
    expect(readMeCache()).toBeUndefined();
  });

  it('treats a shape missing required Profile fields as no cache', () => {
    sessionStorage.setItem('chuyocode:me:v1', JSON.stringify({ profile: { name: 'x' } }));
    expect(readMeCache()).toBeUndefined();
  });

  it('treats a value with no "profile" key at all as no cache', () => {
    sessionStorage.setItem('chuyocode:me:v1', JSON.stringify({ somethingElse: true }));
    expect(readMeCache()).toBeUndefined();
  });
});

describe('meCache — storage failures never throw', () => {
  function throwingStorage(): Storage {
    return {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
      clear: () => {},
      key: () => null,
      length: 0,
    };
  }

  it('readMeCache swallows a throwing storage and returns undefined', () => {
    expect(readMeCache(throwingStorage())).toBeUndefined();
  });

  it('writeMeCache swallows a throwing storage', () => {
    expect(() => writeMeCache({ profile: PROFILE }, throwingStorage())).not.toThrow();
  });

  it('clearMeCache swallows a throwing storage', () => {
    expect(() => clearMeCache(throwingStorage())).not.toThrow();
  });
});
