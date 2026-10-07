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
  MAX_MINIMIZED_WINDOWS,
  MINIMIZED_WINDOWS_STORAGE_KEY,
  type MinimizedWindowEntry,
} from './minimizedWindows';

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

  it('renders one chip per entry, unhidden, each an opener anchor with the title and a close button', () => {
    const container = document.createElement('nav');
    renderMinimizedWindowsTray(container, [entry('a'), entry('b')], 'Quitar');
    expect(container.hidden).toBe(false);
    const chips = container.querySelectorAll('a[data-desk-window-open]');
    expect(chips).toHaveLength(2);
    expect(chips[0].getAttribute('data-desk-window-open')).toBe('a');
    expect(chips[0].getAttribute('href')).toBe('/es/ingles/actividades/a');
    expect(chips[0].textContent).toContain('Title a');
    expect(chips[0].querySelector('button')?.getAttribute('aria-label')).toBe('Quitar');
  });

  it('each chip is a tile: a document glyph preview (no thumbnail yet) with the title underneath', () => {
    const container = document.createElement('nav');
    renderMinimizedWindowsTray(container, [entry('a')], 'Quitar');
    const chip = container.querySelector('a[data-desk-window-open]') as HTMLElement;

    expect(chip.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(chip.querySelector('img')).toBeNull();
    expect(chip.querySelector('small')?.textContent).toBe('Title a');
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

describe('renderMinimizedWindowsTray — the hairline sibling', () => {
  it('unhides a sibling [data-minimized-tray-hairline] when there is something to show, and hides it again once empty', () => {
    const wrapper = document.createElement('div');
    const hairline = document.createElement('div');
    hairline.setAttribute('data-minimized-tray-hairline', '');
    hairline.hidden = true;
    const container = document.createElement('nav');
    wrapper.append(hairline, container);

    renderMinimizedWindowsTray(container, [entry('a')], 'Quitar');
    expect(hairline.hidden).toBe(false);

    renderMinimizedWindowsTray(container, [], 'Quitar');
    expect(hairline.hidden).toBe(true);
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
});
