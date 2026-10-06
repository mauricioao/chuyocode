// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  createInitialChromeState,
  reduceChromeVisibility,
  UP_SHOW_THRESHOLD_PX,
  PULL_SHOW_THRESHOLD_PX,
  FOOTER_DWELL_MS,
  type ChromeState,
  type ChromeEvent,
} from './chromeVisibility';

const HEADER_HEIGHT = 64;
const VIEWPORT = 800;
const DOC_HEIGHT = 3000; // a tall, scrollable page by default

interface ScrollOverrides {
  viewportHeight?: number;
  docHeight?: number;
  headerHeight?: number;
  headerBottom?: number;
  footerTop?: number;
  now?: number;
}

/** A `scroll` event with sensible tall-page defaults, overridable per test. */
function scroll(y: number, overrides: ScrollOverrides = {}): ChromeEvent {
  return {
    type: 'scroll',
    y,
    viewportHeight: overrides.viewportHeight ?? VIEWPORT,
    docHeight: overrides.docHeight ?? DOC_HEIGHT,
    headerHeight: overrides.headerHeight ?? HEADER_HEIGHT,
    // The header's live `getBoundingClientRect().bottom` — realistically
    // `headerHeight - y` (its document top is always 0), overridable so
    // INGLÉS's "fully scrolled out of view" tests can set it directly.
    headerBottom: overrides.headerBottom ?? (overrides.headerHeight ?? HEADER_HEIGHT) - y,
    // Far below the viewport by default (footer nowhere near view).
    footerTop: overrides.footerTop ?? (overrides.docHeight ?? DOC_HEIGHT) - y,
    now: overrides.now ?? 0,
  };
}

function reduceAll(state: ChromeState, events: ChromeEvent[]): ChromeState {
  return events.reduce(reduceChromeVisibility, state);
}

describe('createInitialChromeState', () => {
  it('SITE mode starts with the header visible and the footer hidden', () => {
    const state = createInitialChromeState('site');
    expect(state.headerVisible).toBe(true);
    expect(state.footerVisible).toBe(false);
  });

  it('INGLÉS mode (non-hub) starts with the header hidden (no flash) but the footer already visible ("desktop" redesign PART 1, item C: clean footer scroll)', () => {
    const state = createInitialChromeState('ingles');
    expect(state.headerVisible).toBe(false);
    expect(state.footerVisible).toBe(true);
    expect(state.isHub).toBe(false);
  });

  it('INGLÉS HUB starts with BOTH the header and the footer already visible — no flash of either being hidden (item C)', () => {
    const state = createInitialChromeState('ingles', true);
    expect(state.headerVisible).toBe(true);
    expect(state.footerVisible).toBe(true);
    expect(state.isHub).toBe(true);
  });
});

