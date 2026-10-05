// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useState } from 'react';
import WorksheetZoneEditor from './WorksheetZoneEditor';
import type { Zone } from '@/lib/activities/blocks';
import { anchoredZoom, type Camera } from '@/lib/activities/canvasViewport';

const IMAGE = { path: 'activity-uploads/u1/img.webp', width: 800, height: 400 };
const SSR_ZONE: Zone = { id: 'z1', x: 0.1, y: 0.1, w: 0.2, h: 0.1, kind: 'text', answers: ['x'] };

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  // Restores every `vi.spyOn` too — load-bearing for the
  // `HTMLElement.prototype.getBoundingClientRect` PROTOTYPE-level spy one
  // test below uses (it must run before `render()`, so it can't be scoped
  // to one already-rendered element like `mockRect` below does): without
  // this it would otherwise leak into every later test in this file, since
  // `cleanup()` only unmounts components, it does not restore spies.
  vi.restoreAllMocks();
});

/**
 * The editable zoom % input's current value, formatted like the old
 * read-only `zoom-level` span it replaced (canvas tools pass) — e.g.
 * `"100%"` — so every existing assertion below keeps reading the same way.
 */
function zoomLevel(): string {
  return `${(screen.getByTestId('zoom-input') as HTMLInputElement).value}%`;
}

/**
 * The content layer's (`zone-canvas`) own camera transform — canvas camera
 * pass: panning/zooming is a CSS `transform: translate(x, y) scale(scale)`
 * now, never native `scrollLeft`/`scrollTop`. Every pan/zoom-position
 * assertion below reads THIS instead.
 */
function cameraTransform(): string {
  return screen.getByTestId('zone-canvas').style.transform;
}

/**
 * Wheel-zoom is now batched behind ONE `requestAnimationFrame` per frame
 * (canvas tools pass — see `WorksheetZoneEditor.tsx`'s own wheel effect):
 * every wheel test needs this so its accumulated delta flushes
 * synchronously instead of on a real animation frame `fireEvent` never waits
 * for. `afterEach`'s `vi.unstubAllGlobals()` cleans it up automatically.
 */
function stubSyncRaf() {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
}

/**
 * A `requestAnimationFrame` stub that QUEUES its callback instead of firing
 * it immediately (unlike {@link stubSyncRaf}) — needed to actually observe
 * batching: dispatch several wheel events while nothing has flushed yet,
 * THEN call `flush()` once, so the assertion can tell "one accumulated
 * delta applied once" apart from "N deltas each applied immediately".
 */
function stubQueuedRaf() {
  const callbacks: FrameRequestCallback[] = [];
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    callbacks.push(cb);
    return callbacks.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  return {
    flush() {
      const pending = callbacks.splice(0, callbacks.length);
      pending.forEach((cb) => cb(0));
    },
  };
}

/**
 * A controllable `ResizeObserver` stub (jsdom has none — see this file's own
 * header, and `WorksheetPlayer.tsx`'s identical guard/precedent): captures
 * every constructed instance's callback so a test can invoke it directly,
 * simulating the viewport's box actually changing size from flex layout
 * alone (no window `resize` event involved at all).
 */
