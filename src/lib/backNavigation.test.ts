// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  shouldGoBack,
  shouldGoBackWithinArea,
  isInglesAreaPath,
  isInglesHubPath,
  trackPageVisit,
  readTrackedPreviousPath,
  resolvePreviousPath,
  initBackButtons,
  BACK_BUTTON_ATTR,
} from './backNavigation';

function fakeStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
  };
}

describe('trackPageVisit / readTrackedPreviousPath (bugfix 2026-10-06 — document.referrer goes stale)', () => {
  it('has no tracked previous path before anything was ever recorded', () => {
    const storage = fakeStorage();
    expect(readTrackedPreviousPath(storage)).toBeNull();
  });

  it('records the FIRST page with no previous path yet', () => {
    const storage = fakeStorage();
    trackPageVisit('/es/ingles', storage);
    expect(readTrackedPreviousPath(storage)).toBeNull();
  });

  it('slides the window forward on a real navigation to a different page', () => {
    const storage = fakeStorage();
    trackPageVisit('/es/ingles', storage);
    trackPageVisit('/es/ingles/propuestos', storage);
    expect(readTrackedPreviousPath(storage)).toBe('/es/ingles');
  });

  it('keeps sliding correctly across a longer chain of real navigations', () => {
    const storage = fakeStorage();
    trackPageVisit('/es/ingles', storage);
    trackPageVisit('/es/ingles/propuestos', storage);
    trackPageVisit('/es/ingles/A2/present-simple', storage);
    expect(readTrackedPreviousPath(storage)).toBe('/es/ingles/propuestos');
    trackPageVisit('/es/ingles/A2/present-simple/daily-standup-routine', storage);
    expect(readTrackedPreviousPath(storage)).toBe('/es/ingles/A2/present-simple');
  });

  it('a reload of the EXACT SAME page (F5) never overwrites the real previous path', () => {
    const storage = fakeStorage();
    trackPageVisit('/es/ingles', storage);
    trackPageVisit('/es/ingles/propuestos', storage);
    // Reload of the same page — a no-op for the tracker.
    trackPageVisit('/es/ingles/propuestos', storage);
    expect(readTrackedPreviousPath(storage)).toBe('/es/ingles');
  });

  it('treats a query-string-only change as a genuinely different page (search/filter changes)', () => {
    const storage = fakeStorage();
    trackPageVisit('/es/ingles/actividades', storage);
    trackPageVisit('/es/ingles/actividades?q=present', storage);
    expect(readTrackedPreviousPath(storage)).toBe('/es/ingles/actividades');
    trackPageVisit('/es/ingles/actividades/abc-123', storage);
    // The exact filtered list the visitor was actually looking at when they
    // left — never a stale, already-abandoned filter.
    expect(readTrackedPreviousPath(storage)).toBe('/es/ingles/actividades?q=present');
  });

  it('degrades to a no-op (never throws) when storage read/write throws', () => {
    const storage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(() => trackPageVisit('/es/ingles', storage)).not.toThrow();
  });

  it('readTrackedPreviousPath degrades to null (never throws) when storage read throws', () => {
    const storage = {
      getItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readTrackedPreviousPath(storage)).toBeNull();
  });
});

describe('resolvePreviousPath', () => {
  const origin = 'https://chuyocode.test';

  it('prefers the tracked path over the referrer when both are present', () => {
    expect(resolvePreviousPath('/es/ingles', 'https://chuyocode.test/es/libros', origin)).toBe('/es/ingles');
  });

  it('falls back to a same-origin referrer when nothing is tracked yet (the very first page of a session)', () => {
    expect(resolvePreviousPath(null, 'https://chuyocode.test/es/libros', origin)).toBe('/es/libros');
  });

  it('is null when nothing is tracked and the referrer is cross-origin', () => {
    expect(resolvePreviousPath(null, 'https://google.com/search', origin)).toBeNull();
  });

  it('is null when nothing is tracked and there is no referrer at all (direct visit)', () => {
    expect(resolvePreviousPath(null, '', origin)).toBeNull();
  });

  it('is null (never throws) on a malformed referrer with nothing tracked', () => {
    expect(() => resolvePreviousPath(null, 'not a url', origin)).not.toThrow();
    expect(resolvePreviousPath(null, 'not a url', origin)).toBeNull();
  });
});

