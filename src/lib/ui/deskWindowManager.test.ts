// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initDeskWindowManager, DESK_WINDOW_OPEN_ATTR, type DeskWindowManagerHandle } from './deskWindowManager';
import { DESK_WINDOWS_STORAGE_KEY, serializePersistedDeskWindows } from './deskWindowsPersistence';
import type { DeskWindowsState } from '../deskWindowsState';

const toastSpy = vi.fn();
vi.mock('sonner', () => ({ toast: (...args: unknown[]) => toastSpy(...args) }));

const HEADER_RECT = { left: 0, top: 0, width: 1440, height: 64 };
const WRAPPER_RECT = { left: 64, top: 76, width: 600, height: 500 };

function stubRects(): void {
  Element.prototype.getBoundingClientRect = function (this: Element) {
    if (this.hasAttribute('data-chrome-header')) {
      const r = HEADER_RECT;
      return { ...r, right: r.left + r.width, bottom: r.top + r.height, x: r.left, y: r.top, toJSON() {} } as DOMRect;
    }
    const r = WRAPPER_RECT;
    return { ...r, right: r.left + r.width, bottom: r.top + r.height, x: r.left, y: r.top, toJSON() {} } as DOMRect;
  };
}

/** A tiny, ISOLATED in-memory `Storage` per `fakeWin()` call — never the
 * real/shared jsdom `sessionStorage`, which persists across every test in
 * this file and would otherwise leak one test's persisted windows into the
 * next test's fresh manager (restore-after-reload, robustness pass). */
function fakeSessionStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: () => null,
    get length() {
      return store.size;
    },
  } as Storage;
}

function fakeWin(opts: { desktop?: boolean; reducedMotion?: boolean } = {}) {
  const listeners: Record<string, Array<(event: unknown) => void>> = {};
  const win = {
    location: { href: 'https://example.test/es/ingles', origin: 'https://example.test' },
    innerWidth: 1440,
    innerHeight: 900,
    matchMedia: (query: string) => ({
      matches: query.includes('prefers-reduced-motion') ? (opts.reducedMotion ?? false) : (opts.desktop ?? true) && query.includes('min-width'),
    }),
    history: { replaceState: vi.fn() },
    sessionStorage: fakeSessionStorage(),
    setTimeout: ((fn: () => void) => {
      fn();
      return 0;
    }) as unknown as Window['setTimeout'],
    addEventListener: (type: string, fn: (event: unknown) => void) => {
      (listeners[type] ??= []).push(fn);
    },
    removeEventListener: () => {},
  };
  return Object.assign(win, {
    dispatchMessage(data: unknown, source: unknown) {
      listeners.message?.forEach((fn) => fn({ origin: 'https://example.test', data, source }));
    },
  }) as unknown as Window & { dispatchMessage: (data: unknown, source: unknown) => void };
}

async function flushMicrotasks() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

let container: HTMLElement;
let tray: HTMLElement;
let handle: DeskWindowManagerHandle | null;

beforeEach(() => {
  stubRects();
  document.body.innerHTML = '<header data-chrome-header></header>';
  document.body.className = '';
  container = document.createElement('div');
  const trayWrapper = document.createElement('div');
  trayWrapper.setAttribute('data-minimized-tray-wrapper', '');
  tray = document.createElement('nav');
  trayWrapper.appendChild(tray);
  document.body.appendChild(container);
  document.body.appendChild(trayWrapper);
  handle = null;
  toastSpy.mockClear();
});

afterEach(() => {
  handle?.destroy();
  document.body.innerHTML = '';
});

function frameFor(id: string): { wrapper: HTMLElement; iframe: HTMLIFrameElement } | null {
  const wrapper = container.querySelector<HTMLElement>(`[data-desk-window-frame="${id}"]`);
  if (!wrapper) return null;
  return { wrapper, iframe: wrapper.querySelector('iframe')! };
}