describe('SITE mode — header', () => {
  it('stays visible at the very top', () => {
    const state = reduceChromeVisibility(createInitialChromeState('site'), scroll(0));
    expect(state.headerVisible).toBe(true);
  });

  it('stays visible within the header height of the top', () => {
    const state = reduceAll(createInitialChromeState('site'), [scroll(0), scroll(HEADER_HEIGHT - 1)]);
    expect(state.headerVisible).toBe(true);
  });

  it('hides on scroll down past the header height', () => {
    const state = reduceAll(createInitialChromeState('site'), [scroll(0), scroll(HEADER_HEIGHT + 200)]);
    expect(state.headerVisible).toBe(false);
  });

  it('a tiny upward scroll (below the 8px threshold) does not reveal it again', () => {
    let state = reduceAll(createInitialChromeState('site'), [scroll(0), scroll(HEADER_HEIGHT + 200)]);
    expect(state.headerVisible).toBe(false);
    state = reduceChromeVisibility(state, scroll(HEADER_HEIGHT + 200 - (UP_SHOW_THRESHOLD_PX - 1)));
    expect(state.headerVisible).toBe(false);
  });

  it('a cumulative upward scroll of >= 8px reveals it again, even across several small events', () => {
    let state = reduceAll(createInitialChromeState('site'), [scroll(0), scroll(HEADER_HEIGHT + 400)]);
    expect(state.headerVisible).toBe(false);
    state = reduceChromeVisibility(state, scroll(HEADER_HEIGHT + 400 - 5)); // +5px up: below threshold
    expect(state.headerVisible).toBe(false);
    state = reduceChromeVisibility(state, scroll(HEADER_HEIGHT + 400 - 9)); // +4px more up: 9px cumulative
    expect(state.headerVisible).toBe(true);
  });

  it('a downward move resets the cumulative upward progress', () => {
    let state = reduceAll(createInitialChromeState('site'), [scroll(0), scroll(HEADER_HEIGHT + 400)]);
    state = reduceChromeVisibility(state, scroll(HEADER_HEIGHT + 400 - 6)); // 6px up: below threshold
    state = reduceChromeVisibility(state, scroll(HEADER_HEIGHT + 400 - 4)); // 2px back down: resets progress
    state = reduceChromeVisibility(state, scroll(HEADER_HEIGHT + 400 - 10)); // 6px up again: still below 8 from the reset point
    expect(state.headerVisible).toBe(false);
  });

  it('is visible back at the top regardless of the last direction', () => {
    let state = reduceAll(createInitialChromeState('site'), [scroll(0), scroll(HEADER_HEIGHT + 400)]);
    expect(state.headerVisible).toBe(false);
    state = reduceChromeVisibility(state, scroll(0));
    expect(state.headerVisible).toBe(true);
  });
});

describe('INGLÉS mode — header (owner spec 2026-10-05: blocks, pull-to-reveal)', () => {
  it('starts hidden even AT the top (no "always visible at top" rule)', () => {
    const state = reduceChromeVisibility(createInitialChromeState('ingles'), scroll(0));
    expect(state.headerVisible).toBe(false);
  });

  it('a plain scroll up through the page (never reaching an at-top pull) never reveals it — removed (owner spec)', () => {
    // Scrolling from the middle back up to the very top is a "casual scroll
    // that merely reaches the top" (owner spec) — SITE's old generic
    // cumulative-upward-scroll rule no longer applies here at all.
    let state = reduceAll(createInitialChromeState('ingles'), [scroll(500)]);
    state = reduceChromeVisibility(state, scroll(500 - 8));
    expect(state.headerVisible).toBe(false);
    state = reduceChromeVisibility(state, scroll(0));
    expect(state.headerVisible).toBe(false);
  });

  it('collapses once it has fully scrolled out of view (after it was shown some other way)', () => {
    let state = reduceAll(createInitialChromeState('ingles'), [scroll(0)]);
    state = reduceChromeVisibility(state, { type: 'focusIn', region: 'header' });
    expect(state.headerVisible).toBe(true);

    // Still (at least partly) within the viewport — not out of view yet —
    // stays visible even though this is a downward move.
    state = reduceChromeVisibility(state, scroll(40, { headerBottom: HEADER_HEIGHT - 40 }));
    expect(state.headerVisible).toBe(true);

    // Now fully scrolled past it (`headerBottom <= 0`) — collapses. The DOM
    // wiring compensates the scroll position for this exact transition so it
    // never visibly jumps (see `measureAndDispatchScroll`'s own comment) —
    // not observable from the pure reducer, which only owns the RULE.
    state = reduceChromeVisibility(state, scroll(300, { headerBottom: -10 }));
    expect(state.headerVisible).toBe(false);
  });
});

