// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import WorksheetPracticePlayer from './WorksheetPracticePlayer';
import type { ImageRef, WorksheetBlock } from '@/lib/activities/blocks';

/**
 * jsdom has NO real `PointerEvent` constructor, so `fireEvent.pointerDown/Move/Up`
 * silently drop `clientX`/`clientY`/`button` — same guard/precedent as
 * `WorksheetZoneEditor.test.tsx`'s own `firePointer` helper. Dispatching a
 * hand-built native event with those fields assigned directly is the
 * accurate way to drive a drag in jsdom.
 */
function firePointer(
  el: Element,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  clientX: number,
  clientY: number,
  extra: Record<string, unknown> = {},
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { clientX, clientY, pointerId: 1, button: 0, ...extra });
  act(() => {
    el.dispatchEvent(event);
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const BLOCK: WorksheetBlock & { image: ImageRef } = {
  id: 'b1',
  type: 'worksheet',
  rotation: 0,
  image: { path: 'activity-images/act-1/img-1.webp', width: 800, height: 400 },
  zones: [{ id: 'z1', x: 0.1, y: 0.2, w: 0.3, h: 0.1, kind: 'text', answers: ['sat'] }],
};

/** A 1000x500 viewport for every rect this suite reads — fit at that size is exactly 1.25x (both axes). */
function mockViewportRect() {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 1000,
    height: 500,
    top: 0,
    left: 0,
    right: 1000,
    bottom: 500,
    x: 0,
    y: 0,
    toJSON: () => {},
  });
}

function content(): HTMLElement {
  return screen.getByTestId('practice-camera-content');
}

function scaleOf(el: HTMLElement): number {
  const match = el.style.transform.match(/scale\(([\d.]+)\)/);
  return match ? Number(match[1]) : NaN;
}

function renderPlayer(overrides: Partial<Parameters<typeof WorksheetPracticePlayer>[0]> = {}) {
  const toolbarSlot = document.createElement('div');
  document.body.appendChild(toolbarSlot);
  const utils = render(
    <WorksheetPracticePlayer
      lang="es"
      block={BLOCK}
      imageUrl="/img.webp"
      practice={{ values: {}, onChange: () => {} }}
      toolbarSlot={toolbarSlot}
      {...overrides}
    />,
  );
  return { ...utils, toolbarSlot };
}