class MockResizeObserver {
  static instances: MockResizeObserver[] = [];
  callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    MockResizeObserver.instances.push(this);
  }
  observe() {}
  unobserve() {}
  disconnect() {}
  /** Simulates the observed element's box changing size. */
  fire() {
    this.callback([], this as unknown as ResizeObserver);
  }
}

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

  it('fades the canvas image in once it loads (coherent loading states, item 6)', () => {
    render(<Harness />);
    const img = screen.getByTestId('zone-canvas').querySelector('img') as HTMLImageElement;
    expect(img.className).toContain('opacity-0');
    fireEvent.load(img);
    expect(img.className).toContain('opacity-100');
  });

  it('shows a neutral broken-image placeholder instead of the browser glyph on error', () => {
    render(<Harness />);
    const img = screen.getByTestId('zone-canvas').querySelector('img') as HTMLImageElement;
    fireEvent.error(img);
    expect(screen.getByTestId('zone-canvas-image-broken')).toBeTruthy();
    expect(screen.getByTestId('zone-canvas').querySelector('img')).toBeNull();
  });

  it('renders an existing zone positioned by its fractional rect', () => {
    const zone: Zone = { id: 'z1', x: 0.25, y: 0.1, w: 0.2, h: 0.15, kind: 'text', answers: ['sat'] };
    render(<Harness initialZones={[zone]} />);
    const el = screen.getByTestId('zone-z1');
    expect(el.style.left).toBe('25%');
    expect(el.style.top).toBe('10%');
  });

  // "Fill the empty space" pass (owner feedback #2): the "Dibujar un
  // recuadro…"/no-zones hint used to be its own extra row UNDER the canvas —
  // real height the canvas `flex-1` viewport never got back. It now lives
  // INSIDE the zoom toolbar's own row instead, adding no height of its own.
  it('folds the canvas hint into the zoom toolbar row instead of its own row under the canvas', () => {
    render(<Harness />);
    const toolbar = screen.getByTestId('zoom-toolbar');
    const hint = screen.getByTestId('worksheet-canvas-hint');
    expect(toolbar.contains(hint)).toBe(true);
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
  it('draws a zone via a pointer drag with the Zona tool (default) and selects it', () => {
    // Canvas tools pass: the old accessible "+ Zona" button is gone — the
    // Zona tool (default) now owns zone creation, via a plain left-drag.
    render(<Harness />);
    const canvas = screen.getByTestId('zone-canvas');
    mockRect(canvas, { width: 200, height: 100 });

    firePointer(canvas, 'pointerdown', 20, 10);
    firePointer(canvas, 'pointerup', 60, 50);

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

/** D4 "Escuchar/Listen" — the optional per-zone speak text field. */
describe('WorksheetZoneEditor — speak text (D4)', () => {
  it('starts empty for a zone with no speak text', () => {
    const zone: Zone = { id: 'z1', x: 0.1, y: 0.1, w: 0.2, h: 0.1, kind: 'text', answers: ['x'] };
    render(<Harness initialZones={[zone]} initialSelected="z1" />);
    const input = screen.getByTestId('zone-properties-speak-input') as HTMLInputElement;
    expect(input.value).toBe('');
  });

  it('shows an already-authored speak text', () => {
    const zone: Zone = {
      id: 'z1',
      x: 0.1,
      y: 0.1,
      w: 0.2,
      h: 0.1,
      kind: 'text',
      answers: ['x'],
      speak: 'The cat sat.',
    };
    render(<Harness initialZones={[zone]} initialSelected="z1" />);
    const input = screen.getByTestId('zone-properties-speak-input') as HTMLInputElement;
    expect(input.value).toBe('The cat sat.');
  });

  it('types a speak text and keeps it on the zone', () => {
    const zone: Zone = { id: 'z1', x: 0.1, y: 0.1, w: 0.2, h: 0.1, kind: 'text', answers: ['x'] };
    render(<Harness initialZones={[zone]} initialSelected="z1" />);
    const input = screen.getByTestId('zone-properties-speak-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'The cat sat.' } });
    expect(input.value).toBe('The cat sat.');
  });

  it('clearing the field back to blank drops the speak text entirely', () => {
    const zone: Zone = {
      id: 'z1',
      x: 0.1,
      y: 0.1,
      w: 0.2,
      h: 0.1,
      kind: 'text',
      answers: ['x'],
      speak: 'The cat sat.',
    };
    render(<Harness initialZones={[zone]} initialSelected="z1" />);
    const input = screen.getByTestId('zone-properties-speak-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '   ' } });
    expect(input.value).toBe('');
  });

  it('survives a text -> choice -> text kind switch', () => {
    const zone: Zone = {
      id: 'z1',
      x: 0.1,
      y: 0.1,
      w: 0.2,
      h: 0.1,
      kind: 'text',
      answers: ['x'],
      speak: 'The cat sat.',
    };
    render(<Harness initialZones={[zone]} initialSelected="z1" />);
    fireEvent.click(screen.getByText('Opción'));
    expect((screen.getByTestId('zone-properties-speak-input') as HTMLInputElement).value).toBe('The cat sat.');
    fireEvent.click(screen.getByText('Texto'));
    expect((screen.getByTestId('zone-properties-speak-input') as HTMLInputElement).value).toBe('The cat sat.');
  });
});

/** D5 "¿Por qué?" — the optional per-zone explanation field, under the answers. */
describe('WorksheetZoneEditor — explanation text (D5)', () => {
  it('starts empty for a zone with no explanation', () => {
    const zone: Zone = { id: 'z1', x: 0.1, y: 0.1, w: 0.2, h: 0.1, kind: 'text', answers: ['x'] };
    render(<Harness initialZones={[zone]} initialSelected="z1" />);
    const input = screen.getByTestId('zone-properties-explanation-input') as HTMLTextAreaElement;
    expect(input.value).toBe('');
  });

  it('shows an already-authored explanation', () => {
    const zone: Zone = {
      id: 'z1',
      x: 0.1,
      y: 0.1,
      w: 0.2,
      h: 0.1,
      kind: 'text',
      answers: ['x'],
      explanation: 'Because "cat" is the animal.',
    };
    render(<Harness initialZones={[zone]} initialSelected="z1" />);
    const input = screen.getByTestId('zone-properties-explanation-input') as HTMLTextAreaElement;
    expect(input.value).toBe('Because "cat" is the animal.');
  });

  it('types an explanation and keeps it on the zone', () => {
    const zone: Zone = { id: 'z1', x: 0.1, y: 0.1, w: 0.2, h: 0.1, kind: 'text', answers: ['x'] };
    render(<Harness initialZones={[zone]} initialSelected="z1" />);
    const input = screen.getByTestId('zone-properties-explanation-input') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'Because "cat" is the animal.' } });
    expect(input.value).toBe('Because "cat" is the animal.');
  });

  it('clearing the field back to blank drops the explanation entirely', () => {
    const zone: Zone = {
      id: 'z1',
      x: 0.1,
      y: 0.1,
      w: 0.2,
      h: 0.1,
      kind: 'text',
      answers: ['x'],
      explanation: 'Because "cat" is the animal.',
    };
    render(<Harness initialZones={[zone]} initialSelected="z1" />);
    const input = screen.getByTestId('zone-properties-explanation-input') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: '   ' } });
    expect(input.value).toBe('');
  });

  it('renders the field under the answers section for a choice zone too', () => {
    const zone: Zone = {
      id: 'z1',
      x: 0.1,
      y: 0.1,
      w: 0.2,
      h: 0.1,
      kind: 'choice',
      answers: ['a'],
      options: ['a', 'b'],
      explanation: 'Because "a" is correct.',
    };
    render(<Harness initialZones={[zone]} initialSelected="z1" />);
    const input = screen.getByTestId('zone-properties-explanation-input') as HTMLTextAreaElement;
    expect(input.value).toBe('Because "a" is correct.');
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
    const checkboxes = screen.getAllByLabelText('Correcta');
    expect(checkboxes).toHaveLength(2);
  });

  // The design-system Checkbox (PR 1) is a Radix `role="checkbox"` button,
  // not a native `<input type="checkbox">` — it reports state via
  // `aria-checked`, not the DOM `.checked` property (same rule
  // `radio-group.tsx`'s own header documents for its radio items).
  it('checking an option marks it correct (adds it to answers)', () => {
    render(<Harness initialZones={[CHOICE_ZONE]} initialSelected="z1" />);
    const checkboxes = screen.getAllByLabelText('Correcta');
    expect(checkboxes[0].getAttribute('aria-checked')).toBe('false');
    fireEvent.click(checkboxes[0]);
    expect(checkboxes[0].getAttribute('aria-checked')).toBe('true');
  });

  it('unchecking the only correct option removes it from answers', () => {
    render(<Harness initialZones={[CHOICE_ZONE]} initialSelected="z1" />);
    const checkboxes = screen.getAllByLabelText('Correcta');
    expect(checkboxes[1].getAttribute('aria-checked')).toBe('true'); // "b" is the seeded answer
    fireEvent.click(checkboxes[1]);
    expect(checkboxes[1].getAttribute('aria-checked')).toBe('false');
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

describe('WorksheetZoneEditor — pointer draw (mocked layout)', () => {
  // Canvas camera pass: drawing/moving/resizing math now goes through
  // `screenToContentPoint` against the content layer's own NATIVE (unscaled)
  // size — always `displaySize` (IMAGE's 800x400 here, unrotated), never a
  // mockable "current canvas box" the way the old scroll-based viewport's
  // (zoom-dependent) `getBoundingClientRect()` was. With the viewport's own
  // rect unmocked (jsdom defaults every `getBoundingClientRect()` to zeros —
  // see this file's own header), the mount effect's `fitCamera` computes the
  // identity camera (`scale: 1, x: 0, y: 0`, since a zero-sized viewport
  // makes `fitZoom` fall back to 100% and `clampCamera` clamps the offset
  // back to 0) — so a raw `clientX/Y` maps 1:1 onto content pixels, and
  // fractions are plain `clientX/Y / 800` or `/ 400`.
  it('draws a new zone from a pointer drag, against the image\'s own native pixel size', () => {
    render(<Harness />);
    const canvas = screen.getByTestId('zone-canvas');

    firePointer(canvas, 'pointerdown', 20, 10);
    firePointer(canvas, 'pointerup', 60, 50);

    const zones = screen.getAllByTestId(/^zone-(?!canvas|properties|viewport|draft)/);
    expect(zones).toHaveLength(1);
    expect(zones[0].style.left).toBe('2.5%'); // 20 / 800
    expect(zones[0].style.top).toBe('2.5%'); // 10 / 400
    expect(zones[0].style.width).toBe('5%'); // (60 - 20) / 800
    expect(zones[0].style.height).toBe('10%'); // (50 - 10) / 400
  });

  it('renders a live dashed rubber-band rectangle from pointerdown to pointerup, then removes it', () => {
    render(<Harness />);
    const canvas = screen.getByTestId('zone-canvas');

    firePointer(canvas, 'pointerdown', 20, 10);
    expect(screen.queryByTestId('zone-draft')).toBeNull();

    firePointer(canvas, 'pointermove', 60, 50);
    const draft = screen.getByTestId('zone-draft');
    expect(draft.style.left).toBe('2.5%');
    expect(draft.style.top).toBe('2.5%');
    expect(draft.style.width).toBe('5%');
    expect(draft.style.height).toBe('10%');

    firePointer(canvas, 'pointerup', 60, 50);
    expect(screen.queryByTestId('zone-draft')).toBeNull();
  });

  it('updates the draft rectangle continuously as the pointer keeps moving', () => {
    render(<Harness />);
    const canvas = screen.getByTestId('zone-canvas');

    firePointer(canvas, 'pointerdown', 0, 0);
    firePointer(canvas, 'pointermove', 40, 20);
    expect(screen.getByTestId('zone-draft').style.width).toBe('5%'); // 40 / 800

    firePointer(canvas, 'pointermove', 100, 50);
    expect(screen.getByTestId('zone-draft').style.width).toBe('12.5%'); // 100 / 800
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

describe('WorksheetZoneEditor — two-finger touch pinch/pan (mobile layout pass)', () => {
  const IDENTITY_CAMERA: Camera = { scale: 1, x: 0, y: 0 };

  it('`touch-action: none` lives on the viewport only, not the content layer', () => {
    render(<Harness />);
    expect(screen.getByTestId('zone-viewport').className).toContain('touch-none');
    expect(screen.getByTestId('zone-canvas').className).not.toContain('touch-none');
  });

  it('a lone touch finger still draws a zone, unaffected (one finger === the existing mouse behavior)', () => {
    render(<Harness />);
    const canvas = screen.getByTestId('zone-canvas');
    firePointer(canvas, 'pointerdown', 20, 10, { pointerId: 1, pointerType: 'touch' });
    firePointer(canvas, 'pointerup', 60, 50, { pointerId: 1, pointerType: 'touch' });
    expect(screen.getAllByTestId(/^zone-(?!canvas|properties|viewport|draft)/)).toHaveLength(1);
  });

  it('a second touch finger cancels an in-progress draw WITHOUT committing a zone (no history entry)', () => {
    render(<Harness />);
    const canvas = screen.getByTestId('zone-canvas');

    firePointer(canvas, 'pointerdown', 20, 10, { pointerId: 1, pointerType: 'touch' });
    firePointer(canvas, 'pointermove', 60, 50, { pointerId: 1, pointerType: 'touch' });
    expect(screen.getByTestId('zone-draft')).toBeTruthy();

    firePointer(canvas, 'pointerdown', 100, 10, { pointerId: 2, pointerType: 'touch' });
    expect(screen.queryByTestId('zone-draft')).toBeNull();

    firePointer(canvas, 'pointerup', 100, 10, { pointerId: 2, pointerType: 'touch' });
    firePointer(canvas, 'pointerup', 60, 50, { pointerId: 1, pointerType: 'touch' });
    expect(screen.queryAllByTestId(/^zone-(?!canvas|properties|viewport|draft)/)).toHaveLength(0);
  });

  it('pinching with two touch fingers updates the camera transform via the exact `anchoredZoom` math', () => {
    render(<Harness />);
    const canvas = screen.getByTestId('zone-canvas');
    const viewport = screen.getByTestId('zone-viewport');
    // Mounted over an unmocked (0x0) viewport, so the mount-time fit camera
    // falls back to the identity camera — see this file's own header on the
    // "pointer draw (mocked layout)" describe block above. Mocked here
    // (post-mount, like every other camera test in this file) only for
    // `viewportSize()` reads made DURING the pinch itself.
    mockRect(viewport, { width: 400, height: 400 });

    firePointer(canvas, 'pointerdown', 100, 100, { pointerId: 1, pointerType: 'touch' });
    firePointer(canvas, 'pointerdown', 200, 100, { pointerId: 2, pointerType: 'touch' }); // distance 100, midpoint (150,100)
    firePointer(canvas, 'pointermove', 300, 100, { pointerId: 2, pointerType: 'touch' }); // distance doubles to 200, midpoint (200,100)

    const expected = anchoredZoom(
      IDENTITY_CAMERA,
      2, // clampZoomInput(1 * 200/100)
      { x: 150, y: 100 },
      { x: 200, y: 100 },
      { image: { width: 800, height: 400 }, viewport: { width: 400, height: 400 } },
    );
    expect(screen.getByTestId('zone-canvas').style.transform).toBe(
      `translate(${expected.x}px, ${expected.y}px) scale(${expected.scale})`,
    );
  });

  it('lifting to one finger does nothing — the remaining finger neither pans nor starts a new draw', () => {
    render(<Harness />);
    const canvas = screen.getByTestId('zone-canvas');

    firePointer(canvas, 'pointerdown', 100, 100, { pointerId: 1, pointerType: 'touch' });
    firePointer(canvas, 'pointerdown', 200, 100, { pointerId: 2, pointerType: 'touch' });
    firePointer(canvas, 'pointerup', 200, 100, { pointerId: 2, pointerType: 'touch' });

    const cameraBefore = screen.getByTestId('zone-canvas').style.transform;
    firePointer(canvas, 'pointermove', 999, 999, { pointerId: 1, pointerType: 'touch' });
    expect(screen.getByTestId('zone-canvas').style.transform).toBe(cameraBefore);
    expect(screen.queryByTestId('zone-draft')).toBeNull();

    firePointer(canvas, 'pointerup', 999, 999, { pointerId: 1, pointerType: 'touch' });
    expect(screen.queryAllByTestId(/^zone-(?!canvas|properties|viewport|draft)/)).toHaveLength(0);
  });

  it('once every finger is up, the next touch starts a genuinely new single-finger draw', () => {
    render(<Harness />);
    const canvas = screen.getByTestId('zone-canvas');

    firePointer(canvas, 'pointerdown', 100, 100, { pointerId: 1, pointerType: 'touch' });
    firePointer(canvas, 'pointerdown', 200, 100, { pointerId: 2, pointerType: 'touch' });
    firePointer(canvas, 'pointerup', 200, 100, { pointerId: 2, pointerType: 'touch' });
    firePointer(canvas, 'pointerup', 100, 100, { pointerId: 1, pointerType: 'touch' });

    firePointer(canvas, 'pointerdown', 20, 10, { pointerId: 3, pointerType: 'touch' });
    firePointer(canvas, 'pointerup', 60, 50, { pointerId: 3, pointerType: 'touch' });
    expect(screen.getAllByTestId(/^zone-(?!canvas|properties|viewport|draft)/)).toHaveLength(1);
  });

  it('a second MOUSE pointer (not touch) never cancels or interferes with an in-progress draw', () => {
    render(<Harness />);
    const canvas = screen.getByTestId('zone-canvas');
    firePointer(canvas, 'pointerdown', 20, 10, { pointerId: 1 }); // default pointerType is not 'touch'
    firePointer(canvas, 'pointermove', 60, 50, { pointerId: 1 });
    expect(screen.getByTestId('zone-draft')).toBeTruthy();

    firePointer(canvas, 'pointerup', 60, 50, { pointerId: 1 });
    expect(screen.getAllByTestId(/^zone-(?!canvas|properties|viewport|draft)/)).toHaveLength(1);
  });
});

describe('WorksheetZoneEditor — camera coordinate conversion at scale != 1 with a non-zero offset (canvas camera pass regression check)', () => {
  it('draws a zone at the correct fraction through a scaled, offset camera', () => {
    render(<Harness />);
    const viewport = screen.getByTestId('zone-viewport');
    const canvas = screen.getByTestId('zone-canvas');
    mockRect(viewport, { width: 300, height: 200 });

    // Zoom in once: scale 1 -> 1.25, anchored at the (now-mocked) viewport's
    // own center (150, 100). zoomAt keeps that content point fixed:
    // contentX = (150-0)/1 = 150, contentY = 100; next.x = 150 - 150*1.25 =
    // -37.5, next.y = 100 - 100*1.25 = -25. Both stay unclamped (content
    // 1000x500 is bigger than the 300x200 viewport on both axes, range
    // [-700, 0] / [-300, 0]).
    fireEvent.click(screen.getByTestId('zoom-in'));
    expect(zoomLevel()).toBe('125%');

    // content = (screen - camera.xy) / scale:
    // pointerdown (100,100) -> ((100+37.5)/1.25, (100+25)/1.25) = (110, 100).
    // pointerup (350,350) -> ((350+37.5)/1.25, (350+25)/1.25) = (310, 300).
    firePointer(canvas, 'pointerdown', 100, 100);
    firePointer(canvas, 'pointerup', 350, 350);

    const zones = screen.getAllByTestId(/^zone-(?!canvas|properties|viewport|draft)/);
    expect(zones).toHaveLength(1);
    // `toBeCloseTo` (not exact string equality): floating-point division
    // through the camera (`/1.25`) can land a few ULPs off a clean decimal.
    expect(parseFloat(zones[0].style.left)).toBeCloseTo(13.75); // 110 / 800
    expect(parseFloat(zones[0].style.top)).toBeCloseTo(25); // 100 / 400
    expect(parseFloat(zones[0].style.width)).toBeCloseTo(25); // (310 - 110) / 800
    expect(parseFloat(zones[0].style.height)).toBeCloseTo(50); // (300 - 100) / 400
  });

  it('moves an existing zone by the correct fraction through the same scaled, offset camera', () => {
    // A zone move is now batched behind ONE `requestAnimationFrame` per frame
    // (canvas tools pass — see `WorksheetZoneEditor.tsx`'s own Performance
    // note): this single pointermove needs it flushed synchronously, same as
    // the wheel-zoom tests above.
    stubSyncRaf();
    const zone: Zone = { id: 'z1', x: 0.1, y: 0.1, w: 0.2, h: 0.1, kind: 'text', answers: ['x'] };
    render(<Harness initialZones={[zone]} />);
    const viewport = screen.getByTestId('zone-viewport');
    mockRect(viewport, { width: 300, height: 200 });
    fireEvent.click(screen.getByTestId('zoom-in')); // same camera as above: scale 1.25, offset (-37.5, -25)
    expect(zoomLevel()).toBe('125%');

    const zoneEl = screen.getByTestId('zone-z1');
    // content start (100,100) -> (110, 100); content end (150,120) ->
    // ((150+37.5)/1.25, (120+25)/1.25) = (150, 116).
    // dx = (150-110)/800 = 0.05; dy = (116-100)/400 = 0.04.
    firePointer(zoneEl, 'pointerdown', 100, 100);
    firePointer(zoneEl, 'pointermove', 150, 120);

    expect(parseFloat(zoneEl.style.left)).toBeCloseTo(15); // 0.1 + 0.05
    expect(parseFloat(zoneEl.style.top)).toBeCloseTo(14); // 0.1 + 0.04
  });
});

describe('WorksheetZoneEditor — zoom controls', () => {
  it('shows 100% by default when the viewport has no real layout (jsdom fallback)', () => {
    render(<Harness />);
    expect(zoomLevel()).toBe('100%');
  });

  it('zooms in and out via the toolbar buttons', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('zoom-in'));
    expect(zoomLevel()).toBe('125%');
    fireEvent.click(screen.getByTestId('zoom-out'));
    fireEvent.click(screen.getByTestId('zoom-out'));
    expect(zoomLevel()).toBe('75%');
  });

  it('clamps zoom-out at the unified 10% floor (canvas camera pass: same floor as the editable % input, not the narrower 25%)', () => {
    render(<Harness />);
    for (let i = 0; i < 10; i++) fireEvent.click(screen.getByTestId('zoom-out'));
    expect(zoomLevel()).toBe('10%');
  });

  it('clamps zoom-in at the 400% ceiling', () => {
    render(<Harness />);
    for (let i = 0; i < 20; i++) fireEvent.click(screen.getByTestId('zoom-in'));
    expect(zoomLevel()).toBe('400%');
  });

  it('does not render the old 25/50/100/125 preset buttons or the "+ Zona" button', () => {
    // Canvas tools pass: both are REMOVED — the toolbar is now −/[%]/+ ·
    // Ajustar · the Zona/Mano tool toggle.
    render(<Harness />);
    for (const preset of [25, 50, 100, 125]) {
      expect(screen.queryByTestId(`zoom-preset-${preset}`)).toBeNull();
    }
    expect(screen.queryByTestId('add-zone')).toBeNull();
  });

  it('fits the whole image to the viewport via the fit button', () => {
    render(<Harness />);
    const viewport = screen.getByTestId('zone-viewport');
    // Viewport 400x400, image 800x400 -> width ratio 0.5, height ratio 1 -> fit picks 0.5 (50%).
    mockRect(viewport, { width: 400, height: 400 });
    fireEvent.click(screen.getByTestId('zoom-fit'));
    expect(zoomLevel()).toBe('50%');
  });

  it('fits synchronously on MOUNT, without needing a ResizeObserver callback or a manual click (fit bug fix)', () => {
    // Regression test pinning down the ACTUAL root cause: the old code only
    // computed fit INSIDE `ResizeObserver`'s own callback — and jsdom has no
    // `ResizeObserver` at all (see this file's own `MockResizeObserver`
    // elsewhere), so the old effect's guard bailed out immediately and fit
    // was NEVER computed on mount here, regardless of the viewport's actual
    // size — a fresh mount (`BlockList.tsx` mounts this component fresh
    // every time its block opens) stayed stuck at the hardcoded 100%
    // default. Stubbing every element's rect BEFORE mount (jsdom has no
    // real layout, so this is the only way to give the viewport a non-zero
    // size at mount time) and asserting the fit is already correct right
    // after `render()` — no explicit observer fire, no click — is exactly
    // what would have failed before the `useLayoutEffect` fix.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 400,
      height: 400,
      right: 400,
      bottom: 400,
      x: 0,
      y: 0,
      toJSON() {
        return {};
      },
    });
    render(<Harness />);
    // Viewport 400x400, image 800x400 -> width ratio 0.5, height ratio 1 -> fit picks 0.5 (50%).
    expect(zoomLevel()).toBe('50%');
  });

  it('zooms via a plain wheel over the canvas (owner-approved design: no Ctrl/⌘ required)', () => {
    stubSyncRaf();
    render(<Harness />);
    const viewport = screen.getByTestId('zone-viewport');
    mockRect(viewport, { width: 400, height: 400 });
    const event = new Event('wheel', { bubbles: true, cancelable: true });
    Object.assign(event, { deltaY: -100, clientX: 10, clientY: 10 });
    act(() => {
      viewport.dispatchEvent(event);
    });
    // wheelZoom(1, -100) = 1 + clamp(100 * 0.0015 * 1, -0.5, 0.5) = 1.15.
    expect(zoomLevel()).toBe('115%');
  });

  it('zooms with Ctrl/Cmd + wheel too (just another wheel event, no special-casing)', () => {
    stubSyncRaf();
    render(<Harness />);
    const viewport = screen.getByTestId('zone-viewport');
    mockRect(viewport, { width: 400, height: 400 });
    const event = new Event('wheel', { bubbles: true, cancelable: true });
    Object.assign(event, { ctrlKey: true, deltaY: -100, clientX: 10, clientY: 10 });
    act(() => {
      viewport.dispatchEvent(event);
    });
    expect(zoomLevel()).toBe('115%');
  });

  it('prevents the default wheel action over the canvas (page/block-list must not also scroll)', () => {
    stubSyncRaf();
    render(<Harness />);
    const viewport = screen.getByTestId('zone-viewport');
    mockRect(viewport, { width: 400, height: 400 });
    const event = new Event('wheel', { bubbles: true, cancelable: true });
    Object.assign(event, { deltaY: -100, clientX: 10, clientY: 10 });
    act(() => {
      viewport.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
  });

  it('does NOT zoom or prevent default for a wheel outside the canvas viewport', () => {
    stubSyncRaf();
    render(<Harness />);
    // Dispatched on `document` — never reaches the viewport's own listener,
    // which is attached to that element specifically, not delegated.
    const event = new Event('wheel', { bubbles: true, cancelable: true });
    Object.assign(event, { deltaY: -100, clientX: 10, clientY: 10 });
    act(() => {
      document.dispatchEvent(event);
    });
    expect(zoomLevel()).toBe('100%');
    expect(event.defaultPrevented).toBe(false);
  });

  it('batches several wheel events within the same frame into ONE zoom update', () => {
    const raf = stubQueuedRaf();
    render(<Harness />);
    const viewport = screen.getByTestId('zone-viewport');
    mockRect(viewport, { width: 400, height: 400 });
    const event1 = new Event('wheel', { bubbles: true, cancelable: true });
    Object.assign(event1, { deltaY: -50, clientX: 10, clientY: 10 });
    const event2 = new Event('wheel', { bubbles: true, cancelable: true });
    Object.assign(event2, { deltaY: -50, clientX: 10, clientY: 10 });
    act(() => {
      viewport.dispatchEvent(event1);
      viewport.dispatchEvent(event2);
    });
    // Neither event has been flushed to a zoom change yet — only ONE
    // animation frame was scheduled for both (the second event's own
    // `requestAnimationFrame` call is skipped, since one is already pending).
    expect(zoomLevel()).toBe('100%');

    act(() => {
      raf.flush();
    });
    // The accumulated delta (-50 + -50 = -100) is applied ONCE, matching
    // exactly what a single -100 event would give (the earlier "plain
    // wheel" test) — not two sequential -50 steps compounding to something
    // else.
    expect(zoomLevel()).toBe('115%');
  });

  it('zooms in/out with +/- keys while the viewport is focused', () => {
    render(<Harness />);
    const viewport = screen.getByTestId('zone-viewport');
    fireEvent.keyDown(viewport, { key: '+' });
    expect(zoomLevel()).toBe('125%');
    fireEvent.keyDown(viewport, { key: '-' });
    fireEvent.keyDown(viewport, { key: '-' });
    expect(zoomLevel()).toBe('75%');
  });

  it('fits via the "0" key while the viewport is focused', () => {
    render(<Harness />);
    const viewport = screen.getByTestId('zone-viewport');
    mockRect(viewport, { width: 400, height: 400 });
    fireEvent.click(screen.getByTestId('zoom-in')); // turn fit mode off first
    expect(zoomLevel()).toBe('125%');
    fireEvent.keyDown(viewport, { key: '0' });
    // Viewport 400x400, image 800x400 -> fit picks 50%.
    expect(zoomLevel()).toBe('50%');
  });
});

describe('WorksheetZoneEditor — tool toggle (Zona/Mano)', () => {
  it('defaults to the Zona tool, shown active (pressed)', () => {
    render(<Harness />);
    expect(screen.getByTestId('tool-zone').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('tool-hand').getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByTestId('zone-canvas').className).toContain('cursor-crosshair');
  });

  it('switches to the Mano tool via its toolbar button', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('tool-hand'));
    expect(screen.getByTestId('tool-hand').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('tool-zone').getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByTestId('zone-canvas').className).toContain('cursor-grab');
  });

  it('switches tools with the V/H keyboard shortcuts while the viewport is focused', () => {
    render(<Harness />);
    const viewport = screen.getByTestId('zone-viewport');
    fireEvent.keyDown(viewport, { key: 'h' });
    expect(screen.getByTestId('tool-hand').getAttribute('aria-pressed')).toBe('true');
    fireEvent.keyDown(viewport, { key: 'v' });
    expect(screen.getByTestId('tool-zone').getAttribute('aria-pressed')).toBe('true');
  });

  it('keeps the selected zone and its properties panel unchanged across a tool switch', () => {
    const zone: Zone = { id: 'z1', x: 0.1, y: 0.1, w: 0.2, h: 0.1, kind: 'text', answers: ['x'] };
    render(<Harness initialZones={[zone]} initialSelected="z1" />);
    expect(screen.getByTestId('zone-properties-content')).toBeTruthy();
    fireEvent.click(screen.getByTestId('tool-hand'));
    expect(screen.getByTestId('zone-properties-content')).toBeTruthy();
    fireEvent.click(screen.getByTestId('tool-zone'));
    expect(screen.getByTestId('zone-properties-content')).toBeTruthy();
  });
});

describe('WorksheetZoneEditor — editable zoom % input', () => {
  it('applies a typed value on Enter', () => {
    render(<Harness />);
    const input = screen.getByTestId('zoom-input') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '80' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(input.value).toBe('80');
    // Confirms the REAL zoom changed too, not just the displayed draft: the
    // next zoom-in step is +25 percentage points from 80, not from 100.
    fireEvent.click(screen.getByTestId('zoom-in'));
    expect(zoomLevel()).toBe('105%');
  });

  it('accepts a trailing "%" sign', () => {
    render(<Harness />);
    const input = screen.getByTestId('zoom-input') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '50%' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(input.value).toBe('50');
  });

  it('applies on blur too, not just Enter', () => {
    render(<Harness />);
    const input = screen.getByTestId('zoom-input') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '60' } });
    fireEvent.blur(input);
    expect(input.value).toBe('60');
  });

  it('reverts on Escape without applying', () => {
    render(<Harness />);
    const input = screen.getByTestId('zoom-input') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '999' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input.value).toBe('100');
    // The real zoom was never touched either.
    fireEvent.click(screen.getByTestId('zoom-in'));
    expect(zoomLevel()).toBe('125%');
  });

  it('reverts an unparseable value on blur', () => {
    render(<Harness />);
    const input = screen.getByTestId('zoom-input') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'abc' } });
    fireEvent.blur(input);
    expect(input.value).toBe('100');
  });

  it('clamps below to the wider 10% input floor (below the toolbar\'s own 25% floor)', () => {
    render(<Harness />);
    const input = screen.getByTestId('zoom-input') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '5' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(input.value).toBe('10');
  });

  it('clamps above at the 400% ceiling', () => {
    render(<Harness />);
    const input = screen.getByTestId('zoom-input') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '9999' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(input.value).toBe('400');
  });
});

