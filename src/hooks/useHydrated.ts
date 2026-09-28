/**
 * useHydrated — `false` on every server render AND on the very first client
 * render (hydration itself), `true` from the first effect flush onward.
 *
 * Pairs with `useIsDesktop()` wherever a component must render TWO
 * STRUCTURALLY DIFFERENT subtrees for desktop vs. mobile (not just
 * different CSS) — see that hook's own header for why a plain
 * `isDesktop ? <A/> : <B/>` branch flashes the wrong one on a phone. The
 * fix (mobile layout pass, "no layout flash" priority):
 *
 *  - While `!hydrated` (server render + the first paint, before any JS has
 *    run): render BOTH subtrees, gated purely by CSS (`lg:hidden` /
 *    `hidden lg:contents`) — the browser applies those rules at first paint
 *    with zero JS, so whichever one is right for the ACTUAL viewport is
 *    what gets painted, on every device, with no flash. The other one is
 *    additionally `inert` (SSR-safe default: matches `useIsDesktop`'s own
 *    desktop-first default) so nothing in it is reachable by tab order or a
 *    screen reader before its own interactivity has attached — `inert`
 *    changes none of the CSS-driven visual result (unlike the native
 *    `hidden` attribute, which WOULD fight the `lg:` classes and reintroduce
 *    the very flash this hook exists to avoid — see the file this is used
 *    from for the full reasoning).
 *  - Once `hydrated` flips (a single `useEffect`, flushed synchronously by
 *    Testing Library's own `render()`/`act()` — existing component tests
 *    that query a single `data-testid` keep working unchanged), collapse to
 *    mounting ONLY the one `useIsDesktop()` says matches — exactly today's
 *    behavior, so no permanent duplicate ids/testids/focusable controls
 *    ever reach the live DOM past that first paint.
 */
import { useEffect, useState } from 'react';

export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);
  return hydrated;
}
