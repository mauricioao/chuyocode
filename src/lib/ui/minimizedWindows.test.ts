// @vitest-environment jsdom
//
// `renderMinimizedWindowsTray`/`initMinimizedWindowsTray` need a real DOM
// (`document.createElement`) — same pragma reasoning as `deskWindow.test.ts`'s
// own `focusableElements` block; the whole file routes to jsdom rather than
// splitting one DOM-touching describe block into its own file.
import { describe, it, expect } from 'vitest';
import {
  withMinimizedWindow,
  withoutMinimizedWindow,
  parseMinimizedWindows,
  readMinimizedWindows,
  writeMinimizedWindows,
  addMinimizedWindow,
  removeMinimizedWindow,
  renderMinimizedWindowsTray,
  initMinimizedWindowsTray,
  initFooterOverlapGuard,
  MAX_MINIMIZED_WINDOWS,
  MAX_VISIBLE_MINIMIZED_CHIPS,
  MINIMIZED_WINDOWS_STORAGE_KEY,
  MINIMIZED_TRAY_WRAPPER_ATTR,
  TRAY_FOOTER_OVERLAP_ATTR,
  type MinimizedWindowEntry,
} from './minimizedWindows';

const MORE_LABEL_TEMPLATE = '{n} ventanas más';

function entry(id: string, t = 0): MinimizedWindowEntry {
  return { id, title: `Title ${id}`, href: `/es/ingles/actividades/${id}`, thumbnail: null, t };
}

function fakeStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
  };
}

describe('withMinimizedWindow', () => {
  it('adds a new entry to the front', () => {
    const result = withMinimizedWindow([entry('a')], entry('b'));
    expect(result.map((e) => e.id)).toEqual(['b', 'a']);
  });

  it('moves an existing entry to the front instead of duplicating it', () => {
    const result = withMinimizedWindow([entry('a'), entry('b')], entry('a', 99));
    expect(result).toEqual([entry('a', 99), entry('b')]);
  });

  it('caps the list at MAX_MINIMIZED_WINDOWS, dropping the oldest', () => {
    const full = Array.from({ length: MAX_MINIMIZED_WINDOWS }, (_, i) => entry(`id-${i}`));
    const result = withMinimizedWindow(full, entry('new'));
    expect(result).toHaveLength(MAX_MINIMIZED_WINDOWS);
    expect(result[0].id).toBe('new');
    expect(result.map((e) => e.id)).not.toContain(`id-${MAX_MINIMIZED_WINDOWS - 1}`);
  });
});

describe('withoutMinimizedWindow', () => {
  it('removes the matching entry', () => {
    const result = withoutMinimizedWindow([entry('a'), entry('b')], 'a');
    expect(result.map((e) => e.id)).toEqual(['b']);
  });

  it('is a no-op when the id is not present', () => {
    const result = withoutMinimizedWindow([entry('a')], 'missing');
    expect(result.map((e) => e.id)).toEqual(['a']);
  });
});

describe('parseMinimizedWindows', () => {
  it('returns an empty list for null/empty input', () => {
    expect(parseMinimizedWindows(null)).toEqual([]);
    expect(parseMinimizedWindows('')).toEqual([]);
  });

  it('returns an empty list for malformed JSON, never throws', () => {
    expect(() => parseMinimizedWindows('not json')).not.toThrow();
    expect(parseMinimizedWindows('not json')).toEqual([]);
  });

  it('returns an empty list when the JSON is not an array', () => {
    expect(parseMinimizedWindows(JSON.stringify({ id: 'a' }))).toEqual([]);
  });

  it('filters out malformed entries, keeping the valid ones', () => {
    const raw = JSON.stringify([entry('a'), { id: 'b' }, 'nonsense', entry('c')]);
    expect(parseMinimizedWindows(raw).map((e) => e.id)).toEqual(['a', 'c']);
  });

  it('round-trips a real entry list', () => {
    const list = [entry('a'), entry('b')];
    expect(parseMinimizedWindows(JSON.stringify(list))).toEqual(list);
  });
});