describe('WorksheetZoneEditor — history commit flag (creator polish round 2)', () => {
  /**
   * Shared by the tests below: a zone (`z1`), already selected (so its
   * resize handles exist — see `HANDLES.map` in the component, only
   * rendered `{selected && ...}`), wired exactly like `ActivityEditorIsland.tsx`
   * wires it in the real app — every `onZonesChange` call recorded (its
   * `opts` AND the resulting zones array) before feeding it back into state.
   */
  function renderTrackedZone(zone: Zone) {
    const calls: Array<{ opts: { commit?: boolean }; zones: Zone[] }> = [];
    function Wrapper() {
      const [zones, setZones] = useState<Zone[]>([zone]);
      return (
        <WorksheetZoneEditor
          lang="es"
          image={IMAGE}
          imageUrl="/img.webp"
          zones={zones}
          selectedZoneId="z1"
          onZonesChange={(next, opts) => {
            calls.push({ opts: opts ?? {}, zones: next });
            setZones(next);
          }}
          onSelectZone={() => {}}
        />
      );
    }
    render(<Wrapper />);
    mockRect(screen.getByTestId('zone-canvas'), { width: 200, height: 100 });
    return calls;
  }

  it('batches many pointermove frames of a zone move into a single onZonesChange call per animation frame', () => {
    const zone: Zone = { id: 'z1', x: 0.1, y: 0.1, w: 0.1, h: 0.1, kind: 'text', answers: ['x'] };
    const raf = stubQueuedRaf();
    const calls = renderTrackedZone(zone);
    const el = screen.getByTestId('zone-z1');

    firePointer(el, 'pointerdown', 20, 10);
    firePointer(el, 'pointermove', 25, 10);
    firePointer(el, 'pointermove', 30, 10);
    firePointer(el, 'pointermove', 40, 10); // three moves, same simulated frame

    // Still batched — nothing has flushed yet. The old, pre-batching code
    // called `onZonesChange` once PER pointermove instead (3 calls here).
    expect(calls.length).toBe(0);

    raf.flush(); // the ONE animation frame these three moves share

    expect(calls.length).toBe(1);
    expect(calls[0].opts).toEqual({ commit: false });
    // Only the LATEST candidate rect survives the batch, not an intermediate one.
    const moved = calls[0].zones.find((z) => z.id === 'z1')!;
    expect(moved.x).toBeCloseTo(0.1 + (40 - 20) / IMAGE.width);

    firePointer(el, 'pointerup', 40, 10);

    // ...and exactly ONE more call (pointerup) commits, same as before batching.
    expect(calls.length).toBe(2);
    expect(calls[1].opts).toEqual({ commit: true });
  });

  it('pointerup flushes a still-pending frame synchronously — the last pointer position is never lost', () => {
    const zone: Zone = { id: 'z1', x: 0.1, y: 0.1, w: 0.1, h: 0.1, kind: 'text', answers: ['x'] };
    // Queued, never flushed by hand: this animation frame never gets a
    // chance to fire on its own before the gesture ends — only `endDrag`
    // (via pointerup) may still apply it.
    stubQueuedRaf();
    const calls = renderTrackedZone(zone);
    const el = screen.getByTestId('zone-z1');

    firePointer(el, 'pointerdown', 20, 10);
    firePointer(el, 'pointermove', 40, 10);
    firePointer(el, 'pointerup', 40, 10);

    // The move was never lost: pointerup forced the pending frame through
    // synchronously, THEN sealed it — not zero updates, not a stale
    // pre-move commit.
    expect(calls.length).toBe(2);
    expect(calls[0].opts).toEqual({ commit: false });
    expect(calls[1].opts).toEqual({ commit: true });
    const expectedX = 0.1 + (40 - 20) / IMAGE.width;
    expect(calls.at(-1)!.zones.find((z) => z.id === 'z1')!.x).toBeCloseTo(expectedX);
    // The rendered DOM reflects the exact final geometry too, not just the recorded call.
    expect(parseFloat(screen.getByTestId('zone-z1').style.left)).toBeCloseTo(expectedX * 100);
  });

  it('batches resize pointermoves the same way, into a single onZonesChange call', () => {
    const zone: Zone = { id: 'z1', x: 0.1, y: 0.1, w: 0.2, h: 0.2, kind: 'text', answers: ['x'] };
    const raf = stubQueuedRaf();
    const calls = renderTrackedZone(zone);
    const handle = screen.getByTestId('handle-z1-se');

    firePointer(handle, 'pointerdown', 20, 10);
    firePointer(handle, 'pointermove', 25, 15);
    firePointer(handle, 'pointermove', 30, 20); // same simulated frame

    expect(calls.length).toBe(0);

    raf.flush();
    expect(calls.length).toBe(1);
    expect(calls[0].opts).toEqual({ commit: false });

    firePointer(handle, 'pointerup', 30, 20);
    expect(calls.length).toBe(2);
    expect(calls[1].opts).toEqual({ commit: true });
  });
});

