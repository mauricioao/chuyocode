/**
 * chromeVisibility — the "smart" header/footer visibility feature (owner
 * spec: scroll-direction header + reveal-at-the-bottom footer for SITE;
 * owner spec 2026-10-05: hidden-by-default "blocks" in normal flow,
 * revealed only by a deliberate pull/push past an edge, for INGLÉS;
 * "desktop" redesign PART 1 scope extension, owner spec 2026-10-06, item C:
 * "clean footer scroll" REPLACED the Inglés footer's own hide/reveal
 * behavior below with the footer simply always in normal flow — see that
 * item's own section further down).
 *
 * Split the same way `backNavigation.ts`/`reveal.ts` are: a pure state
 * machine ({@link reduceChromeVisibility}, fully unit-testable, no DOM) and a
 * thin DOM-wiring function ({@link initChromeVisibility}) that turns real
 * browser events into calls into it. Every RULE lives in the reducer, never
 * in the wiring — the wiring only measures geometry and translates raw
 * events into the reducer's small vocabulary. The ONE exception, documented
 * where it happens: the INGLÉS header's "collapsed while scrolled past it"
 * transition needs a real `window.scrollBy` DOM side effect (compensating
 * the scroll position so nothing visibly jumps) that a pure reducer cannot
 * perform — `measureAndDispatchScroll` does that, driven by the state the
 * reducer already computed, never deciding the RULE itself.
 *
 * TWO MODES, picked per page from `<html data-theme="ingles">` (BaseLayout's
 * `theme` prop; see that file's own header):
 *
 *  - SITE — every other page. UNCHANGED by the 2026-10-05 pass below, and by
 *    item C. The header is always visible at/near the top; scrolling down
 *    hides it, a small cumulative scroll up (~8px,
 *    {@link UP_SHOW_THRESHOLD_PX}) shows it again; a desktop mouse hover near
 *    the top edge ({@link TOP_EDGE_HOVER_PX}) also reveals it
 *    (unscrollable-page fallback); the footer reveals at the bottom after a
 *    ~1s dwell ({@link FOOTER_DWELL_MS}) or an extra push past it.
 *
 *  - INGLÉS (owner spec 2026-10-05, "blocks", town.com-style; header rules
 *    below narrowed by item C to "every Inglés page EXCEPT the hub") — the
 *    header starts HIDDEN and COLLAPSED (zero height, no space taken) on
 *    every page entry. It is an ordinary block in normal document flow —
 *    NEVER a floating/fixed overlay — that EXPANDS IN FLOW (animated
 *    height, see `global.css`'s own `[data-chrome-mode='ingles']` rules),
 *    pushing surrounding content:
 *      - It reveals ONLY while at the very top AND the visitor keeps
 *        pulling further (an upward wheel/touch "pull" past the top that
 *        can't scroll any further — {@link PULL_SHOW_THRESHOLD_PX}). There
 *        is no "always visible near the top" pin and no generic mid-page
 *        upward-scroll reveal (both SITE-only now), and no top-edge mouse
 *        hover reveal either (also SITE-only now).
 *      - It collapses again once fully scrolled out of view, and on a tap/
 *        click on the page content (`contentPointerDown`, unchanged).
 *        Collapsing it this way would otherwise visibly shift whatever the
 *        visitor is currently reading by the header's own height —
 *        `measureAndDispatchScroll` compensates the scroll position in the
 *        same tick so nothing jumps (see its own comment).
 *      - A wheel/touch "pull" only counts if the browser did not already
 *        consume it (`defaultPrevented` — e.g. canvas zoom in the worksheet
 *        player/editor) and no scrollable ancestor under the pointer can
 *        still scroll further that way — see `isConsumedByInnerScrollable`.
 *      - `fullHeight` pages (the activity editor, the practice player) are
 *        INGLÉS pages too: `global.css` no longer pins them "always visible"
 *        at `lg:` — this behavior now runs at every width, same as every
 *        other INGLÉS page.
 *
 *  - INGLÉS HUB ONLY ("desktop" redesign PART 1 scope extension, item C):
 *    `ChromeState.isHub` (from `<html data-chrome-hub>`, set server-side by
 *    `BaseLayout.astro` — see that file's own header) turns the pull-to-
 *    reveal/collapse header rules above OFF entirely: the header starts, and
 *    always stays, visible — it holds the logo and the avatar in the new
 *    "desktop" design (owner spec), so it must never disappear. It is still
 *    an ordinary in-flow block (not fixed/sticky), so it scrolls out of the
 *    viewport the normal way when the visitor scrolls down to the footer —
 *    it just never COLLAPSES (zero-height) while doing so.
 *
 *  - INGLÉS FOOTER, EVERY PAGE ("desktop" redesign PART 1 scope extension,
 *    item C, "clean footer scroll" — REPLACES the 2026-10-05 hide/pull-
 *    reveal footer rules the hub/non-hub split above never applied to
 *    begin with): the footer is simply always in normal flow, at the end of
 *    the page, fully visible — never collapsed, hidden, half-shown or
 *    faded. `footerVisible` therefore starts (and stays) `true` for BOTH
 *    Inglés sub-modes; `global.css` no longer gives `[data-chrome-footer]`
 *    any grid-collapse rule under `[data-chrome-mode='ingles']` at all. On
 *    the HUB specifically, whose content is one screen tall, `global.css`
 *    additionally adds CSS scroll-snap (keyed off `[data-chrome-hub]`
 *    directly, no JS dependency) so the page rests at either natural
 *    extreme — top (the hub's own one-screen content) or bottom (the footer
 *    fully visible) — "si se baja se mira completo, si se sube se mira toda
 *    la pantalla" (owner's words). Snap is scoped to the hub alone on
 *    purpose: a long Inglés page (the practice player, the editor, a long
 *    activity list) must never fight a visitor trying to read partway down
 *    it. `prefers-reduced-motion: reduce` drops the snap entirely (plain,
 *    un-snapped scrolling) — see `global.css`'s own rule.
 *
 * Shared by both modes, unchanged: keyboard focus entering a collapsed bar
 * always reveals it (never leaves a focused element invisible), and an open
 * menu/dropdown inside the header keeps it visible regardless of scroll.
 *
 * PROGRESSIVE ENHANCEMENT: every one of these rules is additive CSS, gated
 * behind a `data-chrome-js` marker this module (and a tiny inline
 * head script, for the very first paint) sets on `<html>` — see
 * `global.css`'s own header for the exact selectors. No JS / JS failed means
 * none of that CSS activates, so the header/footer render fully visible,
 * in normal flow, exactly as their own ordinary (non-JS) markup. The hub's
 * scroll-snap is the one exception that needs no JS at all — its attribute
 * is server-rendered (see item C above).
 */

