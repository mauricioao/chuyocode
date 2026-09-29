// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import ActivityPracticeIsland from './ActivityPracticeIsland';
import type { Block, WorksheetBlock, QuizBlock } from '@/lib/activities/blocks';

afterEach(() => cleanup());

const WORKSHEET: WorksheetBlock = {
  id: 'w1',
  type: 'worksheet',
  rotation: 0,
  image: { path: 'activity-images/act-1/img-1.webp', width: 800, height: 400 },
  zones: [
    { id: 'z1', x: 0.1, y: 0.1, w: 0.2, h: 0.1, kind: 'text', answers: ['cat'] },
    { id: 'z2', x: 0.5, y: 0.5, w: 0.2, h: 0.1, kind: 'choice', answers: ['blue'], options: ['blue', 'red'] },
  ],
};

const SECOND_WORKSHEET: WorksheetBlock = {
  id: 'w2',
  type: 'worksheet',
  rotation: 0,
  image: { path: 'activity-images/act-1/img-2.webp', width: 800, height: 400 },
  zones: [{ id: 'z3', x: 0.1, y: 0.1, w: 0.2, h: 0.1, kind: 'text', answers: ['dog'] }],
};

const QUIZ: QuizBlock = {
  id: 'q1',
  type: 'quiz',
  payload: {
    pools: {},
    slots: [{ id: 's1', label: 'The cat ___ on the mat', input: 'text', answer: ['sits'] }],
  },
};

function renderIsland(blocks: Block[]) {
  return render(<ActivityPracticeIsland lang="es" blocks={blocks} />);
}

describe('ActivityPracticeIsland — rendering blocks in order', () => {
  it('renders a worksheet block through the practice player', () => {
    renderIsland([WORKSHEET]);
    expect(screen.getByTestId('worksheet-player')).toBeTruthy();
  });

  it('renders a quiz block through the real quiz practice renderer, not a placeholder', () => {
    renderIsland([QUIZ]);
    expect(screen.getByTestId('quiz-practice-q1')).toBeTruthy();
    expect(screen.getByTestId('quiz-slot-s1')).toBeTruthy();
    expect(screen.queryByTestId('worksheet-player')).toBeNull();
  });

  it('renders mixed blocks in the given order', () => {
    const { container } = renderIsland([WORKSHEET, QUIZ]);
    const testIds = Array.from(container.querySelectorAll('[data-testid]')).map((el) =>
      el.getAttribute('data-testid'),
    );
    const worksheetIndex = testIds.indexOf('worksheet-player');
    const quizIndex = testIds.indexOf('quiz-practice-q1');
    expect(worksheetIndex).toBeGreaterThanOrEqual(0);
    expect(quizIndex).toBeGreaterThan(worksheetIndex);
  });
});

