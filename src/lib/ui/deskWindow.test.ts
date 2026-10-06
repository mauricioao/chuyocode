// @vitest-environment jsdom
//
// Only `focusableElements` below needs a real DOM (`document.createElement`)
// — every other describe block in this file is pure/zero-DOM, same as
// before. The pragma routes the WHOLE file to the jsdom Vitest project
// (`src/testSupport/vitestProjectSplit.ts`); splitting it into two files
// just to keep the rest on the cheaper `node` project is not worth the
// churn for one new describe block.
import { describe, it, expect } from 'vitest';
import {
  resolveCloseAction,
  shouldStartFullScreen,
  readFullScreenPreference,
  writeFullScreenPreference,
  focusableElements,
} from './deskWindow';

describe('resolveCloseAction', () => {
  const hub = '/es/ingles';

  it('prefers history.back() when the previous SCREEN this visitor saw is exactly the close target', () => {
    const action = resolveCloseAction('/es/ingles', 2, hub);
    expect(action).toEqual({ kind: 'back' });
  });

  it('falls back to a plain href when there is no previous history entry', () => {
    const action = resolveCloseAction('/es/ingles', 1, hub);
    expect(action).toEqual({ kind: 'href', href: hub });
  });

  it('falls back to a plain href when the previous screen was a different path', () => {
    const action = resolveCloseAction('/es/ingles/actividades', 2, hub);
    expect(action).toEqual({ kind: 'href', href: hub });
  });

  it('falls back to a plain href when the previous screen is unknown (null — no tracked path, no usable referrer)', () => {
    const action = resolveCloseAction(null, 2, hub);
    expect(action).toEqual({ kind: 'href', href: hub });
  });

  it('resolves the guest close target (ChuyoCode home) the exact same way', () => {
    const home = '/es/';
    const action = resolveCloseAction('/es/', 2, home);
    expect(action).toEqual({ kind: 'back' });
  });
});

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
