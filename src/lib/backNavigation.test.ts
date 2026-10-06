// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  shouldGoBack,
  shouldGoBackWithinArea,
  isInglesAreaPath,
  isInglesHubPath,
  initBackButtons,
  BACK_BUTTON_ATTR,
} from './backNavigation';

describe('shouldGoBack', () => {
  it('is false with no previous history entry, even with a same-origin referrer', () => {
    expect(shouldGoBack('https://chuyocode.test/es/ingles', 'https://chuyocode.test', 1)).toBe(
      false,
    );
  });

  it('is false with an empty referrer, even with previous history', () => {
    expect(shouldGoBack('', 'https://chuyocode.test', 2)).toBe(false);
  });

  it('is false when the referrer is a different origin', () => {
    expect(shouldGoBack('https://google.com/search', 'https://chuyocode.test', 2)).toBe(false);
  });

  it('is true with a same-origin referrer and a previous history entry', () => {
    expect(
      shouldGoBack('https://chuyocode.test/es/ingles/propuestos', 'https://chuyocode.test', 2),
    ).toBe(true);
  });

  it('compares the ORIGIN, not the full URL — a same-origin referrer on a different path still counts', () => {
    expect(shouldGoBack('https://chuyocode.test/en/libros', 'https://chuyocode.test', 3)).toBe(
      true,
    );
  });

  it('is false, not a throw, for a malformed referrer', () => {
    expect(shouldGoBack('not a url', 'https://chuyocode.test', 2)).toBe(false);
  });

  it('is false for a subdomain of the same site — origins must match exactly', () => {
    expect(shouldGoBack('https://blog.chuyocode.test/post', 'https://chuyocode.test', 2)).toBe(
      false,
    );
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
    expect(
      shouldGoBackWithinArea('https://chuyocode.test/es/libros', 'https://chuyocode.test', 2, '/es/noticias'),
    ).toBe(true);
    expect(
      shouldGoBackWithinArea('https://google.com/search', 'https://chuyocode.test', 2, '/es/noticias'),
    ).toBe(false);
    expect(shouldGoBackWithinArea('https://chuyocode.test/es/libros', 'https://chuyocode.test', 1, '/es/noticias')).toBe(
      false,
    );
  });

  it('is always false on the hub, even with a same-origin referrer from inside Inglés', () => {
    expect(
      shouldGoBackWithinArea(
        'https://chuyocode.test/es/ingles/propuestos',
        'https://chuyocode.test',
        2,
        '/es/ingles',
      ),
    ).toBe(false);
  });

  it('is true on another Inglés page when the referrer is same-origin and inside the Inglés area', () => {
    expect(
      shouldGoBackWithinArea(
        'https://chuyocode.test/es/ingles/propuestos',
        'https://chuyocode.test',
        2,
        '/es/ingles/propuestos/b1/articles',
      ),
    ).toBe(true);
  });

  it('is false on another Inglés page when the same-origin referrer is OUTSIDE the Inglés area (brand home, shared link, new tab)', () => {
    expect(
      shouldGoBackWithinArea('https://chuyocode.test/es', 'https://chuyocode.test', 2, '/es/crear'),
    ).toBe(false);
  });

  it('is false on another Inglés page with no previous history entry, even from an Inglés referrer', () => {
    expect(
      shouldGoBackWithinArea(
        'https://chuyocode.test/es/ingles',
        'https://chuyocode.test',
        1,
        '/es/ingles/propuestos',
      ),
    ).toBe(false);
  });

  it('is false on another Inglés page for a different-origin referrer', () => {
    expect(
      shouldGoBackWithinArea('https://google.com/search', 'https://chuyocode.test', 2, '/es/mis-actividades'),
    ).toBe(false);
  });
});

