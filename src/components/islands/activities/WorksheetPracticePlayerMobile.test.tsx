// @vitest-environment jsdom
/**
 * WorksheetPracticePlayerMobile — pointer PHYSICS (whether a real two-finger
 * pinch or pan feels right) stay a manual/Playwright check, same posture
 * `WorksheetZoneEditor.test.tsx` already documents for the creator canvas:
 * jsdom has no real layout engine, so every `getBoundingClientRect()` below
 * is a mock, not a measurement. What IS proved here is the wiring: fit mode
 * exits once a gesture moves the camera, a tap opens the right zone's
 * sheet, Anterior/Siguiente walk reading order, and the sheet's own input
 * writes back through `practice.onChange` exactly like the desktop player.
 */
import { act, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import WorksheetPracticePlayerMobile from './WorksheetPracticePlayerMobile';
import type { WorksheetBlock } from '@/lib/activities/blocks';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const BLOCK: WorksheetBlock = {
  id: 'b1',
  type: 'worksheet',
  rotation: 0,
  image: { path: 'activity-images/act-1/img.webp', width: 800, height: 400 },
  zones: [
    { id: 'top-left', x: 0.1, y: 0.1, w: 0.1, h: 0.1, kind: 'text', answers: ['a'] },
    { id: 'top-right', x: 0.6, y: 0.1, w: 0.1, h: 0.1, kind: 'choice', answers: ['b'], options: ['a', 'b', 'c'] },
    { id: 'bottom', x: 0.1, y: 0.6, w: 0.1, h: 0.1, kind: 'text', answers: ['c'] },
  ],
};

/** Same fix as `WorksheetZoneEditor.test.tsx`'s own `firePointer` — jsdom has no real `PointerEvent`. */
function firePointer(
  el: Element,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  clientX: number,
  clientY: number,
  extra: Record<string, unknown> = {},
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { clientX, clientY, button: 0, ...extra });
  act(() => {
    el.dispatchEvent(event);
  });
}

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

/** Stateful harness so `practice.onChange` actually drives re-renders, like the real practice island. */
function Harness() {
  const [values, setValues] = useState<Record<string, string>>({});
  return (
    <WorksheetPracticePlayerMobile
      lang="es"
      block={BLOCK}
      imageUrl="/img.webp"
      practice={{ values, onChange: (id, v) => setValues((prev) => ({ ...prev, [id]: v })) }}
    />
  );
}

function contentTransform(): string {
  return screen.getByTestId('practice-mobile-content').style.transform;
}

/** No `@testing-library/jest-dom` matchers configured in this repo — read `disabled` off the DOM node directly, same convention every other test file here uses. */
function isDisabled(testId: string): boolean {
  return (screen.getByTestId(testId) as HTMLButtonElement).disabled;
}

describe('WorksheetPracticePlayerMobile — rendering', () => {
  it('renders the worksheet at fit scale (identity camera with a zero-sized viewport, same fallback fitZoom already has)', () => {
    render(<Harness />);
    expect(contentTransform()).toBe('translate(0px, 0px) scale(1)');
  });

  it('renders every zone as a tap target, not an inline input', () => {
    render(<Harness />);
    expect(screen.getByTestId('player-zone-tap-top-left')).toBeTruthy();
    expect(screen.queryByTestId('player-zone-top-left')?.querySelector('input')).toBeNull();
  });
});

