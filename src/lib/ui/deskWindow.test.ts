// @vitest-environment jsdom
//
// Only `focusableElements` below needs a real DOM (`document.createElement`)
// — every other describe block in this file is pure/zero-DOM, same as
// before. The pragma routes the WHOLE file to the jsdom Vitest project
// (`src/testSupport/vitestProjectSplit.ts`); splitting it into two files
// just to keep the rest on the cheaper `node` project is not worth the
// churn for one new describe block.
import { describe, it, expect, afterEach } from 'vitest';
import {
  shouldStartFullScreen,
  readFullScreenPreference,
  writeFullScreenPreference,
  focusableElements,
  initDeskWindow,
  initDeskOpenWindowLinks,
  shouldProceedAfterGuardDecision,
  EDITOR_WINDOW_GUARD_KEY,
  type EditorWindowGuard,
} from './deskWindow';
import { MINIMIZED_WINDOWS_STORAGE_KEY, parseMinimizedWindows } from './minimizedWindows';

describe('shouldStartFullScreen', () => {
  it('starts full screen only when the stored value is exactly "true"', () => {
    expect(shouldStartFullScreen('true')).toBe(true);
    expect(shouldStartFullScreen('false')).toBe(false);
    expect(shouldStartFullScreen(null)).toBe(false);
    expect(shouldStartFullScreen('yes')).toBe(false);
  });
});

