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
  shouldProceedAfterGuardDecision,
  EDITOR_WINDOW_GUARD_KEY,
  type EditorWindowGuard,
} from './deskWindow';

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

  function fakeWin(historyLength = 1) {
    return {
      location: { href: '', pathname: '/es/crear/abc', search: '', origin: 'https://example.test' },
      history: { length: historyLength, back: () => {} },
      sessionStorage: fakeStorage(),
      matchMedia: () => ({ matches: true }), // reduced-motion: skip the animation delay entirely
      setTimeout: ((fn: () => void) => {
        fn();
        return 0;
      }) as unknown as Window['setTimeout'],
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
});