describe('INGLÉS mode — header reveal needs an accumulated pull past the top (owner spec 2026-10-05)', () => {
  it('a single small wheel attempt at the top does not reveal it (below the threshold)', () => {
    let state = reduceChromeVisibility(createInitialChromeState('ingles'), scroll(0));
    state = reduceChromeVisibility(state, { type: 'wheelAttempt', deltaY: -30 });
    expect(state.headerVisible).toBe(false);
  });

  it(`reveals once the accumulated pull reaches ${PULL_SHOW_THRESHOLD_PX}px, even across several small attempts`, () => {
    let state = reduceChromeVisibility(createInitialChromeState('ingles'), scroll(0));
    state = reduceChromeVisibility(state, { type: 'wheelAttempt', deltaY: -(PULL_SHOW_THRESHOLD_PX - 10) });
    expect(state.headerVisible).toBe(false);
    state = reduceChromeVisibility(state, { type: 'wheelAttempt', deltaY: -10 });
    expect(state.headerVisible).toBe(true);
  });

  it('a downward attempt at the top cancels whatever partial pull was in progress', () => {
    let state = reduceChromeVisibility(createInitialChromeState('ingles'), scroll(0));
    state = reduceChromeVisibility(state, { type: 'wheelAttempt', deltaY: -(PULL_SHOW_THRESHOLD_PX - 5) });
    state = reduceChromeVisibility(state, { type: 'wheelAttempt', deltaY: 10 }); // a push back down
    state = reduceChromeVisibility(state, { type: 'wheelAttempt', deltaY: -5 }); // only 5px since the reset
    expect(state.headerVisible).toBe(false);
  });

  it('leaving the top resets the partial pull (a casual scroll away and back does not carry it over)', () => {
    let state = reduceChromeVisibility(createInitialChromeState('ingles'), scroll(0));
    state = reduceChromeVisibility(state, { type: 'wheelAttempt', deltaY: -(PULL_SHOW_THRESHOLD_PX - 10) });
    state = reduceChromeVisibility(state, scroll(50)); // scrolls away from the top
    state = reduceChromeVisibility(state, scroll(0)); // and back to it
    state = reduceChromeVisibility(state, { type: 'wheelAttempt', deltaY: -10 }); // only the post-reset 10px
    expect(state.headerVisible).toBe(false);
  });
});

// "Desktop" redesign PART 1 scope extension (owner spec 2026-10-06, item C):
// the Inglés HUB turns every pull-to-reveal/collapse header rule above OFF
// — its header starts, and always stays, visible.
describe('INGLÉS HUB — header is always visible, never pull-to-reveal, never collapses', () => {
  it('starts visible at the top (unlike a non-hub INGLÉS page)', () => {
    const state = reduceChromeVisibility(createInitialChromeState('ingles', true), scroll(0));
    expect(state.headerVisible).toBe(true);
  });

  it('a wheel pull past the top is a no-op — it is already visible', () => {
    let state = reduceChromeVisibility(createInitialChromeState('ingles', true), scroll(0));
    state = reduceChromeVisibility(state, { type: 'wheelAttempt', deltaY: -(PULL_SHOW_THRESHOLD_PX + 50) });
    expect(state.headerVisible).toBe(true);
  });

  it('never collapses even once fully scrolled out of view', () => {
    let state = reduceChromeVisibility(createInitialChromeState('ingles', true), scroll(0));
    expect(state.headerVisible).toBe(true);
    state = reduceChromeVisibility(state, scroll(300, { headerBottom: -10 }));
    expect(state.headerVisible).toBe(true);
  });

  it('a tap on the page content does not hide it (narrowed by item C to non-hub pages only)', () => {
    let state = reduceChromeVisibility(createInitialChromeState('ingles', true), scroll(0));
    state = reduceChromeVisibility(state, { type: 'contentPointerDown' });
    expect(state.headerVisible).toBe(true);
  });
});

