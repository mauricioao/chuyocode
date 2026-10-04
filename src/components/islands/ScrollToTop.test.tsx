// @vitest-environment jsdom
import { act, createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { UI_LABELS } from '@/lib/i18n';
import ScrollToTop from './ScrollToTop';

// `ScrollToTop` now takes its copy as a `labels` prop (see that component's
// own props doc) instead of resolving it itself from the full dictionary —
// the same slice `BaseLayout.astro` computes server-side.
const esLabels = { scrollToTop: UI_LABELS.es.common.scrollToTop };
const enLabels = { scrollToTop: UI_LABELS.en.common.scrollToTop };

/** Stubs the footer's `getBoundingClientRect()` so `measure()` computes a
 * deterministic `visibleFooterHeight` from it (jsdom's default rect is all
 * zeros, which would always read as "fully visible"). */
function setFooterTop(footer: Element, top: number) {
  vi.spyOn(footer, 'getBoundingClientRect').mockReturnValue({
    top,
    left: 0,
    right: 0,
    bottom: top,
    width: 0,
    height: 0,
    x: 0,
    y: top,
    toJSON() {
      return this;
    },
  } as DOMRect);
}

function setReducedMotion(reduce: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('reduce') ? reduce : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
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

/** No `@testing-library/jest-dom` matchers configured in this repo (no
 * global setup file) — read `aria-hidden` off the DOM node directly, same
 * convention `UserMenu.test.tsx` uses for every attribute assertion. */
function isHidden(el: HTMLElement): boolean {
  return el.getAttribute('aria-hidden') === 'true';
}

beforeEach(() => {
  Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
  Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
  setReducedMotion(false);
  // A footer must exist in the document for global mode's bottom-offset
  // tracking; parked well below the viewport (not encroaching) by default.
  const footer = document.createElement('footer');
  document.body.appendChild(footer);
  setFooterTop(footer, 2000);
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ScrollToTop — global mode (window scroll)', () => {
  it('is hidden before scrolling past one viewport', () => {
    render(<ScrollToTop labels={esLabels} />);
    expect(isHidden(screen.getByTestId('scroll-to-top'))).toBe(true);
  });

  it('becomes visible after scrolling past one viewport', () => {
    render(<ScrollToTop labels={esLabels} />);
    fireWindowScroll(900);
    expect(isHidden(screen.getByTestId('scroll-to-top'))).toBe(false);
  });

  it('hides again once scrolled back near the top', () => {
    render(<ScrollToTop labels={esLabels} />);
    fireWindowScroll(900);
    fireWindowScroll(100);
    expect(isHidden(screen.getByTestId('scroll-to-top'))).toBe(true);
  });

  it('stays visible (never hides) once the footer enters the viewport', () => {
    render(<ScrollToTop labels={esLabels} />);
    fireWindowScroll(900);
    expect(isHidden(screen.getByTestId('scroll-to-top'))).toBe(false);

    const footer = document.querySelector('footer')!;
    setFooterTop(footer, 700); // 100px of the footer now visible
    fireWindowScroll(901); // re-run measure()

    expect(isHidden(screen.getByTestId('scroll-to-top'))).toBe(false);
  });

  it('sits at its base offset while the footer has not entered the viewport', () => {
    render(<ScrollToTop labels={esLabels} />);
    fireWindowScroll(900);
    expect(screen.getByTestId('scroll-to-top').style.bottom).toBe('24px');
  });

  it('rides up above the footer, in sync with how much of it is visible', () => {
    render(<ScrollToTop labels={esLabels} />);
    const footer = document.querySelector('footer')!;

    setFooterTop(footer, 700); // 100px visible -> max(24, 100+16) = 116
    fireWindowScroll(900);
    expect(screen.getByTestId('scroll-to-top').style.bottom).toBe('116px');

    setFooterTop(footer, 500); // 300px visible -> max(24, 300+16) = 316
    fireWindowScroll(901);
    expect(screen.getByTestId('scroll-to-top').style.bottom).toBe('316px');
  });

  it('settles back to the base offset once the footer leaves the viewport again', () => {
    render(<ScrollToTop labels={esLabels} />);
    const footer = document.querySelector('footer')!;

    setFooterTop(footer, 700);
    fireWindowScroll(900);
    expect(screen.getByTestId('scroll-to-top').style.bottom).toBe('116px');

    setFooterTop(footer, 2000);
    fireWindowScroll(901);
    expect(screen.getByTestId('scroll-to-top').style.bottom).toBe('24px');
  });

  it('has the localized accessible label, in Spanish and English', () => {
    const { unmount } = render(<ScrollToTop labels={esLabels} />);
    expect(screen.getByTestId('scroll-to-top').getAttribute('aria-label')).toBe('Volver arriba');
    unmount();
    render(<ScrollToTop labels={enLabels} />);
    expect(screen.getByTestId('scroll-to-top').getAttribute('aria-label')).toBe('Back to top');
  });

  it('scrolls the window to top, smoothly, on click', () => {
    render(<ScrollToTop labels={esLabels} />);
    fireWindowScroll(900);
    const scrollToSpy = vi.fn();
    window.scrollTo = scrollToSpy;

    fireEvent.click(screen.getByTestId('scroll-to-top'));

    expect(scrollToSpy).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });

  it('scrolls instantly (no smooth behavior) when the visitor prefers reduced motion', () => {
    render(<ScrollToTop labels={esLabels} />);
    fireWindowScroll(900);
    setReducedMotion(true);
    const scrollToSpy = vi.fn();
    window.scrollTo = scrollToSpy;

    fireEvent.click(screen.getByTestId('scroll-to-top'));

    expect(scrollToSpy).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });
  });
});