describe('WorksheetPracticePlayerMobile — per-zone bottom sheet', () => {
  it('opens the sheet with a text input when a text zone is tapped', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('player-zone-tap-top-left'));
    expect(screen.getByTestId('zone-sheet')).toBeTruthy();
    expect(screen.getByTestId('zone-sheet-text-input')).toBeTruthy();
  });

  it('opens the sheet with large tap-target options for a choice zone', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('player-zone-tap-top-right'));
    expect(screen.getByTestId('zone-sheet-option-a')).toBeTruthy();
    expect(screen.getByTestId('zone-sheet-option-b')).toBeTruthy();
    expect(screen.getByTestId('zone-sheet-option-c')).toBeTruthy();
  });

  it('typing in the sheet writes back through practice.onChange, reflected on the zone tap target', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('player-zone-tap-top-left'));
    fireEvent.change(screen.getByTestId('zone-sheet-text-input'), { target: { value: 'cat' } });
    expect(screen.getByTestId('player-zone-tap-top-left').textContent).toContain('cat');
  });

  it('choosing an option writes back through practice.onChange', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('player-zone-tap-top-right'));
    fireEvent.click(screen.getByTestId('zone-sheet-option-b'));
    expect(screen.getByTestId('zone-sheet-option-b').getAttribute('aria-checked')).toBe('true');
    expect(screen.getByTestId('player-zone-tap-top-right').textContent).toContain('b');
  });

  it('Siguiente/Anterior step through zones in READING order (top-to-bottom, left-to-right), not array order', () => {
    render(<Harness />);
    // Array order is top-left, top-right, bottom — reading order for this
    // layout is the same here, so tap the SECOND one to prove navigation
    // uses the ordered list's neighbors, not the array's.
    fireEvent.click(screen.getByTestId('player-zone-tap-top-right'));
    expect(isDisabled('zone-sheet-prev')).toBe(false);

    fireEvent.click(screen.getByTestId('zone-sheet-next'));
    expect(screen.getByTestId('zone-sheet-text-input')).toBeTruthy(); // now on "bottom", a text zone

    fireEvent.click(screen.getByTestId('zone-sheet-prev'));
    expect(screen.getByTestId('zone-sheet-option-a')).toBeTruthy(); // back to "top-right"
  });

  it('disables Anterior on the first zone and Siguiente on the last', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('player-zone-tap-top-left')); // first in reading order
    expect(isDisabled('zone-sheet-prev')).toBe(true);
    expect(isDisabled('zone-sheet-next')).toBe(false);

    fireEvent.click(screen.getByTestId('zone-sheet-next'));
    fireEvent.click(screen.getByTestId('zone-sheet-next'));
    expect(isDisabled('zone-sheet-next')).toBe(true); // last zone ("bottom")
  });

  it('Listo closes the sheet', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('player-zone-tap-top-left'));
    fireEvent.click(screen.getByTestId('zone-sheet-done'));
    expect(screen.queryByTestId('zone-sheet')).toBeNull();
  });

  it('closing the sheet (Escape) leaves the zone tap target reachable again', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('player-zone-tap-top-left'));
    fireEvent.keyDown(screen.getByTestId('zone-sheet'), { key: 'Escape' });
    expect(screen.queryByTestId('zone-sheet')).toBeNull();
    expect(screen.getByTestId('player-zone-tap-top-left')).toBeTruthy();
  });
});

/** D4 "Escuchar/Listen": the sheet's own SpeakButton, next to the input. */
describe('WorksheetPracticePlayerMobile — speak affordance (D4)', () => {
  const BLOCK_WITH_SPEAK: WorksheetBlock = {
    ...BLOCK,
    zones: BLOCK.zones.map((z) => (z.id === 'top-left' ? { ...z, speak: 'The cat sat.' } : z)),
  };

  function HarnessWithSpeak() {
    const [values, setValues] = useState<Record<string, string>>({});
    return (
      <WorksheetPracticePlayerMobile
        lang="es"
        block={BLOCK_WITH_SPEAK}
        imageUrl="/img.webp"
        practice={{ values, onChange: (id, v) => setValues((prev) => ({ ...prev, [id]: v })) }}
      />
    );
  }

  function installSynth() {
    Object.defineProperty(window, 'speechSynthesis', {
      value: { getVoices: () => [], speak: vi.fn(), cancel: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      value: class {
        constructor(public text: string) {}
      },
      writable: true,
      configurable: true,
    });
  }

  afterEach(() => {
    Reflect.deleteProperty(window, 'speechSynthesis');
    Reflect.deleteProperty(window, 'SpeechSynthesisUtterance');
  });

  it('shows no speak button for a zone with no speak text', () => {
    installSynth();
    render(<Harness />);
    fireEvent.click(screen.getByTestId('player-zone-tap-top-left'));
    expect(screen.queryByTestId('speak-button')).toBeNull();
  });

  it('shows a speak button next to the input for a zone with speak text', () => {
    installSynth();
    render(<HarnessWithSpeak />);
    fireEvent.click(screen.getByTestId('player-zone-tap-top-left'));
    expect(screen.getByTestId('speak-button')).toBeTruthy();
  });

  it('renders nothing when speechSynthesis is unsupported (jsdom default)', () => {
    render(<HarnessWithSpeak />);
    fireEvent.click(screen.getByTestId('player-zone-tap-top-left'));
    expect(screen.queryByTestId('speak-button')).toBeNull();
  });
});

/** D5 "¿Por qué?": the sheet shows the explanation under the input, only once graded and only while incorrect. */
describe('WorksheetPracticePlayerMobile — explanation (D5)', () => {
  const BLOCK_WITH_EXPLANATION: WorksheetBlock = {
    ...BLOCK,
    zones: BLOCK.zones.map((z) => (z.id === 'top-left' ? { ...z, explanation: 'Because it is "a".' } : z)),
  };

  function HarnessGraded({ correct }: { correct: boolean }) {
    return (
      <WorksheetPracticePlayerMobile
        lang="es"
        block={BLOCK_WITH_EXPLANATION}
        imageUrl="/img.webp"
        practice={{
          values: { 'top-left': correct ? 'a' : 'wrong' },
          onChange: () => {},
          results: { 'top-left': correct },
          disabled: true,
        }}
      />
    );
  }

  it('shows nothing before grading (no results yet)', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('player-zone-tap-top-left'));
    expect(screen.queryByTestId('zone-sheet-explanation')).toBeNull();
  });

  it('shows nothing for a correct zone', () => {
    render(<HarnessGraded correct />);
    fireEvent.click(screen.getByTestId('player-zone-tap-top-left'));
    expect(screen.queryByTestId('zone-sheet-explanation')).toBeNull();
  });

  it('shows the explanation under the input for an incorrect zone that has one', () => {
    render(<HarnessGraded correct={false} />);
    fireEvent.click(screen.getByTestId('player-zone-tap-top-left'));
    expect(screen.getByTestId('zone-sheet-explanation').textContent).toContain('Because it is "a".');
  });

  it('shows nothing for an incorrect zone with no explanation authored', () => {
    function HarnessNoExplanation() {
      return (
        <WorksheetPracticePlayerMobile
          lang="es"
          block={BLOCK}
          imageUrl="/img.webp"
          practice={{ values: {}, onChange: () => {}, results: { 'top-left': false }, disabled: true }}
        />
      );
    }
    render(<HarnessNoExplanation />);
    fireEvent.click(screen.getByTestId('player-zone-tap-top-left'));
    expect(screen.queryByTestId('zone-sheet-explanation')).toBeNull();
  });
});