describe('initDeskWindowManager — openWindow', () => {
  it('is a no-op for a non-window route', () => {
    const win = fakeWin();
    handle = initDeskWindowManager(container, tray, 'Quitar', null, document, win);
    handle.openWindow('/es/ajustes', 'Ajustes');
    expect(container.children).toHaveLength(0);
  });

  it('creates an iframe frame with ?ventana=1 appended to the real path/query', () => {
    const win = fakeWin();
    handle = initDeskWindowManager(container, tray, 'Quitar', null, document, win);
    handle.openWindow('/es/ingles/actividades?nivel=A1', 'Comunidad');

    const frame = frameFor('community')!;
    expect(frame).not.toBeNull();
    expect(frame.iframe.src).toBe('https://example.test/es/ingles/actividades?nivel=A1&ventana=1');
    expect(frame.iframe.getAttribute('title')).toBe('Comunidad');
  });

  it('dedupes: opening the same window id twice keeps exactly one frame', () => {
    const win = fakeWin();
    handle = initDeskWindowManager(container, tray, 'Quitar', null, document, win);
    handle.openWindow('/es/ingles/actividades', 'Comunidad');
    handle.openWindow('/es/ingles/actividades?nivel=B1', 'Comunidad');

    expect(container.querySelectorAll('[data-desk-window-frame]')).toHaveLength(1);
    expect(frameFor('community')!.iframe.src).toContain('nivel=B1');
  });

  it('an initial window opens on construction', () => {
    const win = fakeWin();
    handle = initDeskWindowManager(container, tray, 'Quitar', { href: '/es/crear/abc', title: 'Nueva actividad' }, document, win);
    expect(frameFor('editor:abc')).not.toBeNull();
  });
});

describe('initDeskWindowManager — click interception', () => {
  it('intercepts a [data-desk-window-open] anchor resolving to a window route, preventing navigation', () => {
    const win = fakeWin();
    handle = initDeskWindowManager(container, tray, 'Quitar', null, document, win);

    const anchor = document.createElement('a');
    anchor.href = '/es/crear';
    anchor.setAttribute(DESK_WINDOW_OPEN_ATTR, 'create');
    anchor.textContent = 'Crear actividad';
    document.body.appendChild(anchor);

    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    anchor.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(frameFor('create')).not.toBeNull();
  });

  it('lets a marked anchor that is not a window route navigate normally', () => {
    const win = fakeWin();
    handle = initDeskWindowManager(container, tray, 'Quitar', null, document, win);

    const anchor = document.createElement('a');
    anchor.href = '/es/ajustes';
    anchor.setAttribute(DESK_WINDOW_OPEN_ATTR, 'whatever');
    document.body.appendChild(anchor);

    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    anchor.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(container.children).toHaveLength(0);
  });
});

