// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { DndContext, useDraggable } from '@dnd-kit/core';
import type { Active, ClientRect, CollisionDetection, DroppableContainer } from '@dnd-kit/core';
import {
  DRAG_LAYER_CLASS,
  dragCursorClassName,
  gameCollisionDetection,
  gameDropAnimation,
  gameTileTransitionClassName,
  GameDragOverlay,
  GameSoundToggle,
  liftedTileClassName,
  useDragSourceMetrics,
  useGameDndSensors,
  useGrabCursor,
} from './gameFeel';

afterEach(cleanup);

describe('liftedTileClassName', () => {
  it('lifts, tilts and deepens the shadow normally', () => {
    const className = liftedTileClassName(false);
    expect(className).toContain('scale-105');
    expect(className).toContain('-rotate-2');
    expect(className).toContain('shadow-[var(--shadow-chip-raised)');
    expect(className).toContain('will-change-transform');
  });

  it('applies no scaling/tilt/shadow under reduced motion', () => {
    expect(liftedTileClassName(true)).toBe('');
  });
});

describe('gameTileTransitionClassName', () => {
  it('transitions opacity (the dragged tile\'s own fade to its "ghost" state) and shadow', () => {
    const className = gameTileTransitionClassName(false);
    expect(className).toContain('transition');
    expect(className).toContain('opacity');
  });

  it('is empty under reduced motion', () => {
    expect(gameTileTransitionClassName(true)).toBe('');
  });
});

describe('gameDropAnimation', () => {
  it('eases over ~200ms with a smooth ease-out, normally', () => {
    const config = gameDropAnimation(false);
    expect(config).not.toBeNull();
    expect(config?.duration).toBe(200);
    expect(config?.easing).toBe('cubic-bezier(0.2, 0.9, 0.3, 1)');
  });

  it('is null (instant) under reduced motion', () => {
    expect(gameDropAnimation(true)).toBeNull();
  });
});

describe('dragCursorClassName', () => {
  it('shows an open hand on an idle draggable tile', () => {
    expect(dragCursorClassName(true, false)).toBe('cursor-grab');
  });

  it('shows a closed hand for the one tile currently being dragged', () => {
    expect(dragCursorClassName(true, true)).toBe('cursor-grabbing');
  });

  it('shows no grab affordance for a tile that cannot be dragged (tap-only, e.g. a placed word in QuizReorder)', () => {
    expect(dragCursorClassName(false, false)).toBe('');
    expect(dragCursorClassName(false, true)).toBe('');
  });
});

describe('useGrabCursor', () => {
  afterEach(() => {
    document.body.style.cursor = '';
  });

  it('forces the whole document cursor to grabbing while dragging, and restores it once the drag ends', () => {
    const { rerender } = renderHook(({ dragging }: { dragging: boolean }) => useGrabCursor(dragging), {
      initialProps: { dragging: false },
    });
    expect(document.body.style.cursor).toBe('');

    rerender({ dragging: true });
    expect(document.body.style.cursor).toBe('grabbing');

    rerender({ dragging: false });
    expect(document.body.style.cursor).toBe('');
  });
});

/** A plain, non-rotated `ClientRect` — same shape `getBoundingClientRect()` gives dnd-kit. */
function rect(left: number, top: number, width: number, height: number): ClientRect {
  return { left, top, width, height, right: left + width, bottom: top + height };
}

/** A minimal but fully-typed fake droppable — `pointerWithin`/`rectIntersection` only ever read `id` and the matching `droppableRects` entry, never `data`/`node`/`disabled`. */
function fakeDroppable(id: string, box: ClientRect): DroppableContainer {
  return {
    id,
    key: id,
    disabled: false,
    data: { current: undefined },
    node: { current: null },
    rect: { current: box },
  };
}

const fakeActive: Active = {
  id: 'tile-1',
  data: { current: undefined },
  rect: { current: { initial: null, translated: null } },
};