describe('WorksheetZoneEditor — keyboard zone creation (accessibility)', () => {
  function mockFittedViewport() {
    // Viewport matches the image's own 800x400 aspect ratio exactly, so
    // `fitCamera` picks 100% with a centered (0, 0) offset — the whole image
    // is the "visible" rect, same as the pure `visibleImageRect` test.
    mockRect(screen.getByTestId('zone-viewport'), { width: 800, height: 400 });
  }

  it('creates a zone centered in the visible image on Enter, with the Zona tool active', () => {
    render(<Harness />);
    mockFittedViewport();
    const viewport = screen.getByTestId('zone-viewport');

    fireEvent.keyDown(viewport, { key: 'Enter' });

    const zones = screen.getAllByTestId(/^zone-(?!canvas|properties|viewport|draft)/);
    expect(zones).toHaveLength(1);
    expect(zones[0].style.left).toBe('40%'); // 0.5 - 0.2/2
    expect(zones[0].style.top).toBe('47%'); // 0.5 - 0.06/2
    expect(zones[0].style.width).toBe('20%');
    expect(zones[0].style.height).toBe('6%');
  });

  it('also creates a zone on the N shortcut', () => {
    render(<Harness />);
    mockFittedViewport();
    fireEvent.keyDown(screen.getByTestId('zone-viewport'), { key: 'N' });
    expect(screen.getAllByTestId(/^zone-(?!canvas|properties|viewport|draft)/)).toHaveLength(1);
  });

  it('selects the newly-created zone and opens its properties panel', () => {
    render(<Harness />);
    mockFittedViewport();
    fireEvent.keyDown(screen.getByTestId('zone-viewport'), { key: 'Enter' });
    expect(screen.getByTestId('zone-properties-content')).toBeTruthy();
  });

  it('moves focus to the new zone\'s first answer field', () => {
    render(<Harness />);
    mockFittedViewport();
    fireEvent.keyDown(screen.getByTestId('zone-viewport'), { key: 'Enter' });
    const firstAnswer = screen.getByLabelText('Respuestas aceptadas 1') as HTMLInputElement;
    expect(document.activeElement).toBe(firstAnswer);
  });

  it('announces the creation via an aria-live region', () => {
    render(<Harness />);
    mockFittedViewport();
    fireEvent.keyDown(screen.getByTestId('zone-viewport'), { key: 'Enter' });
    const live = screen.getByTestId('worksheet-live-region');
    expect(live.getAttribute('aria-live')).toBe('polite');
    expect(live.textContent).toBe('Zona creada');
  });

  it('creates exactly one history entry (a single committing onZonesChange call)', () => {
    const calls: Array<{ commit?: boolean } | undefined> = [];
    function Wrapper() {
      const [zones, setZones] = useState<Zone[]>([]);
      const [selected, setSelected] = useState<string | null>(null);
      return (
        <WorksheetZoneEditor
          lang="es"
          image={IMAGE}
          imageUrl="/img.webp"
          zones={zones}
          selectedZoneId={selected}
          onZonesChange={(next, opts) => {
            calls.push(opts);
            setZones(next);
          }}
          onSelectZone={setSelected}
        />
      );
    }
    render(<Wrapper />);
    mockFittedViewport();
    fireEvent.keyDown(screen.getByTestId('zone-viewport'), { key: 'Enter' });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.commit).not.toBe(false); // committing (default/true), not a live drag frame
  });

  it('does nothing while the Mano tool is active', () => {
    render(<Harness />);
    mockFittedViewport();
    const viewport = screen.getByTestId('zone-viewport');
    fireEvent.keyDown(viewport, { key: 'h' }); // switch to Mano
    fireEvent.keyDown(viewport, { key: 'Enter' });
    expect(screen.queryAllByTestId(/^zone-(?!canvas|properties|viewport|draft)/)).toHaveLength(0);
  });

  it('is added to the shortcuts help hint text below the canvas', () => {
    render(<Harness />);
    expect(screen.getByText(/N para/)).toBeTruthy();
  });
});

