// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import EditorSideToolbar from './EditorSideToolbar';
import { clampToolbarPosition, dockTargetPosition } from '@/lib/activities/toolbarPosition';

const STORAGE_KEY = 'chuyocode:editor-side-toolbar';

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(window, 'innerWidth', { value: 1000, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: 700, configurable: true });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});

/** A DOMRect-shaped mock — same convention as `WorksheetZoneEditor.test.tsx`'s own `mockRect`. */
function mockRect(el: Element, box: { left?: number; top?: number; width: number; height: number }) {
  const left = box.left ?? 0;
  const top = box.top ?? 0;
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
    left,
    top,
    width: box.width,
    height: box.height,
    right: left + box.width,
    bottom: top + box.height,
    x: left,
    y: top,
    toJSON() {
      return {};
    },
  });
}

/**
 * jsdom has no real `PointerEvent` constructor — same posture (and same
 * reasoning) as `WorksheetZoneEditor.test.tsx`'s own `firePointer`.
 */
function firePointer(
  el: Element,
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel' | 'lostpointercapture',
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

const SAVE_LABELS = {
  saving: 'Guardando cambios',
  saved: 'Cambios guardados',
  error: 'No se pudo guardar',
  unsaved: 'Cambios sin guardar',
  retry: 'Reintentar',
  errorRetry: 'No se pudo guardar, reintentar',
};

function renderToolbar(overrides: Partial<Parameters<typeof EditorSideToolbar>[0]> = {}) {
  const props = {
    lang: 'es' as const,
    preview: false,
    onTogglePreview: vi.fn(),
    canUndo: false,
    canRedo: false,
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onSave: vi.fn(),
    saveDisabled: false,
    saveState: 'idle' as const,
    saveLabels: SAVE_LABELS,
    ...overrides,
  };
  const view = render(<EditorSideToolbar {...props} />);
  return {
    ...props,
    /** Re-renders with the SAME base props, overridden by `next` — e.g. a `dockMargin` prop change (T3 dock pass). */
    rerender: (next: Partial<Parameters<typeof EditorSideToolbar>[0]> = {}) =>
      view.rerender(<EditorSideToolbar {...props} {...next} />),
  };
}

describe('EditorSideToolbar — basic controls', () => {
  it('renders the rail with every icon button', () => {
    renderToolbar();
    expect(screen.getByTestId('editor-side-toolbar')).toBeTruthy();
    expect(screen.getByTestId('preview-toggle')).toBeTruthy();
    expect(screen.getByTestId('undo-button')).toBeTruthy();
    expect(screen.getByTestId('redo-button')).toBeTruthy();
    expect(screen.getByTestId('shortcuts-trigger')).toBeTruthy();
    expect(screen.getByTestId('save-button')).toBeTruthy();
    expect(screen.getByTestId('save-status')).toBeTruthy();
  });

  // One-sheet redesign: the sheet-switcher popover and "Agregar bloque" are
  // GONE — replaced by the worksheet-tools slot below.
  it('no longer renders the sheet-switcher popover or an add-block button', () => {
    renderToolbar();
    expect(screen.queryByTestId('block-index-trigger')).toBeNull();
    expect(screen.queryByTestId('toolbar-add-block')).toBeNull();
  });

  // One-sheet redesign: the active worksheet block's own tool/rotate/
  // "Cambiar imagen" controls (owned by `BlockList.tsx`/`WorksheetZoneEditor.tsx`)
  // portal into this slot — empty (and `empty:hidden`) with nothing to show.
  it('renders an empty worksheet-tools slot, with nothing portaled into it yet', () => {
    renderToolbar();
    const slot = screen.getByTestId('worksheet-tools-slot');
    expect(slot).toBeTruthy();
    expect(slot.children.length).toBe(0);
  });

  it('calls onWorksheetToolsSlotReady with the slot element on mount', () => {
    const onWorksheetToolsSlotReady = vi.fn();
    renderToolbar({ onWorksheetToolsSlotReady });
    expect(onWorksheetToolsSlotReady).toHaveBeenCalledWith(screen.getByTestId('worksheet-tools-slot'));
  });

  // "Colapsar todos"/"Expandir todos" are gone (owner decision 2026-10-07,
  // "Barra fina debajo") — they only ever served the accordion layout the
  // active-sheet bar replaced.
  it('no longer renders the collapse-all/expand-all buttons', () => {
    renderToolbar();
    expect(screen.queryByTestId('collapse-all-button')).toBeNull();
    expect(screen.queryByTestId('expand-all-button')).toBeNull();
  });

  it('disables undo/redo per props', () => {
    renderToolbar({ canUndo: false, canRedo: false });
    expect((screen.getByTestId('undo-button') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('redo-button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('enables and calls onUndo/onRedo', () => {
    const props = renderToolbar({ canUndo: true, canRedo: true });
    fireEvent.click(screen.getByTestId('undo-button'));
    fireEvent.click(screen.getByTestId('redo-button'));
    expect(props.onUndo).toHaveBeenCalledTimes(1);
    expect(props.onRedo).toHaveBeenCalledTimes(1);
  });

  it('toggles the preview icon based on the preview prop', () => {
    renderToolbar({ preview: false });
    expect(screen.getByTestId('preview-toggle').getAttribute('aria-label')).toBe('Vista previa');
    cleanup();
    renderToolbar({ preview: true });
    expect(screen.getByTestId('preview-toggle').getAttribute('aria-label')).toBe('Volver a editar');
  });
});

describe('EditorSideToolbar — keyboard shortcuts dialog', () => {
  it('opens the dialog listing shortcuts', () => {
    renderToolbar();
    fireEvent.click(screen.getByTestId('shortcuts-trigger'));
    const dialog = screen.getByTestId('shortcuts-dialog');
    expect(dialog.textContent).toContain('Z'); // undo/redo keys shown
  });

  it('lists the keyboard zone-creation shortcut (accessibility)', () => {
    renderToolbar();
    fireEvent.click(screen.getByTestId('shortcuts-trigger'));
    const dialog = screen.getByTestId('shortcuts-dialog');
    expect(dialog.textContent).toContain('Nueva zona');
    expect(dialog.textContent).toContain('Enter / N');
  });
});

describe('EditorSideToolbar — save', () => {
  it('calls onSave from the save button', () => {
    const props = renderToolbar();
    fireEvent.click(screen.getByTestId('save-button'));
    expect(props.onSave).toHaveBeenCalledTimes(1);
  });

  it('disables the save button while saving', () => {
    renderToolbar({ saveDisabled: true, saveState: 'saving' });
    expect((screen.getByTestId('save-button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows the save button as loading/aria-busy while a manual save runs', () => {
    renderToolbar({ saveDisabled: true, saveState: 'saving' });
    expect(screen.getByTestId('save-button').getAttribute('aria-busy')).toBe('true');
  });

  it('does not show the save button as loading when idle/saved/pending', () => {
    renderToolbar({ saveState: 'saved' });
    expect(screen.getByTestId('save-button').getAttribute('aria-busy')).toBeNull();
  });
});

// Floating side toolbar pass. jsdom has no real layout (`getBoundingClientRect`
// always returns zeros — same posture as `WorksheetZoneEditor.test.tsx`'s own
// header), and this test harness never renders a real `<header>`/`<footer>`
// (`EditorSideToolbar` renders standalone), so `measureBounds()` always falls
// back to `{ left: 0, right: window.innerWidth, top: 0, bottom: window.innerHeight }`
// here — `beforeEach` fixes those at 1000x700 for deterministic numbers.
describe('EditorSideToolbar — floating: docked by default', () => {
  it('renders fixed (body-portaled), JS-synced to the window\'s own dock slot, docked, no drag handle inline position mismatch', () => {
    renderToolbar();
    const rail = screen.getByTestId('editor-side-toolbar');
    expect(rail.getAttribute('data-docked')).toBe('true');
    expect(rail.className).toContain('fixed');
    expect(rail.className).toContain('z-[60]');
    // Dock pass: no more CSS-only `absolute`/`top-1/2`/`right-3` trick — the
    // rail is ALWAYS portaled to `document.body` now (the file header's own
    // doc on why), so the docked spot is computed the SAME way the
    // keyboard-nudge tests below already compute it.
    expect(rail.className).not.toContain('absolute');
    const target = dockTargetPosition({ width: 0, height: 0 }, { left: 0, right: 1000, top: 0, bottom: 700 });
    expect(rail.style.left).toBe(`${target.x}px`);
    expect(rail.style.top).toBe(`${target.y}px`);
    expect(screen.getByTestId('toolbar-drag-handle')).toBeTruthy();
    expect(screen.queryByTestId('toolbar-dock-target')).toBeNull();
  });
});

// Dock pass: this component now ALWAYS renders inside `DeskWindow` — DOCKED
// is pure CSS against `[data-desk-window-body]` (no JS measurement at all
// any more), and FLOATING always clamps to the full VIEWPORT regardless of
// the window's own rect. `measureBounds()` (`[data-desk-window-body]`'s own
// rect when mounted) now ONLY feeds the ghost dock-target/snap-back check —
// "where is the window right now", for re-docking — never the drag clamp.
describe('EditorSideToolbar — docked-inside-the-window vs. floating-the-full-viewport split', () => {
  function mountWindowBody(box: { left: number; top: number; width: number; height: number }) {
    const body = document.createElement('div');
    body.setAttribute('data-desk-window-body', '');
    document.body.appendChild(body);
    mockRect(body, box);
    return body;
  }

  it('clamps a drag to the full viewport even when a (smaller) desk window body is mounted', () => {
    const windowBody = mountWindowBody({ left: 16, top: 56, width: 900, height: 600 });
    renderToolbar();
    const rail = screen.getByTestId('editor-side-toolbar');
    mockRect(rail, { left: 900, top: 250, width: 56, height: 300 });
    const handle = screen.getByTestId('toolbar-drag-handle');

    firePointer(handle, 'pointerdown', 920, 300);
    firePointer(handle, 'pointermove', 5000, 5000); // way past every edge
    firePointer(handle, 'pointerup', 5000, 5000);

    // Viewport clamp (1000x700), NOT the window body's own (smaller) rect:
    // maxX = 1000 - 56 = 944; maxY = 700 - 300 = 400. The old window-body
    // numbers (860, 356) would mean the OLD clamp-to-window behaviour regressed.
    expect(rail.style.left).toBe('944px');
    expect(rail.style.top).toBe('400px');
    windowBody.remove();
  });

  it('snaps back to re-dock near the WINDOW BODY\'s own slot, not a viewport-wide one', () => {
    // Window body far from where a viewport-based dock target would land —
    // deliberately chosen so the two targets are nowhere near each other.
    const windowBody = mountWindowBody({ left: 100, top: 400, width: 400, height: 200 });
    renderToolbar();
    const rail = screen.getByTestId('editor-side-toolbar');
    mockRect(rail, { left: 900, top: 250, width: 56, height: 300 });
    const handle = screen.getByTestId('toolbar-drag-handle');

    // Window-body dock target: x = 100+400-56-12 = 432, y = (400+600)/2-150 = 350.
    // A viewport-wide target would instead be (932, 200) — over 500px away —
    // so landing exactly on (432, 350) only snaps if the WINDOW BODY is the
    // real target.
    firePointer(handle, 'pointerdown', 920, 300);
    firePointer(handle, 'pointermove', 452, 400);
    firePointer(handle, 'pointerup', 452, 400);

    expect(rail.getAttribute('data-docked')).toBe('true');
    // Re-docked -> the sync effect immediately recomputes `position` from
    // the SAME window-body rect (never empty any more — see the file header
    // on why docked is no longer pure CSS).
    expect(rail.style.left).toBe('432px');
    expect(rail.style.top).toBe('350px');
    windowBody.remove();
  });

  it('falls back to the full viewport for both clamp and dock target when no desk window body is mounted (every other caller)', () => {
    renderToolbar();
    const rail = screen.getByTestId('editor-side-toolbar');
    mockRect(rail, { left: 900, top: 250, width: 56, height: 300 });
    const handle = screen.getByTestId('toolbar-drag-handle');

    firePointer(handle, 'pointerdown', 920, 300);
    firePointer(handle, 'pointermove', 5000, 5000);
    firePointer(handle, 'pointerup', 5000, 5000);

    // Same as the existing "clamps a drag" test: maxX = 1000-56=944, maxY = 700-300=400.
    expect(rail.style.left).toBe('944px');
    expect(rail.style.top).toBe('400px');
  });
});

// Mobile review 2026-10-17 (1280×800): the worksheet tool cluster portals
// into the rail AFTER the dock position was first computed, so the rail grew
// from ~322px to ~514px tall while keeping the top it was given for the
// short version — its last buttons (Guardar) ended below the window's
// bottom edge. A docked rail re-centres whenever its own size changes.
describe('EditorSideToolbar — docked rail re-centres when it grows', () => {
  it('recomputes the docked position from the new rail size, not the size it had at mount', () => {
    const observed: Array<() => void> = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: () => void) {
          observed.push(cb);
        }
        observe() {}
        disconnect() {}
      },
    );
    renderToolbar();
    const rail = screen.getByTestId('editor-side-toolbar');
    // The rail grows (tools portaled in): 56x500 now.
    mockRect(rail, { left: 900, top: 0, width: 56, height: 500 });
    act(() => {
      for (const cb of observed) cb();
    });
    const target = dockTargetPosition({ width: 56, height: 500 }, { left: 0, right: 1000, top: 0, bottom: 700 });
    expect(rail.style.top).toBe(`${target.y}px`);
    expect(rail.style.left).toBe(`${target.x}px`);
  });
});

describe('EditorSideToolbar — dock/float toggle (the "clip")', () => {
  it('is pressed (pinned) by default, docked', () => {
    renderToolbar();
    const toggle = screen.getByTestId('toolbar-dock-toggle');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(toggle.getAttribute('aria-label')).toBe('Soltar y flotar');
  });

  it('clicking it releases the rail to float at its current on-screen position', () => {
    renderToolbar();
    const rail = screen.getByTestId('editor-side-toolbar');
    mockRect(rail, { left: 300, top: 120, width: 56, height: 300 });
    const toggle = screen.getByTestId('toolbar-dock-toggle');

    fireEvent.click(toggle);

    expect(rail.getAttribute('data-docked')).toBe('false');
    expect(rail.style.left).toBe('300px');
    expect(rail.style.top).toBe('120px');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(toggle.getAttribute('aria-label')).toBe('Volver a su lugar');
  });

  it('clicking it again re-docks', () => {
    renderToolbar();
    const rail = screen.getByTestId('editor-side-toolbar');
    mockRect(rail, { left: 300, top: 120, width: 56, height: 300 });
    const toggle = screen.getByTestId('toolbar-dock-toggle');

    fireEvent.click(toggle);
    fireEvent.click(toggle);

    expect(rail.getAttribute('data-docked')).toBe('true');
    // Re-docked -> the sync effect recomputes `position` from the window's
    // own (here: viewport-fallback) dock slot, same formula as the
    // "docked by default" test above.
    const target = dockTargetPosition({ width: 56, height: 300 }, { left: 0, right: 1000, top: 0, bottom: 700 });
    expect(rail.style.left).toBe(`${target.x}px`);
    expect(rail.style.top).toBe(`${target.y}px`);
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
  });
});

describe('EditorSideToolbar — floating: drag to undock/move', () => {
  it('dragging the handle undocks the rail and moves it to the drop position', () => {
    renderToolbar();
    const rail = screen.getByTestId('editor-side-toolbar');
    mockRect(rail, { left: 900, top: 250, width: 56, height: 300 });
    const handle = screen.getByTestId('toolbar-drag-handle');

    firePointer(handle, 'pointerdown', 920, 300);
    firePointer(handle, 'pointermove', 500, 150);
    firePointer(handle, 'pointerup', 500, 150);

    // Undocks from its captured on-screen (900, 250) position by the drag
    // delta (500-920, 150-300) = (-420, -150) -> (480, 100), well clear of
    // the dock target so it does not snap back.
    expect(rail.getAttribute('data-docked')).toBe('false');
    expect(rail.style.left).toBe('480px');
    expect(rail.style.top).toBe('100px');
    expect(rail.className).not.toContain('top-1/2');
    expect(screen.getByTestId('toolbar-dock-target')).toBeTruthy();
  });

  it('clamps a drag to stay within the visible header-to-footer/window area', () => {
    renderToolbar();
    const rail = screen.getByTestId('editor-side-toolbar');
    mockRect(rail, { left: 900, top: 250, width: 56, height: 300 });
    const handle = screen.getByTestId('toolbar-drag-handle');

    firePointer(handle, 'pointerdown', 920, 300);
    firePointer(handle, 'pointermove', 5000, 5000); // way past every edge
    firePointer(handle, 'pointerup', 5000, 5000);

    // maxX = 1000 - 56 = 944; maxY = 700 - 300 = 400.
    expect(rail.style.left).toBe('944px');
    expect(rail.style.top).toBe('400px');
  });

  it('releasing within the snap distance of the dock target re-docks automatically', () => {
    renderToolbar();
    const rail = screen.getByTestId('editor-side-toolbar');
    mockRect(rail, { left: 900, top: 250, width: 56, height: 300 });
    const handle = screen.getByTestId('toolbar-drag-handle');

    // dockTargetPosition({56,300}, {0,1000,0,700}) = (932, 200); a (32, -50)
    // delta from the captured (900, 250) start lands EXACTLY there.
    firePointer(handle, 'pointerdown', 920, 300);
    firePointer(handle, 'pointermove', 952, 250);
    firePointer(handle, 'pointerup', 952, 250);

    expect(rail.getAttribute('data-docked')).toBe('true');
    // Re-docked exactly at the dock target -> the sync effect recomputes the
    // SAME spot (932, 200) from the same (viewport-fallback) bounds.
    expect(rail.style.left).toBe('932px');
    expect(rail.style.top).toBe('200px');
    expect(screen.queryByTestId('toolbar-dock-target')).toBeNull();
  });

  it('a middle/right-click on the handle does not start a drag', () => {
    renderToolbar();
    const rail = screen.getByTestId('editor-side-toolbar');
    mockRect(rail, { left: 900, top: 250, width: 56, height: 300 });
    const handle = screen.getByTestId('toolbar-drag-handle');

    firePointer(handle, 'pointerdown', 920, 300, { button: 2 });
    firePointer(handle, 'pointermove', 500, 150, { button: 2 });
    firePointer(handle, 'pointerup', 500, 150, { button: 2 });

    expect(rail.getAttribute('data-docked')).toBe('true');
  });
});

describe('EditorSideToolbar — floating: re-docking', () => {
  function undock(rail: HTMLElement, handle: HTMLElement) {
    mockRect(rail, { left: 900, top: 250, width: 56, height: 300 });
    firePointer(handle, 'pointerdown', 920, 300);
    firePointer(handle, 'pointermove', 500, 150);
    firePointer(handle, 'pointerup', 500, 150);
  }

  it('clicking the ghost dock target re-docks', () => {
    renderToolbar();
    const rail = screen.getByTestId('editor-side-toolbar');
    const handle = screen.getByTestId('toolbar-drag-handle');
    undock(rail, handle);
    expect(rail.getAttribute('data-docked')).toBe('false');

    fireEvent.click(screen.getByTestId('toolbar-dock-target'));

    expect(rail.getAttribute('data-docked')).toBe('true');
    expect(screen.queryByTestId('toolbar-dock-target')).toBeNull();
  });

  it('double-clicking the handle re-docks', () => {
    renderToolbar();
    const rail = screen.getByTestId('editor-side-toolbar');
    const handle = screen.getByTestId('toolbar-drag-handle');
    undock(rail, handle);

    fireEvent.doubleClick(handle);

    expect(rail.getAttribute('data-docked')).toBe('true');
  });

  it('Home on the handle re-docks', () => {
    renderToolbar();
    const rail = screen.getByTestId('editor-side-toolbar');
    const handle = screen.getByTestId('toolbar-drag-handle');
    undock(rail, handle);

    fireEvent.keyDown(handle, { key: 'Home' });

    expect(rail.getAttribute('data-docked')).toBe('true');
  });
});

describe('EditorSideToolbar — floating: keyboard nudge', () => {
  it('an arrow key undocks (from the dock target position) and moves by ARROW_KEY_STEP', () => {
    renderToolbar();
    const rail = screen.getByTestId('editor-side-toolbar');
    const handle = screen.getByTestId('toolbar-drag-handle');
    const size = { width: 0, height: 0 }; // jsdom default (unmocked) rect
    const bounds = { left: 0, right: 1000, top: 0, bottom: 700 };
    const target = dockTargetPosition(size, bounds);

    fireEvent.keyDown(handle, { key: 'ArrowLeft' });

    expect(rail.getAttribute('data-docked')).toBe('false');
    expect(rail.style.left).toBe(`${target.x - 16}px`);
    expect(rail.style.top).toBe(`${target.y}px`);
  });

  it('Shift+arrow moves by the larger ARROW_KEY_STEP_SHIFT', () => {
    renderToolbar();
    const rail = screen.getByTestId('editor-side-toolbar');
    const handle = screen.getByTestId('toolbar-drag-handle');
    const size = { width: 0, height: 0 };
    const bounds = { left: 0, right: 1000, top: 0, bottom: 700 };
    const target = dockTargetPosition(size, bounds);
    const expected = clampToolbarPosition({ x: target.x + 64, y: target.y }, size, bounds);

    fireEvent.keyDown(handle, { key: 'ArrowRight', shiftKey: true });

    expect(rail.style.left).toBe(`${expected.x}px`);
  });

  it('ignores keys other than the arrows/Home', () => {
    renderToolbar();
    const rail = screen.getByTestId('editor-side-toolbar');
    const handle = screen.getByTestId('toolbar-drag-handle');

    fireEvent.keyDown(handle, { key: 'a' });

    expect(rail.getAttribute('data-docked')).toBe('true');
  });
});

describe('EditorSideToolbar — floating: Escape cancels a drag', () => {
  it('reverts to the DOCKED origin when the drag started from docked', () => {
    renderToolbar();
    const rail = screen.getByTestId('editor-side-toolbar');
    mockRect(rail, { left: 900, top: 250, width: 56, height: 300 });
    const handle = screen.getByTestId('toolbar-drag-handle');

    firePointer(handle, 'pointerdown', 920, 300);
    firePointer(handle, 'pointermove', 500, 150);
    expect(rail.getAttribute('data-docked')).toBe('false'); // undocked mid-drag

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(rail.getAttribute('data-docked')).toBe('true');
    // The (now cancelled) gesture's own pointerup is a no-op.
    firePointer(handle, 'pointerup', 500, 150);
    expect(rail.getAttribute('data-docked')).toBe('true');
  });

  it('reverts to the PRIOR undocked position when dragging an already-floating rail', () => {
    renderToolbar();
    const rail = screen.getByTestId('editor-side-toolbar');
    const handle = screen.getByTestId('toolbar-drag-handle');

    // First drag: undock to (480, 100) — see the "drag to undock" test above.
    mockRect(rail, { left: 900, top: 250, width: 56, height: 300 });
    firePointer(handle, 'pointerdown', 920, 300);
    firePointer(handle, 'pointermove', 500, 150);
    firePointer(handle, 'pointerup', 500, 150);
    expect(rail.style.left).toBe('480px');

    // Second drag, from the now-undocked rail: move further, then cancel.
    mockRect(rail, { left: 480, top: 100, width: 56, height: 300 });
    firePointer(handle, 'pointerdown', 480, 100);
    firePointer(handle, 'pointermove', 200, 50);
    expect(rail.style.left).toBe('200px');

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(rail.getAttribute('data-docked')).toBe('false'); // still undocked...
    expect(rail.style.left).toBe('480px'); // ...back at the PRIOR position, not the docked origin.
  });
});

describe('EditorSideToolbar — floating: persistence (localStorage)', () => {
  it('persists { docked: false, x, y } after a drag', () => {
    renderToolbar();
    const rail = screen.getByTestId('editor-side-toolbar');
    mockRect(rail, { left: 900, top: 250, width: 56, height: 300 });
    const handle = screen.getByTestId('toolbar-drag-handle');

    firePointer(handle, 'pointerdown', 920, 300);
    firePointer(handle, 'pointermove', 500, 150);
    firePointer(handle, 'pointerup', 500, 150);

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')).toEqual({
      docked: false,
      x: 480,
      y: 100,
    });
  });

  it('persists { docked: true } after re-docking', () => {
    renderToolbar();
    const rail = screen.getByTestId('editor-side-toolbar');
    mockRect(rail, { left: 900, top: 250, width: 56, height: 300 });
    const handle = screen.getByTestId('toolbar-drag-handle');
    firePointer(handle, 'pointerdown', 920, 300);
    firePointer(handle, 'pointermove', 500, 150);
    firePointer(handle, 'pointerup', 500, 150);

    fireEvent.doubleClick(handle);

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null').docked).toBe(true);
  });

  it('restores an undocked position from localStorage on mount, re-clamped to the current bounds', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ docked: false, x: 5000, y: 5000 }));
    renderToolbar();
    const rail = screen.getByTestId('editor-side-toolbar');

    // Unmocked (0x0) rail size; bounds {0,1000,0,700} -> clamps to the
    // bottom-right corner (1000, 700).
    expect(rail.getAttribute('data-docked')).toBe('false');
    expect(rail.style.left).toBe('1000px');
    expect(rail.style.top).toBe('700px');
  });

  it('falls back to docked for corrupted/invalid JSON in localStorage', () => {
    localStorage.setItem(STORAGE_KEY, '{not valid json');
    renderToolbar();
    expect(screen.getByTestId('editor-side-toolbar').getAttribute('data-docked')).toBe('true');
  });

  it('falls back to docked when localStorage.getItem throws (private window / blocked storage)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => renderToolbar()).not.toThrow();
    expect(screen.getByTestId('editor-side-toolbar').getAttribute('data-docked')).toBe('true');
  });
});

