// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initDeskHelper, DESK_HELPER_FOLDED_STORAGE_KEY, readStoredFold } from './deskHelper';
import { clearDeskHelperTipsCacheForTests } from './deskHelperTipsClient';
import { DESK_HELPER_QUEUE_STORAGE_KEY } from './deskHelperQueue';
import { CHARACTERS } from '@/content/characters';

const FULL_TIPS = [
  { id: 'tip-a', character: 'bruno', html: '<em>a</em>' },
  { id: 'tip-b', character: 'luna', html: '<em>b</em>' },
  { id: 'tip-c', character: 'mia', html: '<em>c</em>' },
] as const;

function setDom(tipId: string, { folded = false }: { folded?: boolean } = {}): void {
  document.body.innerHTML = `
    <aside id="desk-helper" data-tip-id="${tipId}" data-lang="es" data-avatar-label-template="Ayuda de {name}">
      <button id="desk-helper-avatar" data-desk-helper-avatar aria-expanded="${!folded}" aria-label="Ayuda de x">
        <picture>
          <source data-desk-helper-avif type="image/avif" />
          <source data-desk-helper-webp type="image/webp" />
          <img data-desk-helper-img src="" alt="" />
        </picture>
      </button>
      <div id="desk-helper-bubble" ${folded ? 'hidden' : ''}>
        <b data-desk-helper-name></b>
        <span data-desk-helper-tip></span>
        <button id="desk-helper-next" type="button">Otro tip</button>
        <button id="desk-helper-close" type="button" aria-label="Cerrar ayuda">&times;</button>
      </div>
    </aside>
  `;
}

function fakeFetch(tips: readonly { id: string; character: string; html: string }[] = FULL_TIPS) {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => tips,
  })) as unknown as typeof fetch;
}

function fakeStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
  };
}

beforeEach(() => {
  sessionStorage.clear();
  clearDeskHelperTipsCacheForTests();
});

afterEach(() => {
  sessionStorage.clear();
  document.body.innerHTML = '';
  clearDeskHelperTipsCacheForTests();
});