describe('WorksheetPracticePlayer', () => {
  it('renders the underlying WorksheetPlayer in practice mode (no "not graded" notice)', () => {
    mockViewportRect();
    renderPlayer();
    expect(screen.getByTestId('worksheet-player').textContent).not.toContain('no corrige');
  });

  it('forwards value changes to the caller through practice.onChange', () => {
    mockViewportRect();
    const onChange = vi.fn();
    renderPlayer({ practice: { values: {}, onChange } });
    const input = screen.getByTestId('player-zone-z1').querySelector('input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'sat' } });
    expect(onChange).toHaveBeenCalledWith('z1', 'sat');
  });

  it('shows grading feedback once practice.results is provided', () => {
    mockViewportRect();
    renderPlayer({ practice: { values: { z1: 'sat' }, onChange: () => {}, results: { z1: true } } });
    expect(screen.getByTestId('player-zone-result-z1').textContent).toBe('Correcto');
  });
});

describe('WorksheetPracticePlayer — camera (practice player redesign)', () => {
  it('starts FIT-scaled to the viewport on mount', () => {
    mockViewportRect();
    renderPlayer();
    // fitZoom(1000x500, 800x400) = min(1000/800, 500/400) = 1.25.
    expect(scaleOf(content())).toBeCloseTo(1.25);
  });

  it('renders no zoom toolbar when no toolbarSlot is given yet', () => {
    mockViewportRect();
    renderPlayer({ toolbarSlot: null });
    expect(screen.queryByTestId('practice-zoom-in')).toBeNull();
  });

  it('portals its zoom controls into the given toolbarSlot', () => {
    mockViewportRect();
    const { toolbarSlot } = renderPlayer();
    expect(toolbarSlot.querySelector('[data-testid="practice-zoom-in"]')).toBeTruthy();
  });

  it('zooms in by one step on click', () => {
    mockViewportRect();
    renderPlayer();
    fireEvent.click(screen.getByTestId('practice-zoom-in'));
    expect(scaleOf(content())).toBeCloseTo(1.5);
  });

  it('zooms out by one step on click', () => {
    mockViewportRect();
    renderPlayer();
    fireEvent.click(screen.getByTestId('practice-zoom-out'));
    expect(scaleOf(content())).toBeCloseTo(1.0);
  });

  it('resets to fit via the Ajustar button after zooming', () => {
    mockViewportRect();
    renderPlayer();
    fireEvent.click(screen.getByTestId('practice-zoom-in'));
    fireEvent.click(screen.getByTestId('practice-zoom-in'));
    fireEvent.click(screen.getByTestId('practice-zoom-fit'));
    expect(scaleOf(content())).toBeCloseTo(1.25);
  });

  it('never zooms below the shared camera floor (10%)', () => {
    mockViewportRect();
    renderPlayer();
    for (let i = 0; i < 20; i += 1) fireEvent.click(screen.getByTestId('practice-zoom-out'));
    expect(scaleOf(content())).toBeCloseTo(0.1);
  });

  it('never zooms above the shared camera ceiling (400%)', () => {
    mockViewportRect();
    renderPlayer();
    for (let i = 0; i < 30; i += 1) fireEvent.click(screen.getByTestId('practice-zoom-in'));
    expect(scaleOf(content())).toBeCloseTo(4);
  });

  it('zooms via a plain wheel over the canvas, anchored at the pointer', () => {
    mockViewportRect();
    renderPlayer();
    const viewport = screen.getByTestId('practice-camera-viewport');
    const before = scaleOf(content());
    const event = new Event('wheel', { bubbles: true, cancelable: true }) as WheelEvent;
    Object.assign(event, { deltaY: -100, clientX: 500, clientY: 250 });
    act(() => {
      viewport.dispatchEvent(event);
    });
    expect(scaleOf(content())).toBeGreaterThan(before);
  });

  it('prevents the default wheel action (the page must not also scroll)', () => {
    mockViewportRect();
    renderPlayer();
    const viewport = screen.getByTestId('practice-camera-viewport');
    const event = new Event('wheel', { bubbles: true, cancelable: true }) as WheelEvent;
    Object.assign(event, { deltaY: -100, clientX: 500, clientY: 250 });
    act(() => {
      viewport.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
  });
});

describe('WorksheetPracticePlayer — pan (Mano tool / Space / middle-drag)', () => {
  it('does not pan a plain left-drag while the Mano tool is off', () => {
    mockViewportRect();
    renderPlayer();
    fireEvent.click(screen.getByTestId('practice-zoom-in')); // zoom past fit so there is room to pan
    const viewport = screen.getByTestId('practice-camera-viewport');
    const before = content().style.transform;
    firePointer(viewport, 'pointerdown', 500, 250, { button: 0 });
    firePointer(viewport, 'pointermove', 400, 200, { button: 0 });
    firePointer(viewport, 'pointerup', 400, 200, { button: 0 });
    expect(content().style.transform).toBe(before);
  });

  it('pans on left-drag once the Mano tool is active', () => {
    mockViewportRect();
    renderPlayer();
    fireEvent.click(screen.getByTestId('practice-zoom-in'));
    fireEvent.click(screen.getByTestId('practice-tool-hand'));
    expect(screen.getByTestId('practice-tool-hand').getAttribute('aria-pressed')).toBe('true');
    const viewport = screen.getByTestId('practice-camera-viewport');
    const before = content().style.transform;
    firePointer(viewport, 'pointerdown', 500, 250, { button: 0 });
    firePointer(viewport, 'pointermove', 400, 200, { button: 0 });
    firePointer(viewport, 'pointerup', 400, 200, { button: 0 });
    expect(content().style.transform).not.toBe(before);
  });

  it('pans on a middle-button drag regardless of tool', () => {
    mockViewportRect();
    renderPlayer();
    fireEvent.click(screen.getByTestId('practice-zoom-in'));
    const viewport = screen.getByTestId('practice-camera-viewport');
    const before = content().style.transform;
    firePointer(viewport, 'pointerdown', 500, 250, { button: 1 });
    firePointer(viewport, 'pointermove', 420, 260, { button: 1 });
    firePointer(viewport, 'pointerup', 420, 260, { button: 1 });
    expect(content().style.transform).not.toBe(before);
  });

  it('pans on left-drag while Space is held, even with the Mano tool off', () => {
    mockViewportRect();
    renderPlayer();
    fireEvent.click(screen.getByTestId('practice-zoom-in'));
    const viewport = screen.getByTestId('practice-camera-viewport');
    fireEvent.keyDown(viewport, { key: ' ' });
    const before = content().style.transform;
    firePointer(viewport, 'pointerdown', 500, 250, { button: 0 });
    firePointer(viewport, 'pointermove', 460, 240, { button: 0 });
    firePointer(viewport, 'pointerup', 460, 240, { button: 0 });
    expect(content().style.transform).not.toBe(before);
  });

  it('releases Space on keyup, even if it landed on the window', () => {
    mockViewportRect();
    renderPlayer();
    fireEvent.click(screen.getByTestId('practice-zoom-in'));
    const viewport = screen.getByTestId('practice-camera-viewport');
    fireEvent.keyDown(viewport, { key: ' ' });
    fireEvent.keyUp(window, { key: ' ' });
    const before = content().style.transform;
    firePointer(viewport, 'pointerdown', 500, 250, { button: 0 });
    firePointer(viewport, 'pointermove', 400, 200, { button: 0 });
    firePointer(viewport, 'pointerup', 400, 200, { button: 0 });
    expect(content().style.transform).toBe(before);
  });
});

describe('WorksheetPracticePlayer — hand tool click-to-write on an answer blank', () => {
  it('turns the Mano tool off and focuses the blank on a plain click while the tool is on', () => {
    mockViewportRect();
    renderPlayer();
    fireEvent.click(screen.getByTestId('practice-tool-hand'));
    const input = screen.getByTestId('player-zone-z1').querySelector('input') as HTMLInputElement;

    firePointer(input, 'pointerdown', 500, 250, { button: 0 });
    firePointer(input, 'pointerup', 500, 250, { button: 0 });

    expect(screen.getByTestId('practice-tool-hand').getAttribute('aria-pressed')).toBe('false');
    expect(document.activeElement).toBe(input);
  });

  it('keeps the Mano tool on and leaves the blank unfocused once the press drags past the click threshold', () => {
    mockViewportRect();
    renderPlayer();
    fireEvent.click(screen.getByTestId('practice-tool-hand'));
    const input = screen.getByTestId('player-zone-z1').querySelector('input') as HTMLInputElement;
    const before = content().style.transform;

    firePointer(input, 'pointerdown', 500, 250, { button: 0 });
    firePointer(input, 'pointermove', 400, 200, { button: 0 });
    firePointer(input, 'pointerup', 400, 200, { button: 0 });

    expect(screen.getByTestId('practice-tool-hand').getAttribute('aria-pressed')).toBe('true');
    expect(document.activeElement).not.toBe(input);
    expect(content().style.transform).not.toBe(before);
  });

  it('does not switch tools on a Space-held click (temporary pan only, same as today)', () => {
    mockViewportRect();
    renderPlayer();
    const viewport = screen.getByTestId('practice-camera-viewport');
    fireEvent.keyDown(viewport, { key: ' ' });
    const input = screen.getByTestId('player-zone-z1').querySelector('input') as HTMLInputElement;

    firePointer(input, 'pointerdown', 500, 250, { button: 0 });
    firePointer(input, 'pointerup', 500, 250, { button: 0 });

    expect(screen.getByTestId('practice-tool-hand').getAttribute('aria-pressed')).toBe('false');
    expect(document.activeElement).not.toBe(input);
  });
});

describe('WorksheetPracticePlayer — free panning (Bug 2, loose camera bound)', () => {
  it('pans away from center at FIT scale once the Mano tool is active (clampCameraLoose, not the strict/locked clampCamera)', () => {
    mockViewportRect();
    renderPlayer();
    fireEvent.click(screen.getByTestId('practice-tool-hand'));
    // At fit (1.25x, both axes landing exactly on the 1000x500 viewport),
    // the OLD strict `clampCamera` forces x/y back to 0 (centered, locked)
    // regardless of how far the drag moved — this must no longer hold.
    const before = content().style.transform;
    const viewport = screen.getByTestId('practice-camera-viewport');
    firePointer(viewport, 'pointerdown', 500, 250, { button: 0 });
    firePointer(viewport, 'pointermove', 450, 250, { button: 0 });
    firePointer(viewport, 'pointerup', 450, 250, { button: 0 });
    expect(content().style.transform).not.toBe(before);
  });

  it('still re-centers via the Ajustar/Fit button after panning away at fit scale', () => {
    mockViewportRect();
    renderPlayer();
    fireEvent.click(screen.getByTestId('practice-tool-hand'));
    const viewport = screen.getByTestId('practice-camera-viewport');
    firePointer(viewport, 'pointerdown', 500, 250, { button: 0 });
    firePointer(viewport, 'pointermove', 450, 250, { button: 0 });
    firePointer(viewport, 'pointerup', 450, 250, { button: 0 });
    fireEvent.click(screen.getByTestId('practice-zoom-fit'));
    expect(content().style.transform).toBe('translate(0px, 0px) scale(1.25)');
  });
});

describe('WorksheetPracticePlayer — no layout flash on the server render (mobile layout pass, priority fix)', () => {
  it('renders BOTH the desktop camera and the mobile pinch viewport on the server, gated by CSS `lg:` classes only', () => {
    window.matchMedia = undefined as unknown as typeof window.matchMedia;
    const html = renderToStaticMarkup(
      <WorksheetPracticePlayer lang="es" block={BLOCK} imageUrl="/img.webp" practice={{ values: {}, onChange: () => {} }} />,
    );
    expect(html).toContain('class="hidden lg:contents"');
    expect(html).toContain('practice-camera-viewport');
    expect(html).toMatch(/class="contents lg:hidden" inert(="")?[^>]*>/);
    expect(html).toContain('practice-mobile-viewport');
  });

  it('does not mark the desktop camera `inert` on the server', () => {
    window.matchMedia = undefined as unknown as typeof window.matchMedia;
    const html = renderToStaticMarkup(
      <WorksheetPracticePlayer lang="es" block={BLOCK} imageUrl="/img.webp" practice={{ values: {}, onChange: () => {} }} />,
    );
    expect(html).not.toMatch(/class="hidden lg:contents" inert/);
  });

  it('never renders a zoom toolbar on the server (no toolbarSlot to portal into yet)', () => {
    window.matchMedia = undefined as unknown as typeof window.matchMedia;
    const html = renderToStaticMarkup(
      <WorksheetPracticePlayer lang="es" block={BLOCK} imageUrl="/img.webp" practice={{ values: {}, onChange: () => {} }} />,
    );
    expect(html).not.toContain('practice-zoom-in');
  });
});