describe('initDeskWindowManager — postMessage bridge', () => {
  it('minimize hides the frame (visibility/inert) and renders a tray chip', async () => {
    const win = fakeWin();
    handle = initDeskWindowManager(container, tray, 'Quitar', null, document, win);
    handle.openWindow('/es/ingles/actividades', 'Comunidad');
    const frame = frameFor('community')!;

    win.dispatchMessage({ source: 'desk-window', type: 'minimize' }, frame.iframe.contentWindow);
    await flushMicrotasks(); // the exit animation (`playMinimizeAnimation`) is awaited before the dispatch commits.

    expect(frame.wrapper.style.visibility).toBe('hidden');
    expect(frame.wrapper.hasAttribute('inert')).toBe(true);
    expect(tray.querySelector('[data-minimized-chip="community"]')).not.toBeNull();
  });

  it('close removes the frame entirely when the window has no dirty guard', async () => {
    const win = fakeWin();
    handle = initDeskWindowManager(container, tray, 'Quitar', null, document, win);
    handle.openWindow('/es/ingles/actividades', 'Comunidad');
    const frame = frameFor('community')!;

    win.dispatchMessage({ source: 'desk-window', type: 'close' }, frame.iframe.contentWindow);
    await flushMicrotasks();

    expect(frameFor('community')).toBeNull();
  });

  it('close is blocked when window.deskWindowCanClose resolves false (a dirty editor guard)', async () => {
    const win = fakeWin();
    handle = initDeskWindowManager(container, tray, 'Quitar', { href: '/es/crear/abc', title: 'Nueva actividad' }, document, win);
    const frame = frameFor('editor:abc')!;
    (frame.iframe.contentWindow as unknown as Record<string, unknown>).deskWindowCanClose = async () => false;

    win.dispatchMessage({ source: 'desk-window', type: 'close' }, frame.iframe.contentWindow);
    await flushMicrotasks();

    expect(frameFor('editor:abc')).not.toBeNull();
  });

  it('maximize-toggle fills the viewport (inset 0, no shadow)', () => {
    const win = fakeWin();
    handle = initDeskWindowManager(container, tray, 'Quitar', null, document, win);
    handle.openWindow('/es/ingles/actividades', 'Comunidad');
    const frame = frameFor('community')!;

    win.dispatchMessage({ source: 'desk-window', type: 'maximize-toggle' }, frame.iframe.contentWindow);

    expect(frame.wrapper.style.inset).toBe('0px');
    expect(frame.wrapper.style.boxShadow).toBe('none');
  });

  it('title updates the iframe title attribute and the document title for the active window', () => {
    const win = fakeWin();
    handle = initDeskWindowManager(container, tray, 'Quitar', null, document, win);
    handle.openWindow('/es/ingles/actividades/abc', '');
    const frame = frameFor('activity:abc')!;

    win.dispatchMessage({ source: 'desk-window', type: 'title', text: 'Present Simple' }, frame.iframe.contentWindow);

    expect(frame.iframe.getAttribute('title')).toBe('Present Simple');
    expect(document.title).toBe('Present Simple');
  });

  it('open-window opens a new cascaded window from inside another one', () => {
    const win = fakeWin();
    handle = initDeskWindowManager(container, tray, 'Quitar', null, document, win);
    handle.openWindow('/es/ingles/actividades', 'Comunidad');
    const community = frameFor('community')!;

    win.dispatchMessage({ source: 'desk-window', type: 'open-window', href: '/es/crear', title: 'Crear actividad' }, community.iframe.contentWindow);

    expect(frameFor('create')).not.toBeNull();
  });

  it('a message from an unknown source (not a managed iframe) is ignored', () => {
    const win = fakeWin();
    handle = initDeskWindowManager(container, tray, 'Quitar', null, document, win);
    handle.openWindow('/es/ingles/actividades', 'Comunidad');

    expect(() => win.dispatchMessage({ source: 'desk-window', type: 'minimize' }, {})).not.toThrow();
    expect(frameFor('community')!.wrapper.style.visibility).not.toBe('hidden');
  });

  it('locks body scroll and hides the mobile tray dynamically, only while a window is actually visible', async () => {
    const win = fakeWin();
    handle = initDeskWindowManager(container, tray, 'Quitar', null, document, win);
    expect(document.body.classList.contains('overflow-hidden')).toBe(false);

    handle.openWindow('/es/ingles/actividades', 'Comunidad');
    expect(document.body.classList.contains('overflow-hidden')).toBe(true);
    expect(document.body.classList.contains('h-dvh')).toBe(true);
    const trayWrapper = tray.closest('[data-minimized-tray-wrapper]')!;
    expect(trayWrapper.classList.contains('max-desk:hidden')).toBe(true);

    const frame = frameFor('community')!;
    win.dispatchMessage({ source: 'desk-window', type: 'minimize' }, frame.iframe.contentWindow);
    await flushMicrotasks(); // the exit animation (`playMinimizeAnimation`) is awaited before the dispatch commits.
    expect(document.body.classList.contains('overflow-hidden')).toBe(false);
    expect(trayWrapper.classList.contains('max-desk:hidden')).toBe(false);
  });

  it("the tray chip's own remove calls window.deskWindowCanClose before actually closing", async () => {
    const win = fakeWin();
    handle = initDeskWindowManager(container, tray, 'Quitar', null, document, win);
    handle.openWindow('/es/ingles/actividades', 'Comunidad');
    const frame = frameFor('community')!;
    (frame.iframe.contentWindow as unknown as Record<string, unknown>).deskWindowCanClose = async () => false;
    win.dispatchMessage({ source: 'desk-window', type: 'minimize' }, frame.iframe.contentWindow);
    await flushMicrotasks(); // the exit animation (`playMinimizeAnimation`) is awaited before the dispatch commits.

    const chipRemove = tray.querySelector<HTMLElement>('[data-minimized-chip="community"] button')!;
    chipRemove.click();
    await flushMicrotasks();

    expect(frameFor('community')).not.toBeNull(); // still open — the guard refused to close it
  });

  it('an in-iframe navigation that lands on a DIFFERENT window route opens it as its own window instead of staying in place (click-race defensive net)', () => {
    const win = fakeWin();
    handle = initDeskWindowManager(container, tray, 'Quitar', null, document, win);
    handle.openWindow('/es/ingles/actividades', 'Comunidad');
    const frame = frameFor('community')!;

    // Simulate this frame having navigated IN PLACE to a different window's
    // own route (the click-race this defends against, or any other failure
    // that let a real navigation through) — `location.replace` is spied so
    // this frame's own recovery is directly assertable, never a real jsdom
    // navigation attempt.
    const replaceSpy = vi.fn();
    Object.defineProperty(frame.iframe, 'contentWindow', {
      configurable: true,
      value: {
        location: { pathname: '/es/ingles/actividades/abc', search: '', replace: replaceSpy },
        document: { title: 'Present Simple' },
      },
    });

    frame.iframe.dispatchEvent(new Event('load'));

    // The real destination opens as its OWN window…
    expect(frameFor('activity:abc')).not.toBeNull();
    // …and the original frame is sent back to its own href, never left
    // showing the wrong window's content under the wrong id.
    expect(replaceSpy).toHaveBeenCalledWith('https://example.test/es/ingles/actividades?ventana=1');
  });

  it('an in-iframe navigation that stays on the SAME window route (a filter/pagination link) is left alone', () => {
    const win = fakeWin();
    handle = initDeskWindowManager(container, tray, 'Quitar', null, document, win);
    handle.openWindow('/es/ingles/actividades', 'Comunidad');
    const frame = frameFor('community')!;

    const replaceSpy = vi.fn();
    Object.defineProperty(frame.iframe, 'contentWindow', {
      configurable: true,
      value: {
        location: { pathname: '/es/ingles/actividades', search: '?nivel=A1', replace: replaceSpy },
        document: { title: 'Comunidad', addEventListener: vi.fn() },
      },
    });

    frame.iframe.dispatchEvent(new Event('load'));

    expect(replaceSpy).not.toHaveBeenCalled();
    expect(container.querySelectorAll('[data-desk-window-frame]')).toHaveLength(1);
  });

  /** Synchronously replaces an iframe's own document content via the classic
   * `document.open/write/close` API — reliable in jsdom, unlike setting
   * `.src` (which schedules a real, unimplemented navigation). */
  function writeFrameDoc(iframe: HTMLIFrameElement, html: string): void {
    const doc = iframe.contentDocument!;
    doc.open();
    // The single-string overload is deprecated in favour of variadic
    // `...text`, which is exactly what is passed — `astro check` still flags
    // it (a lib.dom.d.ts quirk unrelated to this call's own correctness).
    (doc.write as (...text: string[]) => void)(html);
    doc.close();
  }

  it("shows a fallback title bar when the loaded document is NOT a genuine desk window, and its close button still closes the frame", async () => {
    const win = fakeWin();
    handle = initDeskWindowManager(container, tray, 'Quitar', null, document, win);
    handle.openWindow('/es/ingles/actividades', 'Comunidad');
    const frame = frameFor('community')!;

    // Simulate a chrome-less document landing in the frame (a 404/500 error
    // page, or a login page the top-navigation bounce somehow missed) —
    // no `[data-desk-window]` marker, a plain error title.
    writeFrameDoc(frame.iframe, '<!doctype html><html><head><title>Error</title></head><body></body></html>');
    frame.iframe.dispatchEvent(new Event('load'));

    const bar = frame.wrapper.querySelector<HTMLElement>('[data-desk-window-fallback-bar]')!;
    expect(bar.hidden).toBe(false);
    expect(bar.querySelector('[data-desk-window-fallback-title]')?.textContent).toBe('Error');

    frame.wrapper.querySelector<HTMLButtonElement>('[data-desk-window-fallback-close]')!.click();
    await flushMicrotasks();
    expect(frameFor('community')).toBeNull();
  });

  it('hides the fallback bar again once a later navigation lands back on a genuine desk window document', () => {
    const win = fakeWin();
    handle = initDeskWindowManager(container, tray, 'Quitar', null, document, win);
    handle.openWindow('/es/ingles/actividades', 'Comunidad');
    const frame = frameFor('community')!;

    writeFrameDoc(frame.iframe, '<!doctype html><html><head><title>Error</title></head><body></body></html>');
    frame.iframe.dispatchEvent(new Event('load'));
    const bar = frame.wrapper.querySelector<HTMLElement>('[data-desk-window-fallback-bar]')!;
    expect(bar.hidden).toBe(false);

    writeFrameDoc(frame.iframe, '<!doctype html><html><body><div data-desk-window></div></body></html>');
    frame.iframe.dispatchEvent(new Event('load'));

    expect(bar.hidden).toBe(true);
  });

  it("the fallback bar's minimize button minimizes the frame (hides/inert, no DOM-side guard to ask)", async () => {
    const win = fakeWin();
    handle = initDeskWindowManager(container, tray, 'Quitar', null, document, win);
    handle.openWindow('/es/ingles/actividades', 'Comunidad');
    const frame = frameFor('community')!;

    writeFrameDoc(frame.iframe, '<!doctype html><html><head><title>Error</title></head><body></body></html>');
    frame.iframe.dispatchEvent(new Event('load'));
    frame.wrapper.querySelector<HTMLButtonElement>('[data-desk-window-fallback-minimize]')!.click();
    await flushMicrotasks();

    expect(frame.wrapper.style.visibility).toBe('hidden');
    expect(frame.wrapper.hasAttribute('inert')).toBe(true);
  });

  it('drag-start/drag-move/drag-end moves the wrapper and commits the offset', () => {
    const win = fakeWin();
    handle = initDeskWindowManager(container, tray, 'Quitar', null, document, win);
    handle.openWindow('/es/ingles/actividades', 'Comunidad');
    const frame = frameFor('community')!;

    win.dispatchMessage({ source: 'desk-window', type: 'drag-start' }, frame.iframe.contentWindow);
    win.dispatchMessage({ source: 'desk-window', type: 'drag-move', dx: 40, dy: 10 }, frame.iframe.contentWindow);
    expect(frame.wrapper.style.translate).toBe('40px 10px');

    win.dispatchMessage({ source: 'desk-window', type: 'drag-end' }, frame.iframe.contentWindow);
    // Committed into state — a later render (e.g. opening another window, which cascades off the topmost one) reflects it.
    handle.openWindow('/es/crear', 'Crear actividad');
    const second = frameFor('create')!;
    expect(second.wrapper.style.translate).toBe('68px 38px'); // 40+28, 10+28
  });
});

