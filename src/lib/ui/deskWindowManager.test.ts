// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initDeskWindowManager, DESK_WINDOW_OPEN_ATTR, type DeskWindowManagerHandle } from './deskWindowManager';

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

function fakeWin(opts: { desktop?: boolean } = {}) {
  const listeners: Record<string, Array<(event: unknown) => void>> = {};
  const win = {
    location: { href: 'https://example.test/es/ingles', origin: 'https://example.test' },
    innerWidth: 1440,
    innerHeight: 900,
    matchMedia: (query: string) => ({ matches: (opts.desktop ?? true) && query.includes('min-width') }),
    history: { replaceState: vi.fn() },
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
  it('minimize hides the frame (visibility/inert) and renders a tray chip', () => {
    const win = fakeWin();
    handle = initDeskWindowManager(container, tray, 'Quitar', null, document, win);
    handle.openWindow('/es/ingles/actividades', 'Comunidad');
    const frame = frameFor('community')!;

    win.dispatchMessage({ source: 'desk-window', type: 'minimize' }, frame.iframe.contentWindow);

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

  it('locks body scroll and hides the mobile tray dynamically, only while a window is actually visible', () => {
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

    const chipRemove = tray.querySelector<HTMLElement>('[data-minimized-chip="community"] button')!;
    chipRemove.click();
    await flushMicrotasks();

    expect(frameFor('community')).not.toBeNull(); // still open — the guard refused to close it
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
