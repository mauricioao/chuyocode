/**
 * Back-navigation decision + wiring for `BackButton.astro`.
 *
 * Split the same way `exerciseFacets.ts` is: pure decision functions
 * ({@link shouldGoBack}, {@link shouldGoBackWithinArea}, {@link resolvePreviousPath},
 * fully unit-testable, no DOM) and thin DOM-wiring functions
 * ({@link initBackButtons}, {@link trackPageVisit}) that read
 * `document`/`window`/`sessionStorage` and defer to them. Anything that
 * could silently be WRONG belongs in a pure function, never in an inline
 * script body nobody can assert on directly.
 *
 * A `BackButton` always renders a real `<a href={parentHref}>` first — it
 * works with scripting disabled, and it is what a middle-click / "open in
 * new tab" honours either way. This only progressively enhances the plain
 * click: when there IS a genuinely previous in-app screen AND a previous
 * entry in THIS TAB's history, it intercepts the click and calls
 * `history.back()` instead, which preserves scroll position and feels like
 * "back" rather than a forward navigation to the same content the `href`
 * happens to also point at.
 *
 * TRACKED PREVIOUS PATH, NOT `document.referrer` (bugfix, 2026-10-06, owner
 * report: "el botón de volver me manda a la pantalla principal de
 * ChuyoCode en vez de a la pantalla anterior que vi"). `document.referrer`
 * is set ONCE per real (full) document load and Astro's `<ClientRouter>`
 * swaps pages WITHOUT a new document — so after the very first client-side
 * navigation in a tab, `document.referrer` is PERMANENTLY stale for the rest
 * of that tab's session (confirmed with a real browser, Playwright,
 * 2026-10-06: a `goto` -> 3 further in-app link clicks left
 * `document.referrer` exactly as empty as it was after the very first
 * `goto`). Every decision below used to read it directly, which is why a
 * visitor who entered Inglés from the ChuyoCode home and then browsed
 * several pages deep would see their back button ignore the real previous
 * screen and fall through to a page's own static `href` instead — on
 * `/[lang]/mis-actividades` and `/[lang]/crear` that `href` is literally
 * `/[lang]` (the ChuyoCode home, now fixed alongside this to `/[lang]/ingles`
 * — see those two pages' own `backHref`), which is the exact bug reported.
 *
 * {@link trackPageVisit} fixes this at the source: called on every real page
 * entry (first load AND every `astro:page-load`, from `BaseLayout.astro`'s
 * own script, BEFORE a visitor could possibly click anything on the new
 * page), it keeps a two-slot sliding window in `sessionStorage` — "what's
 * current" and "what was current right before this" — so
 * {@link readTrackedPreviousPath} always answers "the screen this visitor
 * actually just saw", regardless of how many client-side navigations
 * happened since the tab's last full load. A same-path write (a plain
 * reload, or a `prefers-reduced-motion`-style re-render with no real
 * navigation) is a deliberate no-op, so an F5 on the current page never
 * overwrites the real previous screen with itself. `document.referrer` is
 * kept ONLY as {@link resolvePreviousPath}'s fallback for the very first
 * page of a session (direct visit, QR scan, external link — nothing tracked
 * yet).
 *
 * KNOWN LIMITATION (documented, not fixed here — out of scope for a sliding
 * two-slot window): pressing the browser's OWN back/forward buttons also
 * fires `astro:page-load`, which this module cannot distinguish from a
 * forward link click. Using this page's own `BackButton` immediately after
 * a NATIVE back/forward press can therefore recompute "previous" one step
 * off. This is rare in practice (it requires chaining a native history
 * action with this app's own back control) and considered an acceptable
 * trade-off against a full history-stack implementation.
 *
 * SEARCH/FILTER CHANGES ON THE SAME LIST (owner spec: must not create a back
 * step to a stale old filter, "unless that is genuinely the previous
 * screen"): every filter/search change on a list page here is a REAL
 * navigation (a GET form submit or a plain link, each its own history
 * entry — confirmed live for `SearchFilter.astro`'s own "server" mode: its
 * submit IS intercepted by the `<ClientRouter>`, same as a link click, and
 * pushes a new entry). The sliding window above therefore already does the
 * right thing with NO special-casing: the list state recorded as "previous"
 * for whatever comes after it is always the exact query the visitor was
 * looking at when they left — never an older, already-abandoned filter —
 * because `history.back()` itself (called only once we decide to) lands on
 * that exact real entry, not an invented one.
 *
 * INGLÉS AREA RULES ("desktop" redesign PART 1, owner spec 2026-10-06):
 * `/[lang]/ingles` is the HOME of its own subroutes, not just another stop
 * `history.back()` can leave through. Plain `shouldGoBack` is still exactly
 * right for every brand/site page (unchanged below), but inside the Inglés
 * area it would do the wrong thing in two ways: on the HUB itself, a visitor
 * who arrived there FROM a deeper Inglés page (its own `history.back()`
 * landing them on the hub) would be sent right back into Inglés by a second
 * back-click instead of out to the ChuyoCode home its `href` already points
 * at; and on any OTHER Inglés page, a visitor who arrived from the brand
 * home, a shared link, or a new tab (a previous screen that is NOT itself
 * inside Inglés) would be sent OUT of Inglés by `history.back()` instead of
 * following that page's own `href`, which always points at its parent
 * INSIDE Inglés. {@link shouldGoBackWithinArea} is the one place that extra
 * rule lives; {@link isInglesAreaPath} is the ONE place the area's route
 * list lives, reused by both that function and `chromeVisibility.ts`'s hub
 * detection.
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

// ---- Tracked previous path (bugfix, 2026-10-06) — see this file's own
// header for the full "why". `sessionStorage`, never `localStorage`: this is
// about ONE browsing session, not a "remember forever" feature. ----

const CURRENT_PATH_STORAGE_KEY = 'chuyo-nav-current-path';
const PREVIOUS_PATH_STORAGE_KEY = 'chuyo-nav-previous-path';

/**
 * Call on every real page entry — first load AND every `astro:page-load`
 * (`BaseLayout.astro`'s own script) — BEFORE a visitor could possibly click
 * a back button on the new page. Slides a two-slot window forward: whatever
 * was "current" becomes "previous", and `pathname` (the FULL path, query
 * string included — see this file's own header on search/filter changes)
 * becomes the new "current". A write where `pathname` already EQUALS the
 * stored "current" (a plain reload, not a real navigation) is a deliberate
 * no-op, so an F5 can never overwrite the real previous screen with the
 * current one.
 */
