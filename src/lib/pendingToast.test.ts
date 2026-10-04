// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { writePendingToast, readAndClearPendingToast } from './pendingToast';

beforeEach(() => {
  sessionStorage.clear();
});

describe('pendingToast — read/write round trip', () => {
  it('returns undefined when nothing is pending', () => {
    expect(readAndClearPendingToast()).toBeUndefined();
  });

  it('round-trips a written message', () => {
    writePendingToast('Tu cuenta se eliminó correctamente.');
    expect(readAndClearPendingToast()).toBe('Tu cuenta se eliminó correctamente.');
  });
});

describe('pendingToast — one-shot read', () => {
  it('clears the message after reading it once', () => {
    writePendingToast('listo');
    readAndClearPendingToast();
    expect(readAndClearPendingToast()).toBeUndefined();
  });

  it('a later write after a read is readable again', () => {
    writePendingToast('first');
    readAndClearPendingToast();
    writePendingToast('second');
    expect(readAndClearPendingToast()).toBe('second');
  });
});

describe('pendingToast — storage failures never throw', () => {
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

  it('readAndClearPendingToast swallows a throwing storage and returns undefined', () => {
    expect(readAndClearPendingToast(throwingStorage())).toBeUndefined();
  });

  it('writePendingToast swallows a throwing storage', () => {
    expect(() => writePendingToast('x', throwingStorage())).not.toThrow();
  });
});
