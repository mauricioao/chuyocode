// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initDeskDrag } from './deskDrag';
import { DESK_DRAG_STORAGE_KEY } from '../deskDragMath';
import { DESK_ARRANGE_RESET_EVENT, DESK_ARRANGE_VISIBILITY_EVENT } from './deskArrange';

/** Fixed, deterministic rects for the desk and each widget, keyed by a `data-rect` marker so `getBoundingClientRect` can be stubbed without a real layout engine (jsdom computes none). */
const RECTS: Record<string, { left: number; top: number; width: number; height: number }> = {
  desk: { left: 0, top: 0, width: 1200, height: 800 },
  clock: { left: 20, top: 10, width: 160, height: 160 },
  weather: { left: 200, top: 10, width: 336, height: 120 },
};

function rectFor(el: Element) {
  const key = el.getAttribute('data-rect') ?? el.getAttribute('data-desk-widget') ?? (el.hasAttribute('data-desk') ? 'desk' : '');
  const r = RECTS[key] ?? { left: 0, top: 0, width: 100, height: 100 };
  return { ...r, right: r.left + r.width, bottom: r.top + r.height, x: r.left, y: r.top, toJSON() {} };
}

function setDom(): void {
  document.body.innerHTML = `
    <section data-desk>
      <div data-desk-widget="clock" tabindex="0"></div>
      <div data-desk-widget="weather"><button type="button" id="inner-btn">x</button></div>
    </section>
  `;
}

beforeEach(() => {
  setDom();
  Element.prototype.getBoundingClientRect = function (this: Element) {
    return rectFor(this) as DOMRect;
  };
  // jsdom has no real pointer-capture implementation.
  (Element.prototype as unknown as { setPointerCapture: (id: number) => void }).setPointerCapture = vi.fn();
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({ matches: query.includes('min-width'), media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  document.body.innerHTML = '';
});

describe('initDeskDrag — breakpoint guard', () => {
  it('does nothing below the desk breakpoint', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    initDeskDrag(document);
    const clock = document.querySelector('[data-desk-widget="clock"]') as HTMLElement;
    expect(clock.style.position).toBe('');
  });
});

describe('initDeskDrag — first enhancement', () => {
  it('switches every widget to absolute positioning, resetting grid-column/row', () => {
    initDeskDrag(document);
    const clock = document.querySelector('[data-desk-widget="clock"]') as HTMLElement;
    expect(clock.style.position).toBe('absolute');
    expect(clock.style.gridColumn).toBe('auto');
    expect(clock.style.gridRow).toBe('auto');
  });

  it('uses the stored position (clamped to the desk) when one exists', () => {
    localStorage.setItem(DESK_DRAG_STORAGE_KEY, JSON.stringify({ clock: { x: 5000, y: 5000 } }));
    initDeskDrag(document);
    const clock = document.querySelector('[data-desk-widget="clock"]') as HTMLElement;
    // Clamped inside the 1200x800 desk for a 160x160 widget.
    expect(clock.style.left).toBe(`${1200 - 160}px`);
    expect(clock.style.top).toBe(`${800 - 160}px`);
  });

  it('announces arrange-icon visibility true on load when a stored position exists', () => {
    localStorage.setItem(DESK_DRAG_STORAGE_KEY, JSON.stringify({ clock: { x: 10, y: 10 } }));
    const seen: boolean[] = [];
    document.addEventListener(DESK_ARRANGE_VISIBILITY_EVENT, (e) => seen.push((e as CustomEvent<{ visible: boolean }>).detail.visible));
    initDeskDrag(document);
    expect(seen).toContain(true);
  });
});

describe('initDeskDrag — pointer drag', () => {
  it('moves and persists the widget position on drag release', () => {
    initDeskDrag(document);
    const clock = document.querySelector('[data-desk-widget="clock"]') as HTMLElement;

    clock.dispatchEvent(new MouseEvent('pointerdown', { clientX: 100, clientY: 100 }));
    clock.dispatchEvent(new MouseEvent('pointermove', { clientX: 140, clientY: 130 }));
    clock.dispatchEvent(new MouseEvent('pointerup', { clientX: 140, clientY: 130 }));

    const startLeft = parseFloat(clock.style.left);
    expect(startLeft).toBeGreaterThan(20); // moved right from its default x=20

    const stored = JSON.parse(localStorage.getItem(DESK_DRAG_STORAGE_KEY) ?? '{}');
    expect(stored.clock).toEqual({ x: startLeft, y: parseFloat(clock.style.top) });
  });

  it('never starts a drag from a click on a control inside the widget', () => {
    initDeskDrag(document);
    const weather = document.querySelector('[data-desk-widget="weather"]') as HTMLElement;
    const button = weather.querySelector('#inner-btn') as HTMLElement;
    const leftBefore = weather.style.left;

    button.dispatchEvent(new MouseEvent('pointerdown', { clientX: 50, clientY: 50, bubbles: true }));
    button.dispatchEvent(new MouseEvent('pointermove', { clientX: 90, clientY: 90, bubbles: true }));

    expect(weather.style.left).toBe(leftBefore);
  });
});

describe('initDeskDrag — keyboard', () => {
  it('nudges the focused widget by 16px on an arrow key, 64px with Shift, and persists', () => {
    initDeskDrag(document);
    const clock = document.querySelector('[data-desk-widget="clock"]') as HTMLElement;
    const startLeft = parseFloat(clock.style.left);

    clock.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: false }));
    expect(parseFloat(clock.style.left)).toBe(startLeft + 16);

    clock.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: false }));
    expect(parseFloat(clock.style.left)).toBe(startLeft + 16 + 64);

    const stored = JSON.parse(localStorage.getItem(DESK_DRAG_STORAGE_KEY) ?? '{}');
    expect(stored.clock.x).toBe(startLeft + 16 + 64);
  });

  it('ignores arrow keys that originate from an inner control, never moving the widget', () => {
    initDeskDrag(document);
    const weather = document.querySelector('[data-desk-widget="weather"]') as HTMLElement;
    const button = weather.querySelector('#inner-btn') as HTMLElement;
    const leftBefore = weather.style.left;

    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

    expect(weather.style.left).toBe(leftBefore);
  });

  it('Escape blurs the widget without moving it', () => {
    initDeskDrag(document);
    const clock = document.querySelector('[data-desk-widget="clock"]') as HTMLElement;
    clock.focus();
    expect(document.activeElement).toBe(clock);
    clock.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.activeElement).not.toBe(clock);
  });
});

describe('initDeskDrag — arrange reset', () => {
  it('clears storage and resets every widget to its default position on the reset event', () => {
    initDeskDrag(document);
    const clock = document.querySelector('[data-desk-widget="clock"]') as HTMLElement;
    clock.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(localStorage.getItem(DESK_DRAG_STORAGE_KEY)).not.toBeNull();

    const seen: boolean[] = [];
    document.addEventListener(DESK_ARRANGE_VISIBILITY_EVENT, (e) => seen.push((e as CustomEvent<{ visible: boolean }>).detail.visible));

    document.dispatchEvent(new CustomEvent(DESK_ARRANGE_RESET_EVENT));

    expect(localStorage.getItem(DESK_DRAG_STORAGE_KEY)).toBeNull();
    expect(clock.style.left).toBe('20px');
    expect(clock.style.top).toBe('10px');
    expect(seen).toContain(false);
  });
});
