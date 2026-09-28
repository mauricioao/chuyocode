// @vitest-environment jsdom
import { act, createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import ScrollToTop from './ScrollToTop';

// ---------------------------------------------------------------------------
// IntersectionObserver mock — same shape as `reveal.test.ts`'s: jsdom ships
// none, so a controllable stub lets a test fire the footer intersection
// synchronously via `trigger()`.
// ---------------------------------------------------------------------------
type IOEntryInit = { target: Element; isIntersecting: boolean };

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];
  readonly observed = new Set<Element>();
  disconnected = false;

  constructor(private readonly callback: IntersectionObserverCallback) {
    MockIntersectionObserver.instances.push(this);
  }

  observe(el: Element): void {
    this.observed.add(el);
  }
  unobserve(el: Element): void {
    this.observed.delete(el);
  }
  disconnect(): void {
    this.disconnected = true;
    this.observed.clear();
  }
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

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

function setReducedMotion(reduce: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('reduce') ? reduce : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

/** `act()`-wrapped: a raw `dispatchEvent` on a native listener (not React's
 * synthetic event system) schedules its `setState` without React 18's
 * automatic batching flushing it before the next line runs. */
function fireWindowScroll(scrollY: number) {
  Object.defineProperty(window, 'scrollY', { value: scrollY, configurable: true });
  act(() => {
    window.dispatchEvent(new Event('scroll'));
  });
}

function fireContainerScroll(el: HTMLElement, scrollTop: number) {
  Object.defineProperty(el, 'scrollTop', { value: scrollTop, configurable: true });
  act(() => {
    el.dispatchEvent(new Event('scroll'));
  });
}

function triggerIntersection(
  observer: MockIntersectionObserver,
  entries: { target: Element; isIntersecting: boolean }[],
) {
  act(() => {
    observer.trigger(entries);
  });
}

/** No `@testing-library/jest-dom` matchers configured in this repo (no
 * global setup file) — read `aria-hidden` off the DOM node directly, same
 * convention `UserMenu.test.tsx` uses for every attribute assertion. */
function isHidden(el: HTMLElement): boolean {
  return el.getAttribute('aria-hidden') === 'true';
}

beforeEach(() => {
  MockIntersectionObserver.instances = [];
  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
  Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
  Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
  setReducedMotion(false);
  // A footer must exist in the document for the global mode's observer.
  const footer = document.createElement('footer');
  document.body.appendChild(footer);
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ScrollToTop — global mode (window scroll)', () => {
  it('is hidden before scrolling past one viewport', () => {
    render(<ScrollToTop lang="es" />);
    expect(isHidden(screen.getByTestId('scroll-to-top'))).toBe(true);
  });

  it('becomes visible after scrolling past one viewport', () => {
    render(<ScrollToTop lang="es" />);
    fireWindowScroll(900);
    expect(isHidden(screen.getByTestId('scroll-to-top'))).toBe(false);
  });

  it('hides again once scrolled back near the top', () => {
    render(<ScrollToTop lang="es" />);
    fireWindowScroll(900);
    fireWindowScroll(100);
    expect(isHidden(screen.getByTestId('scroll-to-top'))).toBe(true);
  });

  it('hides once the footer enters the viewport, even past the scroll threshold', () => {
    render(<ScrollToTop lang="es" />);
    fireWindowScroll(900);
    expect(isHidden(screen.getByTestId('scroll-to-top'))).toBe(false);

    const footer = document.querySelector('footer')!;
    triggerIntersection(MockIntersectionObserver.instances[0], [
      { target: footer, isIntersecting: true },
    ]);
    expect(isHidden(screen.getByTestId('scroll-to-top'))).toBe(true);
  });

  it('reappears once the footer leaves the viewport again', () => {
    render(<ScrollToTop lang="es" />);
    fireWindowScroll(900);
    const footer = document.querySelector('footer')!;
    triggerIntersection(MockIntersectionObserver.instances[0], [
      { target: footer, isIntersecting: true },
    ]);
    triggerIntersection(MockIntersectionObserver.instances[0], [
      { target: footer, isIntersecting: false },
    ]);
    expect(isHidden(screen.getByTestId('scroll-to-top'))).toBe(false);
  });

  it('has the localized accessible label, in Spanish and English', () => {
    const { unmount } = render(<ScrollToTop lang="es" />);
    expect(screen.getByTestId('scroll-to-top').getAttribute('aria-label')).toBe('Volver arriba');
    unmount();
    render(<ScrollToTop lang="en" />);
    expect(screen.getByTestId('scroll-to-top').getAttribute('aria-label')).toBe('Back to top');
  });

  it('scrolls the window to top, smoothly, on click', () => {
    render(<ScrollToTop lang="es" />);
    fireWindowScroll(900);
    const scrollToSpy = vi.fn();
    window.scrollTo = scrollToSpy;

    fireEvent.click(screen.getByTestId('scroll-to-top'));

    expect(scrollToSpy).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });

  it('scrolls instantly (no smooth behavior) when the visitor prefers reduced motion', () => {
    render(<ScrollToTop lang="es" />);
    fireWindowScroll(900);
    setReducedMotion(true);
    const scrollToSpy = vi.fn();
    window.scrollTo = scrollToSpy;

    fireEvent.click(screen.getByTestId('scroll-to-top'));

    expect(scrollToSpy).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });
  });
});

describe('ScrollToTop — scoped mode (container scroll)', () => {
  function makeScrollableDiv(): HTMLDivElement {
    const el = document.createElement('div');
    Object.defineProperty(el, 'clientHeight', { value: 400, configurable: true });
    Object.defineProperty(el, 'scrollTop', { value: 0, writable: true, configurable: true });
    document.body.appendChild(el);
    return el;
  }

  it('tracks the target container scroll, not the window', () => {
    const el = makeScrollableDiv();
    const ref = createRef<HTMLDivElement>();
    (ref as { current: HTMLDivElement }).current = el;

    render(<ScrollToTop lang="es" targetRef={ref} />);
    expect(isHidden(screen.getByTestId('scroll-to-top-scoped'))).toBe(true);

    fireContainerScroll(el, 500);

    expect(isHidden(screen.getByTestId('scroll-to-top-scoped'))).toBe(false);

    // Window scrolling past the threshold must NOT affect the scoped button.
    fireWindowScroll(0);
  });

  it('is never suppressed by the footer — there is no footer inside the editor card', () => {
    const el = makeScrollableDiv();
    const ref = createRef<HTMLDivElement>();
    (ref as { current: HTMLDivElement }).current = el;

    render(<ScrollToTop lang="es" targetRef={ref} />);
    fireContainerScroll(el, 500);

    expect(MockIntersectionObserver.instances).toHaveLength(0);
    expect(isHidden(screen.getByTestId('scroll-to-top-scoped'))).toBe(false);
  });

  it('scrolls the CONTAINER to top on click, not the window', () => {
    const el = makeScrollableDiv();
    const containerScrollTo = vi.fn();
    el.scrollTo = containerScrollTo;
    const ref = createRef<HTMLDivElement>();
    (ref as { current: HTMLDivElement }).current = el;

    render(<ScrollToTop lang="es" targetRef={ref} />);
    const windowScrollTo = vi.fn();
    window.scrollTo = windowScrollTo;

    fireEvent.click(screen.getByTestId('scroll-to-top-scoped'));

    expect(containerScrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
    expect(windowScrollTo).not.toHaveBeenCalled();
  });
});