describe('initDeskWindowManager — restore-after-reload (robustness pass)', () => {
  it('recreates every persisted window on mount, with its own geometry/minimized state', () => {
    const win = fakeWin();
    const persisted: DeskWindowsState = {
      windows: [
        { id: 'community', kind: 'community', href: '/es/ingles/actividades', title: 'Comunidad', minimized: false, maximized: false, offset: { x: 12, y: 8 }, z: 1 },
        { id: 'activity:abc', kind: 'activity', href: '/es/ingles/actividades/abc', title: 'x', minimized: true, maximized: false, offset: { x: 0, y: 0 }, z: 2 },
      ],
      nextZ: 3,
    };
    win.sessionStorage.setItem(DESK_WINDOWS_STORAGE_KEY, serializePersistedDeskWindows(persisted));

    handle = initDeskWindowManager(container, tray, 'Quitar', null, document, win);

    expect(frameFor('community')).not.toBeNull();
    const activity = frameFor('activity:abc')!;
    expect(activity.wrapper.style.visibility).toBe('hidden'); // restored minimized
  });

  it("dedupes the URL's own initial window against a restored one for the same id, through the ordinary reducer path", () => {
    const win = fakeWin();
    const persisted: DeskWindowsState = {
      windows: [
        { id: 'community', kind: 'community', href: '/es/ingles/actividades?nivel=A1', title: 'Comunidad', minimized: false, maximized: false, offset: { x: 0, y: 0 }, z: 1 },
      ],
      nextZ: 2,
    };
    win.sessionStorage.setItem(DESK_WINDOWS_STORAGE_KEY, serializePersistedDeskWindows(persisted));

    handle = initDeskWindowManager(
      container,
      tray,
      'Quitar',
      { href: '/es/ingles/actividades?nivel=B1', title: 'Comunidad' },
      document,
      win,
    );

    expect(container.querySelectorAll('[data-desk-window-frame]')).toHaveLength(1);
    expect(frameFor('community')!.iframe.src).toContain('nivel=B1');
  });

  it('a corrupted/absent sessionStorage value is simply no restore at all (first-visit behaviour)', () => {
    const win = fakeWin();
    win.sessionStorage.setItem(DESK_WINDOWS_STORAGE_KEY, '{not json');
    handle = initDeskWindowManager(container, tray, 'Quitar', null, document, win);
    expect(container.querySelectorAll('[data-desk-window-frame]')).toHaveLength(0);
  });

  it('write-through: opening a window persists the full state, recoverable after this host page tears down (e.g. "Presentar"/"Imprimir", target="_top")', () => {
    const win = fakeWin();
    handle = initDeskWindowManager(container, tray, 'Quitar', null, document, win);
    handle.openWindow('/es/ingles/actividades', 'Comunidad');

    const raw = win.sessionStorage.getItem(DESK_WINDOWS_STORAGE_KEY);
    expect(raw).not.toBeNull();
    const persisted = JSON.parse(raw!) as DeskWindowsState;
    expect(persisted.windows).toHaveLength(1);
    expect(persisted.windows[0].id).toBe('community');
  });

  it('write-through also covers minimize/close, so the tray/desk reload exactly as left', async () => {
    const win = fakeWin();
    handle = initDeskWindowManager(container, tray, 'Quitar', null, document, win);
    handle.openWindow('/es/ingles/actividades', 'Comunidad');
    const frame = frameFor('community')!;
    win.dispatchMessage({ source: 'desk-window', type: 'minimize' }, frame.iframe.contentWindow);
    await flushMicrotasks(); // the exit animation (`playMinimizeAnimation`) is awaited before the dispatch commits.

    let persisted = JSON.parse(win.sessionStorage.getItem(DESK_WINDOWS_STORAGE_KEY)!) as DeskWindowsState;
    expect(persisted.windows[0].minimized).toBe(true);

    win.dispatchMessage({ source: 'desk-window', type: 'close' }, frame.iframe.contentWindow);
    await flushMicrotasks();
    persisted = JSON.parse(win.sessionStorage.getItem(DESK_WINDOWS_STORAGE_KEY)!) as DeskWindowsState;
    expect(persisted.windows).toHaveLength(0);
  });
});

