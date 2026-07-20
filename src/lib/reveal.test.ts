// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  initReveals,
  initReveal,
  REVEAL_CLASS,
  REVEALED_CLASS,
} from './reveal';

// ---------------------------------------------------------------------------
// IntersectionObserver mock
//
// jsdom (v25) ships NO IntersectionObserver, so reveal.ts would take its
// no-support fallback branch. To exercise the real observer path we install a
// controllable stub: it records observed elements and exposes `trigger()` so a
// test can synthesously fire the intersection callback. `unobserve` removes the
// element so we can assert reveal.ts stops watching after a reveal.
// ---------------------------------------------------------------------------
type IOEntryInit = { target: Element; isIntersecting: boolean };

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];

  readonly observed = new Set<Element>();
  readonly unobserved: Element[] = [];
  disconnected = false;

  constructor(
    private readonly callback: IntersectionObserverCallback,
    readonly options?: IntersectionObserverInit,
  ) {
    MockIntersectionObserver.instances.push(this);
  }

  observe(el: Element): void {
    this.observed.add(el);
  }

  unobserve(el: Element): void {
    this.observed.delete(el);
    this.unobserved.push(el);
  }

  disconnect(): void {
    this.disconnected = true;
    this.observed.clear();
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  /** Fire the callback for the given entries (test-only helper). */
  trigger(entries: IOEntryInit[]): void {
    const full = entries.map((e) => ({
      target: e.target,
      isIntersecting: e.isIntersecting,
      intersectionRatio: e.isIntersecting ? 1 : 0,
      boundingClientRect: {} as DOMRectReadOnly,
      intersectionRect: {} as DOMRectReadOnly,
      rootBounds: null,
      time: 0,
    })) as unknown as IntersectionObserverEntry[];
    this.callback(full, this as unknown as IntersectionObserver);
  }
}

/** Install a `matchMedia` stub whose reduced-motion answer we control. */
function setReducedMotion(reduce: boolean): void {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('prefers-reduced-motion') ? reduce : false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

/** Add N `.reveal` divs to the document body and return them. */
function addRevealElements(count: number): HTMLElement[] {
  const els: HTMLElement[] = [];
  for (let i = 0; i < count; i += 1) {
    const el = document.createElement('div');
    el.classList.add(REVEAL_CLASS);
    document.body.appendChild(el);
    els.push(el);
  }
  return els;
}

describe('initReveals', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    MockIntersectionObserver.instances = [];
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
    setReducedMotion(false);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('observes every .reveal element', () => {
    const [a, b] = addRevealElements(2);

    initReveals();

    expect(MockIntersectionObserver.instances).toHaveLength(1);
    const io = MockIntersectionObserver.instances[0];
    expect(io.observed.has(a)).toBe(true);
    expect(io.observed.has(b)).toBe(true);
  });

  it('adds .revealed on intersection and unobserves the element', () => {
    const [a, b] = addRevealElements(2);
    initReveals();
    const io = MockIntersectionObserver.instances[0];

    // `a` intersects, `b` does not.
    io.trigger([
      { target: a, isIntersecting: true },
      { target: b, isIntersecting: false },
    ]);

    expect(a.classList.contains(REVEALED_CLASS)).toBe(true);
    expect(b.classList.contains(REVEALED_CLASS)).toBe(false);
    // Revealed element is unobserved; the non-intersecting one keeps watching.
    expect(io.unobserved).toContain(a);
    expect(io.observed.has(a)).toBe(false);
    expect(io.observed.has(b)).toBe(true);
  });

  it('skips animation under prefers-reduced-motion: reveals immediately, no observer', () => {
    setReducedMotion(true);
    const [a, b] = addRevealElements(2);

    initReveals();

    // No observer is created…
    expect(MockIntersectionObserver.instances).toHaveLength(0);
    // …but every element is revealed straight away.
    expect(a.classList.contains(REVEALED_CLASS)).toBe(true);
    expect(b.classList.contains(REVEALED_CLASS)).toBe(true);
  });

  it('falls back to immediate reveal when IntersectionObserver is unsupported', () => {
    // Remove IO support entirely (older browsers / SSR-ish jsdom default).
    vi.stubGlobal('IntersectionObserver', undefined);
    const [a] = addRevealElements(1);

    initReveals();

    expect(a.classList.contains(REVEALED_CLASS)).toBe(true);
  });

  it('is a no-op when there are no .reveal elements', () => {
    initReveals();
    expect(MockIntersectionObserver.instances).toHaveLength(0);
  });

  it('does not re-observe already-revealed elements (View Transitions re-run)', () => {
    const [a, b] = addRevealElements(2);
    a.classList.add(REVEALED_CLASS); // simulate a prior reveal

    initReveals();

    const io = MockIntersectionObserver.instances[0];
    expect(io.observed.has(a)).toBe(false);
    expect(io.observed.has(b)).toBe(true);
  });

  it('honors a custom threshold option', () => {
    addRevealElements(1);
    initReveals({ threshold: 0.5 });
    expect(MockIntersectionObserver.instances[0].options?.threshold).toBe(0.5);
  });

  it('exposes initReveal as an alias of initReveals', () => {
    expect(initReveal).toBe(initReveals);
  });
});
