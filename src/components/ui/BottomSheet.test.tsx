// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import BottomSheet from './BottomSheet';

/**
 * jsdom has no real `PointerEvent` constructor, so `fireEvent.pointerX`
 * silently drops `clientX`/`clientY` — same gap and same fix already
 * established in `WorksheetZoneEditor.test.tsx`'s own `firePointer` (see its
 * header there): a hand-built native event with the coordinate fields
 * assigned directly, still delivered through React's real event system.
 */
function firePointer(
  el: Element,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  clientY: number,
  extra: Record<string, unknown> = {},
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { clientX: 0, clientY, pointerId: 1, button: 0, ...extra });
  act(() => {
    el.dispatchEvent(event);
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

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

beforeEach(() => {
  setReducedMotion(false);
});

/** A controlled harness so `onOpenChange` actually flips `open`, matching how every real caller wires this component. */
function Harness({ initialOpen = false, peek }: { initialOpen?: boolean; peek?: React.ReactNode }) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <BottomSheet open={open} onOpenChange={setOpen} title="Zona 1" peek={peek}>
      <p data-testid="sheet-body">Contenido</p>
    </BottomSheet>
  );
}

describe('BottomSheet — plain modal (no peek)', () => {
  it('renders nothing while closed', () => {
    render(<Harness />);
    expect(screen.queryByTestId('bottom-sheet')).toBeNull();
    expect(screen.queryByTestId('bottom-sheet-peek')).toBeNull();
  });

  it('renders the title and children when open', () => {
    render(<Harness initialOpen />);
    const sheet = screen.getByTestId('bottom-sheet');
    expect(sheet.textContent).toContain('Zona 1');
    expect(screen.getByTestId('sheet-body').textContent).toBe('Contenido');
  });

  it('is a dialog (role) so Radix owns focus trap semantics', () => {
    render(<Harness initialOpen />);
    expect(screen.getByTestId('bottom-sheet').getAttribute('role')).toBe('dialog');
  });

  it('closes on Escape', () => {
    render(<Harness initialOpen />);
    fireEvent.keyDown(screen.getByTestId('bottom-sheet'), { key: 'Escape' });
    expect(screen.queryByTestId('bottom-sheet')).toBeNull();
  });

  // Backdrop-tap-to-close is Radix's own `DismissableLayer` outside-pointer
  // detection, not logic this file adds — same "true pointer physics stay a
  // manual/Playwright check" posture `WorksheetZoneEditor.test.tsx` already
  // documents (jsdom's `PointerEvent` gap means a hand-built outside
  // pointerdown does not reliably exercise Radix's own internal outside-vs-
  // inside detection the way a real browser would). The Escape-key test
  // above already proves the SAME underlying wiring (Radix's dismiss
  // pipeline is reachable and calls `onOpenChange(false)`), which is the
  // part actually owned by this component.
  it.todo('closes on a backdrop tap — covered by manual/Playwright check');
});

describe('BottomSheet — collapsed peek', () => {
  it('shows the peek bar (not the modal) while closed', () => {
    render(<Harness peek={<span>Zona de texto</span>} />);
    expect(screen.getByTestId('bottom-sheet-peek').textContent).toContain('Zona de texto');
    expect(screen.queryByTestId('bottom-sheet')).toBeNull();
  });

  it('expands to the full modal sheet on tapping the peek bar', () => {
    render(<Harness peek={<span>Zona de texto</span>} />);
    fireEvent.click(screen.getByTestId('bottom-sheet-peek'));
    expect(screen.getByTestId('bottom-sheet')).toBeTruthy();
    expect(screen.queryByTestId('bottom-sheet-peek')).toBeNull();
  });

  it('defaults the peek bar to `bottom-0`', () => {
    render(<Harness peek={<span>Zona de texto</span>} />);
    expect(screen.getByTestId('bottom-sheet-peek').className.split(/\s+/)).toContain('bottom-0');
  });

  // Mobile layout pass, bug fix: a caller stacking this peek bar above its
  // own fixed bottom bar (the editor's mobile toolbar) overrides the
  // default `bottom-0` instead of overlapping it — see `peekBottomClassName`'s
  // own header.
  it('applies a custom `peekBottomClassName` instead of `bottom-0`, when given', () => {
    render(
      <BottomSheet
        open={false}
        onOpenChange={() => {}}
        title="Zona 1"
        peek={<span>Zona de texto</span>}
        peekBottomClassName="bottom-[2.5rem]"
      >
        <p>Contenido</p>
      </BottomSheet>,
    );
    const classes = screen.getByTestId('bottom-sheet-peek').className.split(/\s+/);
    expect(classes).toContain('bottom-[2.5rem]');
    expect(classes).not.toContain('bottom-0');
  });
});

describe('BottomSheet — swipe down to close', () => {
  function drag(handle: HTMLElement, sequence: { y: number; time: number }[]) {
    let now = sequence[0].time;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    firePointer(handle, 'pointerdown', sequence[0].y);
    for (const step of sequence.slice(1, -1)) {
      now = step.time;
      firePointer(handle, 'pointermove', step.y);
    }
    const last = sequence[sequence.length - 1];
    now = last.time;
    firePointer(handle, 'pointerup', last.y);
  }

  it('closes the sheet when dragged past the dismiss threshold', () => {
    render(<Harness initialOpen />);
    const sheet = screen.getByTestId('bottom-sheet');
    vi.spyOn(sheet, 'getBoundingClientRect').mockReturnValue({ height: 400 } as DOMRect);

    drag(screen.getByTestId('bottom-sheet-handle'), [
      { y: 0, time: 0 },
      { y: 100, time: 50 },
      { y: 200, time: 100 }, // 200/400 = 0.5 > 0.3 dismiss ratio
    ]);

    expect(screen.queryByTestId('bottom-sheet')).toBeNull();
  });

  it('snaps back and stays open for a small drag', () => {
    render(<Harness initialOpen />);
    const sheet = screen.getByTestId('bottom-sheet');
    vi.spyOn(sheet, 'getBoundingClientRect').mockReturnValue({ height: 400 } as DOMRect);

    drag(screen.getByTestId('bottom-sheet-handle'), [
      { y: 0, time: 0 },
      { y: 10, time: 500 }, // 10/400 well under the ratio, slow, stays open
    ]);

    expect(screen.getByTestId('bottom-sheet')).toBeTruthy();
    expect(sheet.style.transform).toBe('translateY(0px)');
  });
});

describe('BottomSheet — titleHidden', () => {
  it('keeps the title accessible but visually hidden', () => {
    render(
      <BottomSheet open onOpenChange={() => {}} title="Zona 1" titleHidden>
        <p>Contenido</p>
      </BottomSheet>,
    );
    const title = screen.getByText('Zona 1');
    expect(title.className).toContain('sr-only');
  });
});
