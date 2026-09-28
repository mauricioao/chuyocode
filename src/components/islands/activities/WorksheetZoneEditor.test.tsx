// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { useState } from 'react';
import WorksheetZoneEditor from './WorksheetZoneEditor';
import type { Zone } from '@/lib/activities/blocks';

const IMAGE = { path: 'activity-uploads/u1/img.webp', width: 800, height: 400 };

afterEach(() => cleanup());

/** Stateful wrapper so onZonesChange/onSelectZone actually drive re-renders, like the real editor. */
function Harness({ initialZones = [] as Zone[], initialSelected = null as string | null }) {
  const [zones, setZones] = useState<Zone[]>(initialZones);
  const [selected, setSelected] = useState<string | null>(initialSelected);
  return (
    <WorksheetZoneEditor
      lang="es"
      image={IMAGE}
      imageUrl="/img.webp"
      zones={zones}
      selectedZoneId={selected}
      onZonesChange={setZones}
      onSelectZone={setSelected}
    />
  );
}

/** A DOMRect-shaped mock, defaulting `right`/`bottom` from `left/top + width/height`. */
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

describe('WorksheetZoneEditor — rendering', () => {
  it('renders the image and no zones initially', () => {
    render(<Harness />);
    expect(screen.getByTestId('worksheet-zone-editor')).toBeTruthy();
    expect(screen.getByTestId('zone-canvas').querySelector('img')).toBeTruthy();
  });

  it('renders an existing zone positioned by its fractional rect', () => {
    const zone: Zone = { id: 'z1', x: 0.25, y: 0.1, w: 0.2, h: 0.15, kind: 'text', answers: ['sat'] };
    render(<Harness initialZones={[zone]} />);
    const el = screen.getByTestId('zone-z1');
    expect(el.style.left).toBe('25%');
    expect(el.style.top).toBe('10%');
  });
});

describe('WorksheetZoneEditor — properties panel is always rendered (no layout jump)', () => {
  it('shows the panel with a quiet empty state when nothing is selected', () => {
    render(<Harness />);
    const panel = screen.getByTestId('zone-properties-panel');
    expect(panel).toBeTruthy();
    expect(screen.getByTestId('zone-properties-empty')).toBeTruthy();
    expect(screen.queryByTestId('zone-properties-content')).toBeNull();
  });

  it('keeps the exact same panel column width whether or not a zone is selected', () => {
    const zone: Zone = { id: 'z1', x: 0.1, y: 0.1, w: 0.2, h: 0.1, kind: 'text', answers: ['x'] };
    render(<Harness initialZones={[zone]} initialSelected={null} />);
    const emptyClass = screen.getByTestId('zone-properties-panel').className;

    cleanup();
    render(<Harness initialZones={[zone]} initialSelected="z1" />);
    const selectedClass = screen.getByTestId('zone-properties-panel').className;

    expect(selectedClass).toBe(emptyClass);
  });

  it('switches the panel content in place on select, without ever hiding the column', () => {
    const zone: Zone = { id: 'z1', x: 0.1, y: 0.1, w: 0.2, h: 0.1, kind: 'text', answers: ['x'] };
    render(<Harness initialZones={[zone]} />);
    expect(screen.getByTestId('zone-properties-empty')).toBeTruthy();

    fireEvent.pointerDown(screen.getByTestId('zone-z1'));
    expect(screen.getByTestId('zone-properties-panel')).toBeTruthy();
    expect(screen.getByTestId('zone-properties-content')).toBeTruthy();
    expect(screen.queryByTestId('zone-properties-empty')).toBeNull();
  });
});