describe('initDeskWindowManager — entrance/exit motion (robustness pass)', () => {
  it('opening from a desk item scales in FROM that item (transform-origin relative to the new frame, via onClickCapture)', () => {
    const win = fakeWin();
    handle = initDeskWindowManager(container, tray, 'Quitar', null, document, win);

    const anchor = document.createElement('a');
    anchor.href = '/es/ingles/actividades';
    anchor.setAttribute(DESK_WINDOW_OPEN_ATTR, 'community');
    anchor.textContent = 'Comunidad';
    document.body.appendChild(anchor);
    anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));

    const frame = frameFor('community')!;
    expect(frame.wrapper.hasAttribute('data-desk-window-manager-opening')).toBe(true);
    // `stubRects()` gives every non-header element the same WRAPPER_RECT
    // (left:64, top:76, width:600, height:500) — the opener's own CENTRE
    // (364, 326) minus the new frame's own top-left (64, 76), since
    // `transform-origin` is relative to the frame's own box, not the
    // viewport.
    expect(frame.wrapper.style.getPropertyValue('--desk-window-manager-from')).toBe('300px 250px');
  });

  it('any OTHER open (e.g. postMessage from inside an embedded window) scales in from the cascade spot — no explicit transform-origin override', () => {
    const win = fakeWin();
    handle = initDeskWindowManager(container, tray, 'Quitar', null, document, win);
    handle.openWindow('/es/ingles/actividades', 'Comunidad');
    const frame = frameFor('community')!;

    expect(frame.wrapper.hasAttribute('data-desk-window-manager-opening')).toBe(true);
    expect(frame.wrapper.style.getPropertyValue('--desk-window-manager-from')).toBe('');
  });

  it('plays no entrance animation at all under prefers-reduced-motion', () => {
    const win = fakeWin({ reducedMotion: true });
    handle = initDeskWindowManager(container, tray, 'Quitar', null, document, win);
    handle.openWindow('/es/ingles/actividades', 'Comunidad');
    const frame = frameFor('community')!;

    expect(frame.wrapper.hasAttribute('data-desk-window-manager-opening')).toBe(false);
  });

  it('restoring a persisted window after a reload never plays the entrance animation (that is not an "opening")', () => {
    const win = fakeWin();
    const persisted: DeskWindowsState = {
      windows: [
        { id: 'community', kind: 'community', href: '/es/ingles/actividades', title: 'Comunidad', minimized: false, maximized: false, offset: { x: 0, y: 0 }, z: 1 },
      ],
      nextZ: 2,
    };
    win.sessionStorage.setItem(DESK_WINDOWS_STORAGE_KEY, serializePersistedDeskWindows(persisted));

    handle = initDeskWindowManager(container, tray, 'Quitar', null, document, win);

    expect(frameFor('community')!.wrapper.hasAttribute('data-desk-window-manager-opening')).toBe(false);
  });

  it('reopening/focusing an already-open window never replays the entrance animation', () => {
    const win = fakeWin();
    handle = initDeskWindowManager(container, tray, 'Quitar', null, document, win);
    handle.openWindow('/es/ingles/actividades', 'Comunidad');
    const frame = frameFor('community')!;
    frame.wrapper.removeAttribute('data-desk-window-manager-opening'); // simulate the first entrance already having finished

    handle.openWindow('/es/ingles/actividades?nivel=A1', 'Comunidad');

    expect(frame.wrapper.hasAttribute('data-desk-window-manager-opening')).toBe(false);
  });

  it('minimize adds the shrink-toward-tray exit class before the dispatch commits', () => {
    const win = fakeWin();
    handle = initDeskWindowManager(container, tray, 'Quitar', null, document, win);
    handle.openWindow('/es/ingles/actividades', 'Comunidad');
    const frame = frameFor('community')!;

    win.dispatchMessage({ source: 'desk-window', type: 'minimize' }, frame.iframe.contentWindow);

    // Synchronously, before the awaited exit animation resolves — the
    // window is still fully visible/reachable (same reasoning the close
    // animation already relies on), just mid-exit.
    expect(frame.wrapper.classList.contains('ingles-window--minimizing')).toBe(true);
    expect(frame.wrapper.style.visibility).not.toBe('hidden');
  });

  it("the fallback bar's minimize button plays the same exit class", () => {
    const win = fakeWin();
    handle = initDeskWindowManager(container, tray, 'Quitar', null, document, win);
    handle.openWindow('/es/ingles/actividades', 'Comunidad');
    const frame = frameFor('community')!;

    frame.wrapper.querySelector<HTMLButtonElement>('[data-desk-window-fallback-minimize]')!.click();

    expect(frame.wrapper.classList.contains('ingles-window--minimizing')).toBe(true);
  });
});

