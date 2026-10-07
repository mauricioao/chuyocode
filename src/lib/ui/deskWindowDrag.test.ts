// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initDeskWindowDrag } from './deskWindowDrag';
import { DESK_WINDOW_OFFSET_STORAGE_KEY } from '../deskWindowDragMath';

const RECTS: Record<string, { left: number; top: number; width: number; height: number }> = {
  header: { left: 0, top: 0, width: 1440, height: 64 },
  window: { left: 64, top: 76, width: 600, height: 500 },
};

/** jsdom computes no real layout — `getBoundingClientRect` is stubbed from
 * fixed fixture rects, but the WINDOW's own reported rect must still reflect
 * whatever `translate` it currently carries (same as a real browser, where
 * `translate` is set directly on the window element) — otherwise re-clamping
 * a second time would subtract an offset from a rect that never actually
 * "moved", breaking the module's own idempotency assumption purely as a test
 * artifact. */
function rectFor(el: Element) {
  if (el.hasAttribute('data-chrome-header')) {
    const r = RECTS.header;
    return { ...r, right: r.left + r.width, bottom: r.top + r.height, x: r.left, y: r.top, toJSON() {} };
  }
  if (el.id === 'desk-window') {
    const r = RECTS.window;
    const translate = windowEl().style.translate || '0px 0px';
    const [dx, dy] = translate.split(' ').map((v) => parseFloat(v) || 0);
    const left = r.left + dx;
    const top = r.top + dy;
    return { left, top, width: r.width, height: r.height, right: left + r.width, bottom: top + r.height, x: left, y: top, toJSON() {} };
  }
  return { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON() {} };
}

function setDom(): void {
  document.body.innerHTML = `
    <header data-chrome-header></header>
    <section id="desk-window" data-fullscreen="false">
      <div data-desk-window-titlebar data-testid="desk-window-titlebar">
        <button type="button" id="inner-btn">x</button>
        <input id="title-input" />
      </div>
    </section>
  `;
}

/** A minimal fake `Window` — real DOM dispatch for pointer events, a fake sessionStorage/matchMedia/innerWidth-height so tests never depend on jsdom's own (fixed) viewport. */
function fakeWin(opts: { desktop?: boolean; width?: number; height?: number } = {}) {
  const store = new Map<string, string>();
  const listeners: Record<string, Array<() => void>> = {};
  return {
    innerWidth: opts.width ?? 1440,
    innerHeight: opts.height ?? 900,
    matchMedia: (query: string) => ({ matches: (opts.desktop ?? true) && query.includes('min-width') }),
    sessionStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    },
    addEventListener: (type: string, fn: () => void) => {
      (listeners[type] ??= []).push(fn);
    },
    dispatch: (type: string) => listeners[type]?.forEach((fn) => fn()),
  } as unknown as Window & { dispatch: (type: string) => void };
}

beforeEach(() => {
  setDom();
  Element.prototype.getBoundingClientRect = function (this: Element) {
    return rectFor(this) as DOMRect;
  };
  (Element.prototype as unknown as { setPointerCapture: (id: number) => void }).setPointerCapture = vi.fn();
});

afterEach(() => {
  document.body.innerHTML = '';
});

function windowEl(): HTMLElement {
  return document.getElementById('desk-window') as HTMLElement;
}

function titlebarEl(): HTMLElement {
  return windowEl().querySelector('[data-desk-window-titlebar]') as HTMLElement;
}

describe('initDeskWindowDrag — breakpoint/fullscreen guards', () => {
  it('does nothing below the desk breakpoint', () => {
    const win = fakeWin({ desktop: false });
    initDeskWindowDrag(windowEl(), document, win);

    titlebarEl().dispatchEvent(new MouseEvent('pointerdown', { clientX: 100, clientY: 100 }));
    titlebarEl().dispatchEvent(new MouseEvent('pointermove', { clientX: 200, clientY: 200 }));

    expect(windowEl().style.translate).toBe('');
  });

  it('does nothing while the window is full screen', () => {
    windowEl().setAttribute('data-fullscreen', 'true');
    const win = fakeWin();
    initDeskWindowDrag(windowEl(), document, win);

    titlebarEl().dispatchEvent(new MouseEvent('pointerdown', { clientX: 100, clientY: 100 }));
    titlebarEl().dispatchEvent(new MouseEvent('pointermove', { clientX: 200, clientY: 200 }));

    expect(windowEl().style.translate).toBe('');
  });

  it('never starts a drag from a click on a control inside the title bar', () => {
    const win = fakeWin();
    initDeskWindowDrag(windowEl(), document, win);
    const button = document.getElementById('inner-btn') as HTMLElement;

    button.dispatchEvent(new MouseEvent('pointerdown', { clientX: 100, clientY: 100, bubbles: true }));
    button.dispatchEvent(new MouseEvent('pointermove', { clientX: 200, clientY: 200, bubbles: true }));

    expect(windowEl().style.translate).toBe('');
  });

  it('never starts a drag from the editable title input', () => {
    const win = fakeWin();
    initDeskWindowDrag(windowEl(), document, win);
    const input = document.getElementById('title-input') as HTMLElement;

    input.dispatchEvent(new MouseEvent('pointerdown', { clientX: 100, clientY: 100, bubbles: true }));
    input.dispatchEvent(new MouseEvent('pointermove', { clientX: 200, clientY: 200, bubbles: true }));

    expect(windowEl().style.translate).toBe('');
  });
});