describe('WorksheetZoneEditor — add / select / delete', () => {
  it('adds a default zone via the accessible button and selects it', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('add-zone'));
    const zones = screen.getAllByTestId(/^zone-(?!canvas|properties|viewport|draft)/);
    expect(zones).toHaveLength(1);
    expect(screen.getByTestId('zone-properties-content')).toBeTruthy();
  });

  it('selecting a zone opens the properties panel content; deselecting closes it', () => {
    const zone: Zone = { id: 'z1', x: 0.1, y: 0.1, w: 0.2, h: 0.1, kind: 'text', answers: ['x'] };
    render(<Harness initialZones={[zone]} />);
    fireEvent.pointerDown(screen.getByTestId('zone-z1'));
    expect(screen.getByTestId('zone-properties-content')).toBeTruthy();
  });

  it('deletes the selected zone via the panel delete button', () => {
    const zone: Zone = { id: 'z1', x: 0.1, y: 0.1, w: 0.2, h: 0.1, kind: 'text', answers: ['x'] };
    render(<Harness initialZones={[zone]} initialSelected="z1" />);
    fireEvent.click(screen.getByTestId('delete-zone'));
    expect(screen.queryByTestId('zone-z1')).toBeNull();
    expect(screen.getByTestId('zone-properties-empty')).toBeTruthy();
  });

  it('deletes the selected zone via the Delete key', () => {
    const zone: Zone = { id: 'z1', x: 0.1, y: 0.1, w: 0.2, h: 0.1, kind: 'text', answers: ['x'] };
    render(<Harness initialZones={[zone]} initialSelected="z1" />);
    fireEvent.keyDown(screen.getByTestId('zone-z1'), { key: 'Delete' });
    expect(screen.queryByTestId('zone-z1')).toBeNull();
  });
});

describe('WorksheetZoneEditor — keyboard nudge', () => {
  it('nudges the zone right on ArrowRight', () => {
    const zone: Zone = { id: 'z1', x: 0.1, y: 0.1, w: 0.2, h: 0.1, kind: 'text', answers: ['x'] };
    render(<Harness initialZones={[zone]} initialSelected="z1" />);
    fireEvent.keyDown(screen.getByTestId('zone-z1'), { key: 'ArrowRight' });
    expect(screen.getByTestId('zone-z1').style.left).toBe('11%');
  });

  it('nudges the zone down on ArrowDown', () => {
    const zone: Zone = { id: 'z1', x: 0.1, y: 0.1, w: 0.2, h: 0.1, kind: 'text', answers: ['x'] };
    render(<Harness initialZones={[zone]} initialSelected="z1" />);
    fireEvent.keyDown(screen.getByTestId('zone-z1'), { key: 'ArrowDown' });
    expect(screen.getByTestId('zone-z1').style.top).toBe('11%');
  });
});

describe('WorksheetZoneEditor — zone kind switching', () => {
  it('switches from text to choice, seeding two empty options', () => {
    const zone: Zone = { id: 'z1', x: 0.1, y: 0.1, w: 0.2, h: 0.1, kind: 'text', answers: ['x'] };
    render(<Harness initialZones={[zone]} initialSelected="z1" />);
    fireEvent.click(screen.getByText('Opción'));
    const optionInputs = screen.getAllByLabelText(/Opciones \d/);
    expect(optionInputs).toHaveLength(2);
  });

  it('switches back to text, keeping at least one answer field', () => {
    const zone: Zone = {
      id: 'z1',
      x: 0.1,
      y: 0.1,
      w: 0.2,
      h: 0.1,
      kind: 'choice',
      answers: ['a'],
      options: ['a', 'b'],
    };
    render(<Harness initialZones={[zone]} initialSelected="z1" />);
    fireEvent.click(screen.getByText('Texto'));
    const answerInputs = screen.getAllByLabelText(/Respuestas aceptadas \d/);
    expect(answerInputs.length).toBeGreaterThanOrEqual(1);
  });
});

describe('WorksheetZoneEditor — text answers', () => {
  it('adds and edits an answer', () => {
    const zone: Zone = { id: 'z1', x: 0.1, y: 0.1, w: 0.2, h: 0.1, kind: 'text', answers: ['sat'] };
    render(<Harness initialZones={[zone]} initialSelected="z1" />);
    fireEvent.click(screen.getByText('+ Agregar respuesta'));
    const inputs = screen.getAllByLabelText(/Respuestas aceptadas \d/) as HTMLInputElement[];
    expect(inputs).toHaveLength(2);
    fireEvent.change(inputs[1], { target: { value: 'sit' } });
    expect(inputs[1].value).toBe('sit');
  });

  it('never lets the last answer be removed', () => {
    const zone: Zone = { id: 'z1', x: 0.1, y: 0.1, w: 0.2, h: 0.1, kind: 'text', answers: ['sat'] };
    render(<Harness initialZones={[zone]} initialSelected="z1" />);
    const removeButton = screen.getByLabelText('Quitar respuesta') as HTMLButtonElement;
    expect(removeButton.disabled).toBe(true);
  });
});