describe('initDeskWindowManager — the 8-window cap (robustness pass)', () => {
  async function openManyMinimized(win: ReturnType<typeof fakeWin>, count: number): Promise<void> {
    for (let i = 0; i < count; i += 1) {
      handle!.openWindow(`/es/ingles/actividades/w${i}`, `w${i}`);
      const frame = frameFor(`activity:w${i}`)!;
      win.dispatchMessage({ source: 'desk-window', type: 'minimize' }, frame.iframe.contentWindow);
      await flushMicrotasks(); // the exit animation (`playMinimizeAnimation`) is awaited before each dispatch commits.
    }
  }

  it('opening a 9th window evicts the OLDEST minimized window to make room', async () => {
    const win = fakeWin();
    handle = initDeskWindowManager(container, tray, 'Quitar', null, document, win, 'Demasiadas ventanas');
    await openManyMinimized(win, 8);
    expect(container.querySelectorAll('[data-desk-window-frame]')).toHaveLength(8);

    handle.openWindow('/es/ingles/actividades/w8', 'w8');
    await flushMicrotasks();

    expect(container.querySelectorAll('[data-desk-window-frame]')).toHaveLength(8);
    expect(frameFor('activity:w0')).toBeNull(); // the oldest-minimized one was evicted
    expect(frameFor('activity:w8')).not.toBeNull(); // the new one opened in its place
    expect(toastSpy).not.toHaveBeenCalled();
  });

  it('skips a minimized window whose own deskWindowCanClose guard refuses, trying the next-oldest instead', async () => {
    const win = fakeWin();
    handle = initDeskWindowManager(container, tray, 'Quitar', null, document, win, 'Demasiadas ventanas');
    await openManyMinimized(win, 8);
    const dirtiest = frameFor('activity:w0')!;
    (dirtiest.iframe.contentWindow as unknown as Record<string, unknown>).deskWindowCanClose = async () => false;

    handle.openWindow('/es/ingles/actividades/w8', 'w8');
    await flushMicrotasks();

    expect(frameFor('activity:w0')).not.toBeNull(); // refused — stays
    expect(frameFor('activity:w1')).toBeNull(); // next-oldest evicted instead
    expect(frameFor('activity:w8')).not.toBeNull();
  });

  it('shows a calm notice instead of opening when every minimized window refuses to close', async () => {
    const win = fakeWin();
    handle = initDeskWindowManager(container, tray, 'Quitar', null, document, win, 'Demasiadas ventanas');
    await openManyMinimized(win, 8);
    for (let i = 0; i < 8; i += 1) {
      const frame = frameFor(`activity:w${i}`)!;
      (frame.iframe.contentWindow as unknown as Record<string, unknown>).deskWindowCanClose = async () => false;
    }

    handle.openWindow('/es/ingles/actividades/w8', 'w8');
    await flushMicrotasks();

    expect(frameFor('activity:w8')).toBeNull(); // never opened
    expect(container.querySelectorAll('[data-desk-window-frame]')).toHaveLength(8);
    expect(toastSpy).toHaveBeenCalledWith('Demasiadas ventanas');
  });

  it('reopening/focusing an EXISTING window never triggers the cap, even already at 8', async () => {
    const win = fakeWin();
    handle = initDeskWindowManager(container, tray, 'Quitar', null, document, win, 'Demasiadas ventanas');
    await openManyMinimized(win, 8);

    handle.openWindow('/es/ingles/actividades/w0', 'w0');

    expect(container.querySelectorAll('[data-desk-window-frame]')).toHaveLength(8);
    expect(toastSpy).not.toHaveBeenCalled();
  });
});