describe('initBackButtons', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  // A same-document hash href (not a real app route): when a test's click is
  // left unprevented, jsdom's own default `<a>` activation behaviour runs —
  // real cross-document navigation is "not implemented" in jsdom and logs an
  // `Error: Not implemented: navigation (except hash changes)` straight to
  // stderr. A hash-only href resolves to the same document (the one real
  // navigation jsdom DOES implement), so the unprevented-click tests below
  // exercise the exact same default-action path with no noise, with no
  // assertion relying on the href's actual value.
  function renderBackLink(href = '#'): HTMLAnchorElement {
    const link = document.createElement('a');
    link.href = href;
    link.setAttribute(BACK_BUTTON_ATTR, '');
    link.textContent = 'Volver';
    document.body.appendChild(link);
    return link;
  }

  it('calls history.back() and prevents the default navigation on a same-origin, non-empty history click', () => {
    Object.defineProperty(document, 'referrer', {
      value: `${window.location.origin}/es/ingles/propuestos`,
      configurable: true,
    });
    Object.defineProperty(window, 'history', {
      value: { length: 2, back: vi.fn() },
      configurable: true,
    });

    initBackButtons();
    const link = renderBackLink();
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    link.dispatchEvent(event);

    expect(window.history.back).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it('leaves the click alone (real <a> navigation) when there is no previous history entry', () => {
    Object.defineProperty(document, 'referrer', {
      value: 'https://chuyocode.test/es/ingles/propuestos',
      configurable: true,
    });
    Object.defineProperty(window, 'history', {
      value: { length: 1, back: vi.fn() },
      configurable: true,
    });

    initBackButtons();
    const link = renderBackLink();
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    link.dispatchEvent(event);

    expect(window.history.back).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('leaves the click alone when the referrer is a different origin', () => {
    Object.defineProperty(document, 'referrer', {
      value: 'https://google.com/search',
      configurable: true,
    });
    Object.defineProperty(window, 'history', {
      value: { length: 3, back: vi.fn() },
      configurable: true,
    });

    initBackButtons();
    const link = renderBackLink();
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));

    expect(window.history.back).not.toHaveBeenCalled();
  });

  it('ignores clicks on unrelated links', () => {
    Object.defineProperty(document, 'referrer', {
      value: 'https://chuyocode.test/es/ingles',
      configurable: true,
    });
    Object.defineProperty(window, 'history', {
      value: { length: 2, back: vi.fn() },
      configurable: true,
    });

    initBackButtons();
    const other = document.createElement('a');
    // Hash href — see `renderBackLink`'s own comment: this click is never
    // intercepted (no `BACK_BUTTON_ATTR`), so jsdom runs its real `<a>`
    // activation behaviour; a hash keeps that on the one navigation path
    // jsdom actually implements.
    other.href = '#';
    document.body.appendChild(other);
    other.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));

    expect(window.history.back).not.toHaveBeenCalled();
  });

  it('ignores a modified click (e.g. Ctrl+click to open in a new tab)', () => {
    Object.defineProperty(document, 'referrer', {
      value: 'https://chuyocode.test/es/ingles',
      configurable: true,
    });
    Object.defineProperty(window, 'history', {
      value: { length: 2, back: vi.fn() },
      configurable: true,
    });

    initBackButtons();
    const link = renderBackLink();
    link.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ctrlKey: true }),
    );

    expect(window.history.back).not.toHaveBeenCalled();
  });

  // Inglés area rules ("desktop" redesign PART 1) — end-to-end through the
  // real click handler, on top of `shouldGoBackWithinArea`'s own unit tests
  // above. These three pass their OWN fake `win` (the second, optional
  // `initBackButtons` param — real `document`/DOM throughout, only
  // `location`/`history` are faked) instead of mutating the shared global
  // `window.history`/`window.location`: several tests above already replace
  // `window.history` with a plain `{ length, back }` stub via
  // `Object.defineProperty` and never restore it, so a REAL
  // `window.history.pushState` call (needed to change `window.location.
  // pathname`) can no longer be relied on later in this same file.
  function fakeWin(pathname: string, historyLength: number): { location: { origin: string; pathname: string }; history: { length: number; back: ReturnType<typeof vi.fn> } } {
    return {
      location: { origin: 'https://chuyocode.test', pathname },
      history: { length: historyLength, back: vi.fn() },
    };
  }

  it('on the Inglés hub, always follows the plain <a href> — never history.back(), even from a deeper Inglés referrer', () => {
    Object.defineProperty(document, 'referrer', {
      value: 'https://chuyocode.test/es/ingles/propuestos',
      configurable: true,
    });
    const win = fakeWin('/es/ingles', 2);

    initBackButtons(document, win as unknown as Window);
    const link = renderBackLink();
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    link.dispatchEvent(event);

    expect(win.history.back).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('on another Inglés page, uses history.back() for a same-origin referrer from inside the Inglés area', () => {
    Object.defineProperty(document, 'referrer', {
      value: 'https://chuyocode.test/es/ingles',
      configurable: true,
    });
    const win = fakeWin('/es/ingles/propuestos', 2);

    initBackButtons(document, win as unknown as Window);
    const link = renderBackLink();
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    link.dispatchEvent(event);

    expect(win.history.back).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it('on another Inglés page, follows the plain <a href> (never history.back()) for a same-origin referrer from OUTSIDE the Inglés area', () => {
    Object.defineProperty(document, 'referrer', {
      value: 'https://chuyocode.test/es',
      configurable: true,
    });
    const win = fakeWin('/es/crear', 2);

    initBackButtons(document, win as unknown as Window);
    const link = renderBackLink();
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    link.dispatchEvent(event);

    expect(win.history.back).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });
});