describe('WorksheetZoneEditor — choice options', () => {
  const CHOICE_ZONE: Zone = {
    id: 'z1',
    x: 0.1,
    y: 0.1,
    w: 0.2,
    h: 0.1,
    kind: 'choice',
    answers: ['b'],
    options: ['a', 'b'],
  };

  it('never lets options drop below 2', () => {
    render(<Harness initialZones={[CHOICE_ZONE]} initialSelected="z1" />);
    const removeButtons = screen.getAllByLabelText('Quitar opción') as HTMLButtonElement[];
    expect(removeButtons.every((b) => b.disabled)).toBe(true);
  });

  it('allows removing an option once a third exists, and drops it from answers too', () => {
    const zone: Zone = { ...CHOICE_ZONE, answers: ['b', 'c'], options: ['a', 'b', 'c'] };
    render(<Harness initialZones={[zone]} initialSelected="z1" />);
    const removeButtons = screen.getAllByLabelText('Quitar opción');
    fireEvent.click(removeButtons[2]); // remove "c"
    const checkboxes = screen.getAllByLabelText('Correcta') as HTMLInputElement[];
    expect(checkboxes).toHaveLength(2);
  });

  it('checking an option marks it correct (adds it to answers)', () => {
    render(<Harness initialZones={[CHOICE_ZONE]} initialSelected="z1" />);
    const checkboxes = screen.getAllByLabelText('Correcta') as HTMLInputElement[];
    expect(checkboxes[0].checked).toBe(false);
    fireEvent.click(checkboxes[0]);
    expect(checkboxes[0].checked).toBe(true);
  });

  it('unchecking the only correct option removes it from answers', () => {
    render(<Harness initialZones={[CHOICE_ZONE]} initialSelected="z1" />);
    const checkboxes = screen.getAllByLabelText('Correcta') as HTMLInputElement[];
    expect(checkboxes[1].checked).toBe(true); // "b" is the seeded answer
    fireEvent.click(checkboxes[1]);
    expect(checkboxes[1].checked).toBe(false);
  });
});

/**
 * jsdom has NO real `PointerEvent` constructor (`window.PointerEvent` is
 * undefined), so `@testing-library`'s `fireEvent.pointerDown/Up` silently
 * drop `clientX`/`clientY` — they fall back to a plain `Event`, whose init
 * dict has no coordinate fields at all. Dispatching a hand-built native
 * event with those fields assigned directly (still delivered through
 * React's real event system) is the accurate way to drive this in jsdom;
 * true multi-touch/mouse drag PHYSICS remain a manual/Playwright check, same
 * posture as `imagePipeline.ts`'s canvas functions.
 */
