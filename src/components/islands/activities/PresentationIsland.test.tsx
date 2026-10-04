// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { renderThenHydrate } from '@/testSupport/hydrationHarness';
import type { QuizBlock } from '@/lib/activities/blocks';
import PresentationIsland from './PresentationIsland';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const QUIZ_BLOCKS: QuizBlock[] = [
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

const BASE_PROPS = {
  lang: 'es' as const,
  title: 'Animales y capitales',
  level: 'A2' as const,
  practiceUrl: '/es/ingles/actividades/abc',
  qrSvg: '<svg data-testid="fake-qr"></svg>',
  quizBlocks: QUIZ_BLOCKS,
};

function next() {
  fireEvent.click(screen.getByTestId('presentation-next'));
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

describe('PresentationIsland — cover slide', () => {
  it('shows the title, level, question count, and the QR with its own caption', () => {
    render(<PresentationIsland {...BASE_PROPS} />);
    const cover = screen.getByTestId('presentation-slide-cover');
    expect(cover.textContent).toContain('Animales y capitales');
    expect(cover.textContent).toContain('A2');
    expect(cover.textContent).toContain('2 preguntas');
    expect(screen.getByTestId('presentation-cover-qr')).toBeTruthy();
    expect(cover.textContent).toContain('Escanear el código');
  });

  it('skips the QR block entirely when none was generated', () => {
    render(<PresentationIsland {...BASE_PROPS} qrSvg={null} />);
    expect(screen.queryByTestId('presentation-cover-qr')).toBeNull();
  });

  it('shows "Sin nivel" when the activity has no level', () => {
    render(<PresentationIsland {...BASE_PROPS} level={null} />);
    expect(screen.getByTestId('presentation-slide-cover').textContent).toContain('Sin nivel');
  });
});

describe('PresentationIsland — the full flow', () => {
  it('walks cover -> q1 (unrevealed) -> q1 (revealed) -> q2 (unrevealed) -> q2 (revealed) -> summary -> restart', () => {
    render(<PresentationIsland {...BASE_PROPS} />);

    // cover -> next shows question 1, nothing revealed yet.
    next();
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

    // Restart returns to the cover.
    fireEvent.click(screen.getByTestId('presentation-restart'));
    expect(screen.getByTestId('presentation-slide-cover')).toBeTruthy();
  });

  it('dims the wrong option without removing it, once revealed', () => {
    render(<PresentationIsland {...BASE_PROPS} />);
    next(); // q1 unrevealed
    next(); // q1 revealed
    const wrong = screen.getByTestId('presentation-option-b');
    expect(wrong.textContent).toContain('Dog');
    expect(wrong.className).toContain('opacity-40');
  });

  it('previous steps back and hides the answer again', () => {
    render(<PresentationIsland {...BASE_PROPS} />);
    next(); // q1 unrevealed
    next(); // q1 revealed
    next(); // q2 unrevealed
    fireEvent.click(screen.getByTestId('presentation-prev'));
    expect(screen.getByTestId('presentation-question-s1')).toBeTruthy();
    expect(screen.queryByTestId('presentation-option-correct-a')).toBeNull();
  });
});

describe('PresentationIsland — keyboard map', () => {
  it.each([['ArrowRight'], [' '], ['PageDown'], ['Enter']])('"%s" advances/reveals like the next button', (key) => {
    render(<PresentationIsland {...BASE_PROPS} />);
    fireEvent.keyDown(window, { key });
    expect(screen.getByTestId('presentation-question-s1')).toBeTruthy();
  });

  it.each([['ArrowLeft'], ['PageUp']])('"%s" steps back like the previous button', (key) => {
    render(<PresentationIsland {...BASE_PROPS} />);
    next();
    next();
    fireEvent.keyDown(window, { key });
    expect(screen.queryByTestId('presentation-option-correct-a')).toBeNull();
  });

  it.each([['r'], ['R']])('"%s" reveals without advancing', (key) => {
    render(<PresentationIsland {...BASE_PROPS} />);
    next(); // q1 unrevealed
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
    screen.getByTestId('presentation-next').focus();
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

describe('PresentationIsland — control bar accessible names', () => {
  it('gives every control a real, labeled button or link', () => {
    render(<PresentationIsland {...BASE_PROPS} />);
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mostrar respuesta' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pantalla completa' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Salir' })).toBeTruthy();
  });

  it('disables "reveal" off a question slide (cover/summary) and enables it on one', () => {
    render(<PresentationIsland {...BASE_PROPS} />);
    expect((screen.getByTestId('presentation-reveal') as HTMLButtonElement).disabled).toBe(true);
    next();
    expect((screen.getByTestId('presentation-reveal') as HTMLButtonElement).disabled).toBe(false);
  });

  it('names the progress readout for assistive tech', () => {
    render(<PresentationIsland {...BASE_PROPS} />);
    expect(attr(screen.getByTestId('presentation-progress'), 'aria-label')).toBe('Pregunta 0 de 2');
    next();
    expect(attr(screen.getByTestId('presentation-progress'), 'aria-label')).toBe('Pregunta 1 de 2');
  });
});

describe('PresentationIsland — the polite live region', () => {
  it('announces the cover, each question (with reveal state), and the summary', () => {
    render(<PresentationIsland {...BASE_PROPS} />);
    const region = () => screen.getByTestId('presentation-live-region');
    expect(region().textContent).toBe('Portada');
    next();
    expect(region().textContent).toBe('Pregunta 1 de 2');
    next();
    expect(region().textContent).toContain('revelada');
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

describe('PresentationIsland — SSR/hydration', () => {
  it('hydrates cleanly against its own server-rendered markup (no React #418)', async () => {
    const { recoverableErrors } = await renderThenHydrate(() => <PresentationIsland {...BASE_PROPS} />);
    expect(recoverableErrors).toEqual([]);
  });
});