describe('footer — reveal at the bottom (both modes share this rule)', () => {
  it('is hidden by default, away from the bottom', () => {
    const state = reduceChromeVisibility(createInitialChromeState('site'), scroll(0));
    expect(state.footerVisible).toBe(false);
  });

  it('reveals after the ~1s dwell once at the bottom', () => {
    let state = reduceChromeVisibility(
      createInitialChromeState('site'),
      scroll(DOC_HEIGHT - VIEWPORT, { footerTop: VIEWPORT - 10, now: 0 }),
    );
    expect(state.footerVisible).toBe(false);
    state = reduceChromeVisibility(state, { type: 'tick', now: FOOTER_DWELL_MS - 1 });
    expect(state.footerVisible).toBe(false);
    state = reduceChromeVisibility(state, { type: 'tick', now: FOOTER_DWELL_MS });
    expect(state.footerVisible).toBe(true);
  });

  it('reveals immediately on a further downward wheel/swipe attempt at the bottom ("a little more")', () => {
    let state = reduceChromeVisibility(
      createInitialChromeState('site'),
      scroll(DOC_HEIGHT - VIEWPORT, { footerTop: VIEWPORT - 10 }),
    );
    expect(state.footerVisible).toBe(false);
    state = reduceChromeVisibility(state, { type: 'wheelAttempt', deltaY: 40 });
    expect(state.footerVisible).toBe(true);
  });

  it('an upward attempt at the bottom does not reveal the footer', () => {
    const state = reduceChromeVisibility(
      reduceChromeVisibility(
        createInitialChromeState('site'),
        scroll(DOC_HEIGHT - VIEWPORT, { footerTop: VIEWPORT - 10 }),
      ),
      { type: 'wheelAttempt', deltaY: -40 },
    );
    expect(state.footerVisible).toBe(false);
  });

  it('covers a page too short to scroll: already at top AND bottom on the very first reading', () => {
    let state = reduceChromeVisibility(
      createInitialChromeState('site'),
      scroll(0, { docHeight: 500, footerTop: 300, now: 0 }),
    );
    state = reduceChromeVisibility(state, { type: 'tick', now: FOOTER_DWELL_MS });
    expect(state.footerVisible).toBe(true);
  });

  it('stays visible on a small upward wiggle away from the bottom (not fully out of view)', () => {
    // A realistically tall (200px) footer: fully visible at the bottom...
    let state = reduceChromeVisibility(
      createInitialChromeState('site'),
      scroll(DOC_HEIGHT - VIEWPORT, { footerTop: VIEWPORT - 200 }),
    );
    state = reduceChromeVisibility(state, { type: 'tick', now: FOOTER_DWELL_MS });
    expect(state.footerVisible).toBe(true);

    // ...a 50px upward wiggle moves its top edge down by 50px, but it is
    // still (mostly) inside the viewport — nowhere near fully out of view.
    state = reduceChromeVisibility(state, scroll(DOC_HEIGHT - VIEWPORT - 50, { footerTop: VIEWPORT - 150 }));
    expect(state.footerVisible).toBe(true);
  });

  it('resets to hidden once it has scrolled fully out of view, ready to animate in again next time', () => {
    let state = reduceChromeVisibility(
      createInitialChromeState('site'),
      scroll(DOC_HEIGHT - VIEWPORT, { footerTop: VIEWPORT - 10 }),
    );
    state = reduceChromeVisibility(state, { type: 'tick', now: FOOTER_DWELL_MS });
    expect(state.footerVisible).toBe(true);

    // Scrolled all the way back up: the footer's top edge is now below the
    // viewport entirely (fully out of view).
    state = reduceChromeVisibility(state, scroll(0, { footerTop: VIEWPORT + 50 }));
    expect(state.footerVisible).toBe(false);

    // Back at the bottom: hidden again until the dwell plays out fresh.
    state = reduceChromeVisibility(state, scroll(DOC_HEIGHT - VIEWPORT, { footerTop: VIEWPORT - 10 }));
    expect(state.footerVisible).toBe(false);
    state = reduceChromeVisibility(state, { type: 'tick', now: FOOTER_DWELL_MS });
    expect(state.footerVisible).toBe(true);
  });
});

