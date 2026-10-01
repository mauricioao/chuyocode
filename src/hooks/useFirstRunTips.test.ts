// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFirstRunTips } from './useFirstRunTips';

afterEach(() => window.localStorage.clear());

describe('useFirstRunTips', () => {
  it('activates step 0 after mount when never seen before', () => {
    const { result } = renderHook(() => useFirstRunTips('test:tips', 3));
    expect(result.current.step).toBe(0);
  });

  it('stays inactive when already marked seen', () => {
    window.localStorage.setItem('test:tips', '1');
    const { result } = renderHook(() => useFirstRunTips('test:tips', 3));
    expect(result.current.step).toBeNull();
  });

  it('next() advances through every step, then ends and persists "seen"', () => {
    const { result } = renderHook(() => useFirstRunTips('test:tips', 3));
    expect(result.current.step).toBe(0);

    act(() => result.current.next());
    expect(result.current.step).toBe(1);

    act(() => result.current.next());
    expect(result.current.step).toBe(2);

    act(() => result.current.next());
    expect(result.current.step).toBeNull();
    expect(window.localStorage.getItem('test:tips')).toBe('1');
  });

  it('dismiss() ends the tour immediately and persists "seen"', () => {
    const { result } = renderHook(() => useFirstRunTips('test:tips', 3));
    act(() => result.current.dismiss());
    expect(result.current.step).toBeNull();
    expect(window.localStorage.getItem('test:tips')).toBe('1');
  });

  it('a later mount with the same key never activates again', () => {
    const first = renderHook(() => useFirstRunTips('test:tips', 3));
    act(() => first.result.current.dismiss());

    const second = renderHook(() => useFirstRunTips('test:tips', 3));
    expect(second.result.current.step).toBeNull();
  });

  it('never throws when localStorage access fails, and still activates the tour', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('blocked');
      },
    });
    try {
      const { result } = renderHook(() => useFirstRunTips('test:tips', 3));
      expect(result.current.step).toBe(0);
      expect(() => act(() => result.current.dismiss())).not.toThrow();
    } finally {
      if (original) Object.defineProperty(window, 'localStorage', original);
    }
  });
});