describe('EditorSideToolbar — floating: re-clamp on resize', () => {
  it('re-clamps the undocked position when the window shrinks', () => {
    renderToolbar();
    const rail = screen.getByTestId('editor-side-toolbar');
    mockRect(rail, { left: 900, top: 250, width: 56, height: 300 });
    const handle = screen.getByTestId('toolbar-drag-handle');
    firePointer(handle, 'pointerdown', 920, 300);
    firePointer(handle, 'pointermove', 500, 150);
    firePointer(handle, 'pointerup', 500, 150);
    expect(rail.style.left).toBe('480px');

    Object.defineProperty(window, 'innerWidth', { value: 400, configurable: true });
    fireEvent(window, new Event('resize'));

    // maxX = 400 - 56 = 344.
    expect(rail.style.left).toBe('344px');
  });

  it('re-syncs the docked position on resize too (JS-synced now, never inert)', () => {
    renderToolbar();
    const rail = screen.getByTestId('editor-side-toolbar');
    Object.defineProperty(window, 'innerWidth', { value: 400, configurable: true });
    fireEvent(window, new Event('resize'));
    expect(rail.getAttribute('data-docked')).toBe('true');
    const target = dockTargetPosition({ width: 0, height: 0 }, { left: 0, right: 400, top: 0, bottom: 700 });
    expect(rail.style.left).toBe(`${target.x}px`);
    expect(rail.style.top).toBe(`${target.y}px`);
  });
});

