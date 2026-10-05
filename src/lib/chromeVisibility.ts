/**
 * chromeVisibility — the "smart" header/footer visibility feature (owner
 * spec: scroll-direction header + reveal-at-the-bottom footer, with a
 * separate, more aggressive "immersive" behavior for Inglés pages).
 *
 * Split the same way `backNavigation.ts`/`reveal.ts` are: a pure state
 * machine ({@link reduceChromeVisibility}, fully unit-testable, no DOM) and a
 * thin DOM-wiring function ({@link initChromeVisibility}) that turns real
 * browser events into calls into it. Every RULE lives in the reducer, never
 * in the wiring — the wiring only measures geometry and translates raw
 * events into the reducer's small vocabulary.
 *
 * TWO MODES, picked per page from `<html data-theme="ingles">` (BaseLayout's
 * `theme` prop; see that file's own header):
 *
 *  - SITE — every other page. The header is always visible at/near the top;
 *    scrolling down hides it, a small cumulative scroll up (~8px) shows it
 *    again.
 *  - INGLÉS (immersive) — header and footer BOTH start hidden on every page
 *    entry, even at the top (no flash on first paint — see the inline head
 *    script in `BaseLayout.astro`). Same up-shows/down-hides rule as SITE,
 *    but with NO "always visible at the top" pin, PLUS: tapping the page
 *    content hides both, and the header floats over the content (fixed, not
 *    sticky — see `global.css`'s own `[data-chrome-mode='ingles']` rule) so
 *    hiding it never leaves an empty band.
 *
 * The footer rule is shared by both modes: it stays in normal document flow
 * (never removed/fixed) but fades in only once the visitor is at the very
 * bottom (~2px) AND either pushes a little further (a wheel/swipe attempt
 * past the bottom) or dwells there for ~1s — which also covers the End key,
 * a scrollbar drag, and a page too short to scroll at all. Once it has
 * scrolled fully back out of view, it resets to hidden so the next visit to
 * the bottom animates in again.
 *
 * PROGRESSIVE ENHANCEMENT: every one of these rules is additive CSS, gated
 * behind a `data-chrome-js` marker this module (and a tiny inline
 * head script, for the very first paint) sets on `<html>` — see
 * `global.css`'s own header for the exact selectors. No JS / JS failed means
 * none of that CSS activates, so the header/footer render fully visible
 * exactly as they always have.
 */

// ---------------------------------------------------------------------------
// Pure state machine
// ---------------------------------------------------------------------------

export type ChromeMode = 'site' | 'ingles';

export interface ChromeState {
  mode: ChromeMode;
  headerVisible: boolean;
  footerVisible: boolean;
  /** True while the mobile menu or the account dropdown is open — pins the header visible. */
  menuOpen: boolean;
  /** The last measured scroll position, or `null` right after a `pageEnter` (next `scroll` only calibrates). */
  lastY: number | null;
  /** Cumulative upward delta (px) since the last downward move — compared against {@link UP_SHOW_THRESHOLD_PX}. */
  upAccum: number;
  atTop: boolean;
  atBottom: boolean;
  /** `performance`/`Date.now()`-style timestamp the page last arrived at the bottom, or `null` when not currently there. */
  footerDwellStart: number | null;
}

export type ChromeEvent =
  | { type: 'pageEnter'; mode: ChromeMode }
  | {
      type: 'scroll';
      y: number;
      viewportHeight: number;
      docHeight: number;
      headerHeight: number;
      /** The footer's `getBoundingClientRect().top` — used only to detect "fully scrolled out of view" (see the reducer). */
      footerTop: number;
      now: number;
    }
  | { type: 'wheelAttempt'; deltaY: number }
  | { type: 'contentPointerDown' }
  | { type: 'focusIn'; region: 'header' | 'footer' | 'other' }
  | { type: 'topEdgeHover' }
  | { type: 'menuOpen'; open: boolean }
  | { type: 'tick'; now: number };

/** Cumulative upward scroll (px) that re-shows a hidden header. */
export const UP_SHOW_THRESHOLD_PX = 8;
/** Distance (px) from the true bottom still counted as "at the bottom". */
export const BOTTOM_EPSILON_PX = 2;
/** Mouse distance (px) from the top edge that counts as a hover-to-reveal (desktop, unscrollable-page fallback). */
export const TOP_EDGE_HOVER_PX = 16;
/** Dwell time (ms) at the bottom before the footer reveals on its own. */
export const FOOTER_DWELL_MS = 1000;