describe('WorksheetZoneEditor — rotation (creator polish round 2)', () => {
  it('fits using the ROTATED dimensions at 90deg (width/height swapped)', () => {
    render(
      <WorksheetZoneEditor
        lang="es"
        image={IMAGE}
        imageUrl="/img.webp"
        zones={[]}
        selectedZoneId={null}
        onZonesChange={() => {}}
        onSelectZone={() => {}}
        rotation={90}
      />,
    );
    const viewport = screen.getByTestId('zone-viewport');
    // IMAGE is 800x400. Rotated 90deg it is displayed as 400x800. A 400x400
    // viewport fits it at width ratio 1, height ratio 0.5 -> 50%.
    mockRect(viewport, { width: 400, height: 400 });
    fireEvent.click(screen.getByTestId('zoom-fit'));
    expect(zoomLevel()).toBe('50%');
  });

  it('renders a zone at the same fractional position regardless of rotation (already in the rotated space)', () => {
    const zone: Zone = { id: 'z1', x: 0.25, y: 0.1, w: 0.2, h: 0.15, kind: 'text', answers: ['sat'] };
    render(
      <WorksheetZoneEditor
        lang="es"
        image={IMAGE}
        imageUrl="/img.webp"
        zones={[zone]}
        selectedZoneId={null}
        onZonesChange={() => {}}
        onSelectZone={() => {}}
        rotation={180}
      />,
    );
    const el = screen.getByTestId('zone-z1');
    expect(el.style.left).toBe('25%');
    expect(el.style.top).toBe('10%');
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

  it('a middle-button drag returns to the ACTIVE tool afterward (Zona, unaffected by the transient pan)', () => {
    render(<Harness />);
    const canvas = screen.getByTestId('zone-canvas');
    mockRect(canvas, { width: 200, height: 100 });
    expect(canvas.className).toContain('cursor-crosshair');

    firePointer(canvas, 'pointerdown', 20, 10, { button: 1 });
    firePointer(canvas, 'pointerup', 60, 50, { button: 1 });
    expect(screen.getByTestId('zone-canvas').className).toContain('cursor-crosshair');
  });

  it('hand drag pans (the camera transform changes) and does not draw a zone', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('tool-hand'));
    const viewport = screen.getByTestId('zone-viewport');
    const canvas = screen.getByTestId('zone-canvas');
    // A viewport SMALLER than the 800x400 image (at the identity scale-1
    // camera the mount effect settles on against this same unmocked-at-mount
    // viewport) gives real room to pan — see `clampCamera`'s own header:
    // once content exactly fills or is smaller than the viewport, panning is
    // a clamped no-op by design (nothing left to reveal).
    mockRect(viewport, { width: 400, height: 200 });

    firePointer(canvas, 'pointerdown', 100, 100);
    firePointer(canvas, 'pointermove', 60, 70);
    firePointer(canvas, 'pointerup', 60, 70);

    // camera.x = 0 + (60 - 100) = -40; camera.y = 0 + (70 - 100) = -30 — both
    // well within the pan bounds for this viewport/content size (range
    // [-400, 0] / [-200, 0]).
    expect(cameraTransform()).toBe('translate(-40px, -30px) scale(1)');
    expect(screen.queryAllByTestId(/^zone-(?!canvas|properties|viewport|draft)/)).toHaveLength(0);
  });

  it('hand tool: dragging an EXISTING zone pans the canvas instead of moving it', () => {
    const zone: Zone = { id: 'z1', x: 0.1, y: 0.1, w: 0.2, h: 0.1, kind: 'text', answers: ['x'] };
    render(<Harness initialZones={[zone]} />);
    fireEvent.click(screen.getByTestId('tool-hand'));
    const viewport = screen.getByTestId('zone-viewport');
    mockRect(viewport, { width: 400, height: 200 });
    const zoneEl = screen.getByTestId('zone-z1');
    const originalLeft = zoneEl.style.left;

    firePointer(zoneEl, 'pointerdown', 100, 100);
    firePointer(zoneEl, 'pointermove', 60, 70);
    firePointer(zoneEl, 'pointerup', 60, 70);

    expect(cameraTransform()).toBe('translate(-40px, -30px) scale(1)');
    expect(screen.getByTestId('zone-z1').style.left).toBe(originalLeft);
  });

  it('frees panning away from center even when the whole image already fits the viewport (canvas camera follow-up, owner feedback: "drag to the bottom corner at any zoom")', () => {
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
    MockResizeObserver.instances = [];
    render(<Harness />);
    const viewport = screen.getByTestId('zone-viewport');
    const canvas = screen.getByTestId('zone-canvas');
    // 1600x800 matches the 800x400 IMAGE's own 2:1 aspect ratio exactly — the
    // fit camera lands on scale 2 with content EXACTLY filling the viewport
    // on both axes (offset 0, 0): the worst case for the OLD strict
    // `clampCamera`, which always re-centers content that is `<=` the
    // viewport — ignoring any drag entirely once it exactly fills it.
    mockRect(viewport, { width: 1600, height: 800 });
    act(() => {
      MockResizeObserver.instances.at(-1)?.fire();
    });
    expect(cameraTransform()).toBe('translate(0px, 0px) scale(2)');

    fireEvent.click(screen.getByTestId('tool-hand'));
    firePointer(canvas, 'pointerdown', 100, 100);
    firePointer(canvas, 'pointermove', 60, 70);
    firePointer(canvas, 'pointerup', 60, 70);

    // dx=-40, dy=-30: under the old strict clamp this stayed at (0, 0) —
    // content exactly fills the viewport, so `clampCameraAxis` always
    // re-centers regardless of the drag. The editor's own pan now goes
    // through `clampCameraLoose` (owner feedback), which only bounds the
    // drag so at least 20%/80px of the image stays visible — real movement.
    expect(cameraTransform()).toBe('translate(-40px, -30px) scale(2)');
  });
});