describe('WorksheetPracticePlayerMobile — pinch/pan camera wiring', () => {
  it('a two-finger pinch scales the content layer and exits fit mode (touch-action switches to none)', () => {
    render(<Harness />);
    const viewport = screen.getByTestId('practice-mobile-viewport');
    mockRect(viewport, { width: 400, height: 200 });

    firePointer(viewport, 'pointerdown', 150, 100, { pointerId: 1 });
    firePointer(viewport, 'pointerdown', 250, 100, { pointerId: 2 });
    firePointer(viewport, 'pointermove', 100, 100, { pointerId: 1 });
    firePointer(viewport, 'pointermove', 300, 100, { pointerId: 2 });

    const transform = contentTransform();
    expect(transform).toMatch(/scale\(2/); // distance doubled (100 -> 200)
    expect(viewport.style.touchAction).toBe('none');
  });

  it('a single finger does nothing at fit scale (left to native page scroll)', () => {
    render(<Harness />);
    const viewport = screen.getByTestId('practice-mobile-viewport');
    mockRect(viewport, { width: 400, height: 200 });

    const before = contentTransform();
    firePointer(viewport, 'pointerdown', 100, 100, { pointerId: 1 });
    firePointer(viewport, 'pointermove', 100, 300, { pointerId: 1 });

    expect(contentTransform()).toBe(before);
    expect(viewport.style.touchAction).toBe('pan-y');
  });

  it('a single finger pans once already zoomed in past fit', () => {
    render(<Harness />);
    const viewport = screen.getByTestId('practice-mobile-viewport');
    mockRect(viewport, { width: 400, height: 200 });

    // Zoom in first via a pinch, release both fingers.
    firePointer(viewport, 'pointerdown', 150, 100, { pointerId: 1 });
    firePointer(viewport, 'pointerdown', 250, 100, { pointerId: 2 });
    firePointer(viewport, 'pointermove', 100, 100, { pointerId: 1 });
    firePointer(viewport, 'pointermove', 300, 100, { pointerId: 2 });
    firePointer(viewport, 'pointerup', 100, 100, { pointerId: 1 });
    firePointer(viewport, 'pointerup', 300, 100, { pointerId: 2 });
    const afterPinch = contentTransform();

    firePointer(viewport, 'pointerdown', 200, 100, { pointerId: 3 });
    firePointer(viewport, 'pointermove', 150, 100, { pointerId: 3 });

    expect(contentTransform()).not.toBe(afterPinch);
  });
});