/**
 * One droppable ("slot") at `slotBox`, wired into a full `CollisionDetection`
 * args object. `collisionRect` only matters for the no-pointer (keyboard)
 * path — `rectIntersection` compares IT against `slotBox`; `pointerWithin`
 * ignores it entirely.
 */
function collisionArgs(
  slotBox: ClientRect,
  pointerCoordinates: { x: number; y: number } | null,
  collisionRect: ClientRect = rect(0, 0, 1, 1),
): Parameters<CollisionDetection>[0] {
  return {
    active: fakeActive,
    collisionRect,
    droppableRects: new Map([['slot', slotBox]]),
    droppableContainers: [fakeDroppable('slot', slotBox)],
    pointerCoordinates,
  };
}

describe('gameCollisionDetection', () => {
  // left 100, top 100, right 150, bottom 150.
  const slot = rect(100, 100, 50, 50);

  it('returns the slot the pointer is actually inside', () => {
    const result = gameCollisionDetection(collisionArgs(slot, { x: 120, y: 120 }));
    expect(result.map((collision) => collision.id)).toEqual(['slot']);
  });

  // The owner complaint this whole change exists for: "si la sueltas afuera
  // pero cerca de una casilla, de todos modos entra" — `closestCenter`
  // (the previous default) would still have picked this slot as "nearest".
  it('returns no collision when the pointer is released outside every slot, even just past its edge', () => {
    const result = gameCollisionDetection(collisionArgs(slot, { x: 162, y: 120 })); // 12px past the right edge
    expect(result).toEqual([]);
  });

  it('falls back to rectIntersection when there is no pointer position at all (KeyboardSensor)', () => {
    const overlapping = rect(110, 110, 20, 20); // fully inside `slot`
    const result = gameCollisionDetection(collisionArgs(slot, null, overlapping));
    expect(result.map((collision) => collision.id)).toEqual(['slot']);
  });

  it('keyboard fallback still finds nothing when the collision rect does not overlap any droppable', () => {
    const farAway = rect(900, 900, 20, 20);
    const result = gameCollisionDetection(collisionArgs(slot, null, farAway));
    expect(result).toEqual([]);
  });
});

