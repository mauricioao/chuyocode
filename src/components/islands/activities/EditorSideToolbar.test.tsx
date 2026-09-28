// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import EditorSideToolbar from './EditorSideToolbar';
import type { Block, WorksheetBlock } from '@/lib/activities/blocks';
import { clampToolbarPosition, dockTargetPosition } from '@/lib/activities/toolbarPosition';

const STORAGE_KEY = 'chuyocode:editor-side-toolbar';

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(window, 'innerWidth', { value: 1000, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: 700, configurable: true });
});

afterEach(() => {
  cleanup();
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

function worksheetBlock(id: string, name?: string): WorksheetBlock {
  return {
    id,
    type: 'worksheet',
    rotation: 0,
    name,
    image: { path: `activity-uploads/u1/${id}.webp`, width: 800, height: 600 },
    zones: [],
  };
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
    blocks: [] as Block[],
    onCollapseAll: vi.fn(),
    onExpandAll: vi.fn(),
    onGoToBlock: vi.fn(),
    onAddBlock: vi.fn(),
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
  render(<EditorSideToolbar {...props} />);
  return props;
}

describe('EditorSideToolbar — basic controls', () => {
  it('renders the rail with every icon button', () => {
    renderToolbar();
    expect(screen.getByTestId('editor-side-toolbar')).toBeTruthy();
    expect(screen.getByTestId('collapse-all-button')).toBeTruthy();
    expect(screen.getByTestId('expand-all-button')).toBeTruthy();
    expect(screen.getByTestId('block-index-trigger')).toBeTruthy();
    expect(screen.getByTestId('toolbar-add-block')).toBeTruthy();
    expect(screen.getByTestId('preview-toggle')).toBeTruthy();
    expect(screen.getByTestId('undo-button')).toBeTruthy();
    expect(screen.getByTestId('redo-button')).toBeTruthy();
    expect(screen.getByTestId('shortcuts-trigger')).toBeTruthy();
    expect(screen.getByTestId('save-button')).toBeTruthy();
    expect(screen.getByTestId('save-status')).toBeTruthy();
  });

  it('calls onCollapseAll / onExpandAll', () => {
    const props = renderToolbar();
    fireEvent.click(screen.getByTestId('collapse-all-button'));
    fireEvent.click(screen.getByTestId('expand-all-button'));
    expect(props.onCollapseAll).toHaveBeenCalledTimes(1);
    expect(props.onExpandAll).toHaveBeenCalledTimes(1);
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

describe('EditorSideToolbar — block index popover', () => {
  it('opens the popover listing every block by its display name', () => {
    renderToolbar({ blocks: [worksheetBlock('b1'), worksheetBlock('b2', 'Repaso')] });
    fireEvent.click(screen.getByTestId('block-index-trigger'));
    const popover = screen.getByTestId('block-index-popover');
    expect(popover.textContent).toContain('Hoja 1');
    expect(popover.textContent).toContain('Repaso');
  });

  it('clicking an entry calls onGoToBlock and closes the popover', () => {
    const props = renderToolbar({ blocks: [worksheetBlock('b1')] });
    fireEvent.click(screen.getByTestId('block-index-trigger'));
    fireEvent.click(screen.getByTestId('block-index-item-b1'));
    expect(props.onGoToBlock).toHaveBeenCalledWith('b1');
    expect(screen.queryByTestId('block-index-popover')).toBeNull();
  });

  it('closes on Escape', () => {
    renderToolbar({ blocks: [worksheetBlock('b1')] });
    fireEvent.click(screen.getByTestId('block-index-trigger'));
    expect(screen.getByTestId('block-index-popover')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('block-index-popover')).toBeNull();
  });
});

describe('EditorSideToolbar — keyboard shortcuts dialog', () => {
  it('opens the dialog listing shortcuts', () => {
    renderToolbar();
    fireEvent.click(screen.getByTestId('shortcuts-trigger'));
    const dialog = screen.getByTestId('shortcuts-dialog');
    expect(dialog.textContent).toContain('Z'); // undo/redo keys shown
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
});

// Floating side toolbar pass. jsdom has no real layout (`getBoundingClientRect`
// always returns zeros — same posture as `WorksheetZoneEditor.test.tsx`'s own
// header), and this test harness never renders a real `<header>`/`<footer>`
// (`EditorSideToolbar` renders standalone), so `measureBounds()` always falls
// back to `{ left: 0, right: window.innerWidth, top: 0, bottom: window.innerHeight }`
// here — `beforeEach` fixes those at 1000x700 for deterministic numbers.
describe('EditorSideToolbar — floating: docked by default', () => {
  it('renders the ORIGINAL fixed/centered classes, docked, no drag handle inline position', () => {
    renderToolbar();
    const rail = screen.getByTestId('editor-side-toolbar');
    expect(rail.getAttribute('data-docked')).toBe('true');
    expect(rail.className).toContain('top-1/2');
    expect(rail.className).toContain('right-3');
    expect(rail.style.left).toBe('');
    expect(rail.style.top).toBe('');
    expect(screen.getByTestId('toolbar-drag-handle')).toBeTruthy();
    expect(screen.queryByTestId('toolbar-dock-target')).toBeNull();
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
    expect(rail.style.left).toBe('');
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

  it('does not touch the position while docked', () => {
    renderToolbar();
    const rail = screen.getByTestId('editor-side-toolbar');
    Object.defineProperty(window, 'innerWidth', { value: 400, configurable: true });
    fireEvent(window, new Event('resize'));
    expect(rail.getAttribute('data-docked')).toBe('true');
    expect(rail.style.left).toBe('');
  });
});

/** Stubs `useIsDesktop`'s own `matchMedia` query to report a narrow (mobile) viewport. */
function stubMobileViewport() {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
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

  it('offers every action the desktop rail offers', () => {
    stubMobileViewport();
    renderToolbar({ canUndo: true, canRedo: true });
    for (const testId of [
      'collapse-all-button',
      'expand-all-button',
      'block-index-trigger',
      'toolbar-add-block',
      'preview-toggle',
      'undo-button',
      'redo-button',
      'shortcuts-trigger',
      'save-button',
    ]) {
      expect(screen.getByTestId(testId)).toBeTruthy();
    }
  });

  it('wires the same callbacks as the desktop rail', () => {
    stubMobileViewport();
    const onCollapseAll = vi.fn();
    const onSave = vi.fn();
    renderToolbar({ onCollapseAll, onSave });
    fireEvent.click(screen.getByTestId('collapse-all-button'));
    fireEvent.click(screen.getByTestId('save-button'));
    expect(onCollapseAll).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('opens the block index popover UPWARD, not sideways', () => {
    stubMobileViewport();
    renderToolbar({ blocks: [worksheetBlock('b1')] });
    fireEvent.click(screen.getByTestId('block-index-trigger'));
    expect(screen.getByTestId('block-index-popover').className).toContain('bottom-full');
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
      blocks: [],
      onCollapseAll: vi.fn(),
      onExpandAll: vi.fn(),
      onGoToBlock: vi.fn(),
      onAddBlock: vi.fn(),
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
    window.matchMedia = undefined as unknown as typeof window.matchMedia;
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
    window.matchMedia = undefined as unknown as typeof window.matchMedia;
    const html = renderToStaticMarkup(<EditorSideToolbar {...ssrProps()} />);
    expect(html).toMatch(/class="contents lg:hidden" inert(="")?[^>]*>/);
    expect(html).not.toMatch(/class="hidden lg:contents" inert/);
  });
});
