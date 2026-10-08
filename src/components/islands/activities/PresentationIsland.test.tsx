// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { renderThenHydrate } from '@/testSupport/hydrationHarness';
import type { Block } from '@/lib/activities/blocks';
import PresentationIsland from './PresentationIsland';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const QUIZ_BLOCKS: Block[] = [
  {
    id: 'q1',
    type: 'quiz',
    payload: {
      pools: { opts1: [{ id: 'a', text: 'Cat' }, { id: 'b', text: 'Dog' }] },
      slots: [
        {
          id: 's1',
          label: 'Which animal says meow?',
          input: 'choice',
          pool: 'opts1',
          answer: ['a'],
          explanation: 'Cats say meow, dogs say woof.',
        },
      ],
    },
  },
  {
    id: 'q2',
    type: 'quiz',
    payload: {
      pools: {},
      slots: [{ id: 's2', label: 'What is the capital of France?', input: 'text', answer: ['Paris'] }],
    },
  },
];

/** Two zones, already authored top-to-bottom so reading order matches authored order (ordering itself is covered by `presentationSlides.test.ts`). */
const WORKSHEET_BLOCK: Block = {
  id: 'w1',
  type: 'worksheet',
  rotation: 0,
  image: { path: 'activity-images/abc/img-1.webp', width: 1000, height: 1000 },
  zones: [
    { id: 'z1', x: 0.1, y: 0.1, w: 0.2, h: 0.2, kind: 'text', answers: ['Paris'], explanation: 'It is the capital of France.' },
    { id: 'z2', x: 0.6, y: 0.6, w: 0.2, h: 0.2, kind: 'text', answers: ['London'] },
  ],
};

const BASE_PROPS = {
  lang: 'es' as const,
  title: 'Animales y capitales',
  level: 'A2' as const,
  practiceUrl: '/es/ingles/actividades/abc',
  qrSvg: '<svg data-testid="fake-qr"></svg>',
  blocks: QUIZ_BLOCKS,
};

function next() {
  fireEvent.click(screen.getByTestId('presentation-next'));
}

function prev() {
  fireEvent.click(screen.getByTestId('presentation-prev'));
}

/** No `@testing-library/jest-dom` matchers configured in this repo (no global
 * setup file) — read attributes off the DOM node directly, same convention
 * `UserMenu.test.tsx`/`ScrollToTop.test.tsx` use. */
function attr(el: Element, name: string): string | null {
  return el.getAttribute(name);
}

/** `window.location.assign` throws "not implemented" in jsdom unless stubbed — same helper `PasswordAuthForm.test.tsx` uses. */
function stubLocationAssign() {
  const assign = vi.fn();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, assign },
  });
  return assign;
}

describe('PresentationIsland — opens directly on the first content slide (owner feedback 2026-10-06)', () => {
  it('mounts straight on the first question, never the cover', () => {
    render(<PresentationIsland {...BASE_PROPS} />);
    expect(screen.getByTestId('presentation-question-s1')).toBeTruthy();
    expect(screen.queryByTestId('presentation-slide-cover')).toBeNull();
  });

  it('mounts on the worksheet overview for a worksheet-only deck', () => {
    render(<PresentationIsland {...BASE_PROPS} blocks={[WORKSHEET_BLOCK]} />);
    expect(screen.getByTestId('presentation-worksheet-viewport')).toBeTruthy();
    expect(screen.queryByTestId('presentation-slide-cover')).toBeNull();
  });

  it('the cover is still reachable via "previous" from the first content slide', () => {
    render(<PresentationIsland {...BASE_PROPS} />);
    prev();
    expect(screen.getByTestId('presentation-slide-cover')).toBeTruthy();
  });
});

