/**
 * useIsDesktop — the ONE JS-side breakpoint check behind the "Mobile
 * layout" pass, wherever a component needs a real branch between two
 * DIFFERENT interaction models (not just different CSS) — e.g. the practice
 * page's pinch/pan camera vs. its desktop zoom toolbar, or the editor's
 * properties bottom sheet vs. its desktop side column. A CSS-only
 * `hidden lg:block` toggle is wrong for those: it would mount BOTH versions
 * at once (duplicate inputs/ids, doubled event listeners), so the branch has
 * to happen in JS instead.
 *
 * Matches Tailwind's default `lg` breakpoint (`(min-width: 1024px)` — no
 * custom breakpoints are defined in `src/styles/global.css`), so "desktop"
 * here means exactly what every existing `lg:` class in this codebase
 * already means.
 *
 * SSR-SAFE DEFAULT: `true` (desktop) before hydration — `window.matchMedia`
 * does not exist during Astro's server render, and defaulting to the
 * DESKTOP layout means a phone visitor briefly sees the (already-approved,
 * unchanged) desktop markup for one paint before hydration flips it, rather
 * than the reverse (a desktop visitor never seeing a phone-only control
 * flash on-screen). The effect below reads the real value and any later
 * resize/orientation change on the client.
 */
import { useEffect, useState } from 'react';

export const DESKTOP_QUERY = '(min-width: 1024px)';

export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(true);

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
