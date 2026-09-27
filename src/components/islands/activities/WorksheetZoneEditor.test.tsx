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

describe('WorksheetZoneEditor — rendering', () => {
  it('renders the image and no zones initially', () => {
    render(<Harness />);
    expect(screen.getByTestId('worksheet-zone-editor')).toBeTruthy();
    expect(screen.getByTestId('zone-canvas').querySelector('img')).toBeTruthy();
    expect(screen.queryByTestId('zone-properties-panel')).toBeNull();
  });

  it('renders an existing zone positioned by its fractional rect', () => {
    const zone: Zone = { id: 'z1', x: 0.25, y: 0.1, w: 0.2, h: 0.15, kind: 'text', answers: ['sat'] };
    render(<Harness initialZones={[zone]} />);
    const el = screen.getByTestId('zone-z1');
    expect(el.style.left).toBe('25%');
    expect(el.style.top).toBe('10%');
  });
});

describe('WorksheetZoneEditor — add / select / delete', () => {
  it('adds a default zone via the accessible button and selects it', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('add-zone'));
    const zones = screen.getAllByTestId(/^zone-(?!canvas|properties)/);
    expect(zones).toHaveLength(1);
    expect(screen.getByTestId('zone-properties-panel')).toBeTruthy();
  });

  it('selecting a zone opens the properties panel; deselecting closes it', () => {
    const zone: Zone = { id: 'z1', x: 0.1, y: 0.1, w: 0.2, h: 0.1, kind: 'text', answers: ['x'] };
    render(<Harness initialZones={[zone]} />);
    fireEvent.pointerDown(screen.getByTestId('zone-z1'));
    expect(screen.getByTestId('zone-properties-panel')).toBeTruthy();
  });

  it('deletes the selected zone via the panel delete button', () => {
    const zone: Zone = { id: 'z1', x: 0.1, y: 0.1, w: 0.2, h: 0.1, kind: 'text', answers: ['x'] };
    render(<Harness initialZones={[zone]} initialSelected="z1" />);
    fireEvent.click(screen.getByTestId('delete-zone'));
    expect(screen.queryByTestId('zone-z1')).toBeNull();
    expect(screen.queryByTestId('zone-properties-panel')).toBeNull();
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
function firePointer(el: Element, type: 'pointerdown' | 'pointerup', clientX: number, clientY: number) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { clientX, clientY, pointerId: 1, button: 0 });
  act(() => {
    el.dispatchEvent(event);
  });
}

describe('WorksheetZoneEditor — pointer draw (mocked layout)', () => {
  it('draws a new zone from a pointer drag, using the real container size', () => {
    render(<Harness />);
    const canvas = screen.getByTestId('zone-canvas');
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 200,
      height: 100,
      right: 200,
      bottom: 100,
      x: 0,
      y: 0,
      toJSON() {
        return {};
      },
    });

    firePointer(canvas, 'pointerdown', 20, 10);
    firePointer(canvas, 'pointerup', 60, 50);

    const zones = screen.getAllByTestId(/^zone-(?!canvas|properties)/);
    expect(zones).toHaveLength(1);
    expect(zones[0].style.left).toBe('10%');
    expect(zones[0].style.top).toBe('10%');
    expect(zones[0].style.width).toBe('20%');
    expect(zones[0].style.height).toBe('40%');
  });
});
