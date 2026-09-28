// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useHydrated } from './useHydrated';

describe('useHydrated', () => {
  it('is false during a server render', () => {
    let seen: boolean | null = null;
    function Probe() {
      seen = useHydrated();
      return null;
    }
    renderToStaticMarkup(<Probe />);
    expect(seen).toBe(false);
  });

  it('is true once mounted on the client (Testing Library flushes the effect synchronously)', () => {
    const { result } = renderHook(() => useHydrated());
    expect(result.current).toBe(true);
  });
});