describe('readFullScreenPreference / writeFullScreenPreference', () => {
  function fakeStorage() {
    const store = new Map<string, string>();
    return {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    };
  }

  it('round-trips true through a working storage', () => {
    const storage = fakeStorage();
    writeFullScreenPreference(true, storage);
    expect(readFullScreenPreference(storage)).toBe(true);
  });

  it('round-trips false through a working storage', () => {
    const storage = fakeStorage();
    writeFullScreenPreference(true, storage);
    writeFullScreenPreference(false, storage);
    expect(readFullScreenPreference(storage)).toBe(false);
  });

  it('degrades to false (never throws) when the storage read throws', () => {
    const storage = {
      getItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readFullScreenPreference(storage)).toBe(false);
  });

  it('is a no-op (never throws) when the storage write throws', () => {
    const storage = {
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(() => writeFullScreenPreference(true, storage)).not.toThrow();
  });
});

describe('focusableElements', () => {
  it('finds links, buttons and explicit tabindex in DOM order, skipping disabled controls and tabindex="-1"', () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <a href="/a">link</a>
      <button disabled>disabled</button>
      <button>button</button>
      <div tabindex="-1">not tabbable</div>
      <div tabindex="0">tabbable div</div>
      <input disabled />
      <input />
    `;
    const found = focusableElements(container);
    expect(found.map((el) => el.tagName)).toEqual(['A', 'BUTTON', 'DIV', 'INPUT']);
  });

  it('returns an empty array when nothing inside is focusable', () => {
    const container = document.createElement('div');
    container.innerHTML = '<p>plain text</p>';
    expect(focusableElements(container)).toEqual([]);
  });
});

describe('shouldProceedAfterGuardDecision', () => {
  it('only "cancelled" ever says no', () => {
    expect(shouldProceedAfterGuardDecision('saved')).toBe(true);
    expect(shouldProceedAfterGuardDecision('discarded')).toBe(true);
    expect(shouldProceedAfterGuardDecision('cancelled')).toBe(false);
  });
});

/**
 * `initDeskWindow` — the EDITOR-specific behaviour (PART 6b): the
 * `closeOnEscape` policy, and the `EditorWindowGuard` bridge the
 * close/minimize lights consult before navigating away. Uses the real
 * (jsdom) `document` for `doc` — real event dispatch is what actually
 * exercises the conditionally-registered Escape listener — and a small fake
 * `win` for everything `deskWindow.ts` itself reads/writes on it, so a test
 * never depends on a real navigation happening.
 */
describe('initDeskWindow — editor window (PART 6b)', () => {
  function fakeStorage() {
    const store = new Map<string, string>();
    return {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
    };
  }

  function fakeWin(historyLength = 1, pathname = '/es/crear/abc', search = '') {
    return {
      location: { href: '', pathname, search, origin: 'https://example.test' },
      history: { length: historyLength, back: () => {} },
      sessionStorage: fakeStorage(),
      matchMedia: () => ({ matches: true }), // reduced-motion: skip the animation delay entirely
      setTimeout: ((fn: () => void) => {
        fn();
        return 0;
      }) as unknown as Window['setTimeout'],
      addEventListener: () => {},
    } as unknown as Window;
  }

  function buildWindowEl(): HTMLElement {
    const el = document.createElement('section');
    el.innerHTML = `
      <b id="t">Nueva actividad</b>
      <a data-desk-window-close href="/es/mis-actividades"></a>
      <a data-desk-window-minimize href="/es/mis-actividades"></a>
      <button type="button" data-desk-window-fullscreen></button>
    `;
    el.setAttribute('aria-labelledby', 't');
    document.body.appendChild(el);
    return el;
  }

  function click(el: Element) {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
  }

  async function flushMicrotasks() {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  afterEach(() => {
    document.body.innerHTML = '';
    delete (window as unknown as Record<string, unknown>)[EDITOR_WINDOW_GUARD_KEY];
  });

  it('closeOnEscape=false never registers the Escape-closes listener', () => {
    const el = buildWindowEl();
    const win = fakeWin();
    initDeskWindow(el, '/es/ingles', null, false, document, win);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));

    expect(win.location.href).toBe('');
  });

  it('closeOnEscape=true (default) closes on Escape when there is no guard', () => {
    const el = buildWindowEl();
    const win = fakeWin();
    initDeskWindow(el, '/es/ingles', null, true, document, win);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));

    expect(win.location.href).toBe('/es/ingles');
  });

  it('close(): a dirty editor guard that resolves "cancelled" blocks the navigation', async () => {
    const el = buildWindowEl();
    const win = fakeWin();
    const guard: EditorWindowGuard = {
      isDirty: () => true,
      flush: async () => true,
      confirmClose: async () => 'cancelled',
    };
    (win as unknown as Record<string, unknown>)[EDITOR_WINDOW_GUARD_KEY] = guard;
    initDeskWindow(el, '/es/mis-actividades', 'abc', false, document, win);

    click(el.querySelector('[data-desk-window-close]')!);
    await flushMicrotasks();

    expect(win.location.href).toBe('');
  });

  it('close(): a dirty editor guard that resolves "saved"/"discarded" proceeds with the navigation', async () => {
    const el = buildWindowEl();
    const win = fakeWin();
    const guard: EditorWindowGuard = {
      isDirty: () => true,
      flush: async () => true,
      confirmClose: async () => 'discarded',
    };
    (win as unknown as Record<string, unknown>)[EDITOR_WINDOW_GUARD_KEY] = guard;
    initDeskWindow(el, '/es/mis-actividades', 'abc', false, document, win);

    click(el.querySelector('[data-desk-window-close]')!);
    await flushMicrotasks();

    expect(win.location.href).toBe('/es/mis-actividades');
  });

  it('minimize(): a dirty editor guard is flushed SILENTLY — no confirmClose call when the flush succeeds', async () => {
    const el = buildWindowEl();
    const win = fakeWin();
    let confirmCloseCalls = 0;
    const guard: EditorWindowGuard = {
      isDirty: () => true,
      flush: async () => true,
      confirmClose: async () => {
        confirmCloseCalls += 1;
        return 'cancelled';
      },
    };
    (win as unknown as Record<string, unknown>)[EDITOR_WINDOW_GUARD_KEY] = guard;
    initDeskWindow(el, '/es/mis-actividades', 'abc', false, document, win);

    click(el.querySelector('[data-desk-window-minimize]')!);
    await flushMicrotasks();

    expect(confirmCloseCalls).toBe(0);
    expect(win.location.href).toBe('/es/mis-actividades');
  });

  it('minimize(): falls back to confirmClose when the silent flush itself fails, and honours "cancelled"', async () => {
    const el = buildWindowEl();
    const win = fakeWin();
    const guard: EditorWindowGuard = {
      isDirty: () => true,
      flush: async () => false,
      confirmClose: async () => 'cancelled',
    };
    (win as unknown as Record<string, unknown>)[EDITOR_WINDOW_GUARD_KEY] = guard;
    initDeskWindow(el, '/es/mis-actividades', 'abc', false, document, win);

    click(el.querySelector('[data-desk-window-minimize]')!);
    await flushMicrotasks();

    expect(win.location.href).toBe('');
  });

  it('a clean (non-dirty) editor guard never blocks close or minimize', async () => {
    const el = buildWindowEl();
    const win = fakeWin();
    const guard: EditorWindowGuard = {
      isDirty: () => false,
      flush: async () => true,
      confirmClose: async () => 'cancelled',
    };
    (win as unknown as Record<string, unknown>)[EDITOR_WINDOW_GUARD_KEY] = guard;
    initDeskWindow(el, '/es/mis-actividades', 'abc', false, document, win);

    click(el.querySelector('[data-desk-window-close]')!);
    await flushMicrotasks();

    expect(win.location.href).toBe('/es/mis-actividades');
  });

  // Community-list-as-a-window pass (owner spec 2026-10-07): minimizing the
  // community window must restore the SAME filtered list, not a plain
  // unfiltered one — the whole point of a tray chip is reopening to exactly
  // where the visitor left off. `minimizeNow` builds the stored `href` from
  // `win.location.pathname` + `win.location.search`, so whatever filters
  // are in the URL at minimize time are what the chip reopens to; this
  // locks that contract down directly, rather than only through the
  // generic flush/guard tests above (none of which inspect the stored
  // entry's own `href`/`title`).
  describe('minimize(): stores the exact current URL (filters included) and the title bar\'s own text', () => {
    it('stores href as pathname + search — reopening the chip restores the same filtered list', async () => {
      const el = buildWindowEl();
      const win = fakeWin(1, '/es/ingles/actividades', '?nivel=B1&orden=gustadas');
      initDeskWindow(el, '/es/ingles', 'community-activities', true, document, win);

      click(el.querySelector('[data-desk-window-minimize]')!);
      await flushMicrotasks();

      const stored = parseMinimizedWindows(win.sessionStorage.getItem(MINIMIZED_WINDOWS_STORAGE_KEY));
      expect(stored).toHaveLength(1);
      expect(stored[0].href).toBe('/es/ingles/actividades?nivel=B1&orden=gustadas');
      expect(stored[0].id).toBe('community-activities');
    });

    it('stores the title bar\'s own text (always "Actividades de la comunidad" for the community window, regardless of filters)', async () => {
      const el = buildWindowEl();
      el.querySelector('#t')!.textContent = 'Actividades de la comunidad';
      const win = fakeWin(1, '/es/ingles/actividades', '?q=present');
      initDeskWindow(el, '/es/ingles', 'community-activities', true, document, win);

      click(el.querySelector('[data-desk-window-minimize]')!);
      await flushMicrotasks();

      const stored = parseMinimizedWindows(win.sessionStorage.getItem(MINIMIZED_WINDOWS_STORAGE_KEY));
      expect(stored[0].title).toBe('Actividades de la comunidad');
    });

    it('stores a bare pathname (no trailing "?") when there is no query string at all', async () => {
      const el = buildWindowEl();
      const win = fakeWin(1, '/es/ingles/actividades', '');
      initDeskWindow(el, '/es/ingles', 'community-activities', true, document, win);

      click(el.querySelector('[data-desk-window-minimize]')!);
      await flushMicrotasks();

      const stored = parseMinimizedWindows(win.sessionStorage.getItem(MINIMIZED_WINDOWS_STORAGE_KEY));
      expect(stored[0].href).toBe('/es/ingles/actividades');
    });
  });

  // PART 6c (owner spec 2026-10-07): closing ALWAYS navigates straight to
  // the target now — never `history.back()`, regardless of any tracked
  // previous screen (the old `closeUsesTrackedPath` param/behaviour is
  // gone). `fakeWin`'s own reduced-motion stub (`matches: true` for every
  // query) means `closeNow`'s animation branch is skipped, so `location.href`
  // is already set by the time `flushMicrotasks` resolves.
  describe('close() always navigates to the target (PART 6c, never history.back())', () => {
    it('ignores any tracked previous screen and navigates straight to the target', async () => {
      const el = buildWindowEl();
      const win = fakeWin(2);
      let backCalls = 0;
      win.history.back = () => {
        backCalls += 1;
      };
      win.sessionStorage.setItem('chuyo-nav-previous-path', '/es/mis-actividades');
      initDeskWindow(el, '/es/ingles', null, false, document, win);

      click(el.querySelector('[data-desk-window-close]')!);
      await flushMicrotasks();

      expect(backCalls).toBe(0);
      expect(win.location.href).toBe('/es/ingles');
    });

    it('navigates to the target even with no tracked previous path at all', async () => {
      const el = buildWindowEl();
      const win = fakeWin(2);
      initDeskWindow(el, '/es/ingles', null, false, document, win);

      click(el.querySelector('[data-desk-window-close]')!);
      await flushMicrotasks();

      expect(win.location.href).toBe('/es/ingles');
    });
  });

  describe('close()/minimize() animations (PART 6c, skipped under reduced motion)', () => {
    it('close() plays the closing animation and defers the navigation under full motion', async () => {
      const el = buildWindowEl();
      const win = fakeWin();
      win.matchMedia = (() => ({ matches: false })) as unknown as Window['matchMedia']; // full motion: the animation branch actually runs.
      let navigatedAfter = -1;
      let timeoutMs = -1;
      win.setTimeout = ((fn: () => void, ms: number) => {
        timeoutMs = ms;
        fn();
        navigatedAfter = ms;
        return 0;
      }) as unknown as Window['setTimeout'];
      initDeskWindow(el, '/es/ingles', null, false, document, win);

      click(el.querySelector('[data-desk-window-close]')!);
      await flushMicrotasks();

      expect(el.classList.contains('ingles-window--closing')).toBe(true);
      expect(timeoutMs).toBeGreaterThan(0);
      expect(navigatedAfter).toBe(timeoutMs);
      expect(win.location.href).toBe('/es/ingles');
    });

    it('close() skips the animation entirely under prefers-reduced-motion', async () => {
      const el = buildWindowEl();
      const win = fakeWin(); // reduced motion by default (see fakeWin's own header).
      initDeskWindow(el, '/es/ingles', null, false, document, win);

      click(el.querySelector('[data-desk-window-close]')!);
      await flushMicrotasks();

      expect(el.classList.contains('ingles-window--closing')).toBe(false);
      expect(win.location.href).toBe('/es/ingles');
    });
  });

  // Window-manager architecture (embedded mode): `document.documentElement`
  // carries `data-desk-window-embedded` (`BaseLayout.astro`'s own `embedded`
  // prop) — `deskWindow.ts` reads it off the REAL `document` passed as `doc`
  // in every test above, so these are isolated to their own `describe` with
  // their own `afterEach` cleanup.
  describe('embedded mode (window-manager architecture): posts to the host instead of navigating', () => {
    function fakeEmbeddedWin(parentPosted: Array<{ message: unknown; origin: string }>) {
      const win = fakeWin();
      (win as unknown as { parent: unknown }).parent = {
        postMessage: (message: unknown, origin: string) => parentPosted.push({ message, origin }),
      };
      return win;
    }

    afterEach(() => {
      document.documentElement.removeAttribute('data-desk-window-embedded');
    });

    it('close() posts {type:"close"} instead of navigating, and never asks the editor guard itself', async () => {
      document.documentElement.setAttribute('data-desk-window-embedded', '');
      const el = buildWindowEl();
      const posted: Array<{ message: unknown; origin: string }> = [];
      const win = fakeEmbeddedWin(posted);
      let confirmCloseCalls = 0;
      (win as unknown as Record<string, unknown>)[EDITOR_WINDOW_GUARD_KEY] = {
        isDirty: () => true,
        flush: async () => true,
        confirmClose: async () => {
          confirmCloseCalls += 1;
          return 'cancelled';
        },
      } satisfies EditorWindowGuard;
      initDeskWindow(el, '/es/ingles', 'abc', false, document, win);

      click(el.querySelector('[data-desk-window-close]')!);
      await flushMicrotasks();

      expect(win.location.href).toBe('');
      expect(confirmCloseCalls).toBe(0); // the HOST resolves the guard, via window.deskWindowCanClose — not this frame.
      expect(posted).toContainEqual({ message: { source: 'desk-window', type: 'close' }, origin: 'https://example.test' });
    });

    it('minimize() posts {type:"minimize"} and never touches sessionStorage (the host owns the live tray)', async () => {
      document.documentElement.setAttribute('data-desk-window-embedded', '');
      const el = buildWindowEl();
      const posted: Array<{ message: unknown; origin: string }> = [];
      const win = fakeEmbeddedWin(posted);
      initDeskWindow(el, '/es/ingles', 'abc', false, document, win);

      click(el.querySelector('[data-desk-window-minimize]')!);
      await flushMicrotasks();

      expect(win.location.href).toBe('');
      expect(win.sessionStorage.getItem(MINIMIZED_WINDOWS_STORAGE_KEY)).toBeNull();
      expect(posted).toContainEqual({ message: { source: 'desk-window', type: 'minimize' }, origin: 'https://example.test' });
    });

    it('the fullscreen button posts {type:"maximize-toggle"} instead of writing localStorage', async () => {
      document.documentElement.setAttribute('data-desk-window-embedded', '');
      const el = buildWindowEl();
      const posted: Array<{ message: unknown; origin: string }> = [];
      const win = fakeEmbeddedWin(posted);
      initDeskWindow(el, '/es/ingles', 'abc', false, document, win);

      click(el.querySelector('[data-desk-window-fullscreen]')!);

      expect(posted).toContainEqual({ message: { source: 'desk-window', type: 'maximize-toggle' }, origin: 'https://example.test' });
    });

    it('posts the initial title to the host on mount', () => {
      document.documentElement.setAttribute('data-desk-window-embedded', '');
      const el = buildWindowEl();
      const posted: Array<{ message: unknown; origin: string }> = [];
      const win = fakeEmbeddedWin(posted);
      initDeskWindow(el, '/es/ingles', 'abc', false, document, win);

      expect(posted).toContainEqual({
        message: { source: 'desk-window', type: 'title', text: 'Nueva actividad' },
        origin: 'https://example.test',
      });
    });

    it('window.deskWindowCanClose resolves the SAME guard decision canCloseNow would, for the host to call directly', async () => {
      const el = buildWindowEl();
      const win = fakeWin();
      (win as unknown as Record<string, unknown>)[EDITOR_WINDOW_GUARD_KEY] = {
        isDirty: () => true,
        flush: async () => true,
        confirmClose: async () => 'cancelled',
      } satisfies EditorWindowGuard;
      initDeskWindow(el, '/es/ingles', 'abc', false, document, win);

      const canClose = (win as unknown as { deskWindowCanClose: () => Promise<boolean> }).deskWindowCanClose;
      await expect(canClose()).resolves.toBe(false);
    });

    it('window.deskWindowCanMinimize flushes silently and resolves true on a successful flush', async () => {
      const el = buildWindowEl();
      const win = fakeWin();
      let confirmCloseCalls = 0;
      (win as unknown as Record<string, unknown>)[EDITOR_WINDOW_GUARD_KEY] = {
        isDirty: () => true,
        flush: async () => true,
        confirmClose: async () => {
          confirmCloseCalls += 1;
          return 'cancelled';
        },
      } satisfies EditorWindowGuard;
      initDeskWindow(el, '/es/ingles', 'abc', false, document, win);

      const canMinimize = (win as unknown as { deskWindowCanMinimize: () => Promise<boolean> }).deskWindowCanMinimize;
      await expect(canMinimize()).resolves.toBe(true);
      expect(confirmCloseCalls).toBe(0);
    });
  });
});

describe('initDeskOpenWindowLinks', () => {
  // A BRAND NEW `Document` per test (never the shared jsdom `document`) —
  // `initDeskOpenWindowLinks` has no teardown of its own (same posture as
  // every other desk script: it is meant to be wired exactly once for a
  // real page's whole lifetime), so reusing one `document` across tests
  // would leak a real capture-phase listener from a previous test into the
  // next one, which would then see this test's own click already
  // `defaultPrevented` and wrongly bail out before posting anything.
  function freshDoc(): Document {
    return document.implementation.createHTMLDocument('');
  }

  function fakeEmbeddedWin(posted: Array<{ message: unknown; origin: string }>) {
    return {
      location: { origin: 'https://example.test' },
      parent: { postMessage: (message: unknown, origin: string) => posted.push({ message, origin }) },
    } as unknown as Window;
  }

  it('is a no-op outside embedded mode — a plain navigation proceeds', () => {
    const doc = freshDoc();
    const anchor = doc.createElement('a');
    anchor.href = '/es/ingles/actividades/abc';
    anchor.setAttribute('data-desk-open-window', '');
    doc.body.appendChild(anchor);

    const posted: Array<{ message: unknown; origin: string }> = [];
    initDeskOpenWindowLinks(doc, fakeEmbeddedWin(posted));
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    anchor.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(posted).toEqual([]);
  });

  it('embedded: posts open-window with the href and a derived title, preventing navigation', () => {
    const doc = freshDoc();
    doc.documentElement.setAttribute('data-desk-window-embedded', '');
    const anchor = doc.createElement('a');
    anchor.href = '/es/ingles/actividades/abc';
    anchor.setAttribute('data-desk-open-window', '');
    anchor.textContent = 'Present Simple';
    doc.body.appendChild(anchor);

    const posted: Array<{ message: unknown; origin: string }> = [];
    initDeskOpenWindowLinks(doc, fakeEmbeddedWin(posted));
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    anchor.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(posted).toEqual([
      {
        message: { source: 'desk-window', type: 'open-window', href: '/es/ingles/actividades/abc', title: 'Present Simple' },
        origin: 'https://example.test',
      },
    ]);
  });

  it('prefers aria-label over the text content for the derived title', () => {
    const doc = freshDoc();
    doc.documentElement.setAttribute('data-desk-window-embedded', '');
    const anchor = doc.createElement('a');
    anchor.href = '/es/crear';
    anchor.setAttribute('data-desk-open-window', '');
    anchor.setAttribute('aria-label', 'Crear actividad');
    anchor.textContent = '+';
    doc.body.appendChild(anchor);

    const posted: Array<{ message: unknown; origin: string }> = [];
    initDeskOpenWindowLinks(doc, fakeEmbeddedWin(posted));
    anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));

    expect((posted[0].message as { title: string }).title).toBe('Crear actividad');
  });

  it('only wires once per document (double-wiring guard)', () => {
    const doc = freshDoc();
    doc.documentElement.setAttribute('data-desk-window-embedded', '');
    const anchor = doc.createElement('a');
    anchor.href = '/es/crear';
    anchor.setAttribute('data-desk-open-window', '');
    doc.body.appendChild(anchor);

    const posted: Array<{ message: unknown; origin: string }> = [];
    const win = fakeEmbeddedWin(posted);
    initDeskOpenWindowLinks(doc, win);
    initDeskOpenWindowLinks(doc, win);
    anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));

    expect(posted).toHaveLength(1); // a double-wired listener would post twice.
  });
});
