/**
 * usePrefersReducedMotion — the shared `prefers-reduced-motion: reduce`
 * check for a component whose motion is driven from JS (a `setTimeout`-timed
 * animation, not a pure CSS transition/`motion-reduce:` class alone).
 * `QuizWheel`'s spin is the first caller: its ~3s eased rotation needs to
 * know, in JS, how long to actually wait before resolving the spin.
 *
 * `BottomSheet.tsx` already has an identical local `usePrefersReducedMotion`
 * (its own drag-cancel snap-back) — kept local there rather than migrated
 * here, since touching a working, already-tested component is out of scope
 * for this batch. New callers should use this shared copy instead of adding
 * a third one.
 *
 * SSR CONTRACT: `false` (no preference) on the server/first render —
 * `window.matchMedia` does not exist during Astro's server render, so there
 * is nothing to read yet; the effect below reads the real value once
 * mounted and subscribes to later OS-level changes.
 */
import { useEffect, useState } from 'react';

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mql = window.matchMedia(REDUCED_MOTION_QUERY);
    setReduced(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mql.addEventListener?.('change', onChange);
    return () => mql.removeEventListener?.('change', onChange);
  }, []);

  return reduced;
}