describe('readMinimizedWindows / writeMinimizedWindows (persistence)', () => {
  it('round-trips through a working storage', () => {
    const storage = fakeStorage();
    writeMinimizedWindows([entry('a')], storage);
    expect(readMinimizedWindows(storage)).toEqual([entry('a')]);
  });

  it('degrades to an empty list (never throws) when the storage read throws', () => {
    const storage = {
      getItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readMinimizedWindows(storage)).toEqual([]);
  });

  it('is a no-op (never throws) when the storage write throws', () => {
    const storage = {
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(() => writeMinimizedWindows([entry('a')], storage)).not.toThrow();
  });

  it('uses the documented storage key', () => {
    const storage = fakeStorage();
    writeMinimizedWindows([entry('a')], storage);
    expect(storage.getItem(MINIMIZED_WINDOWS_STORAGE_KEY)).not.toBeNull();
  });
});

describe('addMinimizedWindow / removeMinimizedWindow (read-modify-write)', () => {
  it('adds and persists in one call', () => {
    const storage = fakeStorage();
    const result = addMinimizedWindow(entry('a'), storage);
    expect(result.map((e) => e.id)).toEqual(['a']);
    expect(readMinimizedWindows(storage).map((e) => e.id)).toEqual(['a']);
  });

  it('caps at MAX_MINIMIZED_WINDOWS across repeated calls', () => {
    const storage = fakeStorage();
    for (let i = 0; i < MAX_MINIMIZED_WINDOWS + 2; i++) {
      addMinimizedWindow(entry(`id-${i}`), storage);
    }
    const result = readMinimizedWindows(storage);
    expect(result).toHaveLength(MAX_MINIMIZED_WINDOWS);
    expect(result[0].id).toBe(`id-${MAX_MINIMIZED_WINDOWS + 1}`);
  });

  it('removes and persists in one call', () => {
    const storage = fakeStorage();
    addMinimizedWindow(entry('a'), storage);
    addMinimizedWindow(entry('b'), storage);
    const result = removeMinimizedWindow('a', storage);
    expect(result.map((e) => e.id)).toEqual(['b']);
    expect(readMinimizedWindows(storage).map((e) => e.id)).toEqual(['b']);
  });
});

describe('renderMinimizedWindowsTray (DOM)', () => {
  it('hides the container and clears it when there is nothing to show', () => {
    const container = document.createElement('nav');
    container.appendChild(document.createElement('span'));
    renderMinimizedWindowsTray(container, [], 'Quitar');
    expect(container.hidden).toBe(true);
    expect(container.children).toHaveLength(0);
  });

  it('renders a chip, unhidden, as an opener anchor with an accessible name and a close button', () => {
    const container = document.createElement('nav');
    renderMinimizedWindowsTray(container, [entry('a')], 'Quitar');
    expect(container.hidden).toBe(false);
    const chips = container.querySelectorAll('a[data-desk-window-open]');
    expect(chips).toHaveLength(1);
    expect(chips[0].getAttribute('data-desk-window-open')).toBe('a');
    expect(chips[0].getAttribute('href')).toBe('/es/ingles/actividades/a');
    expect(chips[0].querySelector('button')?.getAttribute('aria-label')).toBe('Quitar');
  });

  // PART 6c (owner spec 2026-10-07): each chip is now a small rectangle —
  // a document-glyph (or thumbnail) preview PLUS a visible, truncated
  // title — now that it lives in its own fixed corner tray instead of
  // squeezed into the levels dock.
  it('each chip shows a document glyph preview (no thumbnail yet) plus a visible title', () => {
    const container = document.createElement('nav');
    renderMinimizedWindowsTray(container, [entry('a')], 'Quitar');
    const chip = container.querySelector('a[data-desk-window-open]') as HTMLAnchorElement;

    expect(chip.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(chip.querySelector('img')).toBeNull();
    expect(chip.textContent).toContain('Title a');
    expect(chip.title).toBe('Title a');
    expect(chip.getAttribute('aria-label')).toBe('Title a');
  });

  it('shows the thumbnail image instead of the glyph once an entry has one', () => {
    const withThumbnail: MinimizedWindowEntry = { ...entry('a'), thumbnail: 'https://img.example/a.webp' };
    const container = document.createElement('nav');
    renderMinimizedWindowsTray(container, [withThumbnail], 'Quitar');
    const chip = container.querySelector('a[data-desk-window-open]') as HTMLElement;

    const img = chip.querySelector('img');
    expect(img?.getAttribute('src')).toBe('https://img.example/a.webp');
    expect(img?.getAttribute('alt')).toBe('');
    expect(chip.querySelector('svg')).toBeNull();
  });

  it("the chip's close button removes that entry from storage and re-renders without it, never navigating", () => {
    const storage = fakeStorage();
    writeMinimizedWindows([entry('a'), entry('b')], storage);
    const container = document.createElement('nav');
    renderMinimizedWindowsTray(container, readMinimizedWindows(storage), 'Quitar', storage);

    const closeButtons = container.querySelectorAll('button');
    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    closeButtons[0].dispatchEvent(clickEvent);

    expect(clickEvent.defaultPrevented).toBe(true);
    expect(readMinimizedWindows(storage).map((e) => e.id)).toEqual(['b']);
    expect(container.querySelectorAll('a[data-desk-window-open]')).toHaveLength(1);
  });
});

// PART 6c polish (owner feedback 2026-10-07, defect #2): the tray used to
// show up to 3 chips ≥1280px wide (1 below it) — a row that ran under/over
// the hub's levels dock and its footer. It now shows at most
// `MAX_VISIBLE_MINIMIZED_CHIPS` (1) chip, at EVERY viewport width; the rest
// still collapse into one "+N" tile that opens a small menu listing them.
describe('renderMinimizedWindowsTray — visible cap + "+N" overflow menu', () => {
  it('shows every chip, no overflow tile, when at or under the visible cap', () => {
    const container = document.createElement('nav');
    renderMinimizedWindowsTray(container, [entry('a')], 'Quitar', undefined, document, MORE_LABEL_TEMPLATE);
    expect(container.querySelectorAll('a[data-desk-window-open]')).toHaveLength(1);
    expect(container.querySelector('[data-minimized-tray-more]')).toBeNull();
  });

  it('shows only the first MAX_VISIBLE_MINIMIZED_CHIPS chip plus a "+N" tile once there are more, regardless of viewport width', () => {
    const entries = Array.from({ length: MAX_MINIMIZED_WINDOWS }, (_, i) => entry(`id-${i}`));
    const container = document.createElement('nav');
    renderMinimizedWindowsTray(container, entries, 'Quitar', undefined, document, MORE_LABEL_TEMPLATE);

    const visibleChips = container.querySelectorAll('a[data-minimized-chip]');
    expect(visibleChips).toHaveLength(MAX_VISIBLE_MINIMIZED_CHIPS);
    expect([...visibleChips].map((c) => c.getAttribute('data-desk-window-open'))).toEqual(['id-0']);

    const overflowCount = entries.length - MAX_VISIBLE_MINIMIZED_CHIPS;
    const moreButton = container.querySelector('[data-minimized-tray-more]') as HTMLButtonElement;
    expect(moreButton).not.toBeNull();
    expect(moreButton.getAttribute('aria-expanded')).toBe('false');
    expect(moreButton.getAttribute('aria-label')).toBe(`${overflowCount} ventanas más`);
    expect(moreButton.textContent).toBe(`+${overflowCount}`);
  });

  it('a wide viewport still gets only ONE visible chip (the old ≥1280px/3-chip rule is gone)', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1920 });
    try {
      const container = document.createElement('nav');
      renderMinimizedWindowsTray(container, [entry('a'), entry('b'), entry('c')], 'Quitar', undefined, document, MORE_LABEL_TEMPLATE);
      expect(container.querySelectorAll('a[data-minimized-chip]')).toHaveLength(1);
      expect((container.querySelector('[data-minimized-tray-more]') as HTMLButtonElement).textContent).toBe('+2');
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: window.innerWidth });
    }
  });

  it('the "+N" tile is a button that opens a hidden menu listing every remaining entry as a link', () => {
    const entries = Array.from({ length: MAX_MINIMIZED_WINDOWS }, (_, i) => entry(`id-${i}`));
    const container = document.createElement('nav');
    renderMinimizedWindowsTray(container, entries, 'Quitar', undefined, document, MORE_LABEL_TEMPLATE);

    const moreButton = container.querySelector('[data-minimized-tray-more]') as HTMLButtonElement;
    // The menu escapes the dock's own `overflow-x-auto` scroller onto
    // `document.body` (fixed-positioned) — see `createOverflowTile`'s header.
    const menu = document.querySelector('[data-minimized-tray-menu]') as HTMLElement;
    expect(menu.hidden).toBe(true);

    moreButton.click();
    expect(moreButton.getAttribute('aria-expanded')).toBe('true');
    expect(menu.hidden).toBe(false);
    const items = menu.querySelectorAll('a[role="menuitem"][data-desk-window-open]');
    expect([...items].map((a) => a.getAttribute('data-desk-window-open'))).toEqual(['id-1', 'id-2', 'id-3', 'id-4']);
    expect(items[0].textContent).toBe('Title id-1');

    moreButton.click();
    expect(moreButton.getAttribute('aria-expanded')).toBe('false');
    expect(menu.hidden).toBe(true);
  });

  it('Escape closes the open menu and resets aria-expanded', () => {
    const entries = Array.from({ length: MAX_MINIMIZED_WINDOWS }, (_, i) => entry(`id-${i}`));
    const container = document.createElement('nav');
    document.body.appendChild(container);
    renderMinimizedWindowsTray(container, entries, 'Quitar', undefined, document, MORE_LABEL_TEMPLATE);

    const moreButton = container.querySelector('[data-minimized-tray-more]') as HTMLButtonElement;
    const menu = document.querySelector('[data-minimized-tray-menu]') as HTMLElement;
    moreButton.click();
    expect(menu.hidden).toBe(false);

    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    document.dispatchEvent(escape);

    expect(menu.hidden).toBe(true);
    expect(moreButton.getAttribute('aria-expanded')).toBe('false');
    container.remove();
    menu.remove();
  });
});