describe('PresentationIsland — cover slide (title/level/count "title card")', () => {
  it('shows the title, level and question count — no QR on this slide anymore (it moved to the on-demand overlay)', () => {
    render(<PresentationIsland {...BASE_PROPS} />);
    prev();
    const cover = screen.getByTestId('presentation-slide-cover');
    expect(cover.textContent).toContain('Animales y capitales');
    expect(cover.textContent).toContain('A2');
    expect(cover.textContent).toContain('2 preguntas');
    expect(screen.queryByTestId('presentation-cover-qr')).toBeNull();
  });

  it('shows "Sin nivel" when the activity has no level', () => {
    render(<PresentationIsland {...BASE_PROPS} level={null} />);
    prev();
    expect(screen.getByTestId('presentation-slide-cover').textContent).toContain('Sin nivel');
  });

  it('combines quiz and worksheet counts when the activity has both', () => {
    render(<PresentationIsland {...BASE_PROPS} blocks={[WORKSHEET_BLOCK, ...QUIZ_BLOCKS]} />);
    prev();
    const cover = screen.getByTestId('presentation-slide-cover');
    expect(cover.textContent).toContain('2 preguntas');
    expect(cover.textContent).toContain('1 hoja');
  });

  it('shows only the worksheet count for a worksheet-only activity', () => {
    render(<PresentationIsland {...BASE_PROPS} blocks={[WORKSHEET_BLOCK]} />);
    prev();
    const cover = screen.getByTestId('presentation-slide-cover');
    expect(cover.textContent).toContain('1 hoja');
    expect(cover.textContent).not.toContain('pregunta');
  });
});