describe('ActivityPracticeIsland — Comprobar/Reintentar', () => {
  it('shows no controls when there is nothing gradable at all', () => {
    const unavailableQuiz: QuizBlock = {
      id: 'q2',
      type: 'quiz',
      payload: { pools: {}, slots: [{ id: 's1', label: 'x', input: 'hotspot', answer: ['x'] }] },
    };
    renderIsland([unavailableQuiz]);
    expect(screen.queryByTestId('practice-controls')).toBeNull();
  });

  it('shows Comprobar for a quiz-only activity — a quiz question alone is gradable content', () => {
    renderIsland([QUIZ]);
    expect(screen.getByTestId('practice-controls')).toBeTruthy();
    expect(screen.getByTestId('practice-check-button')).toBeTruthy();
  });

  it('respects the safe-area inset and clears the floating scroll-to-top button on mobile, while keeping the original desktop position', () => {
    renderIsland([QUIZ]);
    const className = screen.getByTestId('practice-controls').className;
    expect(className).toContain('env(safe-area-inset-bottom)');
    expect(className).toContain('lg:bottom-4');
  });

  it('shows Comprobar before grading', () => {
    renderIsland([WORKSHEET]);
    expect(screen.getByTestId('practice-check-button')).toBeTruthy();
    expect(screen.queryByTestId('practice-retry-button')).toBeNull();
  });

  it('grades every zone and shows the combined score on Comprobar', () => {
    renderIsland([WORKSHEET]);
    const textInput = screen.getByTestId('player-zone-z1').querySelector('input') as HTMLInputElement;
    fireEvent.change(textInput, { target: { value: 'cat' } });
    const select = screen.getByTestId('player-zone-z2').querySelector('select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'blue' } });

    fireEvent.click(screen.getByTestId('practice-check-button'));

    expect(screen.getByTestId('practice-score').textContent).toContain('2 / 2');
    expect(screen.getByTestId('player-zone-result-z1').textContent).toBe('Correcto');
    expect(screen.getByTestId('player-zone-result-z2').textContent).toBe('Correcto');
  });

  it('combines zones across MULTIPLE worksheet blocks into one score', () => {
    renderIsland([WORKSHEET, SECOND_WORKSHEET]);
    fireEvent.click(screen.getByTestId('practice-check-button'));
    // Nothing filled in: 0 correct out of 3 total zones (z1, z2, z3).
    expect(screen.getByTestId('practice-score').textContent).toContain('0 / 3');
  });

  it('swaps Comprobar for Reintentar once graded', () => {
    renderIsland([WORKSHEET]);
    fireEvent.click(screen.getByTestId('practice-check-button'));
    expect(screen.queryByTestId('practice-check-button')).toBeNull();
    expect(screen.getByTestId('practice-retry-button')).toBeTruthy();
  });

  it('disables inputs once graded', () => {
    renderIsland([WORKSHEET]);
    fireEvent.click(screen.getByTestId('practice-check-button'));
    const textInput = screen.getByTestId('player-zone-z1').querySelector('input') as HTMLInputElement;
    expect(textInput.disabled).toBe(true);
  });

  it('Reintentar clears every answer and result, and re-enables inputs', () => {
    renderIsland([WORKSHEET]);
    const textInput = screen.getByTestId('player-zone-z1').querySelector('input') as HTMLInputElement;
    fireEvent.change(textInput, { target: { value: 'cat' } });
    fireEvent.click(screen.getByTestId('practice-check-button'));

    fireEvent.click(screen.getByTestId('practice-retry-button'));

    expect(screen.queryByTestId('practice-score')).toBeNull();
    expect(screen.queryByTestId('player-zone-result-z1')).toBeNull();
    const freshInput = screen.getByTestId('player-zone-z1').querySelector('input') as HTMLInputElement;
    expect(freshInput.value).toBe('');
    expect(freshInput.disabled).toBe(false);
    expect(screen.getByTestId('practice-check-button')).toBeTruthy();
  });
});

describe('ActivityPracticeIsland — quiz questions grade into the combined score', () => {
  it('grades a quiz-only activity and shows per-question feedback', () => {
    renderIsland([QUIZ]);
    const input = screen.getByTestId('quiz-slot-s1').querySelector('input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'sits' } });

    fireEvent.click(screen.getByTestId('practice-check-button'));

    expect(screen.getByTestId('practice-score').textContent).toContain('1 / 1');
    expect(screen.getByTestId('quiz-slot-result-s1').textContent).toBe('Correcto');
  });

  it('combines worksheet zones AND quiz questions into one score', () => {
    renderIsland([WORKSHEET, QUIZ]);
    const zoneInput = screen.getByTestId('player-zone-z1').querySelector('input') as HTMLInputElement;
    fireEvent.change(zoneInput, { target: { value: 'cat' } });
    const zoneSelect = screen.getByTestId('player-zone-z2').querySelector('select') as HTMLSelectElement;
    fireEvent.change(zoneSelect, { target: { value: 'blue' } });
    const quizInput = screen.getByTestId('quiz-slot-s1').querySelector('input') as HTMLInputElement;
    fireEvent.change(quizInput, { target: { value: 'wrong' } });

    fireEvent.click(screen.getByTestId('practice-check-button'));

    // 2 correct worksheet zones + 0 correct quiz question, out of 2 + 1 = 3.
    expect(screen.getByTestId('practice-score').textContent).toContain('2 / 3');
    expect(screen.getByTestId('quiz-slot-result-s1').textContent).toBe('Incorrecto');
  });

  it('a quiz slot with no shipped renderer is excluded from the denominator', () => {
    const unavailableQuiz: QuizBlock = {
      id: 'q2',
      type: 'quiz',
      payload: {
        pools: {},
        slots: [
          { id: 's1', label: 'x', input: 'text', answer: ['cat'] },
          { id: 's2', label: 'y', input: 'hotspot', answer: ['z'] },
        ],
      },
    };
    renderIsland([unavailableQuiz]);
    const input = screen.getByTestId('quiz-slot-s1').querySelector('input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'cat' } });

    fireEvent.click(screen.getByTestId('practice-check-button'));

    expect(screen.getByTestId('practice-score').textContent).toContain('1 / 1');
    expect(screen.getByTestId('slot-unavailable-s2')).toBeTruthy();
  });

  it('Reintentar clears quiz answers and results too', () => {
    renderIsland([QUIZ]);
    const input = screen.getByTestId('quiz-slot-s1').querySelector('input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'sits' } });
    fireEvent.click(screen.getByTestId('practice-check-button'));

    fireEvent.click(screen.getByTestId('practice-retry-button'));

    expect(screen.queryByTestId('quiz-slot-result-s1')).toBeNull();
    const freshInput = screen.getByTestId('quiz-slot-s1').querySelector('input') as HTMLInputElement;
    expect(freshInput.value).toBe('');
    expect(freshInput.disabled).toBe(false);
  });
});

/** D4 "Escuchar/Listen" — Comprobar/Reintentar stop whichever question was being read aloud. */
describe('ActivityPracticeIsland — speech (D4)', () => {
  function installSynth() {
    const synth = {
      getVoices: () => [],
      speak: vi.fn(),
      cancel: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    Object.defineProperty(window, 'speechSynthesis', { value: synth, writable: true, configurable: true });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      value: class {
        constructor(public text: string) {}
      },
      writable: true,
      configurable: true,
    });
    return synth;
  }

  afterEach(() => {
    Reflect.deleteProperty(window, 'speechSynthesis');
    Reflect.deleteProperty(window, 'SpeechSynthesisUtterance');
  });

  it('stops speech when Comprobar is pressed', () => {
    const synth = installSynth();
    renderIsland([QUIZ]);

    fireEvent.click(screen.getByTestId('speak-button'));
    synth.cancel.mockClear();
    fireEvent.click(screen.getByTestId('practice-check-button'));

    expect(synth.cancel).toHaveBeenCalled();
  });

  it('stops speech when Reintentar is pressed', () => {
    const synth = installSynth();
    renderIsland([QUIZ]);

    fireEvent.click(screen.getByTestId('practice-check-button'));
    fireEvent.click(screen.getByTestId('speak-button'));
    synth.cancel.mockClear();
    fireEvent.click(screen.getByTestId('practice-retry-button'));

    expect(synth.cancel).toHaveBeenCalled();
  });
});