export function createInitialChromeState(mode: ChromeMode = 'site'): ChromeState {
  return {
    mode,
    // SITE defaults to visible (today's expectation); INGLÉS starts hidden
    // on every page entry, even at the top — the task's own "no flash" rule.
    headerVisible: mode === 'site',
    footerVisible: false,
    menuOpen: false,
    lastY: null,
    upAccum: 0,
    atTop: true,
    atBottom: false,
    footerDwellStart: null,
  };
}

/** `headerVisible` can never go false while the menu/dropdown guard is up. */
function withMenuGuard(state: ChromeState, headerVisible: boolean): boolean {
  return state.menuOpen ? true : headerVisible;
}

export function reduceChromeVisibility(state: ChromeState, event: ChromeEvent): ChromeState {
  switch (event.type) {
    case 'pageEnter':
      return createInitialChromeState(event.mode);

    case 'scroll':
      return reduceScroll(state, event);

    case 'wheelAttempt': {
      let next = state;
      // Pages that cannot scroll (and the top/bottom edge of any page) never
      // fire a `scroll` event for this — the wheel/swipe ATTEMPT itself is
      // the only signal.
      if (state.atTop && event.deltaY < 0) {
        next = { ...next, headerVisible: withMenuGuard(next, true) };
      }
      if (state.atBottom && event.deltaY > 0) {
        next = { ...next, footerVisible: true };
      }
      return next;
    }

    case 'topEdgeHover':
      return state.atTop ? { ...state, headerVisible: withMenuGuard(state, true) } : state;

    case 'contentPointerDown':
      // INGLÉS-only rule (owner spec): a tap/click on <main> hides both. No
      // rule asks for this in SITE mode.
      return state.mode === 'ingles'
        ? { ...state, headerVisible: withMenuGuard(state, false), footerVisible: false }
        : state;

    case 'focusIn':
      if (event.region === 'header') return { ...state, headerVisible: true };
      if (event.region === 'footer') return { ...state, footerVisible: true };
      return state;

    case 'menuOpen':
      // Opening shows the header immediately (it could otherwise be hidden
      // with the menu it is supposed to contain); closing only releases the
      // guard — it does not force a hide.
      return event.open ? { ...state, menuOpen: true, headerVisible: true } : { ...state, menuOpen: false };

    case 'tick': {
      const dwelled =
        state.atBottom &&
        !state.footerVisible &&
        state.footerDwellStart !== null &&
        event.now - state.footerDwellStart >= FOOTER_DWELL_MS;
      return dwelled ? { ...state, footerVisible: true } : state;
    }

    default:
      return state;
  }
}

function reduceScroll(state: ChromeState, event: Extract<ChromeEvent, { type: 'scroll' }>): ChromeState {
  const { y, viewportHeight, docHeight, headerHeight, footerTop, now } = event;

  const atTop = y <= 0;
  const atBottom = docHeight - y - viewportHeight <= BOTTOM_EPSILON_PX;
  const footerFullyOutOfView = footerTop >= viewportHeight;

  // The first reading after `pageEnter` (or the very first one ever) only
  // calibrates `lastY` — it must never be read as a downward move from 0,
  // which would otherwise hide a SITE header the moment a page loads
  // already scrolled down.
  const isCalibration = state.lastY === null;
  const deltaY = isCalibration ? 0 : y - state.lastY!;

  let headerVisible = state.headerVisible;
  let upAccum = state.upAccum;

  if (!isCalibration) {
    if (deltaY > 0) {
      // Scrolling down hides it outright — the SITE "near the top" pin below
      // can still override this.
      headerVisible = false;
      upAccum = 0;
    } else if (deltaY < 0) {
      upAccum += -deltaY;
      if (upAccum >= UP_SHOW_THRESHOLD_PX) {
        headerVisible = true;
        upAccum = 0;
      }
    }
  }

  // SITE mode only: always visible at/near the top, regardless of direction.
  // INGLÉS has no such pin (owner spec).
  if (state.mode === 'site' && y <= headerHeight) {
    headerVisible = true;
  }

  let footerVisible = state.footerVisible;
  let footerDwellStart = state.footerDwellStart;

  if (atBottom && !state.atBottom) {
    footerDwellStart = now; // just arrived — start the dwell clock
  } else if (!atBottom) {
    footerDwellStart = null;
  }

  if (footerFullyOutOfView && footerVisible) {
    // Scrolled all the way back past it — the next visit to the bottom
    // should animate in again from scratch.
    footerVisible = false;
  }

  return {
    ...state,
    lastY: y,
    atTop,
    atBottom,
    headerVisible: withMenuGuard(state, headerVisible),
    footerVisible,
    upAccum,
    footerDwellStart,
  };
}

