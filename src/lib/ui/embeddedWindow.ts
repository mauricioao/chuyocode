/**
 * embeddedWindow — the one predicate every window route (the community
 * catalog, the practice page, the create picker, the editor) calls to decide
 * which of its two SSR shapes to render (window-manager architecture, see
 * `@lib/deskWindowsState`'s own header for why):
 *
 *   - EMBEDDED (this file's `true`): the request is for the window's own
 *     content, loaded by the host page's `<iframe>` — render ONLY
 *     `DeskWindow` filling the iframe, no desk, no site chrome, no
 *     `ClientRouter` (so in-window navigations stay real iframe navigations
 *     that keep sending `Sec-Fetch-Dest: iframe`).
 *   - HOST (`false`, signed-in visitor): render the desk plus the
 *     window-manager container, which then requests the SAME route again
 *     with `?ventana=1` for its initial window — see
 *     `@lib/ui/deskWindowManager.ts`'s own header.
 *
 * TWO independent signals, either one is enough:
 *   - `?ventana=1` — set by the window manager itself when it builds an
 *     `iframe.src`, so the very FIRST request for a window is unambiguous
 *     even before any navigation has happened inside the frame yet.
 *   - `Sec-Fetch-Dest: iframe` — sent by the browser on every subsequent
 *     navigation INSIDE that iframe (a filter link, pagination, a card,
 *     "Duplicar" -> the editor, a server redirect) even though none of them
 *     carry `?ventana=1` themselves. This is what keeps embedded mode
 *     "sticky" across in-window navigation without the window manager (or
 *     every single in-window link) having to thread the query param through
 *     by hand.
 *
 * Pure and dependency-free (`URL`/`Headers` are both ambient web platform
 * APIs available in Astro's SSR runtime and in a plain unit test alike) —
 * same posture as `@lib/access`'s own gate predicates.
 */
export function isEmbeddedWindowRequest(url: URL, headers: Headers): boolean {
  return url.searchParams.get('ventana') === '1' || headers.get('sec-fetch-dest') === 'iframe';
}