describe('ScrollToTop — circular scroll progress ring (global mode)', () => {
  it('starts at the full circumference (empty ring) before scrolling', () => {
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      value: 2400,
      configurable: true,
    });
    render(<ScrollToTop labels={esLabels} />);
    const ring = screen.getByTestId('scroll-progress-ring');
    const circumference = 2 * Math.PI * 18;
    expect(Number(ring.getAttribute('stroke-dashoffset'))).toBeCloseTo(circumference);
  });

  it('fills in (lower stroke-dashoffset) as the page scrolls further down', () => {
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      value: 2400,
      configurable: true,
    });
    render(<ScrollToTop labels={esLabels} />);
    const ring = screen.getByTestId('scroll-progress-ring');
    fireWindowScroll(1600); // (2400 - 800) = 1600 max scroll -> 100%
    expect(Number(ring.getAttribute('stroke-dashoffset'))).toBeCloseTo(0);
  });
});

describe('ScrollToTop — scoped mode (container scroll)', () => {
  function makeScrollableDiv(): HTMLDivElement {
    const el = document.createElement('div');
    Object.defineProperty(el, 'clientHeight', { value: 400, configurable: true });
    Object.defineProperty(el, 'scrollHeight', { value: 1200, configurable: true });
    Object.defineProperty(el, 'scrollTop', { value: 0, writable: true, configurable: true });
    document.body.appendChild(el);
    return el;
  }

  it('tracks the target container scroll, not the window', () => {
    const el = makeScrollableDiv();
    const ref = createRef<HTMLDivElement>();
    (ref as { current: HTMLDivElement }).current = el;

    render(<ScrollToTop labels={esLabels} targetRef={ref} />);
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

    render(<ScrollToTop labels={esLabels} targetRef={ref} />);
    fireContainerScroll(el, 500);

    // Scoped mode never computes a footer-based offset — it keeps its
    // static `bottom-4` Tailwind class instead of an inline style.
    expect(screen.getByTestId('scroll-to-top-scoped').style.bottom).toBe('');
    expect(isHidden(screen.getByTestId('scroll-to-top-scoped'))).toBe(false);
  });

  it('scrolls the CONTAINER to top on click, not the window', () => {
    const el = makeScrollableDiv();
    const containerScrollTo = vi.fn();
    el.scrollTo = containerScrollTo;
    const ref = createRef<HTMLDivElement>();
    (ref as { current: HTMLDivElement }).current = el;

    render(<ScrollToTop labels={esLabels} targetRef={ref} />);
    const windowScrollTo = vi.fn();
    window.scrollTo = windowScrollTo;

    fireEvent.click(screen.getByTestId('scroll-to-top-scoped'));

    expect(containerScrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
    expect(windowScrollTo).not.toHaveBeenCalled();
  });

  it('tracks scroll progress against the CONTAINER, not the window/document', () => {
    const el = makeScrollableDiv(); // clientHeight 400, scrollHeight 1200 -> 800 max scroll
    const ref = createRef<HTMLDivElement>();
    (ref as { current: HTMLDivElement }).current = el;

    render(<ScrollToTop labels={esLabels} targetRef={ref} />);
    fireContainerScroll(el, 400); // 400/800 = 50%

    const ring = screen.getByTestId('scroll-progress-ring-scoped');
    const circumference = 2 * Math.PI * 18;
    expect(Number(ring.getAttribute('stroke-dashoffset'))).toBeCloseTo(circumference / 2);
  });
});
