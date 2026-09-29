// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import QuizBlockPractice from './QuizBlockPractice';
import type { QuizBlock } from '@/lib/activities/blocks';

afterEach(() => cleanup());

const TEXT_BLOCK: QuizBlock = {
  id: 'q1',
  type: 'quiz',
  payload: {
    pools: {},
    slots: [{ id: 's1', label: 'The cat ___ on the mat', input: 'text', answer: ['sits'] }],
  },
};

describe('QuizBlockPractice — rendering', () => {
  it('renders one slot per question, via the real mechanic renderer', () => {
    render(
      <QuizBlockPractice lang="es" block={TEXT_BLOCK} response={{}} onChange={vi.fn()} disabled={false} />,
    );
    expect(screen.getByTestId('quiz-practice-q1')).toBeTruthy();
    expect(screen.getByTestId('quiz-slot-s1').querySelector('input')).toBeTruthy();
  });

  it('degrades a slot with no shipped renderer to the unavailable notice', () => {
    const block: QuizBlock = {
      id: 'q1',
      type: 'quiz',
      payload: { pools: {}, slots: [{ id: 's1', label: 'x', input: 'hotspot', answer: ['x'] }] },
    };
    render(<QuizBlockPractice lang="es" block={block} response={{}} onChange={vi.fn()} disabled={false} />);
    expect(screen.getByTestId('slot-unavailable-s1')).toBeTruthy();
  });
});

describe('QuizBlockPractice — answering', () => {
  it('reports a typed answer through onChange, keyed by slot id', () => {
    const onChange = vi.fn();
    render(
      <QuizBlockPractice lang="es" block={TEXT_BLOCK} response={{}} onChange={onChange} disabled={false} />,
    );
    const input = screen.getByTestId('quiz-slot-s1').querySelector('input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'sits' } });
    expect(onChange).toHaveBeenCalledWith('s1', ['sits']);
  });

  it('disables the control once graded', () => {
    render(
      <QuizBlockPractice lang="es" block={TEXT_BLOCK} response={{}} onChange={vi.fn()} disabled />,
    );
    const input = screen.getByTestId('quiz-slot-s1').querySelector('input') as HTMLInputElement;
    expect(input.disabled).toBe(true);
  });
});

describe('QuizBlockPractice — per-slot feedback', () => {
  it('shows no result before grading (outcomes absent)', () => {
    render(
      <QuizBlockPractice lang="es" block={TEXT_BLOCK} response={{}} onChange={vi.fn()} disabled={false} />,
    );
    expect(screen.queryByTestId('quiz-slot-result-s1')).toBeNull();
  });

  it('shows Correcto/Incorrecto once outcomes are provided', () => {
    render(
      <QuizBlockPractice
        lang="es"
        block={TEXT_BLOCK}
        response={{ s1: ['sits'] }}
        onChange={vi.fn()}
        outcomes={{ s1: 'correct' }}
        disabled
      />,
    );
    expect(screen.getByTestId('quiz-slot-result-s1').textContent).toBe('Correcto');
  });

  it('never renders a result for an unavailable outcome', () => {
    render(
      <QuizBlockPractice
        lang="es"
        block={TEXT_BLOCK}
        response={{}}
        onChange={vi.fn()}
        outcomes={{ s1: 'unavailable' }}
        disabled
      />,
    );
    expect(screen.queryByTestId('quiz-slot-result-s1')).toBeNull();
  });
});

/** D4 "Escuchar/Listen" — SpeakButton next to each question's own label. jsdom has no speechSynthesis by default. */
describe('QuizBlockPractice — speech (D4)', () => {
  it('renders no speak button when speechSynthesis is unsupported (jsdom default)', () => {
    render(
      <QuizBlockPractice lang="es" block={TEXT_BLOCK} response={{}} onChange={vi.fn()} disabled={false} />,
    );
    expect(screen.queryByTestId('speak-button')).toBeNull();
  });

  it('renders a speak button for the question label when supported', () => {
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

    render(
      <QuizBlockPractice lang="es" block={TEXT_BLOCK} response={{}} onChange={vi.fn()} disabled={false} />,
    );
    expect(screen.getByTestId('speak-button')).toBeTruthy();

    Reflect.deleteProperty(window, 'speechSynthesis');
    Reflect.deleteProperty(window, 'SpeechSynthesisUtterance');
  });
});