describe('GameSoundToggle', () => {
  it('shows the mute label and a speaker icon while unmuted', () => {
    render(<GameSoundToggle muted={false} onToggle={vi.fn()} labelMute="Silenciar" labelUnmute="Activar sonido" />);
    const button = screen.getByTestId('game-sound-toggle');
    expect(button.getAttribute('aria-label')).toBe('Silenciar');
    expect(button.getAttribute('aria-pressed')).toBe('false');
  });

  it('shows the unmute label while muted', () => {
    render(<GameSoundToggle muted onToggle={vi.fn()} labelMute="Silenciar" labelUnmute="Activar sonido" />);
    const button = screen.getByTestId('game-sound-toggle');
    expect(button.getAttribute('aria-label')).toBe('Activar sonido');
    expect(button.getAttribute('aria-pressed')).toBe('true');
  });

  it('calls onToggle when clicked', () => {
    const onToggle = vi.fn();
    render(<GameSoundToggle muted={false} onToggle={onToggle} labelMute="Silenciar" labelUnmute="Activar sonido" />);
    fireEvent.click(screen.getByTestId('game-sound-toggle'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});

describe('GameDragOverlay', () => {
  // `data-flip-id`: the SAME attribute every real mold's own draggable/
  // placed tile already carries (`useFlip`'s own attribute) — this is what
  // `useDragSourceMetrics` looks a drag's source tile up by, see its own
  // header in `gameFeel.tsx`.
  function DraggableTile({ id }: { id: string }) {
    const { listeners, setNodeRef } = useDraggable({ id });
    return (
      <button ref={setNodeRef} data-testid="draggable-tile" data-flip-id={id} {...listeners}>
        tile
      </button>
    );
  }

  /** `useGameDndSensors`'s own `MouseSensor` (4px activation distance) — the same sensor every real mold wires up. */
  function Harness() {
    const [activeId, setActiveId] = useState<string | null>(null);
    return (
      <DndContext
        sensors={useGameDndSensors()}
        onDragStart={(event) => setActiveId(String(event.active.id))}
        onDragEnd={() => setActiveId(null)}
      >
        <DraggableTile id="tile-1" />
        <GameDragOverlay dropAnimation={null} activeId={activeId}>
          {activeId ? <div data-testid="overlay-chip">chip</div> : null}
        </GameDragOverlay>
      </DndContext>
    );
  }

  /** Past the 4px activation distance, so dnd-kit's own `MouseSensor` fires `onDragStart`. */
  function startDrag() {
    fireEvent.mouseDown(screen.getByTestId('draggable-tile'), { clientX: 0, clientY: 0 });
    fireEvent.mouseMove(document, { clientX: 20, clientY: 20 });
  }

  afterEach(() => {
    // A test below shadows `document.fullscreenElement` with an own property; restore the prototype's own getter for every other test.
    delete (document as unknown as Record<string, unknown>).fullscreenElement;
  });

  it('portals the lifted tile to document.body, escaping its own tree', () => {
    render(
      <div data-testid="stage-wrapper">
        <Harness />
      </div>,
    );
    startDrag();
    const chip = screen.getByTestId('overlay-chip');
    expect(screen.getByTestId('stage-wrapper').contains(chip)).toBe(false);
    expect(document.body.contains(chip)).toBe(true);
  });

  // Bugfix (clipped pill / lost lift): an earlier `display: grid` + `100%` +
  // `overflow: hidden` wrapper, meant to fit the chip's own `cqw`/`cqh`-sized
  // padding/font (`chip.ts`'s `CHIP_STAGE_SIZE`) into dnd-kit's measured box,
  // clipped the pill's own right/bottom edges square and cut off
  // `liftedTileClassName`'s own scale/tilt/shadow the instant either pushed
  // the chip's painted box past that wrapper. No ancestor between the
  // overlay chip and `document.body` may clip it any more — see
  // `useDragSourceMetrics`'s own header for how size fidelity is kept
  // WITHOUT a stretch-and-clip wrapper.
  it('never clips the lifted tile — no ancestor between it and document.body hides overflow', () => {
    render(<Harness />);
    startDrag();
    let node: HTMLElement | null = screen.getByTestId('overlay-chip');
    while (node && node !== document.body) {
      expect(node.style.overflow).not.toBe('hidden');
      node = node.parentElement;
    }
  });

  it("sizes the overlay chip from the drag SOURCE tile's own computed box, never a container-relative unit", () => {
    render(<Harness />);
    const source = screen.getByTestId('draggable-tile');
    source.style.fontSize = '22px';
    source.style.borderRadius = '9999px';
    Object.defineProperty(source, 'offsetWidth', { value: 96, configurable: true });
    Object.defineProperty(source, 'offsetHeight', { value: 40, configurable: true });
    vi.spyOn(source, 'getBoundingClientRect').mockReturnValue({ width: 96 } as DOMRect);

    startDrag();

    const chip = screen.getByTestId('overlay-chip');
    expect(chip.style.fontSize).toBe('22px');
    expect(chip.style.borderRadius).toBe('9999px');
    expect(chip.style.width).toBe('96px');
    expect(chip.style.height).toBe('40px');
  });

  // The editor's own live preview (`ActivityPreviewFrame`) renders the whole
  // board at native size, then shrinks it with `transform: scale(s)` — the
  // source tile's own `offsetWidth` (layout) is then bigger than its
  // `getBoundingClientRect().width` (painted) by exactly `s`.
  it("scales an outer wrapper by the source tile's visual/layout width ratio, matching the editor's own live-preview shrink — never the chip itself", () => {
    render(<Harness />);
    const source = screen.getByTestId('draggable-tile');
    Object.defineProperty(source, 'offsetWidth', { value: 96, configurable: true });
    vi.spyOn(source, 'getBoundingClientRect').mockReturnValue({ width: 48 } as DOMRect); // a 0.5 preview shrink

    startDrag();

    const chip = screen.getByTestId('overlay-chip');
    const scaleWrapper = chip.parentElement as HTMLElement;
    expect(scaleWrapper.style.transform).toBe('scale(0.5)');
    expect(scaleWrapper.style.transformOrigin).toBe('top left');
  });

  it('omits the transform entirely at scale 1 (a no-op) outside any transform:scale ancestor — the ordinary player', () => {
    render(<Harness />);
    const source = screen.getByTestId('draggable-tile');
    Object.defineProperty(source, 'offsetWidth', { value: 96, configurable: true });
    vi.spyOn(source, 'getBoundingClientRect').mockReturnValue({ width: 96 } as DOMRect);

    startDrag();

    const scaleWrapper = screen.getByTestId('overlay-chip').parentElement as HTMLElement;
    // Was the literal string 'scale(1)' — a no-op transform that still cost
    // a compositing layer promotion for nothing. Omitted entirely now.
    expect(scaleWrapper.style.transform).toBe('');
    expect(scaleWrapper.style.transformOrigin).toBe('top left');
  });

  it('portals into the real Fullscreen API element instead of document.body when one is set', () => {
    const fullscreenHost = document.createElement('div');
    document.body.appendChild(fullscreenHost);
    Object.defineProperty(document, 'fullscreenElement', { value: fullscreenHost, configurable: true });

    render(<Harness />);
    startDrag();
    const chip = screen.getByTestId('overlay-chip');
    expect(fullscreenHost.contains(chip)).toBe(true);
    expect(document.body.contains(fullscreenHost)).toBe(true);

    fullscreenHost.remove();
  });

  // BLOCKER bugfix: `global.css`'s own `:root { scrollbar-gutter: stable
  // both-edges }` (~L727) shrinks the initial containing block this
  // portal's `fixed` `DragOverlay` resolves `top`/`left` against, landing
  // the lifted tile ~10px off the real pointer wherever that reservation
  // isn't neutralised (course-lesson pages, the dev-plantillas harness —
  // `ActivityStage` also renders in the ordinary scrollable page flow, so
  // turning the reservation off page-wide the way the desk-window/
  // presentation overrides do would bring back the layout-jump bug it
  // exists to prevent). See `GameDragOverlay`'s own "GUTTER OFFSET" header
  // for the full reasoning.
  describe('scrollbar-gutter ICB-shift compensation (BLOCKER bugfix, +10px X offset)', () => {
    it('wraps the lifted tile in its own fixed, pointer-events-none container', () => {
      render(<Harness />);
      startDrag();
      const insetContainer = screen.getByTestId('game-drag-overlay-inset');
      expect(insetContainer.className).toContain('fixed');
      expect(insetContainer.className).toContain('inset-0');
      expect(insetContainer.className).toContain('pointer-events-none');
      expect(insetContainer.contains(screen.getByTestId('overlay-chip'))).toBe(true);
    });

    // Regression guard (BLOCKER bugfix): this host used to carry NO z-index
    // at all, so it painted BELOW every positioned sibling `document.body`
    // already has with an explicit one (the real activity window chief
    // among them) — see `GameDragOverlay`'s own "LAYER" header for the full
    // story. `z-index-layer-budget.test.ts` (`src/styles/`) is the other
    // half of this guard: it fails if any OTHER value in `src/**` climbs to
    // or past this same layer without an explicit allowlist entry.
    it('carries the drag layer class, so it never again paints below a positioned sibling (the real activity window chief among them)', () => {
      render(<Harness />);
      startDrag();
      const insetContainer = screen.getByTestId('game-drag-overlay-inset');
      expect(insetContainer.className).toContain(DRAG_LAYER_CLASS);
    });

    it('cancels a measured ICB offset with an equal, opposite translateX — no magic constant', () => {
      render(<Harness />);
      startDrag();
      const insetContainer = screen.getByTestId('game-drag-overlay-inset');

      // Simulates the gutter shift: this box's OWN `getBoundingClientRect()`
      // is how `GameDragOverlay` measures it (see its own header) — no
      // stand-in for the real browser check, which stays Playwright's job
      // (see this task's own ±2px verification).
      vi.spyOn(insetContainer, 'getBoundingClientRect').mockReturnValue({ left: 10 } as DOMRect);
      fireEvent(window, new Event('resize'));

      expect(insetContainer.style.transform).toBe('translateX(-10px)');
    });

    it('never toggles anything at drag start — the container is already measured and corrected before any drag begins', () => {
      render(<Harness />);
      const insetContainer = screen.getByTestId('game-drag-overlay-inset');
      const transformBeforeDrag = insetContainer.style.transform;
      startDrag();
      expect(insetContainer.style.transform).toBe(transformBeforeDrag);
    });
  });
});

describe('useDragSourceMetrics', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  /** A plain DOM node standing in for a real mold's own tile — `data-flip-id` is the one attribute the hook looks for. */
  function sourceTile(id: string) {
    const el = document.createElement('button');
    el.setAttribute('data-flip-id', id);
    el.style.fontSize = '24px';
    el.style.lineHeight = '28px';
    el.style.paddingTop = '12px';
    el.style.paddingRight = '20px';
    el.style.paddingBottom = '12px';
    el.style.paddingLeft = '20px';
    el.style.borderRadius = '9999px';
    Object.defineProperty(el, 'offsetWidth', { value: 120, configurable: true });
    Object.defineProperty(el, 'offsetHeight', { value: 48, configurable: true });
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({ width: 120 } as DOMRect);
    document.body.appendChild(el);
    return el;
  }

  it('is null while no id is active', () => {
    const { result } = renderHook(() => useDragSourceMetrics(null));
    expect(result.current).toBeNull();
  });

  it('is null when no element carries a matching data-flip-id (defensive — never a real mold)', () => {
    const { result } = renderHook(() => useDragSourceMetrics('no-such-tile'));
    expect(result.current).toBeNull();
  });

  it("copies the source tile's own font-size, line-height, padding, radius and layout size onto a style object", () => {
    sourceTile('tile-7');
    const { result, rerender } = renderHook(({ activeId }) => useDragSourceMetrics(activeId), {
      initialProps: { activeId: null as string | null },
    });
    expect(result.current).toBeNull();

    rerender({ activeId: 'tile-7' });

    expect(result.current?.style).toEqual({
      width: '120px',
      height: '48px',
      fontSize: '24px',
      lineHeight: '28px',
      paddingTop: '12px',
      paddingRight: '20px',
      paddingBottom: '12px',
      paddingLeft: '20px',
      borderRadius: '9999px',
    });
  });

  it('derives scale 1 (no-op) when the visual rect width equals the layout offsetWidth', () => {
    sourceTile('tile-8');
    const { result, rerender } = renderHook(({ activeId }) => useDragSourceMetrics(activeId), {
      initialProps: { activeId: null as string | null },
    });
    rerender({ activeId: 'tile-8' });
    expect(result.current?.scale).toBe(1);
  });

  it("derives scale from visual rect width over layout offsetWidth — the editor's own live-preview shrink", () => {
    const el = sourceTile('tile-9');
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({ width: 73.2 } as DOMRect); // 120 * 0.61
    const { result, rerender } = renderHook(({ activeId }) => useDragSourceMetrics(activeId), {
      initialProps: { activeId: null as string | null },
    });
    rerender({ activeId: 'tile-9' });
    expect(result.current?.scale).toBeCloseTo(0.61, 2);
  });

  it('clears back to null once activeId goes back to null (drag end)', () => {
    sourceTile('tile-10');
    const { result, rerender } = renderHook(({ activeId }) => useDragSourceMetrics(activeId), {
      initialProps: { activeId: null as string | null },
    });
    rerender({ activeId: 'tile-10' });
    expect(result.current).not.toBeNull();

    rerender({ activeId: null });
    expect(result.current).toBeNull();
  });
});