export function trackPageVisit(
  pathname: string,
  storage: Pick<Storage, 'getItem' | 'setItem'> = sessionStorage,
): void {
  try {
    const lastCurrent = storage.getItem(CURRENT_PATH_STORAGE_KEY);
    if (lastCurrent === pathname) return;
    storage.setItem(PREVIOUS_PATH_STORAGE_KEY, lastCurrent ?? '');
    storage.setItem(CURRENT_PATH_STORAGE_KEY, pathname);
  } catch {
    // Best-effort — a visitor who blocks storage just falls back to
    // `document.referrer` for the whole session (see `resolvePreviousPath`).
  }
}

/** Read whatever {@link trackPageVisit} last recorded as "previous", `try`/`catch`-guarded. `null` for nothing tracked yet (the very first page of this tab's session). */
export function readTrackedPreviousPath(
  storage: Pick<Storage, 'getItem'> = sessionStorage,
): string | null {
  try {
    const value = storage.getItem(PREVIOUS_PATH_STORAGE_KEY);
    return value ? value : null;
  } catch {
    return null;
  }
}

/**
 * The one previous-path value every decision below is built from: the
 * tracked path when {@link trackPageVisit} has recorded one (same-origin by
 * construction — it is only ever written from this site's own
 * `location.pathname`/`location.search`), or `document.referrer`'s own path
 * as a fallback for the very first page of a session (a direct visit, a QR
 * scan, an external link — nothing tracked yet). `null` when neither source
 * gives a usable, same-origin answer.
 */