// ---------------------------------------------------------------------------
// DOM wiring
// ---------------------------------------------------------------------------

/** Marks that the behavior is active — see `global.css`'s progressive-enhancement gate. Mirrors the inline head script in `BaseLayout.astro` (which sets this same attribute for the very first paint, before this module has even loaded). */
export const CHROME_JS_ATTR = 'data-chrome-js';
export const CHROME_MODE_ATTR = 'data-chrome-mode';
export const HEADER_VISIBLE_ATTR = 'data-header-visible';
export const FOOTER_VISIBLE_ATTR = 'data-footer-visible';
/** `Header.astro` / `Footer.astro` carry these so CSS and this script can find them without caring where the chrome wrappers put them (a `display:contents` wrapper cannot itself be positioned/faded — see `BaseLayout.astro`'s own header). */
export const HEADER_SELECTOR = '[data-chrome-header]';
export const FOOTER_SELECTOR = '[data-chrome-footer]';
/** Custom property `BackButton.astro` reads for its `lg:sticky` offset — see that file's own comment. */
export const HEADER_OFFSET_VAR = '--chrome-header-offset';
/** Approximates today's literal `top-20` gap below the ~4rem header once JS takes over the offset. */
const HEADER_OFFSET_GAP_PX = 16;
/** How often `tick` is dispatched while waiting out the footer's dwell — well under the ~1s window so the reveal never feels late. */
const DWELL_TICK_MS = 150;

function detectMode(doc: Document): ChromeMode {
  return doc.documentElement.getAttribute('data-theme') === 'ingles' ? 'ingles' : 'site';
}

let wired = false;

/**
 * Wires every rule above to real browser events. Safe to call more than
 * once — only the FIRST call binds anything (never register duplicate
 * listeners, even across repeated calls); the mode is re-picked on every
 * page entry regardless, including the first one.
 */
