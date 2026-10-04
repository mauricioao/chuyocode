// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { renderHook } from '@testing-library/react';
import { usePrefersReducedMotion, REDUCED_MOTION_QUERY } from './usePrefersReducedMotion';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function stubMatchMedia(initialMatches: boolean) {
  let matches = initialMatches;
  let listener: ((e: MediaQueryListEvent) => void) | null = null;
  const mql = {
    get matches() {
      return matches;
    },
    media: REDUCED_MOTION_QUERY,
    addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => {
      listener = cb;
    },
    removeEventListener: () => {
      listener = null;
    },
  };
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mql));
  return {
    change(next: boolean) {
      matches = next;
      act(() => listener?.({ matches: next } as MediaQueryListEvent));
    },
  };
}

describe('usePrefersReducedMotion', () => {
  it('defaults to false before mount (no matchMedia available yet)', () => {
    vi.stubGlobal('matchMedia', undefined);
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);
  });

  it('reflects no preference once mounted', () => {
    stubMatchMedia(false);
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);
  });

  it('reflects a reduced-motion preference once mounted', () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(true);
  });

  it('updates on a later OS-level preference change', () => {
    const stub = stubMatchMedia(false);
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);
    stub.change(true);
    expect(result.current).toBe(true);
  });

  it('queries the standard prefers-reduced-motion media feature', () => {
    let queried: string | null = null;
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => {
        queried = query;
        return { matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} };
      }),
    );
    renderHook(() => usePrefersReducedMotion());
    expect(queried).toBe('(prefers-reduced-motion: reduce)');
  });
});