// ---------------------------------------------------------------------------
// Pure state machine
// ---------------------------------------------------------------------------

export type ChromeMode = 'site' | 'ingles';

export interface ChromeState {
  mode: ChromeMode;
  headerVisible: boolean;
  footerVisible: boolean;
  /**
   * INGLÉS only ("desktop" redesign PART 1 scope extension, item C): true
   * only on the Inglés hub — see `<html data-chrome-hub>`,
   * `BaseLayout.astro`'s own header. Turns the pull-to-reveal/collapse
   * header rules off entirely (the hub's header always stays visible) and
   * is otherwise unused — the footer no longer has hub-specific rules of
   * its own; it is always visible in BOTH Inglés sub-modes (see this
   * module's own header).
   */
  isHub: boolean;
  /** True while the mobile menu or the account dropdown is open — pins the header visible. */
  menuOpen: boolean;
  /** The last measured scroll position, or `null` right after a `pageEnter` (next `scroll` only calibrates). */
  lastY: number | null;
  /** SITE only: cumulative upward scroll delta (px) since the last downward move — compared against {@link UP_SHOW_THRESHOLD_PX}. */
  upAccum: number;
  /** INGLÉS, non-hub only: cumulative upward wheel/touch "pull" (px) while already at the top — compared against {@link PULL_SHOW_THRESHOLD_PX}. */
  pullAccum: number;
  atTop: boolean;
  atBottom: boolean;
  /** `performance`/`Date.now()`-style timestamp the page last arrived at the bottom, or `null` when not currently there. SITE only (drives the dwell reveal). */
  footerDwellStart: number | null;
}

