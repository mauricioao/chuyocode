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

  // Regression test (same class of bug as the calendar going empty after a
  // navigation, see `deskWidgets.test.ts`): `document` is never replaced by
  // an `astro:page-load` navigation, unlike the widgets themselves — a
  // document-level reset listener added on every `initDeskDrag` call used
  // to stack one more copy per call, forever. A single dispatched reset
  // event would then fire every stacked copy, each pushing its own
  // `visible: false` announcement — this asserts exactly one survives.
  it('re-initializing after a navigation does not stack duplicate reset listeners', () => {
    initDeskDrag(document);

    // Simulate the hub's own re-init on a client-side navigation back to
    // itself: the desk section's markup is entirely replaced with a fresh
    // (unmoved) shell, same as a real `astro:page-load` re-render.
    setDom();
    initDeskDrag(document);

    const clock = document.querySelector('[data-desk-widget="clock"]') as HTMLElement;
    clock.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(localStorage.getItem(DESK_DRAG_STORAGE_KEY)).not.toBeNull();

    const seen: boolean[] = [];
    document.addEventListener(DESK_ARRANGE_VISIBILITY_EVENT, (e) => seen.push((e as CustomEvent<{ visible: boolean }>).detail.visible));

    document.dispatchEvent(new CustomEvent(DESK_ARRANGE_RESET_EVENT));

    // A stacked second listener would push `false` twice for this single
    // dispatched event.
    expect(seen.filter((v) => v === false)).toHaveLength(1);
    expect(localStorage.getItem(DESK_DRAG_STORAGE_KEY)).toBeNull();
    expect(clock.style.left).toBe('20px');
    expect(clock.style.top).toBe('10px');
  });
});

// Owner report ("version móvil del inglés pantalla rota, mala distribución"):
// a visitor who loaded the desk at `desk:` width or wider — switching every
// widget to `position: absolute` with a DESKTOP-computed `left`/`top` — and
// then resized the SAME page down below the breakpoint with no reload kept
// those stale desktop pixel coordinates forever (an inline style always wins
// over the mobile flow-layout classes underneath it), piling the widgets up
// on top of each other and the greeting. `@lib/ui/deskWindowDrag.ts` already
// solves the identical class of bug for the floating window's own drag
// offset; these tests pin the matching `resize` behaviour here.
describe('initDeskDrag — stale absolute positioning across a resize', () => {
  /** Lets a test flip `matchMedia`'s answer AFTER `initDeskDrag` already ran, to simulate a live resize crossing the breakpoint with no reload. */
  function stubDesktop(matches: boolean): void {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({ matches: query.includes('min-width') && matches, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    );
  }

  it('clears every widget’s inline placement on resize once the viewport drops below the breakpoint', () => {
    initDeskDrag(document);
    const clock = document.querySelector('[data-desk-widget="clock"]') as HTMLElement;
    const weather = document.querySelector('[data-desk-widget="weather"]') as HTMLElement;
    expect(clock.style.position).toBe('absolute');

    stubDesktop(false); // resized down, no reload
    window.dispatchEvent(new Event('resize'));

    for (const widget of [clock, weather]) {
      expect(widget.style.position).toBe('');
      expect(widget.style.left).toBe('');
      expect(widget.style.top).toBe('');
      expect(widget.style.width).toBe('');
      expect(widget.style.margin).toBe('');
    }
  });

  it('re-places the widgets (re-clamped) on a resize that stays at/above the breakpoint', () => {
    initDeskDrag(document);
    const clock = document.querySelector('[data-desk-widget="clock"]') as HTMLElement;

    stubDesktop(true); // still desktop, just a narrower/wider desktop width
    window.dispatchEvent(new Event('resize'));

    expect(clock.style.position).toBe('absolute');
    expect(clock.style.left).toBe('20px'); // re-clamped against the same fixed desk rect
  });

  it('a later resize back up to desktop re-applies absolute positioning again', () => {
    initDeskDrag(document);
    const clock = document.querySelector('[data-desk-widget="clock"]') as HTMLElement;

    stubDesktop(false);
    window.dispatchEvent(new Event('resize'));
    expect(clock.style.position).toBe('');

    stubDesktop(true);
    window.dispatchEvent(new Event('resize'));
    expect(clock.style.position).toBe('absolute');
  });

  it('a resize-driven clear never breaks on a page with no desk/widgets (self-guarded)', () => {
    initDeskDrag(document);
    document.body.innerHTML = ''; // the desk navigated away entirely
    stubDesktop(false);
    expect(() => window.dispatchEvent(new Event('resize'))).not.toThrow();
  });
});