describe('initMinimizedWindowsTray', () => {
  it('does nothing when the tray container is not on the page', () => {
    const doc = document.implementation.createHTMLDocument('');
    expect(() => initMinimizedWindowsTray(doc, window)).not.toThrow();
  });

  it('renders whatever is already in sessionStorage into the container found by its data attribute', () => {
    const doc = document.implementation.createHTMLDocument('');
    const container = doc.createElement('nav');
    container.setAttribute('data-minimized-tray', '');
    container.setAttribute('data-remove-label', 'Quitar');
    doc.body.appendChild(container);

    const storage = fakeStorage();
    writeMinimizedWindows([entry('a')], storage);
    const fakeWin = { sessionStorage: storage } as unknown as Window;

    initMinimizedWindowsTray(doc, fakeWin);

    expect(container.hidden).toBe(false);
    expect(container.querySelectorAll('a[data-desk-window-open]')).toHaveLength(1);
  });

  // PART 6c polish (owner spec 2026-10-07, defect #3): wires the footer
  // overlap guard against the tray's own OUTER wrapper, found as an
  // ancestor of the `<nav>` container — see `initFooterOverlapGuard`'s own
  // describe block below for the guard's actual behavior.
  it('wires the footer overlap guard onto the tray wrapper ancestor, when present', () => {
    // jsdom has no real `IntersectionObserver` — same minimal fake as
    // `initFooterOverlapGuard`'s own describe block below.
    class FakeIntersectionObserver {
      constructor(_cb: IntersectionObserverCallback) {}
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    const original = globalThis.IntersectionObserver;
    // @ts-expect-error — a minimal fake, not the full browser interface.
    globalThis.IntersectionObserver = FakeIntersectionObserver;

    try {
      const doc = document.implementation.createHTMLDocument('');
      const wrapper = doc.createElement('div');
      wrapper.setAttribute(MINIMIZED_TRAY_WRAPPER_ATTR, '');
      const container = doc.createElement('nav');
      container.setAttribute('data-minimized-tray', '');
      container.setAttribute('data-remove-label', 'Quitar');
      wrapper.appendChild(container);
      doc.body.appendChild(wrapper);
      const footer = doc.createElement('footer');
      footer.setAttribute('data-chrome-footer', '');
      doc.body.appendChild(footer);

      const fakeWin = { sessionStorage: fakeStorage() } as unknown as Window;
      initMinimizedWindowsTray(doc, fakeWin);

      expect(wrapper.dataset.trayFooterGuardReady).toBe('true');
    } finally {
      globalThis.IntersectionObserver = original;
    }
  });
});

// PART 6c polish (owner spec 2026-10-07, defect #3): the hub's fixed
// bottom-right tray must not sit on top of the footer's own
// Premium/Términos/Privacidad links once the visitor scrolls down to it.
describe('initFooterOverlapGuard', () => {
  it('toggles TRAY_FOOTER_OVERLAP_ATTR on the wrapper while the footer intersects, via IntersectionObserver', () => {
    const observed: Element[] = [];
    let callback: IntersectionObserverCallback | null = null;
    class FakeIntersectionObserver {
      constructor(cb: IntersectionObserverCallback) {
        callback = cb;
      }
      observe(target: Element) {
        observed.push(target);
      }
      unobserve() {}
      disconnect() {}
    }
    const original = globalThis.IntersectionObserver;
    // @ts-expect-error — a minimal fake, not the full browser interface.
    globalThis.IntersectionObserver = FakeIntersectionObserver;

    try {
      const wrapper = document.createElement('div');
      const footer = document.createElement('footer');
      footer.setAttribute('data-chrome-footer', '');
      document.body.appendChild(footer);

      initFooterOverlapGuard(wrapper, document);

      expect(observed).toEqual([footer]);
      expect(wrapper.hasAttribute(TRAY_FOOTER_OVERLAP_ATTR)).toBe(false);

      callback!([{ isIntersecting: true } as IntersectionObserverEntry], null as unknown as IntersectionObserver);
      expect(wrapper.hasAttribute(TRAY_FOOTER_OVERLAP_ATTR)).toBe(true);

      callback!([{ isIntersecting: false } as IntersectionObserverEntry], null as unknown as IntersectionObserver);
      expect(wrapper.hasAttribute(TRAY_FOOTER_OVERLAP_ATTR)).toBe(false);

      footer.remove();
    } finally {
      globalThis.IntersectionObserver = original;
    }
  });

  it('is idempotent — a second call never attaches a second observer', () => {
    let observeCalls = 0;
    class FakeIntersectionObserver {
      constructor(_cb: IntersectionObserverCallback) {}
      observe() {
        observeCalls++;
      }
      unobserve() {}
      disconnect() {}
    }
    const original = globalThis.IntersectionObserver;
    // @ts-expect-error — a minimal fake, not the full browser interface.
    globalThis.IntersectionObserver = FakeIntersectionObserver;

    try {
      const wrapper = document.createElement('div');
      const footer = document.createElement('footer');
      footer.setAttribute('data-chrome-footer', '');
      document.body.appendChild(footer);

      initFooterOverlapGuard(wrapper, document);
      initFooterOverlapGuard(wrapper, document);

      expect(observeCalls).toBe(1);
      footer.remove();
    } finally {
      globalThis.IntersectionObserver = original;
    }
  });

  it('is a no-op when there is no real footer on the page', () => {
    const doc = document.implementation.createHTMLDocument('');
    const wrapper = doc.createElement('div');
    expect(() => initFooterOverlapGuard(wrapper, doc)).not.toThrow();
    expect(wrapper.dataset.trayFooterGuardReady).toBeUndefined();
  });
});