describe('shouldGoBack', () => {
  it('is false with no previous history entry, even with a known previous path', () => {
    expect(shouldGoBack('/es/ingles', 1)).toBe(false);
  });

  it('is false when the previous path is unknown (null), even with previous history', () => {
    expect(shouldGoBack(null, 2)).toBe(false);
  });

  it('is true with a known previous path and a previous history entry', () => {
    expect(shouldGoBack('/es/ingles/propuestos', 2)).toBe(true);
  });
});

describe('isInglesAreaPath', () => {
  it('is true for the hub and every subroute under it', () => {
    expect(isInglesAreaPath('/es/ingles')).toBe(true);
    expect(isInglesAreaPath('/es/ingles/propuestos')).toBe(true);
    expect(isInglesAreaPath('/en/ingles/actividades/abc-123/imprimir')).toBe(true);
  });

  it('is true for the other theme="ingles" routes outside /ingles', () => {
    expect(isInglesAreaPath('/es/crear')).toBe(true);
    expect(isInglesAreaPath('/en/crear/abc-123')).toBe(true);
    expect(isInglesAreaPath('/es/mis-actividades')).toBe(true);
    expect(isInglesAreaPath('/es/perfil')).toBe(true);
    expect(isInglesAreaPath('/en/premium')).toBe(true);
    expect(isInglesAreaPath('/es/auth/consentimiento')).toBe(true);
  });

  it('is false for brand/site pages, including a route that merely starts the same way', () => {
    expect(isInglesAreaPath('/es')).toBe(false);
    expect(isInglesAreaPath('/es/libros')).toBe(false);
    expect(isInglesAreaPath('/es/noticias')).toBe(false);
    // Not a prefix match past a full path segment.
    expect(isInglesAreaPath('/es/inglesia')).toBe(false);
    expect(isInglesAreaPath('/es/creartel')).toBe(false);
    // `/[lang]/auth/entrar` is NOT in the Inglés area — only `consentimiento` is.
    expect(isInglesAreaPath('/es/auth/entrar')).toBe(false);
  });
});

describe('isInglesHubPath', () => {
  it('is true only for the hub itself, with or without a trailing slash', () => {
    expect(isInglesHubPath('/es/ingles')).toBe(true);
    expect(isInglesHubPath('/en/ingles/')).toBe(true);
  });

  it('is false for a hub subroute or any other page', () => {
    expect(isInglesHubPath('/es/ingles/propuestos')).toBe(false);
    expect(isInglesHubPath('/es/crear')).toBe(false);
    expect(isInglesHubPath('/es')).toBe(false);
  });
});

describe('shouldGoBackWithinArea', () => {
  it('behaves exactly like shouldGoBack on a brand/site page', () => {
    expect(shouldGoBackWithinArea('/es/libros', 2, '/es/noticias')).toBe(true);
    expect(shouldGoBackWithinArea(null, 2, '/es/noticias')).toBe(false);
    expect(shouldGoBackWithinArea('/es/libros', 1, '/es/noticias')).toBe(false);
  });

  it('is always false on the hub, even with a previous path from inside Inglés', () => {
    expect(shouldGoBackWithinArea('/es/ingles/propuestos', 2, '/es/ingles')).toBe(false);
  });

  it('is true on another Inglés page when the previous path is inside the Inglés area', () => {
    expect(shouldGoBackWithinArea('/es/ingles/propuestos', 2, '/es/ingles/propuestos/b1/articles')).toBe(true);
  });

  it('is false on another Inglés page when the previous path is OUTSIDE the Inglés area (brand home, shared link, new tab)', () => {
    expect(shouldGoBackWithinArea('/es', 2, '/es/crear')).toBe(false);
  });

  it('is false on another Inglés page with no previous history entry, even with a known Inglés previous path', () => {
    expect(shouldGoBackWithinArea('/es/ingles', 1, '/es/ingles/propuestos')).toBe(false);
  });

  it('is false on another Inglés page when the previous path is unknown (null)', () => {
    expect(shouldGoBackWithinArea(null, 2, '/es/mis-actividades')).toBe(false);
  });

  // Owner feedback 2026-10-06: a search/filter change on the same list is a
  // real navigation — the tracked previous path is always the EXACT query
  // the visitor last saw, never a stale earlier one (see
  // `trackPageVisit`'s own test above). This just confirms the decision
  // itself does not special-case or strip query strings.
  it('treats a previous path WITH a query string as inside the Inglés area just like one without', () => {
    expect(shouldGoBackWithinArea('/es/ingles/actividades?q=present', 2, '/es/ingles/actividades/abc-123')).toBe(
      true,
    );
  });
});