describe('WorksheetZoneEditor — layout-driven viewport height (creator "one-screen" pass)', () => {
  it('never sets a fixed/clamped CSS height on the viewport — it fills its flex ancestors instead', () => {
    render(<Harness />);
    const viewport = screen.getByTestId('zone-viewport');
    expect(viewport.style.height).toBe('');
    expect(viewport.className).toContain('flex-1');
  });

  it('re-fits in place when the viewport is still in fit mode and its OWN box resizes (mocked ResizeObserver, no window resize event)', () => {
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
    MockResizeObserver.instances = [];
    render(<Harness />);
    const viewport = screen.getByTestId('zone-viewport');
    // Default (fit) view falls back to 100% with jsdom's zero-sized rect.
    expect(zoomLevel()).toBe('100%');

    // The viewport's flex-driven box "grows" (e.g. a sibling block
    // collapsed, or this one became the active/focus block) — simulated by
    // changing its measured rect and firing the observer callback, with NO
    // window `resize` event at all.
    mockRect(viewport, { width: 400, height: 200 });
    act(() => {
      MockResizeObserver.instances.at(-1)?.fire();
    });

    // IMAGE is 800x400: a 400x200 box fits it at 50% on both axes.
    expect(zoomLevel()).toBe('50%');
  });

  it('does not re-fit once an explicit zoom action has turned fit mode off', () => {
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
    MockResizeObserver.instances = [];
    render(<Harness />);
    const viewport = screen.getByTestId('zone-viewport');

    fireEvent.click(screen.getByTestId('zoom-in')); // turns fitMode off
    expect(zoomLevel()).toBe('125%');

    mockRect(viewport, { width: 400, height: 200 });
    act(() => {
      MockResizeObserver.instances.at(-1)?.fire();
    });

    expect(zoomLevel()).toBe('125%');
  });

  it('does not re-fit after a PAN either (canvas camera pass: a pan turns fit mode off too, not just a zoom)', () => {
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
    MockResizeObserver.instances = [];
    render(<Harness />);
    const viewport = screen.getByTestId('zone-viewport');
    const canvas = screen.getByTestId('zone-canvas');
    // A viewport SMALLER than the 800x400 image (at the identity scale-1
    // camera the mount effect settles on) gives real room to pan — same
    // reasoning as the "hand drag pans" test above: at scale 1, an
    // 800x400-or-bigger viewport would already fully contain the image, so
    // `clampCamera` centers it and the pan would be clamped back to a no-op.
    mockRect(viewport, { width: 400, height: 200 });

    fireEvent.click(screen.getByTestId('tool-hand'));
    firePointer(canvas, 'pointerdown', 100, 100);
    firePointer(canvas, 'pointermove', 60, 70);
    firePointer(canvas, 'pointerup', 60, 70);
    // Still 100% (a pan never changes scale) — but fit mode is now off.
    expect(zoomLevel()).toBe('100%');

    // A resize that WOULD compute a different fit zoom (200x100 -> 25%) must
    // re-CLAMP the panned camera instead, leaving the zoom level exactly
    // where the pan left it.
    mockRect(viewport, { width: 200, height: 100 });
    act(() => {
      MockResizeObserver.instances.at(-1)?.fire();
    });

    expect(zoomLevel()).toBe('100%');
  });
});