describe('initDeskHelper — no-op guards', () => {
  it('does nothing on a page with no helper', () => {
    document.body.innerHTML = '<div>no helper here</div>';
    expect(() => initDeskHelper(document, fakeFetch())).not.toThrow();
  });

  it('does nothing when the root has no recognised data-lang', () => {
    setDom('tip-a');
    document.getElementById('desk-helper')?.removeAttribute('data-lang');
    const fetchImpl = fakeFetch();
    initDeskHelper(document, fetchImpl);
    document.getElementById('desk-helper-next')?.dispatchEvent(new MouseEvent('click'));
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('initDeskHelper — "Otro tip"', () => {
  it('lazily fetches the full per-language list only on the FIRST click', async () => {
    setDom('tip-a');
    const fetchImpl = fakeFetch();
    initDeskHelper(document, fetchImpl, fakeStorage());
    const next = document.getElementById('desk-helper-next') as HTMLButtonElement;

    expect(fetchImpl).not.toHaveBeenCalled();
    next.click();
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    expect(fetchImpl).toHaveBeenCalledWith('/data/desk-tips-es.json');

    next.click();
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1)); // cached — no second fetch
  });

  it('renders the next tip\'s name, html and avatar — changing the speaking character', async () => {
    setDom('tip-a');
    initDeskHelper(document, fakeFetch(), fakeStorage());
    const next = document.getElementById('desk-helper-next') as HTMLButtonElement;
    next.click();

    await vi.waitFor(() => {
      const root = document.getElementById('desk-helper') as HTMLElement;
      expect(root.getAttribute('data-tip-id')).not.toBe('tip-a');
    });

    const root = document.getElementById('desk-helper') as HTMLElement;
    const shownId = root.getAttribute('data-tip-id');
    const shownTip = FULL_TIPS.find((t) => t.id === shownId)!;
    expect(['tip-b', 'tip-c']).toContain(shownId);
    expect(document.querySelector('[data-desk-helper-name]')?.textContent).toBe(
      CHARACTERS[shownTip.character as keyof typeof CHARACTERS].alt.es,
    );
    expect(document.querySelector('[data-desk-helper-tip]')?.innerHTML).toBe(shownTip.html);
    expect(document.getElementById('desk-helper-avatar')?.getAttribute('aria-label')).toBe(
      `Ayuda de ${CHARACTERS[shownTip.character as keyof typeof CHARACTERS].alt.es}`,
    );
  });

  it('never immediately repeats the tip already on screen', async () => {
    setDom('tip-a');
    initDeskHelper(document, fakeFetch(), fakeStorage());
    const next = document.getElementById('desk-helper-next') as HTMLButtonElement;
    next.click();

    const root = document.getElementById('desk-helper') as HTMLElement;
    await vi.waitFor(() => {
      expect(root.getAttribute('data-tip-id')).not.toBe('tip-a');
    });
  });

  it('cycles through every tip with no repeats before any reshuffle', async () => {
    setDom('tip-a');
    const storage = fakeStorage();
    initDeskHelper(document, fakeFetch(), storage);
    const next = document.getElementById('desk-helper-next') as HTMLButtonElement;
    const root = document.getElementById('desk-helper') as HTMLElement;

    const seen = new Set<string>();
    // tip-a is already "shown" (the SSR pick); the remaining 2 unseen ids
    // must appear exactly once each across the next 2 clicks.
    let last = 'tip-a';
    for (let i = 0; i < 2; i++) {
      next.click();
      const previous = last;
      // eslint-disable-next-line no-await-in-loop
      await vi.waitFor(() => expect(root.getAttribute('data-tip-id')).not.toBe(previous));
      last = root.getAttribute('data-tip-id') as string;
      seen.add(last);
    }
    expect(seen).toEqual(new Set(['tip-b', 'tip-c']));
  });

  it('persists the queue under the shared session storage key', async () => {
    setDom('tip-a');
    const storage = fakeStorage();
    initDeskHelper(document, fakeFetch(), storage);
    const next = document.getElementById('desk-helper-next') as HTMLButtonElement;
    next.click();

    await vi.waitFor(() => expect(storage.getItem(DESK_HELPER_QUEUE_STORAGE_KEY)).not.toBeNull());
  });

  it('leaves the current tip showing when the fetch fails, instead of throwing', async () => {
    setDom('tip-a');
    const failingFetch = vi.fn(async () => ({ ok: false, status: 500, json: async () => [] })) as unknown as typeof fetch;
    initDeskHelper(document, failingFetch, fakeStorage());
    const next = document.getElementById('desk-helper-next') as HTMLButtonElement;
    expect(() => next.click()).not.toThrow();

    await vi.waitFor(() => expect(failingFetch).toHaveBeenCalledTimes(1));
    const root = document.getElementById('desk-helper') as HTMLElement;
    expect(root.getAttribute('data-tip-id')).toBe('tip-a');
  });
});

describe('initDeskHelper — fold/unfold', () => {
  it('folds when the avatar is clicked while open: hides the bubble and flips aria-expanded', () => {
    setDom('tip-a', { folded: false });
    initDeskHelper(document, fakeFetch(), fakeStorage());

    const avatar = document.getElementById('desk-helper-avatar') as HTMLElement;
    const bubble = document.getElementById('desk-helper-bubble') as HTMLElement;
    avatar.click();

    expect(bubble.hidden).toBe(true);
    expect(avatar.getAttribute('aria-expanded')).toBe('false');
    expect(readStoredFold()).toBe('true');
  });

  it('reopens when the avatar is clicked while folded', () => {
    setDom('tip-a', { folded: true });
    initDeskHelper(document, fakeFetch(), fakeStorage());

    const avatar = document.getElementById('desk-helper-avatar') as HTMLElement;
    const bubble = document.getElementById('desk-helper-bubble') as HTMLElement;
    avatar.click();

    expect(bubble.hidden).toBe(false);
    expect(avatar.getAttribute('aria-expanded')).toBe('true');
    expect(readStoredFold()).toBe('false');
  });

  it('the close button always folds, even if already folded', () => {
    setDom('tip-a', { folded: false });
    initDeskHelper(document, fakeFetch(), fakeStorage());

    const bubble = document.getElementById('desk-helper-bubble') as HTMLElement;
    const close = document.getElementById('desk-helper-close') as HTMLElement;
    close.click();
    expect(bubble.hidden).toBe(true);

    close.click();
    expect(bubble.hidden).toBe(true);
  });

  it('persists the fold choice under the shared session storage key', () => {
    setDom('tip-a', { folded: false });
    initDeskHelper(document, fakeFetch(), fakeStorage());

    const avatar = document.getElementById('desk-helper-avatar') as HTMLElement;
    avatar.click();

    expect(sessionStorage.getItem(DESK_HELPER_FOLDED_STORAGE_KEY)).toBe('true');
  });

  // Regression test: `index.astro`'s own script calls `initDeskHelper` both
  // immediately AND on `astro:page-load` (which also fires for the very
  // first load) — a real bug caught by hand-testing in a browser, where a
  // second, unguarded `addEventListener('click', …)` made every click
  // double-toggle (two listeners firing once each, the second reading the
  // state the first had just flipped), so the avatar appeared to do nothing.
  it('wiring init twice still toggles exactly once per click', () => {
    setDom('tip-a', { folded: false });
    initDeskHelper(document, fakeFetch(), fakeStorage());
    initDeskHelper(document, fakeFetch(), fakeStorage());

    const avatar = document.getElementById('desk-helper-avatar') as HTMLElement;
    const bubble = document.getElementById('desk-helper-bubble') as HTMLElement;

    avatar.click();
    expect(bubble.hidden).toBe(true);

    avatar.click();
    expect(bubble.hidden).toBe(false);
  });
});

describe('initDeskHelper — footer lift', () => {
  it('lifts clear of the footer bar while it intersects the viewport', () => {
    setDom('tip-a');
    document.body.insertAdjacentHTML('beforeend', '<footer data-chrome-footer></footer>');

    let observedCallback: IntersectionObserverCallback | undefined;
    // A plain function (not a class): assigning the outer `let` from inside a
    // class constructor trips a known TS control-flow-narrowing gap, making
    // every later read of `observedCallback` resolve to `never`.
    function FakeIntersectionObserver(cb: IntersectionObserverCallback) {
      observedCallback = cb;
      return { observe() {}, unobserve() {}, disconnect() {} };
    }
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver as unknown as typeof IntersectionObserver);

    initDeskHelper(document, fakeFetch(), fakeStorage());
    const root = document.getElementById('desk-helper') as HTMLElement;

    expect(observedCallback).toBeDefined();
    const callback = observedCallback as IntersectionObserverCallback;
    callback(
      [
        {
          isIntersecting: true,
          intersectionRect: { height: 72 } as DOMRectReadOnly,
        } as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver,
    );
    expect(root.style.getPropertyValue('--desk-helper-lift')).toBe('72px');

    callback(
      [{ isIntersecting: false, intersectionRect: { height: 0 } as DOMRectReadOnly } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );
    expect(root.style.getPropertyValue('--desk-helper-lift')).toBe('0px');

    vi.unstubAllGlobals();
  });
});
