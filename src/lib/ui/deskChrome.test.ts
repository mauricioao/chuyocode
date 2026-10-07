// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { initDeskChromeOffset, measureDeskChromeOffset, DESK_CHROME_OFFSET_VAR } from './deskChrome';

/** A fresh, isolated document per test — `initDeskChromeOffset` wires its
 * resize listener at most once per `Document` it is given, so each test
 * needs its own instance rather than sharing vitest's one global jsdom
 * `document` across the whole file. */
function freshDoc(): Document {
  return document.implementation.createHTMLDocument();
}

function fakeWin(): Window & { dispatch: (type: string) => void } {
  const listeners: Record<string, Array<() => void>> = {};
  return {
    requestAnimationFrame: (fn: () => void) => {
      fn();
      return 0;
    },
    addEventListener: (type: string, fn: () => void) => {
      (listeners[type] ??= []).push(fn);
    },
    dispatch: (type: string) => listeners[type]?.forEach((fn) => fn()),
  } as unknown as Window & { dispatch: (type: string) => void };
}

afterEach(() => {
  document.documentElement.style.removeProperty(DESK_CHROME_OFFSET_VAR);
});

describe('measureDeskChromeOffset', () => {
  it('returns 0 when no chrome row is on the page', () => {
    expect(measureDeskChromeOffset(freshDoc())).toBe(0);
  });

  it("returns the row's own rendered bottom edge", () => {
    const doc = freshDoc();
    doc.body.innerHTML = '<div data-desk-chrome-row></div>';
    const row = doc.querySelector('[data-desk-chrome-row]') as HTMLElement;
    row.getBoundingClientRect = () => ({ bottom: 76 }) as DOMRect;
    expect(measureDeskChromeOffset(doc)).toBe(76);
  });
});

describe('initDeskChromeOffset', () => {
  it('sets the CSS var from the measured row on mount', () => {
    const doc = freshDoc();
    doc.body.innerHTML = '<div data-desk-chrome-row></div>';
    const row = doc.querySelector('[data-desk-chrome-row]') as HTMLElement;
    row.getBoundingClientRect = () => ({ bottom: 84 }) as DOMRect;

    initDeskChromeOffset(doc, fakeWin());

    expect(doc.documentElement.style.getPropertyValue(DESK_CHROME_OFFSET_VAR)).toBe('84px');
  });

  it('never clears the var to 0 when the row is (temporarily) unmeasurable', () => {
    const doc = freshDoc();
    doc.documentElement.style.setProperty(DESK_CHROME_OFFSET_VAR, '72px');
    initDeskChromeOffset(doc, fakeWin());
    expect(doc.documentElement.style.getPropertyValue(DESK_CHROME_OFFSET_VAR)).toBe('72px');
  });

  it('re-measures on resize', () => {
    const doc = freshDoc();
    doc.body.innerHTML = '<div data-desk-chrome-row></div>';
    const row = doc.querySelector('[data-desk-chrome-row]') as HTMLElement;
    let bottom = 76;
    row.getBoundingClientRect = () => ({ bottom }) as DOMRect;

    const win = fakeWin();
    initDeskChromeOffset(doc, win);
    expect(doc.documentElement.style.getPropertyValue(DESK_CHROME_OFFSET_VAR)).toBe('76px');

    bottom = 90;
    win.dispatch('resize');
    expect(doc.documentElement.style.getPropertyValue(DESK_CHROME_OFFSET_VAR)).toBe('90px');
  });

  it('is idempotent — calling it again for the same document never throws and keeps the measured value in sync', () => {
    const doc = freshDoc();
    doc.body.innerHTML = '<div data-desk-chrome-row></div>';
    const row = doc.querySelector('[data-desk-chrome-row]') as HTMLElement;
    row.getBoundingClientRect = () => ({ bottom: 76 }) as DOMRect;

    const win = fakeWin();
    expect(() => {
      initDeskChromeOffset(doc, win);
      initDeskChromeOffset(doc, win);
    }).not.toThrow();
    expect(doc.documentElement.style.getPropertyValue(DESK_CHROME_OFFSET_VAR)).toBe('76px');
  });
});