// "Desktop" redesign PART 1 scope extension (owner spec 2026-10-06, item C,
// "clean footer scroll") REPLACED the Inglés footer's old hide/pull-reveal
// behavior entirely: it is always in normal flow, at its ordinary height,
// never collapsed/hidden/half-shown/faded, in BOTH Inglés sub-modes — no
// dwell, no wheel-triggered reveal, no re-collapsing once scrolled past it
// (that is now exclusively a SITE thing, see the dwell describe block
// above).
describe('footer — always visible in INGLÉS, both sub-modes ("desktop" redesign PART 1, item C: clean footer scroll)', () => {
  it('is already visible on page entry, both hub and non-hub — no dwell, no flash', () => {
    expect(createInitialChromeState('ingles').footerVisible).toBe(true);
    expect(createInitialChromeState('ingles', true).footerVisible).toBe(true);
  });

  it('stays visible however long a dwell at the bottom runs (no dwell rule applies to INGLÉS)', () => {
    let state = reduceChromeVisibility(
      createInitialChromeState('ingles'),
      scroll(DOC_HEIGHT - VIEWPORT, { footerTop: VIEWPORT - 10, now: 0 }),
    );
    expect(state.footerVisible).toBe(true);
    state = reduceChromeVisibility(state, { type: 'tick', now: FOOTER_DWELL_MS * 10 });
    expect(state.footerVisible).toBe(true);
  });

  it('stays visible even once fully scrolled out of view (unlike SITE, it never re-collapses)', () => {
    let state = reduceChromeVisibility(
      createInitialChromeState('ingles'),
      scroll(DOC_HEIGHT - VIEWPORT, { footerTop: VIEWPORT - 10 }),
    );
    expect(state.footerVisible).toBe(true);
    // Scrolled all the way back up: the footer's top edge is now below the
    // viewport entirely (fully out of view) — SITE would reset this to
    // `false`; INGLÉS never does.
    state = reduceChromeVisibility(state, scroll(0, { footerTop: VIEWPORT + 50 }));
    expect(state.footerVisible).toBe(true);
  });

  it('a tap on the page content no longer hides it (only the header, non-hub — see contentPointerDown below)', () => {
    let state = reduceChromeVisibility(createInitialChromeState('ingles'), scroll(0));
    state = reduceChromeVisibility(state, { type: 'contentPointerDown' });
    expect(state.footerVisible).toBe(true);
  });

  it('a page too short to scroll still has the footer visible from the start, with or without a push attempt', () => {
    let state = reduceChromeVisibility(
      createInitialChromeState('ingles'),
      scroll(0, { docHeight: 500, footerTop: 300, now: 0 }),
    );
    expect(state.footerVisible).toBe(true);
    state = reduceChromeVisibility(state, { type: 'wheelAttempt', deltaY: 40 });
    expect(state.footerVisible).toBe(true);
  });
});

describe('wheelAttempt — pages that cannot scroll (and the top/bottom edges of any page)', () => {
  it('SITE mode: a single upward attempt at the top shows the header immediately', () => {
    let state = reduceChromeVisibility(createInitialChromeState('site'), scroll(0, { docHeight: 400 }));
    state = reduceChromeVisibility(state, { type: 'wheelAttempt', deltaY: -30 });
    expect(state.headerVisible).toBe(true);
  });

  it('INGLÉS mode: a single upward attempt at the top is not enough on its own (needs the accumulated pull — see its own describe block)', () => {
    let state = reduceChromeVisibility(createInitialChromeState('ingles'), scroll(0, { docHeight: 400 }));
    expect(state.headerVisible).toBe(false);
    state = reduceChromeVisibility(state, { type: 'wheelAttempt', deltaY: -30 });
    expect(state.headerVisible).toBe(false);
  });

  it('a downward attempt away from the top/bottom changes nothing (header stays hidden, footer stays visible)', () => {
    let state = reduceChromeVisibility(createInitialChromeState('ingles'), scroll(400));
    state = reduceChromeVisibility(state, { type: 'wheelAttempt', deltaY: 30 });
    expect(state.headerVisible).toBe(false);
    expect(state.footerVisible).toBe(true);
  });
});