export function initChromeVisibility(doc: Document = document, win: Window = window): void {
  if (wired) return;
  wired = true;

  const html = doc.documentElement;
  let state = createInitialChromeState(detectMode(doc));
  let frameScheduled = false;

  function apply(): void {
    html.setAttribute(CHROME_JS_ATTR, '');
    html.setAttribute(CHROME_MODE_ATTR, state.mode);
    html.setAttribute(HEADER_VISIBLE_ATTR, String(state.headerVisible));
    html.setAttribute(FOOTER_VISIBLE_ATTR, String(state.footerVisible));

    // BackButton's sticky offset follows the header's CURRENT contribution
    // to the top of the page: its rendered height while visible, 0 while
    // hidden/overlaying, plus the same small gap the old literal `top-20`
    // approximated (see that file's own header).
    const header = doc.querySelector<HTMLElement>(HEADER_SELECTOR);
    const headerHeight = header?.getBoundingClientRect().height ?? 0;
    const offset = (state.headerVisible ? headerHeight : 0) + HEADER_OFFSET_GAP_PX;
    html.style.setProperty(HEADER_OFFSET_VAR, `${offset}px`);
  }

  function dispatch(event: ChromeEvent): void {
    state = reduceChromeVisibility(state, event);
    apply();
  }

  function measureAndDispatchScroll(): void {
    frameScheduled = false;
    // One read phase (geometry only, no writes) per animation frame — `apply()`,
    // the only place this wiring writes to the DOM, always runs after it.
    const header = doc.querySelector<HTMLElement>(HEADER_SELECTOR);
    const footer = doc.querySelector<HTMLElement>(FOOTER_SELECTOR);
    dispatch({
      type: 'scroll',
      y: win.scrollY,
      viewportHeight: win.innerHeight,
      docHeight: doc.documentElement.scrollHeight,
      headerHeight: header?.getBoundingClientRect().height ?? 0,
      footerTop: footer?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY,
      now: Date.now(),
    });
  }

  function scheduleMeasure(): void {
    if (frameScheduled) return;
    frameScheduled = true;
    win.requestAnimationFrame(measureAndDispatchScroll);
  }

  function handlePageEnter(): void {
    dispatch({ type: 'pageEnter', mode: detectMode(doc) });
    measureAndDispatchScroll();
  }

  // ---- scroll / resize (throttled to one measurement per frame) ----------
  doc.addEventListener('scroll', scheduleMeasure, { passive: true });
  win.addEventListener('resize', scheduleMeasure, { passive: true });

  // ---- wheel + touch "attempt" (pages that cannot scroll, or at an edge) -
  doc.addEventListener(
    'wheel',
    (event) => dispatch({ type: 'wheelAttempt', deltaY: event.deltaY }),
    { passive: true },
  );

  let lastTouchY: number | null = null;
  doc.addEventListener(
    'touchstart',
    (event) => {
      lastTouchY = event.touches[0]?.clientY ?? null;
    },
    { passive: true },
  );
  doc.addEventListener(
    'touchmove',
    (event) => {
      const currentY = event.touches[0]?.clientY;
      if (lastTouchY === null || currentY === undefined) return;
      // A swipe where the finger moves UP (currentY < lastTouchY) is a
      // "scroll down" intent — the same sign convention `wheel`'s `deltaY`
      // already uses — so it collapses onto the exact same reducer action.
      dispatch({ type: 'wheelAttempt', deltaY: lastTouchY - currentY });
      lastTouchY = currentY;
    },
    { passive: true },
  );

  // ---- desktop-only top-edge hover (same unscrollable-page fallback) -----
  doc.addEventListener(
    'mousemove',
    (event) => {
      if (event.clientY <= TOP_EDGE_HOVER_PX && !state.headerVisible) {
        dispatch({ type: 'topEdgeHover' });
      }
    },
    { passive: true },
  );

  // ---- content click (INGLÉS "tap to hide both") -------------------------
  doc.addEventListener(
    'pointerdown',
    (event) => {
      const target = event.target;
      if (target instanceof Element && target.closest('main')) {
        dispatch({ type: 'contentPointerDown' });
      }
    },
    { passive: true },
  );

  // ---- keyboard focus (never an invisible focused element) ---------------
  doc.addEventListener(
    'focusin',
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(HEADER_SELECTOR)) {
        dispatch({ type: 'focusIn', region: 'header' });
      } else if (target.closest(FOOTER_SELECTOR)) {
        dispatch({ type: 'focusIn', region: 'footer' });
      }
    },
    { passive: true },
  );

  // ---- mobile menu / account dropdown guard -------------------------------
  // Both `Header.astro`'s own hamburger button and `UserMenu`'s trigger flip
  // `aria-expanded` on themselves when they open/close — one MutationObserver
  // on the (persisted — see `Header.astro`'s own `transition:persist`) header
  // element covers both without knowing which control opened. The header
  // reference is captured ONCE here specifically because it survives Astro's
  // View Transitions swaps; nothing else in this module keeps a cached
  // element reference across navigations.
  const header = doc.querySelector<HTMLElement>(HEADER_SELECTOR);
  if (header && typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver(() => {
      const anyOpen = header.querySelector('[aria-expanded="true"]') !== null;
      if (anyOpen !== state.menuOpen) {
        dispatch({ type: 'menuOpen', open: anyOpen });
      }
    });
    observer.observe(header, { attributes: true, attributeFilter: ['aria-expanded'], subtree: true });
  }

  // ---- footer dwell clock --------------------------------------------------
  win.setInterval(() => dispatch({ type: 'tick', now: Date.now() }), DWELL_TICK_MS);

  // ---- View Transitions: re-pick the mode on every page entry -------------
  // `document`/`window` (and listeners bound to them) survive Astro's
  // ClientRouter swaps — same reasoning as `backNavigation.ts`'s own
  // delegated listener — so both of these are bound exactly once, here,
  // regardless of how many pages are visited in this tab.
  doc.addEventListener('astro:after-swap', handlePageEnter);
  doc.addEventListener('astro:page-load', handlePageEnter);

  // First paint of this tab's session.
  handlePageEnter();
}
