// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { renderHook } from '@testing-library/react';
import { useIsDesktop, DESKTOP_QUERY } from './useIsDesktop';

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
    media: DESKTOP_QUERY,
    addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => {
      listener = cb;
    },
    removeEventListener: () => {
      listener = null;
    },
  };
  window.matchMedia = vi.fn().mockReturnValue(mql);
  return {
    change(next: boolean) {
      matches = next;
      act(() => listener?.({ matches: next } as MediaQueryListEvent));
    },
  };
}

describe('useIsDesktop', () => {
  it('defaults to true (desktop) before mount, matching the SSR-safe default', () => {
    // No matchMedia stubbed at all — simulates the very first render.
    window.matchMedia = undefined as unknown as typeof window.matchMedia;
    const { result } = renderHook(() => useIsDesktop());
    expect(result.current).toBe(true);
  });

  it('reflects a narrow (mobile) viewport once mounted', () => {
    stubMatchMedia(false);
    const { result } = renderHook(() => useIsDesktop());
    expect(result.current).toBe(false);
  });

  it('reflects a wide (desktop) viewport once mounted', () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => useIsDesktop());
    expect(result.current).toBe(true);
  });

  it('updates on a later viewport change (resize/rotation)', () => {
    const stub = stubMatchMedia(true);
    const { result } = renderHook(() => useIsDesktop());
    expect(result.current).toBe(true);
    stub.change(false);
    expect(result.current).toBe(false);
  });

  it('queries the Tailwind default lg breakpoint', () => {
    let queried: string | null = null;
    window.matchMedia = vi.fn().mockImplementation((query: string) => {
      queried = query;
      return { matches: true, media: query, addEventListener: () => {}, removeEventListener: () => {} };
    });
    renderHook(() => useIsDesktop());
    expect(queried).toBe('(min-width: 1024px)');
  });
});