describe('topEdgeHover — desktop mouse near the top edge (SITE only)', () => {
  // SITE's own "visible at/near the top" scroll pin (see the SITE header
  // describe block above) already guarantees `headerVisible` whenever
  // `atTop` is true, so there is no reachable SITE state where this event
  // itself is the thing that flips it — it is a no-op by construction, kept
  // here (rather than asserted as a no-op fallacy) as an explicit regression
  // guard: it must never THROW or otherwise misbehave when dispatched at
  // the top in SITE mode, and must still do nothing away from the top.
  it('is a no-op at the top in SITE mode (the top pin already covers it — see "SITE mode — header")', () => {
    const state = reduceChromeVisibility(createInitialChromeState('site'), { type: 'topEdgeHover' });
    expect(state.headerVisible).toBe(true);
  });

  it('does nothing away from the top', () => {
    // Two scroll events: the first only calibrates (see "scroll — the first
    // reading after pageEnter" describe block below), the second actually
    // registers the downward move that hides it.
    let state = reduceAll(createInitialChromeState('site'), [scroll(0), scroll(400)]);
    expect(state.headerVisible).toBe(false);
    state = reduceChromeVisibility(state, { type: 'topEdgeHover' });
    expect(state.headerVisible).toBe(false);
  });

  it('removed for INGLÉS (owner spec 2026-10-05): only an at-top wheel/touch pull reveals it there', () => {
    let state = reduceChromeVisibility(createInitialChromeState('ingles'), scroll(0));
    expect(state.headerVisible).toBe(false);
    state = reduceChromeVisibility(state, { type: 'topEdgeHover' });
    expect(state.headerVisible).toBe(false);
  });
});

// "Desktop" redesign PART 1 scope extension (item C) narrowed this rule to
// "hides the header" (never the footer anymore — it is always visible, see
// its own describe block above) and "only on a non-hub Inglés page" (the
// hub's header never hides either — see the hub describe block below).
describe('contentPointerDown — INGLÉS-only "tap content to hide the header" (narrowed by item C)', () => {
  it('hides the header on a non-hub INGLÉS page, but leaves the (always-visible) footer alone', () => {
    let state = reduceChromeVisibility(createInitialChromeState('ingles'), scroll(0));
    state = reduceChromeVisibility(state, { type: 'focusIn', region: 'header' });
    expect(state.headerVisible).toBe(true);
    expect(state.footerVisible).toBe(true);

    state = reduceChromeVisibility(state, { type: 'contentPointerDown' });
    expect(state.headerVisible).toBe(false);
    expect(state.footerVisible).toBe(true);
  });

  it('does nothing in SITE mode (no rule requires it there)', () => {
    let state = reduceChromeVisibility(createInitialChromeState('site'), scroll(0));
    state = reduceChromeVisibility(state, { type: 'contentPointerDown' });
    expect(state.headerVisible).toBe(true); // unchanged — still at the top
  });
});

describe('focusIn — keyboard focus never leaves chrome invisible', () => {
  it('shows the header when focus enters it', () => {
    let state = reduceChromeVisibility(createInitialChromeState('ingles'), scroll(500));
    expect(state.headerVisible).toBe(false);
    state = reduceChromeVisibility(state, { type: 'focusIn', region: 'header' });
    expect(state.headerVisible).toBe(true);
  });

  it('shows the footer when focus enters it, even far from the bottom', () => {
    let state = reduceChromeVisibility(createInitialChromeState('site'), scroll(0));
    expect(state.footerVisible).toBe(false);
    state = reduceChromeVisibility(state, { type: 'focusIn', region: 'footer' });
    expect(state.footerVisible).toBe(true);
  });

  it('a focus elsewhere on the page changes nothing', () => {
    let state = reduceChromeVisibility(createInitialChromeState('ingles'), scroll(500));
    state = reduceChromeVisibility(state, { type: 'focusIn', region: 'other' });
    expect(state.headerVisible).toBe(false);
    // The footer starts (and stays) visible in INGLÉS mode regardless
    // ("desktop" redesign PART 1, item C: clean footer scroll) — this
    // assertion just confirms an unrelated focus event does not somehow
    // flip it.
    expect(state.footerVisible).toBe(true);
  });
});