describe('initDeskWindowManager — focus management (robustness pass)', () => {
  it('opening a window moves keyboard focus into it once its content loads', () => {
    const win = fakeWin();
    handle = initDeskWindowManager(container, tray, 'Quitar', null, document, win);
    handle.openWindow('/es/ingles/actividades', 'Comunidad');
    const frame = frameFor('community')!;

    frame.iframe.dispatchEvent(new Event('load'));

    expect(document.activeElement).toBe(frame.iframe);
  });

  it('a window that loads in the background (no longer the active one) never steals focus', () => {
    const win = fakeWin();
    handle = initDeskWindowManager(container, tray, 'Quitar', null, document, win);
    handle.openWindow('/es/ingles/actividades', 'Comunidad');
    const community = frameFor('community')!;
    community.iframe.dispatchEvent(new Event('load'));
    document.body.focus(); // simulate focus having moved elsewhere since

    // Re-fires this SAME frame's own 'load' (e.g. a slow in-window
    // navigation resolving) after a DIFFERENT window has since become active.
    handle.openWindow('/es/crear', 'Crear actividad');
    frameFor('create')!.iframe.dispatchEvent(new Event('load'));
    community.iframe.dispatchEvent(new Event('load'));

    expect(document.activeElement).toBe(frameFor('create')!.iframe);
  });

  it('closing a window sends focus to the next window down the stack', async () => {
    const win = fakeWin();
    handle = initDeskWindowManager(container, tray, 'Quitar', null, document, win);
    handle.openWindow('/es/ingles/actividades', 'Comunidad');
    handle.openWindow('/es/crear', 'Crear actividad');
    const community = frameFor('community')!;
    const create = frameFor('create')!;

    win.dispatchMessage({ source: 'desk-window', type: 'close' }, create.iframe.contentWindow);
    await flushMicrotasks();

    expect(document.activeElement).toBe(community.iframe);
  });

  it('closing the last window sends focus back to the exact desk item that opened it', async () => {
    const win = fakeWin();
    handle = initDeskWindowManager(container, tray, 'Quitar', null, document, win);

    const anchor = document.createElement('a');
    anchor.href = '/es/ingles/actividades';
    anchor.setAttribute(DESK_WINDOW_OPEN_ATTR, 'community');
    anchor.textContent = 'Comunidad';
    document.body.appendChild(anchor);
    anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    const frame = frameFor('community')!;

    win.dispatchMessage({ source: 'desk-window', type: 'close' }, frame.iframe.contentWindow);
    await flushMicrotasks();

    expect(document.activeElement).toBe(anchor);
  });

  it('closing the last window is a quiet no-op for focus when there is no opener to return to (e.g. a postMessage-driven open)', async () => {
    const win = fakeWin();
    handle = initDeskWindowManager(container, tray, 'Quitar', null, document, win);
    handle.openWindow('/es/ingles/actividades', 'Comunidad'); // no origin -> no tracked opener element
    const frame = frameFor('community')!;
    document.body.tabIndex = -1;
    document.body.focus();

    win.dispatchMessage({ source: 'desk-window', type: 'close' }, frame.iframe.contentWindow);
    await flushMicrotasks();

    expect(document.activeElement).toBe(document.body);
  });
});