describe('WorksheetZoneEditor — state-leak cleanup (blur/pointercancel/lostpointercapture)', () => {
  it('releases a Space-held temporary hand on window blur, even though its keyup never arrives', () => {
    render(<Harness />);
    const viewport = screen.getByTestId('zone-viewport');
    fireEvent.keyDown(viewport, { key: ' ' });
    expect(screen.getByTestId('zone-canvas').className).toContain('cursor-grab');

    // No keyup at all — the window itself loses focus instead (alt-tab, a
    // devtools panel, a native file picker).
    fireEvent(window, new Event('blur'));
    expect(screen.getByTestId('zone-canvas').className).toContain('cursor-crosshair');
  });

  it('ends an in-progress pan on window blur — no pointerup ever arrives for it', () => {
    render(<Harness />);
    const canvas = screen.getByTestId('zone-canvas');
    mockRect(canvas, { width: 200, height: 100 });

    firePointer(canvas, 'pointerdown', 20, 10, { button: 1 });
    expect(screen.getByTestId('zone-canvas').className).toContain('cursor-grabbing');

    fireEvent(window, new Event('blur'));
    expect(screen.getByTestId('zone-canvas').className).toContain('cursor-crosshair');
  });

  it('discards an in-progress draw on `lostpointercapture`, same as `pointercancel`', () => {
    render(<Harness />);
    const canvas = screen.getByTestId('zone-canvas');
    mockRect(canvas, { width: 200, height: 100 });

    firePointer(canvas, 'pointerdown', 20, 10);
    firePointer(canvas, 'pointermove', 60, 50);
    expect(screen.getByTestId('zone-draft')).toBeTruthy();

    firePointer(canvas, 'lostpointercapture', 60, 50);
    expect(screen.queryByTestId('zone-draft')).toBeNull();
    expect(screen.queryAllByTestId(/^zone-(?!canvas|properties|viewport|draft)/)).toHaveLength(0);
  });
});