describe('menuOpen — the mobile/account menu pins the header visible', () => {
  it('opening the menu shows the header immediately', () => {
    let state = reduceChromeVisibility(createInitialChromeState('ingles'), scroll(500));
    expect(state.headerVisible).toBe(false);
    state = reduceChromeVisibility(state, { type: 'menuOpen', open: true });
    expect(state.headerVisible).toBe(true);
  });

  it('a downward scroll cannot hide the header while the menu is open', () => {
    let state = reduceChromeVisibility(createInitialChromeState('site'), scroll(0));
    state = reduceChromeVisibility(state, { type: 'menuOpen', open: true });
    state = reduceChromeVisibility(state, scroll(HEADER_HEIGHT + 400));
    expect(state.headerVisible).toBe(true);
  });

  it('a content click cannot hide the header (INGLÉS) while the menu is open', () => {
    let state = reduceChromeVisibility(createInitialChromeState('ingles'), scroll(0));
    state = reduceChromeVisibility(state, { type: 'menuOpen', open: true });
    state = reduceChromeVisibility(state, { type: 'contentPointerDown' });
    expect(state.headerVisible).toBe(true);
  });

  it('closing the menu releases the guard: the next downward scroll hides it again', () => {
    let state = reduceChromeVisibility(createInitialChromeState('site'), scroll(0));
    state = reduceChromeVisibility(state, { type: 'menuOpen', open: true });
    state = reduceChromeVisibility(state, { type: 'menuOpen', open: false });
    expect(state.headerVisible).toBe(true); // still visible right after closing
    state = reduceChromeVisibility(state, scroll(HEADER_HEIGHT + 400));
    expect(state.headerVisible).toBe(false);
  });
});

describe('pageEnter — mode switches on a View Transitions navigation', () => {
  it('entering INGLÉS (non-hub) hides the header, even if it was visible on the previous (SITE) page — but the footer is already visible (item C)', () => {
    let state = reduceChromeVisibility(createInitialChromeState('site'), scroll(0));
    expect(state.headerVisible).toBe(true);
    state = reduceChromeVisibility(state, { type: 'pageEnter', mode: 'ingles', isHub: false });
    expect(state.headerVisible).toBe(false);
    expect(state.footerVisible).toBe(true);
  });

  it('entering the INGLÉS hub shows the header immediately too (item C)', () => {
    let state = reduceChromeVisibility(createInitialChromeState('site'), scroll(0));
    state = reduceChromeVisibility(state, { type: 'pageEnter', mode: 'ingles', isHub: true });
    expect(state.headerVisible).toBe(true);
    expect(state.footerVisible).toBe(true);
    expect(state.isHub).toBe(true);
  });

  it('leaving INGLÉS (back to SITE) shows the header again', () => {
    let state = reduceChromeVisibility(createInitialChromeState('ingles'), scroll(0));
    expect(state.headerVisible).toBe(false);
    state = reduceChromeVisibility(state, { type: 'pageEnter', mode: 'site', isHub: false });
    expect(state.headerVisible).toBe(true);
  });

  it('navigating from the hub to a non-hub INGLÉS page drops isHub and re-hides the header', () => {
    let state = reduceChromeVisibility(createInitialChromeState('ingles', true), scroll(0));
    expect(state.headerVisible).toBe(true);
    state = reduceChromeVisibility(state, { type: 'pageEnter', mode: 'ingles', isHub: false });
    expect(state.isHub).toBe(false);
    expect(state.headerVisible).toBe(false);
  });
});

describe('scroll — the first reading after pageEnter only calibrates, never infers a direction', () => {
  it('does not hide the SITE header just because the page loaded already scrolled down', () => {
    const state = reduceChromeVisibility(createInitialChromeState('site'), scroll(900));
    expect(state.headerVisible).toBe(true);
  });

  it('does not show the INGLÉS header just because the page loaded already scrolled near the top', () => {
    const state = reduceChromeVisibility(createInitialChromeState('ingles'), scroll(10));
    expect(state.headerVisible).toBe(false);
  });
});