export type ChromeEvent =
  | { type: 'pageEnter'; mode: ChromeMode; isHub: boolean }
  | {
      type: 'scroll';
      y: number;
      viewportHeight: number;
      docHeight: number;
      headerHeight: number;
      /** The header's `getBoundingClientRect().bottom` — used only to detect it has fully scrolled out of view (INGLÉS; see the reducer). */
      headerBottom: number;
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

/** SITE only: cumulative upward scroll (px) that re-shows a hidden header. */
export const UP_SHOW_THRESHOLD_PX = 8;
/** Distance (px) from the true bottom still counted as "at the bottom". */
export const BOTTOM_EPSILON_PX = 2;
/** SITE only: mouse distance (px) from the top edge that counts as a hover-to-reveal (desktop, unscrollable-page fallback). Removed for INGLÉS (owner spec 2026-10-05). */
export const TOP_EDGE_HOVER_PX = 16;
/** SITE only: dwell time (ms) at the bottom before the footer reveals on its own. Removed for INGLÉS (owner spec 2026-10-05). */
export const FOOTER_DWELL_MS = 1000;
/**
 * INGLÉS only (owner spec 2026-10-05): cumulative overscroll "pull" (px),
 * while already at the very top, that reveals the header — "threshold ≈
 * 60–120px, tune it so a casual scroll that merely reaches the top does not
 * trigger but a deliberate extra pull does." 80px is the midpoint of that
 * range: comfortably above ordinary trackpad/touch rubber-band momentum at
 * the top (which settles well under ~40px), the same order of magnitude as
 * a native "pull to refresh" gesture, yet still reachable with one
 * deliberate extra pull.
 */
export const PULL_SHOW_THRESHOLD_PX = 80;

export function createInitialChromeState(mode: ChromeMode = 'site', isHub = false): ChromeState {
  return {
    mode,
    // SITE defaults to visible (today's expectation); INGLÉS starts hidden
    // on every page entry, even at the top — the task's own "no flash" rule
    // — EXCEPT the hub, whose header always starts (and stays) visible
    // (item C).
    headerVisible: mode === 'site' || isHub,
    // "Desktop" redesign PART 1 scope extension (item C, "clean footer
    // scroll"): the Inglés footer is simply always in normal flow — never
    // collapsed/hidden/faded — in EITHER Inglés sub-mode. Only SITE still
    // starts hidden and reveals via the dwell/push rules below.
    footerVisible: mode === 'ingles',
    isHub,
    menuOpen: false,
    lastY: null,
    upAccum: 0,
    pullAccum: 0,
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
      return createInitialChromeState(event.mode, event.isHub);

    case 'scroll':
      return reduceScroll(state, event);

    case 'wheelAttempt': {
      let next = state;
      // Pages that cannot scroll (and the top/bottom edge of any page) never
      // fire a `scroll` event for this — the wheel/swipe ATTEMPT itself is
      // the only signal.
      if (state.mode === 'site') {
        if (state.atTop && event.deltaY < 0) {
          next = { ...next, headerVisible: withMenuGuard(next, true) };
        }
      } else if (!state.isHub && state.atTop) {
        // INGLÉS, non-hub (owner spec 2026-10-05): the header needs a
        // DELIBERATE, accumulated pull past the top — a single small
        // attempt (e.g. scroll-momentum settling right at the edge) must
        // not count on its own; see {@link PULL_SHOW_THRESHOLD_PX}'s own
        // comment. The HUB skips this whole branch (item C): its header is
        // already always visible, nothing to pull-reveal.
        if (event.deltaY < 0) {
          const pullAccum = state.pullAccum + -event.deltaY;
          next =
            pullAccum >= PULL_SHOW_THRESHOLD_PX
              ? { ...next, headerVisible: withMenuGuard(next, true), pullAccum: 0 }
              : { ...next, pullAccum };
        } else if (event.deltaY > 0) {
          // A push back down at the top cancels whatever partial pull was in progress.
          next = { ...next, pullAccum: 0 };
        }
      }
      // SITE only now: the footer's "push a little further past the
      // bottom" reveal. "Desktop" redesign PART 1 scope extension (item C):
      // the Inglés footer is always visible already (both sub-modes), so
      // there is nothing left for this rule to do there.
      if (state.mode === 'site' && state.atBottom && event.deltaY > 0) {
        next = { ...next, footerVisible: true };
      }
      return next;
    }

    case 'topEdgeHover':
      // SITE only — removed for INGLÉS (owner spec 2026-10-05): only an
      // at-top wheel/touch pull reveals the header there (see `wheelAttempt`
      // above).
      return state.mode === 'site' && state.atTop
        ? { ...state, headerVisible: withMenuGuard(state, true) }
        : state;

    case 'contentPointerDown':
      // INGLÉS, non-hub only (owner spec 2026-10-05, narrowed by item C): a
      // tap/click on <main> hides the header. No rule asks for this in SITE
      // mode; the HUB's header never hides (item C); the footer is never
      // hidden by this (or any) rule anymore in either Inglés sub-mode
      // (item C, "clean footer scroll").
      return state.mode === 'ingles' && !state.isHub
        ? { ...state, headerVisible: withMenuGuard(state, false) }
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
      // SITE only — the ~1s bottom dwell auto-reveal is removed for INGLÉS
      // (owner spec 2026-10-05): it only ever reveals via the shared
      // "push past the bottom" wheelAttempt rule there.
      if (state.mode !== 'site') return state;
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
  const { y, viewportHeight, docHeight, headerHeight, headerBottom, footerTop, now } = event;

  const atTop = y <= 0;
  const atBottom = docHeight - y - viewportHeight <= BOTTOM_EPSILON_PX;
  const footerFullyOutOfView = footerTop >= viewportHeight;
  const headerFullyOutOfView = headerBottom <= 0;

  // The first reading after `pageEnter` (or the very first one ever) only
  // calibrates `lastY` — it must never be read as a downward move from 0,
  // which would otherwise hide a SITE header the moment a page loads
  // already scrolled down.
  const isCalibration = state.lastY === null;
  const deltaY = isCalibration ? 0 : y - state.lastY!;

  let headerVisible = state.headerVisible;
  let upAccum = state.upAccum;
  let pullAccum = state.pullAccum;

  if (state.mode === 'site') {
    if (!isCalibration) {
      if (deltaY > 0) {
        // Scrolling down hides it outright — the "near the top" pin below
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
    // Always visible at/near the top, regardless of direction.
    if (y <= headerHeight) {
      headerVisible = true;
    }
  } else if (!state.isHub) {
    // INGLÉS, non-hub (owner spec 2026-10-05): no generic scroll-direction
    // reveal and no "near the top" pin — revealing is ONLY the deliberate
    // at-top pull (`wheelAttempt`, see the reducer's own case). A scroll
    // that merely REACHES the top shows nothing by itself; leaving the top
    // cancels any pull already in progress, same as a casual scroll down
    // and back up never carrying "credit" over to a later pull.
    if (!atTop) {
      pullAccum = 0;
    }
    // Collapses again once fully scrolled past it. The DOM wiring
    // (`measureAndDispatchScroll`) compensates the scroll position for
    // exactly this transition so it never visibly jumps — this reducer only
    // owns the RULE (when), never the DOM side effect (how).
    if (headerFullyOutOfView && headerVisible) {
      headerVisible = false;
    }
  }
  // INGLÉS HUB ("desktop" redesign PART 1 scope extension, item C): neither
  // branch above runs — the header started visible (see
  // `createInitialChromeState`) and nothing in this reducer ever turns it
  // back off; it simply scrolls out of (and back into) the viewport like
  // any other in-flow block as the visitor scrolls toward the footer.

  // "Desktop" redesign PART 1 scope extension (item C, "clean footer
  // scroll"): SITE keeps its own dwell-driven reveal/re-collapse below,
  // UNCHANGED. The Inglés footer (both sub-modes) is always visible already
  // (`createInitialChromeState`) and this reducer never touches it again —
  // no dwell clock, no re-collapsing once scrolled past it.
  let footerVisible = state.footerVisible;
  let footerDwellStart = state.footerDwellStart;

  if (state.mode === 'site') {
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
  }

  return {
    ...state,
    lastY: y,
    atTop,
    atBottom,
    headerVisible: withMenuGuard(state, headerVisible),
    footerVisible,
    upAccum,
    pullAccum,
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
/**
 * INGLÉS only: set momentarily on the header element itself (never on
 * `<html>`) around the one transition that must NOT animate — collapsing it
 * once it has fully scrolled out of view, in the same tick as the
 * compensating scroll (see `measureAndDispatchScroll`). `global.css` zeroes
 * the transition duration while this is present; removed again next frame so
 * every OTHER transition (revealing, tap-to-collapse) keeps animating.
 */
export const CHROME_INSTANT_ATTR = 'data-chrome-instant';
/**
 * "Desktop" redesign PART 1 scope extension (owner spec 2026-10-06, item
 * C): server-rendered by `BaseLayout.astro` (true only on the Inglés hub) —
 * this module only ever READS it (`headerAlwaysVisible`), never writes it;
 * it never changes for the life of a page view. `global.css` also reads it
 * directly for the hub's scroll-snap rules, with no JS dependency at all.
 */
export const CHROME_HUB_ATTR = 'data-chrome-hub';
/**
 * PART 6c bugfix (owner spec 2026-10-07, defect #1: "la vista detrás de la
 * ventana debe verse exactamente como el hub"): server-rendered by
 * `BaseLayout.astro`'s own `deskBehind` prop — true on a page that renders
 * the desk BEHIND an open `DeskWindow` (today, only the signed-in practice
 * page). See {@link headerAlwaysVisible}'s own comment for why this module
 * treats it exactly like {@link CHROME_HUB_ATTR}.
 */
export const CHROME_DESK_BEHIND_ATTR = 'data-desk-behind';
/** Approximates today's literal `top-20` gap below the ~4rem header once JS takes over the offset. */
const HEADER_OFFSET_GAP_PX = 16;
/** How often `tick` is dispatched while waiting out the footer's dwell — well under the ~1s window so the reveal never feels late. */
const DWELL_TICK_MS = 150;

function detectMode(doc: Document): ChromeMode {
  return doc.documentElement.getAttribute('data-theme') === 'ingles' ? 'ingles' : 'site';
}

/**
 * "Desktop" redesign PART 1 scope extension (item C): reads the attribute
 * `BaseLayout.astro` already set server-side — see {@link CHROME_HUB_ATTR}'s
 * own comment for why this module never re-derives it from the URL itself.
 *
 * PART 6c bugfix (owner spec 2026-10-07, defect #1): a `data-desk-behind`
 * page (`CHROME_DESK_BEHIND_ATTR`) gets the EXACT same "header never
 * collapses, always starts visible" treatment as the hub — reusing the
 * `ChromeState.isHub` branches below (rather than adding a parallel set of
 * rules) is what makes that free. That page's own `<body>` also locks all
 * page scroll while the window is open (`BaseLayout.astro`'s own
 * `hasOverlay`), so there is no scroll/pull/tap gesture left that should
 * ever hide it anyway — and the owner's spec is that the area around the
 * window must look pixel-identical to the hub at scroll-top: same header,
 * same desk geometry (`DeskScene.astro`'s own `desk:min-h-[calc(100dvh-
 * 96px)]` assumes exactly the hub's header height).
 */
function headerAlwaysVisible(doc: Document): boolean {
  const html = doc.documentElement;
  return html.hasAttribute(CHROME_HUB_ATTR) || html.hasAttribute(CHROME_DESK_BEHIND_ATTR);
}

/**
 * A wheel event's `deltaY` is only really pixels when `deltaMode` is
 * `DOM_DELTA_PIXEL` (0, the overwhelming common case). Some browsers/devices
 * report `DOM_DELTA_LINE` (1) or `DOM_DELTA_PAGE` (2) instead, where the same
 * `deltaY` is a small line/page COUNT — left un-normalized, a few "lines"
 * would be misread as a few PIXELS against INGLÉS's 60-120px pull threshold,
 * making the gesture far too sensitive on those devices (owner spec: "
 * normalize deltaMode lines/pages to px").
 */
function normalizeWheelDeltaY(event: WheelEvent, win: Window): number {
  const LINE_HEIGHT_PX = 16; // a common per-line approximation (1rem).
  if (event.deltaMode === 1) return event.deltaY * LINE_HEIGHT_PX; // DOM_DELTA_LINE
  if (event.deltaMode === 2) return event.deltaY * win.innerHeight; // DOM_DELTA_PAGE
  return event.deltaY; // DOM_DELTA_PIXEL
}

/**
 * INGLÉS only (owner spec 2026-10-05): a wheel/touch "pull" belongs to the
 * page edge only if the browser has not already consumed it (e.g. a canvas
 * pinch-zoom calling `preventDefault()`) AND no scrollable ancestor under the
 * pointer can still scroll further in the attempted direction — otherwise an
 * inner scroll container (the worksheet player/editor canvas, a scrollable
 * panel) would "leak" its own scrolling into the page chrome's reveal
 * gesture.
 */
function isConsumedByInnerScrollable(
  event: WheelEvent | TouchEvent,
  deltaY: number,
  doc: Document,
  win: Window,
): boolean {
  if (event.defaultPrevented) return true;
  let node = event.target instanceof Element ? event.target : null;
  while (node && node !== doc.documentElement) {
    const style = win.getComputedStyle(node);
    const canScrollY = /(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight;
    if (canScrollY) {
      if (deltaY < 0 && node.scrollTop > 0) return true; // can still scroll further UP
      if (deltaY > 0 && node.scrollTop + node.clientHeight < node.scrollHeight) return true; // can still scroll further DOWN
    }
    node = node.parentElement;
  }
  return false;
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
  let state = createInitialChromeState(detectMode(doc), headerAlwaysVisible(doc));
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

  /**
   * Dispatches a `wheelAttempt`. Used to carry one INGLÉS-only DOM side
   * effect for the footer's old "push past the bottom" reveal — removed by
   * the "desktop" redesign PART 1 scope extension (item C, "clean footer
   * scroll"): the Inglés footer is simply always in normal flow now, so
   * there is no hidden→visible transition left to compensate for. Kept as
   * its own function (rather than calling `dispatch` directly from the
   * wheel/touch listeners below) only because SITE may grow a matching
   * side effect again later — it is currently a plain pass-through.
   */
  function dispatchWheelAttempt(deltaY: number): void {
    dispatch({ type: 'wheelAttempt', deltaY });
  }

  function measureAndDispatchScroll(): void {
    frameScheduled = false;
    // One read phase (geometry only, no writes) per animation frame — `apply()`,
    // the only place this wiring writes to the DOM, always runs after it.
    const header = doc.querySelector<HTMLElement>(HEADER_SELECTOR);
    const footer = doc.querySelector<HTMLElement>(FOOTER_SELECTOR);
    const headerRect = header?.getBoundingClientRect();
    const headerHeight = headerRect?.height ?? 0;
    const headerBottom = headerRect?.bottom ?? Number.POSITIVE_INFINITY;

    // INGLÉS, non-hub only: this exact reading is about to make the reducer
    // collapse an already-revealed header that has fully scrolled out of
    // view (see `reduceScroll`'s own `headerFullyOutOfView` check) —
    // predicted here with the SAME condition so the DOM side effects below
    // can bracket the dispatch. Collapsing it the ordinary (animated) way
    // would let the content below visibly shift up by the header's own
    // height while the visitor is scrolled well past it and not looking at
    // it at all, so THIS one transition skips the animation
    // (`CHROME_INSTANT_ATTR`) and compensates the scroll position in the
    // same tick instead (owner spec: "compensate the scroll position... so
    // nothing visibly jumps"). Every other header transition (revealing via
    // an at-top pull, collapsing via a tap on the content) stays the normal
    // animated kind, because the visitor is already looking at the header
    // when those happen. The HUB is excluded ("desktop" redesign PART 1
    // scope extension, item C): its header never collapses, so `headerBottom
    // <= 0` there is just the ordinary, un-compensated "scrolled past an
    // in-flow block" — no instant/compensated transition applies.
    const willCollapseOutOfView =
      state.mode === 'ingles' && !state.isHub && state.headerVisible && headerBottom <= 0;
    if (willCollapseOutOfView && header) {
      header.setAttribute(CHROME_INSTANT_ATTR, '');
    }

    dispatch({
      type: 'scroll',
      y: win.scrollY,
      viewportHeight: win.innerHeight,
      docHeight: doc.documentElement.scrollHeight,
      headerHeight,
      headerBottom,
      footerTop: footer?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY,
      now: Date.now(),
    });

    if (willCollapseOutOfView && header) {
      win.scrollBy(0, -Math.min(headerHeight, win.scrollY));
      win.requestAnimationFrame(() => header.removeAttribute(CHROME_INSTANT_ATTR));
    }
  }

  function scheduleMeasure(): void {
    if (frameScheduled) return;
    frameScheduled = true;
    win.requestAnimationFrame(measureAndDispatchScroll);
  }

  function handlePageEnter(): void {
    dispatch({ type: 'pageEnter', mode: detectMode(doc), isHub: headerAlwaysVisible(doc) });
    measureAndDispatchScroll();
  }

  // ---- scroll / resize (throttled to one measurement per frame) ----------
  doc.addEventListener('scroll', scheduleMeasure, { passive: true });
  win.addEventListener('resize', scheduleMeasure, { passive: true });

  // ---- wheel + touch "attempt" (pages that cannot scroll, or at an edge) -
  doc.addEventListener(
    'wheel',
    (event) => {
      const deltaY = normalizeWheelDeltaY(event, win);
      // INGLÉS only (owner spec 2026-10-05): an inner scrollable under the
      // pointer (or an event a canvas already consumed) owns this wheel tick
      // instead of the page edge — see the helper's own comment. SITE keeps
      // reading every wheel event exactly as before.
      if (state.mode === 'ingles' && isConsumedByInnerScrollable(event, deltaY, doc, win)) return;
      dispatchWheelAttempt(deltaY);
    },
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
      const deltaY = lastTouchY - currentY;
      lastTouchY = currentY;
      if (state.mode === 'ingles' && isConsumedByInnerScrollable(event, deltaY, doc, win)) return;
      dispatchWheelAttempt(deltaY);
    },
    { passive: true },
  );

  // ---- desktop-only top-edge hover (SITE only — same unscrollable-page
  // fallback; removed for INGLÉS, owner spec 2026-10-05, see `topEdgeHover`'s
  // own reducer case) -------------------------------------------------------
  doc.addEventListener(
    'mousemove',
    (event) => {
      if (state.mode === 'site' && event.clientY <= TOP_EDGE_HOVER_PX && !state.headerVisible) {
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
