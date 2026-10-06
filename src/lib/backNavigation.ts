/**
 * Back-navigation decision + wiring for `BackButton.astro`.
 *
 * Split the same way `exerciseFacets.ts` is: a pure decision function
 * ({@link shouldGoBack}, fully unit-testable, no DOM) and a thin DOM-wiring
 * function ({@link initBackButtons}) that reads `document.referrer` /
 * `window.history` and defers to it. Anything that could silently be WRONG
 * belongs in the function, never in an inline script body nobody can assert
 * on directly.
 *
 * A `BackButton` always renders a real `<a href={parentHref}>` first — it
 * works with scripting disabled, and it is what a middle-click / "open in
 * new tab" honours either way. This only progressively enhances the plain
 * click: when the previous page was same-origin and there IS a previous
 * entry in THIS TAB's history, it intercepts the click and calls
 * `history.back()` instead, which preserves scroll position and feels like
 * "back" rather than a forward navigation to the same content the `href`
 * happens to also point at.
 *
 * INGLÉS AREA RULES ("desktop" redesign PART 1, owner spec 2026-10-06):
 * `/[lang]/ingles` is the HOME of its own subroutes, not just another stop
 * `history.back()` can leave through. Plain same-origin `shouldGoBack` is
 * still exactly right for every brand/site page (unchanged below), but
 * inside the Inglés area it would do the wrong thing in two ways: on the HUB
 * itself, a visitor who arrived there FROM a deeper Inglés page (its own
 * `history.back()` landing them on the hub) would be sent right back into
 * Inglés by a second back-click instead of out to the ChuyoCode home its
 * `href` already points at; and on any OTHER Inglés page, a visitor who
 * arrived from the brand home, a shared link, or a new tab (same-origin
 * referrer, but NOT from inside Inglés) would be sent OUT of Inglés by
 * `history.back()` instead of following that page's own `href`, which
 * always points at its parent INSIDE Inglés. {@link shouldGoBackWithinArea}
 * is the one place that extra rule lives; {@link isInglesAreaPath} is the
 * ONE place the area's route list lives, reused by both that function and
 * `chromeVisibility.ts`'s hub detection.
 */

/**
 * Route roots (relative to the `/<lang>/` prefix every page already has)
 * that render the Inglés chrome (`theme="ingles"` on `BaseLayout`) — see
 * `Header.astro`'s own `ingles` prop. `ingles` itself covers the hub and
 * every one of its subroutes; the rest are the other routes that opt into
 * the same light scope outside that path (verified against every
 * `theme="ingles"` call site in `src/pages` at the time this list was
 * written — grep `theme="ingles"` to recheck if a new one is ever added).
 */
const INGLES_AREA_ROOTS = ['ingles', 'crear', 'mis-actividades', 'perfil', 'premium', 'auth/consentimiento'];

/**
 * True for `/<lang>/<root>` or `/<lang>/<root>/...`, for any
 * {@link INGLES_AREA_ROOTS} entry — i.e. "this path renders inside the
 * Inglés area". The leading `/<lang>` segment is always stripped first and
 * never itself compared, so this answers the same way for `es` and `en`.
 */
export function isInglesAreaPath(pathname: string): boolean {
  const segments = pathname.split('/').filter(Boolean);
  const rest = segments.slice(1).join('/');
  return INGLES_AREA_ROOTS.some((root) => rest === root || rest.startsWith(`${root}/`));
}

/**
 * True ONLY for the Inglés hub itself (`/<lang>/ingles`, with or without a
 * trailing slash) — never one of its subroutes. The hub's back button must
 * always follow its `href` to the ChuyoCode home; see this file's own
 * header for why.
 */
export function isInglesHubPath(pathname: string): boolean {
  const segments = pathname.split('/').filter(Boolean);
  return segments.length === 2 && segments[1] === 'ingles';
}

/** The attribute `initBackButtons` delegates clicks from. */
export const BACK_BUTTON_ATTR = 'data-back-button';

/**
 * True when the browser has a same-origin previous page AND at least one
 * earlier entry in this tab's history — the two conditions the task asks
 * for, kept as their own testable function rather than inlined into the
 * click handler.
 *
 * `historyLength <= 1` covers both "no history at all" (a fresh tab) and "no
 * PREVIOUS entry" (this is the first entry `history.back()` could land on
 * would be off the edge of history) — Chromium/Firefox/WebKit all count the
 * current entry itself, so `1` means "nothing before this page".
 */
export function shouldGoBack(
  referrer: string,
  currentOrigin: string,
  historyLength: number,
): boolean {
  if (historyLength <= 1) return false;
  if (!referrer) return false;
  try {
    return new URL(referrer).origin === currentOrigin;
  } catch {
    // A malformed `document.referrer` (some privacy extensions blank it to
    // a non-URL string rather than "") is treated as "no usable referrer" —
    // fail safe to the plain `<a href>` navigation, never throw.
    return false;
  }
}

/**
 * The full, area-aware back-navigation decision ("desktop" redesign PART 1
 * — see this file's own header). `currentPathname` is the page the back
 * button is ON, never the referrer.
 *
 *  - Not an Inglés-area page (brand/site): identical to {@link shouldGoBack}
 *    — same-origin referrer + a previous history entry. UNCHANGED.
 *  - The Inglés hub exactly: always `false` — its back button must always
 *    follow its own `href` out to the ChuyoCode home.
 *  - Any other Inglés-area page: {@link shouldGoBack}'s same two checks,
 *    PLUS the referrer itself must resolve to a path inside the Inglés
 *    area — otherwise a visitor arriving from outside Inglés would be sent
 *    back out by `history.back()` instead of following this page's own
 *    `href`, which always points at its parent inside Inglés.
 */
export function shouldGoBackWithinArea(
  referrer: string,
  currentOrigin: string,
  historyLength: number,
  currentPathname: string,
): boolean {
  if (!isInglesAreaPath(currentPathname)) {
    return shouldGoBack(referrer, currentOrigin, historyLength);
  }
  if (isInglesHubPath(currentPathname)) return false;
  if (!shouldGoBack(referrer, currentOrigin, historyLength)) return false;
  try {
    return isInglesAreaPath(new URL(referrer).pathname);
  } catch {
    return false;
  }
}

/**
 * Delegated click listener for every `[data-back-button]` anchor on the
 * page, meant to be bound ONCE for the whole session. `document` (and any
 * listener bound to it) survives Astro's View Transitions swaps, so every
 * page navigated to via the ClientRouter is already covered without a
 * `astro:after-swap` re-init — contrast `reveal.ts`, whose `.revealed` class
 * must be re-applied per swapped node because it mutates specific elements
 * rather than delegating from a stable ancestor.
 */
export function initBackButtons(doc: Document = document, win: Window = window): void {
  doc.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const target = event.target;
    if (!(target instanceof Element)) return;
    const link = target.closest(`a[${BACK_BUTTON_ATTR}]`);
    if (!link) return;

    if (
      shouldGoBackWithinArea(doc.referrer, win.location.origin, win.history.length, win.location.pathname)
    ) {
      event.preventDefault();
      win.history.back();
    }
  });
}
