/**
 * useIsDesktop — the ONE JS-side breakpoint check behind the "Mobile
 * layout" pass, for BEHAVIOR only: which pointer/gesture handlers to attach,
 * which callback a shared child gets, whether drag-to-undock is armed — never
 * which JSX/DOM structure to mount. A component that needs a real STRUCTURAL
 * branch (two genuinely different subtrees — e.g. the practice page's
 * pinch/pan camera vs. its desktop zoom toolbar, or the editor's properties
 * bottom sheet vs. its desktop side column) pairs this with `useHydrated()`
 * instead (see that hook's own header) — reading `isDesktop` alone is not
 * enough to pick which subtree to render without flashing the wrong one on a
 * phone's first paint.
 *
 * Matches Tailwind's default `lg` breakpoint (`(min-width: 1024px)` — no
 * custom breakpoints are defined in `src/styles/global.css`), so "desktop"
 * here means exactly what every existing `lg:` class in this codebase
 * already means.
 *
 * SSR CONTRACT: `true` (desktop) on the server — `window.matchMedia` does
 * not exist during Astro's server render, so there is no real value to read
 * yet. On the CLIENT, unlike a plain `useState(true)` + effect, the very
 * first render already reads `matchMedia` SYNCHRONOUSLY (the lazy `useState`
 * initializer below) instead of waiting for a post-commit effect — safe to
 * do precisely because this hook drives BEHAVIOR only: nothing in this
 * codebase renders different DOM based on `isDesktop` directly any more (see
 * above), so an initializer value that differs from the server's `true`
 * default can never itself cause a hydration mismatch — there is no markup
 * for it to disagree with. The effect below only keeps handling a LATER
 * resize/orientation change; the mount-time `matchMedia` call it also makes
 * is redundant with the initializer but kept so `addEventListener` still
 * attaches to a fresh `MediaQueryList` for that live-update duty.
 */
import { useEffect, useState } from 'react';

export const DESKTOP_QUERY = '(min-width: 1024px)';

function readIsDesktop(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
  return window.matchMedia(DESKTOP_QUERY).matches;
}

export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(readIsDesktop);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mql = window.matchMedia(DESKTOP_QUERY);
    setIsDesktop(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mql.addEventListener?.('change', onChange);
    return () => mql.removeEventListener?.('change', onChange);
  }, []);

  return isDesktop;
}