describe('initBackButtons', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // A FRESH `Document` per test (`document.implementation.createHTMLDocument`,
  // same posture as `minimizedWindows.test.ts`'s own `initMinimizedWindowsTray`
  // tests) — `initBackButtons` binds its one delegated listener to WHATEVER
  // `doc` it is given, and that listener is never removed between tests;
  // reusing the real shared `document` across every `it` in this block would
  // stack one more stale listener (closing over an earlier test's own fake
  // `win`) on every call, each firing again on every later click.
  function freshDoc(referrer = ''): Document {
    const doc = document.implementation.createHTMLDocument('');
    Object.defineProperty(doc, 'referrer', { value: referrer, configurable: true });
    return doc;
  }

  function renderBackLink(doc: Document, href = '#'): HTMLAnchorElement {
    const link = doc.createElement('a');
    link.href = href;
    link.setAttribute(BACK_BUTTON_ATTR, '');
    link.textContent = 'Volver';
    doc.body.appendChild(link);
    return link;
  }

  function fakeWin(
    pathname: string,
    historyLength: number,
    storage: ReturnType<typeof fakeStorage> = fakeStorage(),
  ): { location: { origin: string; pathname: string }; history: { length: number; back: ReturnType<typeof vi.fn> }; sessionStorage: ReturnType<typeof fakeStorage> } {
    return {
      location: { origin: 'https://chuyocode.test', pathname },
      history: { length: historyLength, back: vi.fn() },
      sessionStorage: storage,
    };
  }

  function click(doc: Document, win: ReturnType<typeof fakeWin>, href = '#'): MouseEvent {
    initBackButtons(doc, win as unknown as Window);
    const link = renderBackLink(doc, href);
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    link.dispatchEvent(event);
    return event;
  }

  // REGRESSION (found while verifying the above live in a real browser,
  // 2026-10-06): `ClientRouter.astro` (Astro's own View Transitions router,
  // `node_modules/astro/components/ClientRouter.astro`) ALSO binds a click
  // listener to `document`, in the bubble phase — and it is registered
  // EARLIER on the page (it renders in `<head>`; `initBackButtons` runs from
  // `BaseLayout.astro`'s own body script). Two bubble-phase listeners on the
  // SAME node fire in REGISTRATION order, so Astro's own listener used to
  // run FIRST every time, already call its own `preventDefault()` and start
  // its own forward `navigate()` — by the time a bubble-phase listener here
  // got its turn, `event.defaultPrevented` was already `true`, and
  // `history.back()` below NEVER ran, for ANY back button, regardless of
  // how correct the decision logic was. `initBackButtons` now binds in the
  // CAPTURE phase specifically so it always runs BEFORE any bubble-phase
  // listener on the same node, independent of registration order. This test
  // reproduces that exact ordering with a fake "Astro-like" listener
  // registered BEFORE `initBackButtons` runs.
  it("wins the race against an EARLIER-registered bubble-phase 'Astro router'-like click listener on the same document", () => {
    const storage = fakeStorage();
    trackPageVisit('/es/libros', storage);
    trackPageVisit('/es/noticias', storage);
    const win = fakeWin('/es/noticias', 2, storage);
    const doc = freshDoc();

    // Registered BEFORE `initBackButtons` — same relative order as
    // `ClientRouter.astro`'s own script running ahead of `BaseLayout.astro`'s.
    let astroLikeNavigateCalls = 0;
    doc.addEventListener('click', (event) => {
      if (event.defaultPrevented) return;
      event.preventDefault();
      astroLikeNavigateCalls++;
    });

    const event = click(doc, win);

    expect(win.history.back).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
    // The fake router's own listener still fires (capture doesn't stop other
    // listeners from running) but sees `defaultPrevented` already `true` and
    // bails, exactly like `ClientRouter.astro`'s own `ev.defaultPrevented`
    // check — it must never ALSO navigate.
    expect(astroLikeNavigateCalls).toBe(0);
  });

  it('calls history.back() and prevents the default navigation when the tracked previous path matches a real previous screen', () => {
    const storage = fakeStorage();
    trackPageVisit('/es/libros', storage);
    trackPageVisit('/es/noticias', storage);
    const win = fakeWin('/es/noticias', 2, storage);

    const event = click(freshDoc(), win);

    expect(win.history.back).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it('leaves the click alone (real <a> navigation) when there is no previous history entry', () => {
    const storage = fakeStorage();
    trackPageVisit('/es/libros', storage);
    trackPageVisit('/es/noticias', storage);
    const win = fakeWin('/es/noticias', 1, storage);

    const event = click(freshDoc(), win);

    expect(win.history.back).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('falls back to document.referrer when nothing is tracked yet (the very first page of a session)', () => {
    const doc = freshDoc('https://chuyocode.test/es/libros');
    const win = fakeWin('/es/noticias', 2);

    const event = click(doc, win);

    expect(win.history.back).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it('ignores clicks on unrelated links', () => {
    const storage = fakeStorage();
    trackPageVisit('/es', storage);
    trackPageVisit('/es/ingles', storage);
    const win = fakeWin('/es/ingles', 2, storage);
    const doc = freshDoc();

    initBackButtons(doc, win as unknown as Window);
    const other = doc.createElement('a');
    other.href = '#';
    doc.body.appendChild(other);
    other.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));

    expect(win.history.back).not.toHaveBeenCalled();
  });

  it('ignores a modified click (e.g. Ctrl+click to open in a new tab)', () => {
    const storage = fakeStorage();
    trackPageVisit('/es', storage);
    trackPageVisit('/es/ingles', storage);
    const win = fakeWin('/es/ingles', 2, storage);
    const doc = freshDoc();

    initBackButtons(doc, win as unknown as Window);
    const link = renderBackLink(doc);
    link.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ctrlKey: true }),
    );

    expect(win.history.back).not.toHaveBeenCalled();
  });

  // Inglés area rules ("desktop" redesign PART 1) — end-to-end through the
  // real click handler, driven by the TRACKED previous path (bugfix,
  // 2026-10-06) rather than `document.referrer`, which is what the owner's
  // real repro needed — a visitor who entered Inglés from the ChuyoCode
  // home and browsed several client-side hops deep (`document.referrer`
  // stays stale across every one of them; the tracker does not).
  it('on the Inglés hub, always follows the plain <a href> — never history.back(), even from a deeper Inglés previous screen', () => {
    const storage = fakeStorage();
    trackPageVisit('/es/ingles/propuestos', storage);
    trackPageVisit('/es/ingles', storage);
    const win = fakeWin('/es/ingles', 2, storage);

    const event = click(freshDoc(), win);

    expect(win.history.back).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('on another Inglés page, uses history.back() when the tracked previous screen is inside the Inglés area, across several client-side hops', () => {
    const storage = fakeStorage();
    // Simulates: full load /es/ -> client-nav /es/ingles -> client-nav
    // /es/ingles/propuestos — `document.referrer` would still read "" (or
    // whatever the FIRST load's referrer was) at this point in a real
    // browser; the tracker does not care.
    trackPageVisit('/es/', storage);
    trackPageVisit('/es/ingles', storage);
    trackPageVisit('/es/ingles/propuestos', storage);
    const win = fakeWin('/es/ingles/propuestos', 3, storage);

    const event = click(freshDoc(), win);

    expect(win.history.back).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it('on another Inglés page, follows the plain <a href> (never history.back()) when the tracked previous screen is OUTSIDE the Inglés area', () => {
    const storage = fakeStorage();
    trackPageVisit('/es', storage);
    trackPageVisit('/es/crear', storage);
    const win = fakeWin('/es/crear', 2, storage);

    const event = click(freshDoc(), win);

    expect(win.history.back).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('REGRESSION (owner report, 2026-10-06): a search/filter change on a list, then an exercise page, still goes back to the EXACT filtered list, not a stale earlier filter nor the ChuyoCode home', () => {
    const storage = fakeStorage();
    trackPageVisit('/es/ingles', storage);
    trackPageVisit('/es/ingles/actividades', storage);
    trackPageVisit('/es/ingles/actividades?q=present', storage);
    trackPageVisit('/es/ingles/actividades/abc-123', storage);
    const win = fakeWin('/es/ingles/actividades/abc-123', 4, storage);

    const event = click(freshDoc(), win);

    expect(win.history.back).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });
});
