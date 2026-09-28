// @vitest-environment jsdom
/**
 * carousel.tsx — CarouselPrevious/CarouselNext arrow-dodge regression guard.
 *
 * THE BUG: clicking an arrow visibly moved it down while the scroll ran.
 * ROOT CAUSE: `buttonVariants`' base classes give every button
 * `active:not-aria-[haspopup]:translate-y-px` for a tactile "press"
 * affordance. `CarouselPrevious`/`CarouselNext` are vertically centered with
 * `inset-y-0 …  my-auto` (no transform), so on THESE controls the press
 * utility only added a spurious 1px nudge on top of otherwise-correct
 * centering — small, but still a real, unwanted "dodge" on an arrow that
 * should read as a stable navigation control, not a pressable button.
 *
 * Embla needs layout/measurement APIs jsdom lacks; stub the minimum so the
 * carousel mounts (same setup as HeroCarouselIsland.test.tsx).
 */
import { beforeAll, afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
} from './carousel';

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  globalThis.IntersectionObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  } as unknown as typeof IntersectionObserver;
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

afterEach(cleanup);

function renderCarousel() {
  render(
    <Carousel>
      <CarouselContent>
        <CarouselItem>one</CarouselItem>
        <CarouselItem>two</CarouselItem>
      </CarouselContent>
      <CarouselPrevious />
      <CarouselNext />
    </Carousel>,
  );
}

describe('CarouselPrevious / CarouselNext — no dodge on press', () => {
  it('carries no active-press translate utility (press="none")', () => {
    renderCarousel();
    const prev = screen.getByRole('button', { name: /previous slide/i });
    const next = screen.getByRole('button', { name: /next slide/i });
    expect(prev.className).not.toMatch(/translate-y-px/);
    expect(next.className).not.toMatch(/translate-y-px/);
  });

  it('centers vertically with inset-y-0/my-auto, never with a transform', () => {
    renderCarousel();
    const prev = screen.getByRole('button', { name: /previous slide/i });
    const next = screen.getByRole('button', { name: /next slide/i });
    for (const btn of [prev, next]) {
      expect(btn.className).toContain('inset-y-0');
      expect(btn.className).toContain('my-auto');
      expect(btn.className).not.toMatch(/-?translate-y-1\/2/);
    }
  });
});