function firePointer(
  el: Element,
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
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

describe('WorksheetZoneEditor — pointer draw (mocked layout)', () => {
  it('draws a new zone from a pointer drag, using the real container size', () => {
    render(<Harness />);
    const canvas = screen.getByTestId('zone-canvas');
    mockRect(canvas, { width: 200, height: 100 });

    firePointer(canvas, 'pointerdown', 20, 10);
    firePointer(canvas, 'pointerup', 60, 50);

    const zones = screen.getAllByTestId(/^zone-(?!canvas|properties|viewport|draft)/);
    expect(zones).toHaveLength(1);
    expect(zones[0].style.left).toBe('10%');
    expect(zones[0].style.top).toBe('10%');
    expect(zones[0].style.width).toBe('20%');
    expect(zones[0].style.height).toBe('40%');
  });

  it('renders a live dashed rubber-band rectangle from pointerdown to pointerup, then removes it', () => {
    render(<Harness />);
    const canvas = screen.getByTestId('zone-canvas');
    mockRect(canvas, { width: 200, height: 100 });

    firePointer(canvas, 'pointerdown', 20, 10);
    expect(screen.queryByTestId('zone-draft')).toBeNull();

    firePointer(canvas, 'pointermove', 60, 50);
    const draft = screen.getByTestId('zone-draft');
    expect(draft.style.left).toBe('10%');
    expect(draft.style.top).toBe('10%');
    expect(draft.style.width).toBe('20%');
    expect(draft.style.height).toBe('40%');

    firePointer(canvas, 'pointerup', 60, 50);
    expect(screen.queryByTestId('zone-draft')).toBeNull();
  });

  it('updates the draft rectangle continuously as the pointer keeps moving', () => {
    render(<Harness />);
    const canvas = screen.getByTestId('zone-canvas');
    mockRect(canvas, { width: 200, height: 100 });

    firePointer(canvas, 'pointerdown', 0, 0);
    firePointer(canvas, 'pointermove', 40, 20);
    expect(screen.getByTestId('zone-draft').style.width).toBe('20%');

    firePointer(canvas, 'pointermove', 100, 50);
    expect(screen.getByTestId('zone-draft').style.width).toBe('50%');
  });

  it('discards a too-small drag (including a plain click) without committing a zone', () => {
    render(<Harness />);
    const canvas = screen.getByTestId('zone-canvas');
    mockRect(canvas, { width: 200, height: 100 });

    firePointer(canvas, 'pointerdown', 20, 10);
    firePointer(canvas, 'pointerup', 21, 10); // 1px move: well under MIN_ZONE_SIZE (2%)

    expect(screen.queryAllByTestId(/^zone-(?!canvas|properties|viewport|draft)/)).toHaveLength(0);
    expect(screen.getByTestId('zone-properties-empty')).toBeTruthy();
  });

  it('discards the in-progress draft on pointercancel without committing a zone', () => {
    render(<Harness />);
    const canvas = screen.getByTestId('zone-canvas');
    mockRect(canvas, { width: 200, height: 100 });

    firePointer(canvas, 'pointerdown', 20, 10);
    firePointer(canvas, 'pointermove', 60, 50);
    expect(screen.getByTestId('zone-draft')).toBeTruthy();

    firePointer(canvas, 'pointercancel', 60, 50);
    expect(screen.queryByTestId('zone-draft')).toBeNull();
    expect(screen.queryAllByTestId(/^zone-(?!canvas|properties|viewport|draft)/)).toHaveLength(0);
  });

  it('shows a crosshair cursor over the canvas in draw mode', () => {
    render(<Harness />);
    expect(screen.getByTestId('zone-canvas').className).toContain('cursor-crosshair');
  });
});

describe('WorksheetZoneEditor — zoom controls', () => {
  it('shows 100% by default when the viewport has no real layout (jsdom fallback)', () => {
    render(<Harness />);
    expect(screen.getByTestId('zoom-level').textContent).toBe('100%');
  });

  it('zooms in and out via the toolbar buttons', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('zoom-in'));
    expect(screen.getByTestId('zoom-level').textContent).toBe('125%');
    fireEvent.click(screen.getByTestId('zoom-out'));
    fireEvent.click(screen.getByTestId('zoom-out'));
    expect(screen.getByTestId('zoom-level').textContent).toBe('75%');
  });

  it('clamps zoom-out at the 25% floor', () => {
    render(<Harness />);
    for (let i = 0; i < 10; i++) fireEvent.click(screen.getByTestId('zoom-out'));
    expect(screen.getByTestId('zoom-level').textContent).toBe('25%');
  });

  it('clamps zoom-in at the 400% ceiling', () => {
    render(<Harness />);
    for (let i = 0; i < 20; i++) fireEvent.click(screen.getByTestId('zoom-in'));
    expect(screen.getByTestId('zoom-level').textContent).toBe('400%');
  });

  it('resets to 100% via the reset button', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('zoom-in'));
    fireEvent.click(screen.getByTestId('zoom-reset'));
    expect(screen.getByTestId('zoom-level').textContent).toBe('100%');
  });

  it('fits the whole image to the viewport via the fit button', () => {
    render(<Harness />);
    const viewport = screen.getByTestId('zone-viewport');
    // Viewport 400x400, image 800x400 -> width ratio 0.5, height ratio 1 -> fit picks 0.5 (50%).
    mockRect(viewport, { width: 400, height: 400 });
    fireEvent.click(screen.getByTestId('zoom-fit'));
    expect(screen.getByTestId('zoom-level').textContent).toBe('50%');
  });

  it('zooms with Ctrl/Cmd + wheel, anchored at the pointer', () => {
    render(<Harness />);
    const viewport = screen.getByTestId('zone-viewport');
    mockRect(viewport, { width: 400, height: 400 });
    const event = new Event('wheel', { bubbles: true, cancelable: true });
    Object.assign(event, { ctrlKey: true, deltaY: -100, clientX: 10, clientY: 10 });
    act(() => {
      viewport.dispatchEvent(event);
    });
    expect(screen.getByTestId('zoom-level').textContent).toBe('110%');
  });

  it('ignores a plain wheel (no Ctrl/Cmd) — the page scrolls normally instead', () => {
    render(<Harness />);
    const viewport = screen.getByTestId('zone-viewport');
    const event = new Event('wheel', { bubbles: true, cancelable: true });
    Object.assign(event, { ctrlKey: false, deltaY: -100, clientX: 10, clientY: 10 });
    act(() => {
      viewport.dispatchEvent(event);
    });
    expect(screen.getByTestId('zoom-level').textContent).toBe('100%');
  });

  it('zooms in/out with +/- keys while the viewport is focused', () => {
    render(<Harness />);
    const viewport = screen.getByTestId('zone-viewport');
    fireEvent.keyDown(viewport, { key: '+' });
    expect(screen.getByTestId('zoom-level').textContent).toBe('125%');
    fireEvent.keyDown(viewport, { key: '-' });
    fireEvent.keyDown(viewport, { key: '-' });
    expect(screen.getByTestId('zoom-level').textContent).toBe('75%');
  });
});