describe('initDeskWindowDrag — pointer drag', () => {
  it('translates the window on drag and persists the offset on release', () => {
    const win = fakeWin();
    initDeskWindowDrag(windowEl(), document, win);

    titlebarEl().dispatchEvent(new MouseEvent('pointerdown', { clientX: 100, clientY: 100 }));
    titlebarEl().dispatchEvent(new MouseEvent('pointermove', { clientX: 140, clientY: 130 }));

    expect(windowEl().style.translate).toBe('40px 30px');

    titlebarEl().dispatchEvent(new MouseEvent('pointerup', { clientX: 140, clientY: 130 }));

    const stored = JSON.parse(win.sessionStorage.getItem(DESK_WINDOW_OFFSET_STORAGE_KEY) ?? '{}');
    expect(stored).toEqual({ x: 40, y: 30 });
  });

  it('clamps the offset so the window never goes above the header', () => {
    const win = fakeWin();
    initDeskWindowDrag(windowEl(), document, win);

    titlebarEl().dispatchEvent(new MouseEvent('pointerdown', { clientX: 0, clientY: 0 }));
    titlebarEl().dispatchEvent(new MouseEvent('pointermove', { clientX: 0, clientY: -5000 }));

    // window.top (76) + offset.y must equal header.bottom (64).
    expect(windowEl().style.translate).toBe('0px -12px');
  });

  it('keeps the whole window on screen when dragged far past the right/bottom edges', () => {
    const win = fakeWin();
    initDeskWindowDrag(windowEl(), document, win);

    titlebarEl().dispatchEvent(new MouseEvent('pointerdown', { clientX: 0, clientY: 0 }));
    titlebarEl().dispatchEvent(new MouseEvent('pointermove', { clientX: 5000, clientY: 5000 }));

    const [x, y] = windowEl()
      .style.translate.split(' ')
      .map((v) => parseFloat(v));
    // window is 600x500 at (64, 76); viewport is 1440x900; margin is 8px.
    expect(64 + x + 600).toBeLessThanOrEqual(1440 - 8);
    expect(76 + y + 500).toBeLessThanOrEqual(900 - 8);
  });
});

describe('initDeskWindowDrag — restore from sessionStorage', () => {
  it('restores and re-clamps a stored offset on mount', () => {
    const win = fakeWin();
    win.sessionStorage.setItem(DESK_WINDOW_OFFSET_STORAGE_KEY, JSON.stringify({ x: 10, y: 10 }));
    initDeskWindowDrag(windowEl(), document, win);

    expect(windowEl().style.translate).toBe('10px 10px');
  });

  it('ignores (re-clamps) a stored offset that no longer fits a narrower viewport', () => {
    const win = fakeWin({ width: 300, height: 900 });
    // Way too far right for a 300px-wide viewport.
    win.sessionStorage.setItem(DESK_WINDOW_OFFSET_STORAGE_KEY, JSON.stringify({ x: 5000, y: 0 }));
    initDeskWindowDrag(windowEl(), document, win);

    const translate = windowEl().style.translate;
    expect(translate).not.toBe('5000px 0px');
    const x = parseFloat(translate.split(' ')[0]);
    expect(x).toBeLessThan(5000);
  });

  it('does not restore while full screen', () => {
    windowEl().setAttribute('data-fullscreen', 'true');
    const win = fakeWin();
    win.sessionStorage.setItem(DESK_WINDOW_OFFSET_STORAGE_KEY, JSON.stringify({ x: 10, y: 10 }));
    initDeskWindowDrag(windowEl(), document, win);

    expect(windowEl().style.translate).toBe('');
  });
});

describe('initDeskWindowDrag — resize', () => {
  it('clears the offset on resize below the desk breakpoint', () => {
    const win = fakeWin();
    initDeskWindowDrag(windowEl(), document, win);
    titlebarEl().dispatchEvent(new MouseEvent('pointerdown', { clientX: 0, clientY: 0 }));
    titlebarEl().dispatchEvent(new MouseEvent('pointermove', { clientX: 40, clientY: 0 }));
    titlebarEl().dispatchEvent(new MouseEvent('pointerup', { clientX: 40, clientY: 0 }));
    expect(windowEl().style.translate).not.toBe('');

    win.matchMedia = (() => ({ matches: false })) as unknown as Window['matchMedia'];
    win.dispatch('resize');

    expect(windowEl().style.translate).toBe('');
  });

  it('re-clamps the offset on resize while staying desktop', () => {
    const win = fakeWin();
    initDeskWindowDrag(windowEl(), document, win);
    titlebarEl().dispatchEvent(new MouseEvent('pointerdown', { clientX: 0, clientY: 0 }));
    titlebarEl().dispatchEvent(new MouseEvent('pointermove', { clientX: 5000, clientY: 0 }));
    titlebarEl().dispatchEvent(new MouseEvent('pointerup', { clientX: 5000, clientY: 0 }));
    const beforeResize = windowEl().style.translate;

    win.dispatch('resize');

    // Same (already-clamped) offset survives an unrelated resize at the same viewport size.
    expect(windowEl().style.translate).toBe(beforeResize);
  });
});

describe('initDeskWindowDrag — double-wiring guard', () => {
  it('only wires once per element', () => {
    const win = fakeWin();
    initDeskWindowDrag(windowEl(), document, win);
    initDeskWindowDrag(windowEl(), document, win);

    titlebarEl().dispatchEvent(new MouseEvent('pointerdown', { clientX: 0, clientY: 0 }));
    titlebarEl().dispatchEvent(new MouseEvent('pointermove', { clientX: 40, clientY: 0 }));

    // A double-wired drag would double the delta.
    expect(windowEl().style.translate).toBe('40px 0px');
  });
});