/** Stubs `useIsDesktop`'s own `matchMedia` query to report a narrow (mobile) viewport. */
function stubMobileViewport() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  );
}

describe('EditorSideToolbar — mobile bottom action bar (mobile layout pass)', () => {
  it('renders the compact bottom bar instead of the floating rail', () => {
    stubMobileViewport();
    renderToolbar();
    expect(screen.getByTestId('editor-side-toolbar-mobile')).toBeTruthy();
    expect(screen.queryByTestId('editor-side-toolbar')).toBeNull();
  });

  it('has no drag handle and no ghost dock target — undocking is desktop-only', () => {
    stubMobileViewport();
    renderToolbar();
    expect(screen.queryByTestId('toolbar-drag-handle')).toBeNull();
    expect(screen.queryByTestId('toolbar-dock-target')).toBeNull();
  });

  it('offers every action the desktop rail offers, except keyboard shortcuts help', () => {
    stubMobileViewport();
    renderToolbar({ canUndo: true, canRedo: true });
    for (const testId of ['worksheet-tools-slot', 'preview-toggle', 'undo-button', 'redo-button', 'save-button']) {
      expect(screen.getByTestId(testId)).toBeTruthy();
    }
  });

  // Bug fix (owner report: the bar got dense once every tool lived here —
  // it could overflow even a 360px phone): `ShortcutsDialog` lists KEYBOARD
  // shortcuts, meaningless with no physical keyboard on a touchscreen, so
  // it is the one action this compact row drops entirely — it still shows
  // on the desktop rail (see the sibling describe block below).
  it('drops the keyboard-shortcuts trigger — meaningless with no physical keyboard', () => {
    stubMobileViewport();
    renderToolbar();
    expect(screen.queryByTestId('shortcuts-trigger')).toBeNull();
  });

  it('wires the same callbacks as the desktop rail', () => {
    stubMobileViewport();
    const onSave = vi.fn();
    renderToolbar({ onSave });
    fireEvent.click(screen.getByTestId('save-button'));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  // Bug fix (owner report: on a 360px phone this bar could overflow far
  // enough that "Guardar" itself scrolled off-screen with no visual hint a
  // scroll was needed). Only the worksheet tool cluster — the group most
  // likely to grow (Zona/Mano/Audio/rotate/"Cambiar imagen") — gets its own
  // bounded, independently-scrollable region; preview/undo/redo/save stay
  // outside it, so the frequent actions are never what scrolls out of reach.
  it('gives the worksheet tool cluster its own scroll region, separate from the always-visible save/undo/redo/preview row', () => {
    stubMobileViewport();
    renderToolbar();
    const bar = screen.getByTestId('editor-side-toolbar-mobile');
    expect(bar.className).not.toContain('overflow-x-auto');
    const toolsSlot = screen.getByTestId('worksheet-tools-slot');
    const scrollRegion = toolsSlot.parentElement!;
    expect(scrollRegion.className).toContain('overflow-x-auto');
    expect(scrollRegion.contains(screen.getByTestId('save-button'))).toBe(false);
    expect(scrollRegion.contains(screen.getByTestId('preview-toggle'))).toBe(false);
  });

  it('respects the safe-area inset at the bottom of the screen', () => {
    stubMobileViewport();
    renderToolbar();
    expect(screen.getByTestId('editor-side-toolbar-mobile').className).toContain('env(safe-area-inset-bottom)');
  });
});

describe('EditorSideToolbar — no layout flash on the server render (mobile layout pass, priority fix)', () => {
  /** Same default props shape `renderToolbar` builds, without mounting. */
  function ssrProps(): Parameters<typeof EditorSideToolbar>[0] {
    return {
      lang: 'es',
      preview: false,
      onTogglePreview: vi.fn(),
      canUndo: false,
      canRedo: false,
      onUndo: vi.fn(),
      onRedo: vi.fn(),
      onSave: vi.fn(),
      saveDisabled: false,
      saveState: 'idle',
      saveLabels: SAVE_LABELS,
    };
  }

  it('renders BOTH the mobile bottom bar and the desktop rail, gated by CSS `lg:` classes only', () => {
    // Same "no real matchMedia" shape as a true server render — see
    // `useIsDesktop.test.ts`'s own "defaults to true" test.
    vi.stubGlobal('matchMedia', undefined);
    const html = renderToStaticMarkup(<EditorSideToolbar {...ssrProps()} />);
    expect(html).toContain('editor-side-toolbar-mobile');
    expect(html).toContain('editor-side-toolbar"');
    // The mobile bar's own wrapper is visible by default, hidden only at `lg:`.
    expect(html).toMatch(/class="contents lg:hidden"[^>]*>\s*<div[^>]*data-testid="editor-side-toolbar-mobile"/);
    // The desktop rail's own wrapper is hidden by default, shown only at `lg:` —
    // never visible-by-default DOM/structure for a small screen (the bug this fixes).
    expect(html).toContain('class="hidden lg:contents"');
  });

  it('marks the mobile bar `inert` on the server (matches `useIsDesktop`\'s SSR-safe desktop-first default)', () => {
    vi.stubGlobal('matchMedia', undefined);
    const html = renderToStaticMarkup(<EditorSideToolbar {...ssrProps()} />);
    expect(html).toMatch(/class="contents lg:hidden" inert(="")?[^>]*>/);
    expect(html).not.toMatch(/class="hidden lg:contents" inert/);
  });
});

// Owner report: "las herramientas se están cargando medio raro al entrar a
// construir ... primero aparecen a un lado y luego pasan al otro" — the
// rail's docked position is only known once the dock-sync `useLayoutEffect`
// measures it, but the SERVER-rendered markup (painted before hydration,
// visible at `lg:` widths per the describe block above) had no such gating
// and rendered fully opaque at `{0,0}` every time, then jumped once React
// took over. Fixed by staying invisible until that first measurement lands.
describe('EditorSideToolbar — no flash of the wrong docked position before the first measurement', () => {
  function ssrProps(): Parameters<typeof EditorSideToolbar>[0] {
    return {
      lang: 'es',
      preview: false,
      onTogglePreview: vi.fn(),
      canUndo: false,
      canRedo: false,
      onUndo: vi.fn(),
      onRedo: vi.fn(),
      onSave: vi.fn(),
      saveDisabled: false,
      saveState: 'idle',
      saveLabels: SAVE_LABELS,
    };
  }

  function classesOf(html: string, testId: string): string[] {
    const match = html.match(new RegExp(`data-testid="${testId}"[^>]*class="([^"]*)"`));
    return match ? match[1].split(/\s+/) : [];
  }

  it('renders the server markup fully INVISIBLE (opacity-0), not just at the wrong spot', () => {
    vi.stubGlobal('matchMedia', undefined);
    const html = renderToStaticMarkup(<EditorSideToolbar {...ssrProps()} />);
    const classes = classesOf(html, 'editor-side-toolbar');
    expect(classes).toContain('opacity-0');
    expect(classes).not.toContain('opacity-100');
  });

  it('becomes visible (fades in) once the first real position is measured on mount', () => {
    renderToolbar();
    const rail = screen.getByTestId('editor-side-toolbar');
    expect(rail.className.split(/\s+/)).toContain('opacity-100');
    expect(rail.className.split(/\s+/)).not.toContain('opacity-0');
  });

  it('transitions opacity (never none) so the reveal is a short fade, except under prefers-reduced-motion', () => {
    renderToolbar();
    const rail = screen.getByTestId('editor-side-toolbar');
    expect(rail.className).toMatch(/\btransition-opacity\b/);
    expect(rail.className).toMatch(/\bmotion-reduce:transition-none\b/);
  });
});

// T3 toolbar-dock pass: while the ACTIVE block is a templated quiz block,
// `ActivityEditorIsland.tsx` passes `dockMargin={TEMPLATE_TOOLBAR_DOCK_MARGIN}`
// (16px canvas padding + this component's own `DOCK_MARGIN`) so the rail
// docks INSIDE the stage card instead of the window's default right edge —
// every `dockTargetPosition` call site (dock sync, snap-back, keyboard
// nudge, ghost) must forward it. Same {0,1000,0,700} mocked bounds as every
// other describe block above.
describe('EditorSideToolbar — dockMargin prop (template-canvas dock pass, T3)', () => {
  it('docks at the default position without dockMargin, 16px further left with dockMargin={28}', () => {
    renderToolbar();
    const rail = screen.getByTestId('editor-side-toolbar');
    const defaultTarget = dockTargetPosition({ width: 0, height: 0 }, { left: 0, right: 1000, top: 0, bottom: 700 });
    expect(rail.style.left).toBe(`${defaultTarget.x}px`);
    cleanup();

    renderToolbar({ dockMargin: 28 });
    const rail2 = screen.getByTestId('editor-side-toolbar');
    const marginedTarget = dockTargetPosition(
      { width: 0, height: 0 },
      { left: 0, right: 1000, top: 0, bottom: 700 },
      28,
    );
    expect(marginedTarget.x).toBe(defaultTarget.x - 16);
    expect(rail2.style.left).toBe(`${marginedTarget.x}px`);
  });

  it('resyncs when dockMargin changes, without toggling docked', () => {
    const toolbar = renderToolbar({ dockMargin: 28 });
    const rail = screen.getByTestId('editor-side-toolbar');
    const marginedTarget = dockTargetPosition(
      { width: 0, height: 0 },
      { left: 0, right: 1000, top: 0, bottom: 700 },
      28,
    );
    expect(rail.style.left).toBe(`${marginedTarget.x}px`);

    toolbar.rerender({ dockMargin: undefined });

    const defaultTarget = dockTargetPosition({ width: 0, height: 0 }, { left: 0, right: 1000, top: 0, bottom: 700 });
    expect(rail.getAttribute('data-docked')).toBe('true'); // never toggled, only resynced.
    expect(rail.style.left).toBe(`${defaultTarget.x}px`);
  });

  it('an ArrowLeft nudge from docked undocks from the MARGINED dock position', () => {
    renderToolbar({ dockMargin: 28 });
    const rail = screen.getByTestId('editor-side-toolbar');
    const handle = screen.getByTestId('toolbar-drag-handle');
    const size = { width: 0, height: 0 };
    const bounds = { left: 0, right: 1000, top: 0, bottom: 700 };
    const target = dockTargetPosition(size, bounds, 28);

    fireEvent.keyDown(handle, { key: 'ArrowLeft' });

    expect(rail.getAttribute('data-docked')).toBe('false');
    expect(rail.style.left).toBe(`${target.x - 16}px`);
    expect(rail.style.top).toBe(`${target.y}px`);
  });

  it('the undock ghost (dock target) renders at the MARGINED position too', () => {
    renderToolbar({ dockMargin: 28 });
    const rail = screen.getByTestId('editor-side-toolbar');
    mockRect(rail, { left: 900, top: 250, width: 56, height: 300 });
    const handle = screen.getByTestId('toolbar-drag-handle');

    firePointer(handle, 'pointerdown', 920, 300);
    firePointer(handle, 'pointermove', 500, 150);
    firePointer(handle, 'pointerup', 500, 150);

    const ghost = screen.getByTestId('toolbar-dock-target');
    const target = dockTargetPosition({ width: 56, height: 300 }, { left: 0, right: 1000, top: 0, bottom: 700 }, 28);
    const DOCK_TARGET_SIZE = 32; // the ghost's own rendered size (`h-8 w-8`) — EditorSideToolbar.tsx's own constant.
    expect(ghost.style.left).toBe(`${target.x + (56 - DOCK_TARGET_SIZE) / 2}px`);
    expect(ghost.style.top).toBe(`${target.y + (300 - DOCK_TARGET_SIZE) / 2}px`);
  });

  // Copy of "releasing within the snap distance of the dock target re-docks
  // automatically" above, with `dockMargin={28}` — the target shifts 16px
  // left (916 instead of 932) and the drag must land there instead to snap.
  it('releasing within the snap distance of the MARGINED dock target re-docks automatically', () => {
    renderToolbar({ dockMargin: 28 });
    const rail = screen.getByTestId('editor-side-toolbar');
    mockRect(rail, { left: 900, top: 250, width: 56, height: 300 });
    const handle = screen.getByTestId('toolbar-drag-handle');

    // dockTargetPosition({56,300}, {0,1000,0,700}, 28) = (916, 200) — 16px
    // left of the default-margin target (932, 200) the sibling test above
    // snaps to. A (16, -50) delta from the captured (900, 250) start lands
    // EXACTLY there.
    firePointer(handle, 'pointerdown', 920, 300);
    firePointer(handle, 'pointermove', 936, 250);
    firePointer(handle, 'pointerup', 936, 250);

    expect(rail.getAttribute('data-docked')).toBe('true');
    expect(rail.style.left).toBe('916px');
    expect(rail.style.top).toBe('200px');
    expect(screen.queryByTestId('toolbar-dock-target')).toBeNull();
  });
});

// Horizontal toolbar pass ("gain space, use the white bottom part"): while
// `orientation="horizontal"` (set by `ActivityEditorIsland.tsx` while a
// templated quiz block is active), the rail docks along the BOTTOM-RIGHT of
// its host surface instead of the right-center, and lays its icons out in a
// row instead of a column. Same {0,1000,0,700} mocked bounds as every other
// describe block above.
describe('EditorSideToolbar — orientation="horizontal" (horizontal toolbar pass)', () => {
  it('marks the rail with data-orientation="horizontal" and lays its icons out in a row', () => {
    renderToolbar({ orientation: 'horizontal', dockMargin: 28 });
    const rail = screen.getByTestId('editor-side-toolbar');
    expect(rail.getAttribute('data-orientation')).toBe('horizontal');
    expect(rail.className).toContain('flex-row');
    expect(rail.className).not.toContain('flex-col');
  });

  it('defaults data-orientation to "vertical" and keeps the column layout when the prop is omitted', () => {
    renderToolbar();
    const rail = screen.getByTestId('editor-side-toolbar');
    expect(rail.getAttribute('data-orientation')).toBe('vertical');
    expect(rail.className).toContain('flex-col');
    expect(rail.className).not.toContain('flex-row');
  });

  it('docks at the bottom-right target instead of right-center', () => {
    renderToolbar({ orientation: 'horizontal', dockMargin: 28 });
    const rail = screen.getByTestId('editor-side-toolbar');
    const target = dockTargetPosition(
      { width: 0, height: 0 },
      { left: 0, right: 1000, top: 0, bottom: 700 },
      28,
      'bottom-right',
    );
    expect(rail.style.left).toBe(`${target.x}px`);
    expect(rail.style.top).toBe(`${target.y}px`);
  });

  it('the undock ghost and drag snap-back both use the bottom-right target', () => {
    renderToolbar({ orientation: 'horizontal', dockMargin: 28 });
    const rail = screen.getByTestId('editor-side-toolbar');
    mockRect(rail, { left: 900, top: 600, width: 300, height: 42 });
    const handle = screen.getByTestId('toolbar-drag-handle');

    firePointer(handle, 'pointerdown', 920, 610);
    firePointer(handle, 'pointermove', 500, 150);
    firePointer(handle, 'pointerup', 500, 150);

    const ghost = screen.getByTestId('toolbar-dock-target');
    const target = dockTargetPosition(
      { width: 300, height: 42 },
      { left: 0, right: 1000, top: 0, bottom: 700 },
      28,
      'bottom-right',
    );
    const DOCK_TARGET_SIZE = 32;
    expect(ghost.style.left).toBe(`${target.x + (300 - DOCK_TARGET_SIZE) / 2}px`);
    expect(ghost.style.top).toBe(`${target.y + (42 - DOCK_TARGET_SIZE) / 2}px`);

    // Drag back onto the ghost target exactly -> re-docks there too.
    firePointer(handle, 'pointerdown', 500, 150);
    firePointer(
      handle,
      'pointermove',
      500 + (target.x - 500),
      150 + (target.y - 150),
    );
    firePointer(handle, 'pointerup', 500 + (target.x - 500), 150 + (target.y - 150));
    expect(rail.getAttribute('data-docked')).toBe('true');
    expect(rail.style.left).toBe(`${target.x}px`);
    expect(rail.style.top).toBe(`${target.y}px`);
  });

  it('a nudge from docked undocks from the bottom-right dock position', () => {
    renderToolbar({ orientation: 'horizontal', dockMargin: 28 });
    const rail = screen.getByTestId('editor-side-toolbar');
    const handle = screen.getByTestId('toolbar-drag-handle');
    const size = { width: 0, height: 0 };
    const bounds = { left: 0, right: 1000, top: 0, bottom: 700 };
    const target = dockTargetPosition(size, bounds, 28, 'bottom-right');

    fireEvent.keyDown(handle, { key: 'ArrowUp' });

    expect(rail.getAttribute('data-docked')).toBe('false');
    expect(rail.style.left).toBe(`${target.x}px`);
    expect(rail.style.top).toBe(`${target.y - 16}px`);
  });

  // A saved position from the vertical era (e.g. a tall rail docked near the
  // right-center) could leave a now-wide horizontal rail far off-screen once
  // orientation flips — re-clamping on the orientation change (not just on
  // resize) keeps it visible.
  it('re-clamps an undocked saved position when the orientation flips (vertical-era position, now a wide horizontal rail)', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ docked: false, x: 950, y: 300 }));
    const toolbar = renderToolbar({ orientation: 'vertical' });
    const rail = screen.getByTestId('editor-side-toolbar');
    // Unmocked rail rect is 0x0 on first mount, so the restore itself doesn't
    // clamp away (950, 300) yet — flip orientation and re-measure the rail
    // at its now-wide horizontal size (320x42) to trigger the re-clamp.
    mockRect(rail, { left: 950, top: 300, width: 320, height: 42 });
    toolbar.rerender({ orientation: 'horizontal' });

    // maxX = 1000 - 320 = 680; the saved x (950) is now out of bounds.
    expect(Number(rail.style.left.replace('px', ''))).toBeLessThanOrEqual(680);
  });

  it('peer-empty:hidden collapses the separator right after the (empty) worksheet-tools slot, in horizontal orientation too', () => {
    renderToolbar({ orientation: 'horizontal' });
    const slot = screen.getByTestId('worksheet-tools-slot');
    expect(slot.className).toContain('peer');
    const separator = slot.nextElementSibling as HTMLElement;
    expect(separator.className).toContain('peer-empty:hidden');
  });

  it('wraps the save-status indicator in a fixed size-7 slot so a retry button never shifts the bar', () => {
    renderToolbar({ orientation: 'horizontal', saveState: 'error' });
    const status = screen.getByTestId('save-status');
    const slot = status.closest('[data-testid="save-status-slot"]') ?? status.parentElement;
    expect(slot!.className).toContain('size-7');
  });

  it('gives the horizontal rail the same testid order as the vertical rail', () => {
    renderToolbar({ orientation: 'vertical' });
    const verticalOrder = Array.from(screen.getByTestId('editor-side-toolbar').querySelectorAll('[data-testid]')).map(
      (el) => el.getAttribute('data-testid'),
    );
    cleanup();
    renderToolbar({ orientation: 'horizontal' });
    const horizontalOrder = Array.from(
      screen.getByTestId('editor-side-toolbar').querySelectorAll('[data-testid]'),
    ).map((el) => el.getAttribute('data-testid'));
    expect(horizontalOrder).toEqual(verticalOrder);
  });

  it('never sets data-orientation on the mobile bar', () => {
    stubMobileViewport();
    renderToolbar({ orientation: 'horizontal' });
    expect(screen.getByTestId('editor-side-toolbar-mobile').hasAttribute('data-orientation')).toBe(false);
  });
});