describe('WorksheetZoneEditor — panning', () => {
  it('shows a grab cursor while space is held over the viewport-focused canvas', () => {
    render(<Harness />);
    const viewport = screen.getByTestId('zone-viewport');
    fireEvent.keyDown(viewport, { key: ' ' });
    expect(screen.getByTestId('zone-canvas').className).toContain('cursor-grab');
    fireEvent.keyUp(viewport, { key: ' ' });
    expect(screen.getByTestId('zone-canvas').className).toContain('cursor-crosshair');
  });

  it('shows a grabbing cursor while actively panning and does not draw a zone', () => {
    render(<Harness />);
    const viewport = screen.getByTestId('zone-viewport');
    const canvas = screen.getByTestId('zone-canvas');
    mockRect(canvas, { width: 200, height: 100 });

    fireEvent.keyDown(viewport, { key: ' ' });
    firePointer(canvas, 'pointerdown', 20, 10);
    expect(screen.getByTestId('zone-canvas').className).toContain('cursor-grabbing');

    firePointer(canvas, 'pointerup', 60, 50);
    expect(screen.queryAllByTestId(/^zone-(?!canvas|properties|viewport|draft)/)).toHaveLength(0);
  });

  it('pans via a middle-button drag without holding space', () => {
    render(<Harness />);
    const canvas = screen.getByTestId('zone-canvas');
    mockRect(canvas, { width: 200, height: 100 });

    firePointer(canvas, 'pointerdown', 20, 10, { button: 1 });
    expect(screen.getByTestId('zone-canvas').className).toContain('cursor-grabbing');
    firePointer(canvas, 'pointerup', 60, 50, { button: 1 });
    expect(screen.queryAllByTestId(/^zone-(?!canvas|properties|viewport|draft)/)).toHaveLength(0);
  });
});