export function resolvePreviousPath(
  trackedPreviousPath: string | null,
  referrer: string,
  currentOrigin: string,
): string | null {
  if (trackedPreviousPath) return trackedPreviousPath;
  if (!referrer) return null;
  try {
    const url = new URL(referrer);
    return url.origin === currentOrigin ? url.pathname : null;
  } catch {
    // A malformed `document.referrer` (some privacy extensions blank it to
    // a non-URL string rather than "") is treated as "no usable referrer" —
    // fail safe to the plain `<a href>` navigation, never throw.
    return null;
  }
}

/**
 * True when there IS a genuinely previous in-app screen AND at least one
 * earlier entry in this tab's history — the two conditions the task asks
 * for, kept as their own testable function rather than inlined into the
 * click handler.
 *
 * `historyLength <= 1` covers both "no history at all" (a fresh tab) and "no
 * PREVIOUS entry" (this is the first entry `history.back()` could land on
 * would be off the edge of history) — Chromium/Firefox/WebKit all count the
 * current entry itself, so `1` means "nothing before this page".
 */
export function shouldGoBack(previousPath: string | null, historyLength: number): boolean {
  if (historyLength <= 1) return false;
  return previousPath !== null;
}

/**
 * The full, area-aware back-navigation decision ("desktop" redesign PART 1
 * — see this file's own header). `currentPathname` is the page the back
 * button is ON; `previousPath` is {@link resolvePreviousPath}'s own answer
 * for "the screen this visitor actually just saw", never a raw referrer.
 *
 *  - Not an Inglés-area page (brand/site): identical to {@link shouldGoBack}
 *    — a known previous screen + a previous history entry. UNCHANGED.
 *  - The Inglés hub exactly: always `false` — its back button must always
 *    follow its own `href` out to the ChuyoCode home.
 *  - Any other Inglés-area page: {@link shouldGoBack}'s same two checks,
 *    PLUS the previous screen itself must be inside the Inglés area —
 *    otherwise a visitor arriving from outside Inglés would be sent back
 *    out by `history.back()` instead of following this page's own `href`,
 *    which always points at its parent inside Inglés.
 */
export function shouldGoBackWithinArea(
  previousPath: string | null,
  historyLength: number,
  currentPathname: string,
): boolean {
  if (!isInglesAreaPath(currentPathname)) {
    return shouldGoBack(previousPath, historyLength);
  }
  if (isInglesHubPath(currentPathname)) return false;
  if (!shouldGoBack(previousPath, historyLength)) return false;
  return isInglesAreaPath(previousPath!);
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
  // CAPTURE PHASE — bugfix, 2026-10-06, found while verifying the referrer
  // fix live in a real browser: `ClientRouter.astro`'s OWN click listener
  // (`node_modules/astro/components/ClientRouter.astro`) is also bound to
  // `document`, in the BUBBLE phase, and registered EARLIER in the page
  // (the component renders in `<head>`, this script runs in the body) — so
  // on a bubble-phase listener here, Astro's own handler always ran FIRST,
  // already called its own `preventDefault()` and started its own forward
  // `navigate()`, and by the time THIS listener's `event.defaultPrevented`
  // check ran, it was already `true` — `history.back()` below NEVER
  // actually fired, for ANY back button, regardless of the referrer/
  // tracked-path logic being correct. Capture-phase listeners on the SAME
  // node always run before bubble-phase ones, independent of registration
  // order, so binding here instead guarantees this runs BEFORE Astro's own
  // handler — which deliberately checks `ev.defaultPrevented` itself
  // (`ClientRouter.astro` line ~92) as its own escape hatch for exactly
  // this kind of app-level interception.
  doc.addEventListener(
    'click',
    (event) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest(`a[${BACK_BUTTON_ATTR}]`);
      if (!link) return;

      const previousPath = resolvePreviousPath(
        readTrackedPreviousPath(win.sessionStorage),
        doc.referrer,
        win.location.origin,
      );

      if (shouldGoBackWithinArea(previousPath, win.history.length, win.location.pathname)) {
        event.preventDefault();
        win.history.back();
      }
    },
    true,
  );
}