describe('PresentationIsland — "Mostrar QR" on-demand overlay (owner feedback 2026-10-06)', () => {
  it('offers the control and shows the QR + scan hint as an overlay once pressed, from any slide', () => {
    render(<PresentationIsland {...BASE_PROPS} />);
    expect(screen.queryByTestId('presentation-qr-overlay')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Mostrar QR' }));
    const overlay = screen.getByTestId('presentation-qr-overlay');
    expect(overlay.textContent).toContain('Escanea el código');
    expect(screen.getByTestId('presentation-qr-overlay-image')).toBeTruthy();
  });

  it('toggles via the "Q" key, from any slide, without advancing/revealing', () => {
    render(<PresentationIsland {...BASE_PROPS} />);
    fireEvent.keyDown(window, { key: 'q' });
    expect(screen.getByTestId('presentation-qr-overlay')).toBeTruthy();
    // Never a side effect on the deck itself (owner spec: "keep every other
    // presentation behaviour" — the Q key must not also reveal/advance).
    expect(screen.queryByTestId('presentation-option-correct-a')).toBeNull();

    fireEvent.keyDown(window, { key: 'Q' });
    expect(screen.queryByTestId('presentation-qr-overlay')).toBeNull();
  });

  it('closes via its own close button, and via Escape (without exiting the presentation)', () => {
    const assign = stubLocationAssign();
    render(<PresentationIsland {...BASE_PROPS} />);

    fireEvent.click(screen.getByRole('button', { name: 'Mostrar QR' }));
    fireEvent.click(screen.getByTestId('presentation-qr-overlay-close'));
    expect(screen.queryByTestId('presentation-qr-overlay')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Mostrar QR' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('presentation-qr-overlay')).toBeNull();
    expect(assign).not.toHaveBeenCalled();
  });

  it('offers no control and no overlay when there is no QR to show (the editor preview)', () => {
    render(<PresentationIsland {...BASE_PROPS} practiceUrl={undefined} qrSvg={null} onExit={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Mostrar QR' })).toBeNull();
    fireEvent.keyDown(window, { key: 'q' });
    expect(screen.queryByTestId('presentation-qr-overlay')).toBeNull();
  });
});

describe('PresentationIsland — the full flow (quiz-only deck)', () => {
  it('walks q1 (unrevealed, straight on mount) -> q1 (revealed) -> q2 (unrevealed) -> q2 (revealed) -> summary -> restart', () => {
    render(<PresentationIsland {...BASE_PROPS} />);

    // Mounts straight on question 1, nothing revealed yet (owner feedback 2026-10-06 — no cover step first).
    expect(screen.getByTestId('presentation-question-s1')).toBeTruthy();
    expect(screen.queryByTestId('presentation-option-correct-a')).toBeNull();
    expect(screen.queryByTestId('presentation-explanation')).toBeNull();
    expect(screen.getByTestId('presentation-option-a').getAttribute('data-correct')).toBeNull();

    // next reveals q1 instead of advancing: correct option marked (icon + text), explanation shown.
    next();
    expect(screen.getByTestId('presentation-question-s1')).toBeTruthy();
    expect(attr(screen.getByTestId('presentation-option-a'), 'data-correct')).toBe('true');
    expect(screen.getByTestId('presentation-option-correct-a').textContent).toContain('Correcta');
    expect(screen.getByTestId('presentation-option-b').getAttribute('data-correct')).toBeNull();
    expect(screen.getByTestId('presentation-explanation').textContent).toContain(
      'Cats say meow, dogs say woof.',
    );

    // next NOW advances to question 2, unrevealed.
    next();
    expect(screen.getByTestId('presentation-question-s2')).toBeTruthy();
    expect(screen.queryByTestId('presentation-answer-reveal')).toBeNull();

    // next reveals q2's typed answer.
    next();
    expect(screen.getByTestId('presentation-answer-reveal').textContent).toContain('Paris');

    // next advances to the summary.
    next();
    const summary = screen.getByTestId('presentation-slide-summary');
    expect(summary.textContent).toContain('¡Listo!');
    expect(summary.textContent).toContain('2 preguntas');
    // Emoji sticker accent (visual-identity decision, 2026-10-04).
    const emojiImg = screen.getByTestId('presentation-summary-emoji').querySelector('img') as HTMLImageElement;
    expect(emojiImg.getAttribute('src')).toContain('trophy');

    // Restart returns to the FIRST CONTENT slide, not the cover (owner feedback 2026-10-06).
    fireEvent.click(screen.getByTestId('presentation-restart'));
    expect(screen.getByTestId('presentation-question-s1')).toBeTruthy();
    expect(screen.queryByTestId('presentation-option-correct-a')).toBeNull();
  });

  it('dims the wrong option without removing it, once revealed', () => {
    render(<PresentationIsland {...BASE_PROPS} />);
    next(); // q1 revealed (mounts unrevealed already)
    const wrong = screen.getByTestId('presentation-option-b');
    expect(wrong.textContent).toContain('Dog');
    expect(wrong.className).toContain('opacity-40');
  });

  it('previous steps back and hides the answer again', () => {
    render(<PresentationIsland {...BASE_PROPS} />);
    next(); // q1 revealed
    next(); // q2 unrevealed
    fireEvent.click(screen.getByTestId('presentation-prev'));
    expect(screen.getByTestId('presentation-question-s1')).toBeTruthy();
    expect(screen.queryByTestId('presentation-option-correct-a')).toBeNull();
  });
});

describe('PresentationIsland — the worksheet zoom tour (worksheet-only deck)', () => {
  it('walks overview (zones numbered) -> zone 1 blank -> reveal shows the answer and explanation -> zone 2 blank -> reveal -> summary', () => {
    render(<PresentationIsland {...BASE_PROPS} blocks={[WORKSHEET_BLOCK]} />);

    // Mounts straight on the overview, both zones numbered, nothing to reveal (no cover step first).
    expect(screen.getByTestId('presentation-worksheet-viewport')).toBeTruthy();
    expect(screen.getByTestId('presentation-overview-zone-z1')).toBeTruthy();
    expect(screen.getByTestId('presentation-overview-zone-z2')).toBeTruthy();
    expect(screen.getByLabelText('Zona 1')).toBeTruthy();
    expect(screen.getByLabelText('Zona 2')).toBeTruthy();
    expect((screen.getByTestId('presentation-reveal') as HTMLButtonElement).disabled).toBe(true);

    // A single "next" advances straight past the overview (never revealable).
    next();
    expect(screen.getByTestId('presentation-zone-blank-z1')).toBeTruthy();
    expect(screen.queryByTestId('presentation-zone-answer-z1')).toBeNull();
    expect((screen.getByTestId('presentation-reveal') as HTMLButtonElement).disabled).toBe(false);

    // next reveals zone 1's answer + explanation instead of advancing.
    next();
    expect(screen.getByTestId('presentation-zone-answer-z1').textContent).toBe('Paris');
    expect(screen.getByTestId('presentation-zone-explanation-z1').textContent).toContain(
      'It is the capital of France.',
    );

    // next NOW advances to zone 2, blank again.
    next();
    expect(screen.getByTestId('presentation-zone-blank-z2')).toBeTruthy();
    expect(screen.queryByTestId('presentation-zone-answer-z2')).toBeNull();

    // zone 2 has no explanation — reveal shows only the answer.
    next();
    expect(screen.getByTestId('presentation-zone-answer-z2').textContent).toBe('London');
    expect(screen.queryByTestId('presentation-zone-explanation-z2')).toBeNull();

    // next advances to the summary.
    next();
    expect(screen.getByTestId('presentation-slide-summary')).toBeTruthy();
  });
});

describe('PresentationIsland — interleaved worksheet + quiz order', () => {
  it('visits every slide in exactly the authored block order', () => {
    render(<PresentationIsland {...BASE_PROPS} blocks={[WORKSHEET_BLOCK, ...QUIZ_BLOCKS]} />);

    const progressLabel = () => attr(screen.getByTestId('presentation-progress'), 'aria-label');

    // Mounts straight on the overview (slide 1/5), no cover step first.
    expect(screen.getByTestId('presentation-worksheet-viewport')).toBeTruthy();
    expect(progressLabel()).toBe('Diapositiva 1 de 5');

    next(); // -> zone 1 blank (slide 2/5)
    expect(screen.getByTestId('presentation-zone-blank-z1')).toBeTruthy();
    next(); // reveal zone 1
    expect(screen.getByTestId('presentation-zone-answer-z1')).toBeTruthy();

    next(); // -> zone 2 blank (slide 3/5)
    expect(screen.getByTestId('presentation-zone-blank-z2')).toBeTruthy();
    next(); // reveal zone 2

    next(); // -> q1 (slide 4/5), unrevealed
    expect(screen.getByTestId('presentation-question-s1')).toBeTruthy();
    expect(progressLabel()).toBe('Diapositiva 4 de 5');
    next(); // reveal q1

    next(); // -> q2 (slide 5/5)
    expect(screen.getByTestId('presentation-question-s2')).toBeTruthy();
    expect(progressLabel()).toBe('Diapositiva 5 de 5');
    next(); // reveal q2

    next(); // -> summary
    expect(screen.getByTestId('presentation-slide-summary')).toBeTruthy();
  });
});

describe('PresentationIsland — worksheet camera transitions and prefers-reduced-motion', () => {
  it('animates the worksheet camera over ~400ms by default', () => {
    render(<PresentationIsland {...BASE_PROPS} blocks={[WORKSHEET_BLOCK]} />);
    const camera = screen.getByTestId('presentation-worksheet-camera');
    expect(camera.style.transitionDuration).toBe('400ms');
  });

  it('is instant once mounted under prefers-reduced-motion', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: true,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    render(<PresentationIsland {...BASE_PROPS} blocks={[WORKSHEET_BLOCK]} />);
    const camera = screen.getByTestId('presentation-worksheet-camera');
    expect(camera.style.transitionDuration).toBe('0ms');
  });
});

describe('PresentationIsland — keyboard map', () => {
  it.each([['ArrowRight'], [' '], ['PageDown'], ['Enter']])('"%s" reveals/advances like the next button', (key) => {
    render(<PresentationIsland {...BASE_PROPS} />);
    // Mounted unrevealed on q1 already — one press of any of these keys
    // must REVEAL it, same as clicking "Siguiente" would (the two-step
    // reveal-then-advance, unchanged by the "opens on the first slide" feedback).
    fireEvent.keyDown(window, { key });
    expect(screen.getByTestId('presentation-option-correct-a')).toBeTruthy();
  });

  it.each([['ArrowLeft'], ['PageUp']])('"%s" steps back like the previous button', (key) => {
    render(<PresentationIsland {...BASE_PROPS} />);
    next();
    next();
    fireEvent.keyDown(window, { key });
    expect(screen.queryByTestId('presentation-option-correct-a')).toBeNull();
  });

  it.each([['r'], ['R']])('"%s" reveals without advancing', (key) => {
    render(<PresentationIsland {...BASE_PROPS} />); // mounts on q1, unrevealed
    fireEvent.keyDown(window, { key });
    expect(screen.getByTestId('presentation-option-correct-a')).toBeTruthy();
    expect(screen.getByTestId('presentation-question-s1')).toBeTruthy();
  });

  it('"f" toggles fullscreen without throwing (jsdom has no real Fullscreen API)', () => {
    render(<PresentationIsland {...BASE_PROPS} />);
    expect(() => fireEvent.keyDown(window, { key: 'f' })).not.toThrow();
  });

  it('Escape navigates to the practice page', () => {
    const assign = stubLocationAssign();
    render(<PresentationIsland {...BASE_PROPS} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(assign).toHaveBeenCalledWith('/es/ingles/actividades/abc');
  });

  it('does not double-dispatch when Enter/Space activates a focused control-bar button', () => {
    render(<PresentationIsland {...BASE_PROPS} />);
    // `.focus()` synchronously fires the control bar's `onFocus` handler
    // (`setControlsVisible`), so — same as the idle-hide describe block
    // below — it must be wrapped in `act()` itself; it is not an event
    // `fireEvent` wraps for us.
    act(() => {
      screen.getByTestId('presentation-next').focus();
    });
    fireEvent.keyDown(screen.getByTestId('presentation-next'), { key: 'Enter' });
    // The native click (fired by the button's own onClick, simulated via a
    // real click below) is what advances — the global listener must not
    // ALSO advance on the same keydown, or this would land on question 2.
    fireEvent.click(screen.getByTestId('presentation-next'));
    expect(screen.getByTestId('presentation-question-s1')).toBeTruthy();
  });
});

describe('PresentationIsland — the exit control (link, not just Esc)', () => {
  it('is a real link to the practice page, labeled "Salir"', () => {
    render(<PresentationIsland {...BASE_PROPS} />);
    const exit = screen.getByRole('link', { name: 'Salir' });
    expect(attr(exit, 'href')).toBe('/es/ingles/actividades/abc');
  });
});

describe('PresentationIsland — the editor overlay (onExit, no real practice URL)', () => {
  it('renders the exit control as a button, not a link, and calls onExit instead of navigating', () => {
    const onExit = vi.fn();
    render(<PresentationIsland {...BASE_PROPS} practiceUrl={undefined} qrSvg={null} onExit={onExit} />);
    expect(screen.queryByRole('link', { name: 'Salir' })).toBeNull();
    const exitButton = screen.getByRole('button', { name: 'Salir' });
    fireEvent.click(exitButton);
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('calls onExit on Escape instead of navigating', () => {
    const assign = stubLocationAssign();
    const onExit = vi.fn();
    render(<PresentationIsland {...BASE_PROPS} practiceUrl={undefined} qrSvg={null} onExit={onExit} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(assign).not.toHaveBeenCalled();
  });
});

describe('PresentationIsland — control bar accessible names', () => {
  it('gives every control a real, labeled button or link', () => {
    render(<PresentationIsland {...BASE_PROPS} />);
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mostrar respuesta' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mostrar QR' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pantalla completa' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Salir' })).toBeTruthy();
  });

  it('disables "reveal" off a content slide (cover/summary) and enables it on one', () => {
    render(<PresentationIsland {...BASE_PROPS} />);
    // Mounted ON a content slide already (owner feedback 2026-10-06) — reveal starts enabled.
    expect((screen.getByTestId('presentation-reveal') as HTMLButtonElement).disabled).toBe(false);
    prev(); // -> the cover, still reachable
    expect((screen.getByTestId('presentation-reveal') as HTMLButtonElement).disabled).toBe(true);
  });

  it('names the progress readout for assistive tech, generalized to "Diapositiva" (not just quiz questions)', () => {
    render(<PresentationIsland {...BASE_PROPS} />);
    // Mounted on slide 1 already — no more "0 de 2" first.
    expect(attr(screen.getByTestId('presentation-progress'), 'aria-label')).toBe('Diapositiva 1 de 2');
    prev();
    expect(attr(screen.getByTestId('presentation-progress'), 'aria-label')).toBe('Diapositiva 0 de 2');
  });
});

describe('PresentationIsland — the polite live region', () => {
  it('announces the first slide at mount, its reveal state, the cover (still reachable), and the summary', () => {
    render(<PresentationIsland {...BASE_PROPS} />);
    const region = () => screen.getByTestId('presentation-live-region');
    // No more "Portada" announcement first — mounts straight on slide 1.
    expect(region().textContent).toBe('Diapositiva 1 de 2');
    next();
    expect(region().textContent).toContain('revelada');
    prev();
    expect(region().textContent).toBe('Portada');
  });

  it('names a worksheet overview slide explicitly (it can never be "revealed")', () => {
    render(<PresentationIsland {...BASE_PROPS} blocks={[WORKSHEET_BLOCK]} />);
    expect(screen.getByTestId('presentation-live-region').textContent).toContain('Vista general de la hoja');
  });
});

describe('PresentationIsland — control bar idle-hide', () => {
  it('is visible on mount, hides after ~2s idle, and reappears on pointer movement', () => {
    vi.useFakeTimers();
    render(<PresentationIsland {...BASE_PROPS} />);
    const bar = screen.getByTestId('presentation-controls');
    expect(bar.className).toContain('opacity-100');

    act(() => vi.advanceTimersByTime(2000));
    expect(bar.className).toContain('opacity-0');

    fireEvent.pointerMove(screen.getByTestId('presentation-viewport'));
    expect(bar.className).toContain('opacity-100');
  });

  it('stays visible while a control inside it has keyboard focus', () => {
    vi.useFakeTimers();
    render(<PresentationIsland {...BASE_PROPS} />);
    const bar = screen.getByTestId('presentation-controls');
    act(() => {
      screen.getByTestId('presentation-next').focus();
    });
    act(() => vi.advanceTimersByTime(5000));
    expect(bar.className).toContain('opacity-100');
  });
});

const REORDER_BLOCKS: Block[] = [
  {
    id: 'q3',
    type: 'quiz',
    template: 'reorder',
    payload: {
      pools: {},
      slots: [{ id: 's1', label: 'Cats sleep', input: 'text', answer: ['Cats sleep'] }],
    },
  },
];

const GROUPSORT_BLOCKS: Block[] = [
  {
    id: 'q4',
    type: 'quiz',
    template: 'groupsort',
    payload: {
      pools: { p1: [{ id: 'dog', text: 'dog' }, { id: 'cat', text: 'cat' }, { id: 'bread', text: 'bread' }] },
      slots: [
        { id: 'g1', label: 'Animals', input: 'group', pool: 'p1', answer: ['dog', 'cat'] },
        { id: 'g2', label: 'Food', input: 'group', pool: 'p1', answer: ['bread'] },
      ],
    },
  },
];

describe('PresentationIsland — "Reordenar" (one slide per sentence)', () => {
  it('shows the scrambled words unrevealed, then the correct sentence once revealed', () => {
    render(<PresentationIsland {...BASE_PROPS} blocks={REORDER_BLOCKS} />);
    const slide = screen.getByTestId('presentation-reorder-s1');
    expect(slide.textContent).not.toContain('Cats sleep');
    expect(slide.textContent).toContain('Cats');
    expect(slide.textContent).toContain('sleep');
    expect(screen.queryByTestId('presentation-reorder-answer')).toBeNull();

    next(); // reveals, same "next reveals then advances" rule every other slide follows
    expect(screen.getByTestId('presentation-reorder-answer').textContent).toBe('Cats sleep');
  });
});

describe('PresentationIsland — "Ordenar por grupos" (one combined slide for the whole board)', () => {
  it('shows every group by name, unrevealed, then every group filled with its own items once revealed', () => {
    render(<PresentationIsland {...BASE_PROPS} blocks={GROUPSORT_BLOCKS} />);
    const slide = screen.getByTestId('presentation-groupsort-q4');
    expect(slide.textContent).toContain('Animals');
    expect(slide.textContent).toContain('Food');
    expect(slide.textContent).not.toContain('dog');
    expect(screen.queryByTestId('presentation-groupsort-item-g1-0')).toBeNull();

    next(); // reveals, same "next reveals then advances" rule every other slide follows
    expect(screen.getByTestId('presentation-groupsort-group-g1').textContent).toContain('dog');
    expect(screen.getByTestId('presentation-groupsort-group-g1').textContent).toContain('cat');
    expect(screen.getByTestId('presentation-groupsort-group-g2').textContent).toContain('bread');
  });
});

describe('PresentationIsland — SSR/hydration', () => {
  it('hydrates cleanly against its own server-rendered markup (no React #418) for a quiz-only deck', async () => {
    const { recoverableErrors } = await renderThenHydrate(() => <PresentationIsland {...BASE_PROPS} />);
    expect(recoverableErrors).toEqual([]);
  });

  it('hydrates cleanly for a deck with a worksheet (the camera layer + reduced-motion hook included)', async () => {
    const { recoverableErrors } = await renderThenHydrate(() => (
      <PresentationIsland {...BASE_PROPS} blocks={[WORKSHEET_BLOCK, ...QUIZ_BLOCKS]} />
    ));
    expect(recoverableErrors).toEqual([]);
  });
});
