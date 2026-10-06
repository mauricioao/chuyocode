// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initDeskHelper, DESK_HELPER_FOLDED_STORAGE_KEY, readStoredFold } from './deskHelper';
import { DESK_HELPER_TIPS, pickDailyTipIndex } from '@/content/deskHelperTips';
import { CHARACTERS } from '@/content/characters';

const CLIENT_TIPS = DESK_HELPER_TIPS.slice(0, 4).map((tip) => ({
  slug: tip.character,
  name: CHARACTERS[tip.character].alt.es,
  html: tip.es,
}));

function setDom(tipIndex: number, { folded = false }: { folded?: boolean } = {}): void {
  document.body.innerHTML = `
    <aside id="desk-helper" data-tip-index="${tipIndex}" data-avatar-label-template="Ayuda de {name}">
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
      <script type="application/json" id="desk-helper-data">${JSON.stringify(CLIENT_TIPS)}</script>
    </aside>
  `;
}

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  sessionStorage.clear();
  document.body.innerHTML = '';
});

describe('initDeskHelper — local-date tip correction', () => {
  it('corrects the SSR tip to the visitor local calendar day when it differs', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 6));
    const expectedIndex = pickDailyTipIndex(new Date(), CLIENT_TIPS.length);
    const wrongIndex = (expectedIndex + 1) % CLIENT_TIPS.length;
    setDom(wrongIndex);

    initDeskHelper(document);

    const root = document.getElementById('desk-helper') as HTMLElement;
    expect(root.getAttribute('data-tip-index')).toBe(String(expectedIndex));
    expect(document.querySelector('[data-desk-helper-name]')?.textContent).toBe(
      CLIENT_TIPS[expectedIndex].name,
    );
    expect(document.querySelector('[data-desk-helper-tip]')?.innerHTML).toBe(
      CLIENT_TIPS[expectedIndex].html,
    );
    vi.useRealTimers();
  });

  it('leaves the tip alone when the SSR index already matches', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 6));
    const expectedIndex = pickDailyTipIndex(new Date(), CLIENT_TIPS.length);
    setDom(expectedIndex);

    initDeskHelper(document);

    const root = document.getElementById('desk-helper') as HTMLElement;
    expect(root.getAttribute('data-tip-index')).toBe(String(expectedIndex));
    vi.useRealTimers();
  });

  it('does nothing on a page with no helper', () => {
    document.body.innerHTML = '<div>no helper here</div>';
    expect(() => initDeskHelper(document)).not.toThrow();
  });
});

describe('initDeskHelper — "Otro tip"', () => {
  // Pin the clock so the local-date correction (tested above) picks a KNOWN
  // start index, matched in `setDom` below — otherwise it would run first
  // and start cycling from whatever tip today's real date happens to pick.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 6));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function startIndex(): number {
    return pickDailyTipIndex(new Date(), CLIENT_TIPS.length);
  }

  it('cycles to the next tip inside the aria-live bubble, wrapping around at the end', () => {
    const start = startIndex();
    setDom(start);
    initDeskHelper(document);
    const root = document.getElementById('desk-helper') as HTMLElement;
    const next = document.getElementById('desk-helper-next') as HTMLButtonElement;

    for (let step = 1; step < CLIENT_TIPS.length; step++) {
      next.click();
      const expectedIndex = (start + step) % CLIENT_TIPS.length;
      expect(root.getAttribute('data-tip-index')).toBe(String(expectedIndex));
      expect(document.querySelector('[data-desk-helper-name]')?.textContent).toBe(
        CLIENT_TIPS[expectedIndex].name,
      );
    }
    // One more click wraps all the way back to the start.
    next.click();
    expect(root.getAttribute('data-tip-index')).toBe(String(start));
  });

  it('updates the avatar accessible name to the newly speaking character', () => {
    const start = startIndex();
    setDom(start);
    initDeskHelper(document);
    const next = document.getElementById('desk-helper-next') as HTMLButtonElement;
    next.click();

    const expectedIndex = (start + 1) % CLIENT_TIPS.length;
    const avatar = document.getElementById('desk-helper-avatar') as HTMLElement;
    expect(avatar.getAttribute('aria-label')).toBe(`Ayuda de ${CLIENT_TIPS[expectedIndex].name}`);
  });
});

describe('initDeskHelper — fold/unfold', () => {
  it('folds when the avatar is clicked while open: hides the bubble and flips aria-expanded', () => {
    setDom(0, { folded: false });
    initDeskHelper(document);

    const avatar = document.getElementById('desk-helper-avatar') as HTMLElement;
    const bubble = document.getElementById('desk-helper-bubble') as HTMLElement;
    avatar.click();

    expect(bubble.hidden).toBe(true);
    expect(avatar.getAttribute('aria-expanded')).toBe('false');
    expect(readStoredFold()).toBe('true');
  });

  it('reopens when the avatar is clicked while folded', () => {
    setDom(0, { folded: true });
    initDeskHelper(document);

    const avatar = document.getElementById('desk-helper-avatar') as HTMLElement;
    const bubble = document.getElementById('desk-helper-bubble') as HTMLElement;
    avatar.click();

    expect(bubble.hidden).toBe(false);
    expect(avatar.getAttribute('aria-expanded')).toBe('true');
    expect(readStoredFold()).toBe('false');
  });

  it('the close button always folds, even if already folded', () => {
    setDom(0, { folded: false });
    initDeskHelper(document);

    const bubble = document.getElementById('desk-helper-bubble') as HTMLElement;
    const close = document.getElementById('desk-helper-close') as HTMLElement;
    close.click();
    expect(bubble.hidden).toBe(true);

    close.click();
    expect(bubble.hidden).toBe(true);
  });

  it('persists the fold choice under the shared session storage key', () => {
    setDom(0, { folded: false });
    initDeskHelper(document);

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
    setDom(0, { folded: false });
    initDeskHelper(document);
    initDeskHelper(document);

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
    setDom(0);
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

    initDeskHelper(document);
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