/** Stubs `useIsDesktop`'s own `matchMedia` query to report a narrow (mobile) viewport — same pattern `useIsDesktop.test.ts` itself uses. */
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

describe('WorksheetZoneEditor — mobile properties bottom sheet (mobile layout pass)', () => {
  const zone: Zone = { id: 'z1', x: 0.1, y: 0.1, w: 0.2, h: 0.1, kind: 'text', answers: ['x'] };

  it('renders neither a peek bar nor the sheet with nothing selected', () => {
    stubMobileViewport();
    render(<Harness initialZones={[zone]} />);
    expect(screen.queryByTestId('zone-properties-sheet-peek')).toBeNull();
    expect(screen.queryByTestId('zone-properties-sheet')).toBeNull();
    // The always-rendered desktop column is gone too — no empty-state card floating on a phone.
    expect(screen.queryByTestId('zone-properties-panel')).toBeNull();
  });

  it('selecting a zone shows the collapsed peek bar, not the full sheet', () => {
    stubMobileViewport();
    render(<Harness initialZones={[zone]} initialSelected="z1" />);
    expect(screen.getByTestId('zone-properties-sheet-peek').textContent).toContain('Texto');
    expect(screen.queryByTestId('zone-properties-sheet')).toBeNull();
  });

  it('tapping the peek bar expands the full properties form', () => {
    stubMobileViewport();
    render(<Harness initialZones={[zone]} initialSelected="z1" />);
    fireEvent.click(screen.getByTestId('zone-properties-sheet-peek'));
    expect(screen.getByTestId('zone-properties-sheet')).toBeTruthy();
    expect(screen.getByTestId('zone-properties-content')).toBeTruthy();
  });

  it('closing the expanded sheet returns to the collapsed peek (still selected), not fully hidden', () => {
    stubMobileViewport();
    render(<Harness initialZones={[zone]} initialSelected="z1" />);
    fireEvent.click(screen.getByTestId('zone-properties-sheet-peek'));
    fireEvent.keyDown(screen.getByTestId('zone-properties-sheet'), { key: 'Escape' });
    expect(screen.queryByTestId('zone-properties-sheet')).toBeNull();
    expect(screen.getByTestId('zone-properties-sheet-peek')).toBeTruthy();
  });

  it('deselecting closes the sheet entirely, even while it was expanded', () => {
    stubMobileViewport();
    function DeselectHarness() {
      const [selected, setSelected] = useState<string | null>('z1');
      return (
        <>
          <button type="button" data-testid="deselect" onClick={() => setSelected(null)}>
            deselect
          </button>
          <WorksheetZoneEditor
            lang="es"
            image={IMAGE}
            imageUrl="/img.webp"
            zones={[zone]}
            selectedZoneId={selected}
            onZonesChange={() => {}}
            onSelectZone={setSelected}
          />
        </>
      );
    }
    render(<DeselectHarness />);
    fireEvent.click(screen.getByTestId('zone-properties-sheet-peek'));
    expect(screen.getByTestId('zone-properties-sheet')).toBeTruthy();

    fireEvent.click(screen.getByTestId('deselect'));
    expect(screen.queryByTestId('zone-properties-sheet')).toBeNull();
    expect(screen.queryByTestId('zone-properties-sheet-peek')).toBeNull();
  });

  it('selecting a DIFFERENT zone resets the sheet back to collapsed peek', () => {
    stubMobileViewport();
    const zone2: Zone = { id: 'z2', x: 0.5, y: 0.5, w: 0.1, h: 0.1, kind: 'choice', answers: ['b'], options: ['a', 'b'] };
    function SwitchHarness() {
      const [selected, setSelected] = useState<string | null>('z1');
      return (
        <>
          <button type="button" data-testid="select-z2" onClick={() => setSelected('z2')}>
            select z2
          </button>
          <WorksheetZoneEditor
            lang="es"
            image={IMAGE}
            imageUrl="/img.webp"
            zones={[zone, zone2]}
            selectedZoneId={selected}
            onZonesChange={() => {}}
            onSelectZone={setSelected}
          />
        </>
      );
    }
    render(<SwitchHarness />);
    fireEvent.click(screen.getByTestId('zone-properties-sheet-peek'));
    expect(screen.getByTestId('zone-properties-sheet')).toBeTruthy();

    fireEvent.click(screen.getByTestId('select-z2'));
    expect(screen.queryByTestId('zone-properties-sheet')).toBeNull();
    expect(screen.getByTestId('zone-properties-sheet-peek').textContent).toContain('Opción');
  });
});

describe('WorksheetZoneEditor — no layout flash on the server render (mobile layout pass, priority fix)', () => {
  it('renders BOTH the desktop properties column and the mobile sheet on the server, gated by CSS `lg:` classes only', () => {
    // Same "no real matchMedia" shape as a true server render — see
    // `useIsDesktop.test.ts`'s own "defaults to true" test.
    vi.stubGlobal('matchMedia', undefined);
    const html = renderToStaticMarkup(<Harness initialZones={[SSR_ZONE]} initialSelected="z1" />);
    // The desktop column is hidden by default, shown only at `lg:` — never
    // visible-by-default DOM/structure for a small screen (the bug this fixes).
    expect(html).toContain('class="hidden lg:contents"');
    expect(html).toContain('zone-properties-panel');
    // The mobile sheet's own wrapper is visible by default, hidden only at `lg:`.
    expect(html).toMatch(/class="contents lg:hidden" inert(="")?[^>]*>/);
  });

  it('does not mark the desktop column `inert` on the server (matches the SSR-safe desktop-first default)', () => {
    vi.stubGlobal('matchMedia', undefined);
    const html = renderToStaticMarkup(<Harness initialZones={[SSR_ZONE]} initialSelected="z1" />);
    expect(html).not.toMatch(/class="hidden lg:contents" inert/);
  });
});
