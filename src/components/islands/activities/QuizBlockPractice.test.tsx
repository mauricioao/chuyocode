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

/** D5 "¿Por qué?" — the explanation, inline under the question, only once graded and only while incorrect. */
describe('QuizBlockPractice — explanation (D5)', () => {
  const EXPLAINED_BLOCK: QuizBlock = {
    id: 'q1',
    type: 'quiz',
    payload: {
      pools: {},
      slots: [
        { id: 's1', label: 'The cat ___ on the mat', input: 'text', answer: ['sits'], explanation: 'Third person -s.' },
      ],
    },
  };

  it('shows nothing before grading (outcomes absent)', () => {
    render(
      <QuizBlockPractice lang="es" block={EXPLAINED_BLOCK} response={{}} onChange={vi.fn()} disabled={false} />,
    );
    expect(screen.queryByTestId('quiz-slot-explanation-s1')).toBeNull();
  });

  it('shows nothing for a correct answer', () => {
    render(
      <QuizBlockPractice
        lang="es"
        block={EXPLAINED_BLOCK}
        response={{ s1: ['sits'] }}
        onChange={vi.fn()}
        outcomes={{ s1: 'correct' }}
        disabled
      />,
    );
    expect(screen.queryByTestId('quiz-slot-explanation-s1')).toBeNull();
  });

  it('shows the explanation inline under the question for an incorrect answer', () => {
    render(
      <QuizBlockPractice
        lang="es"
        block={EXPLAINED_BLOCK}
        response={{ s1: ['wrong'] }}
        onChange={vi.fn()}
        outcomes={{ s1: 'incorrect' }}
        disabled
      />,
    );
    expect(screen.getByTestId('quiz-slot-explanation-s1').textContent).toContain('Third person -s.');
  });

  it('shows nothing for an incorrect answer with no explanation authored', () => {
    render(
      <QuizBlockPractice
        lang="es"
        block={TEXT_BLOCK}
        response={{ s1: ['wrong'] }}
        onChange={vi.fn()}
        outcomes={{ s1: 'incorrect' }}
        disabled
      />,
    );
    expect(screen.queryByTestId('quiz-slot-explanation-s1')).toBeNull();
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

/** D1 "Una actividad, muchos juegos" — the game-mode switcher + Tarjetas (cards). */
describe('QuizBlockPractice — game modes (D1)', () => {
  const THREE_SLOT_BLOCK: QuizBlock = {
    id: 'q1',
    type: 'quiz',
    payload: {
      pools: {},
      slots: [
        { id: 's1', label: 'The cat ___ on the mat', input: 'text', answer: ['sits'] },
        { id: 's2', label: 'What color is the sky?', input: 'text', answer: ['blue'] },
        { id: 's3', label: 'How many days in a week?', input: 'text', answer: ['seven'] },
      ],
    },
  };

  it('shows no switcher for a block with no answerable slots yet (only quiz is available)', () => {
    const EMPTY_BLOCK: QuizBlock = { id: 'q1', type: 'quiz', payload: { pools: {}, slots: [] } };
    render(<QuizBlockPractice lang="es" block={EMPTY_BLOCK} response={{}} onChange={vi.fn()} disabled={false} />);
    expect(screen.queryByTestId('quiz-game-mode-switcher')).toBeNull();
  });

  it('offers Tarjetas even for a single-question block', () => {
    render(<QuizBlockPractice lang="es" block={TEXT_BLOCK} response={{}} onChange={vi.fn()} disabled={false} />);
    expect(screen.getByTestId('quiz-game-mode-cards')).toBeTruthy();
  });

  it('shows the switcher with quiz + cards + match for a block with 3+ items and unique answers', () => {
    render(<QuizBlockPractice lang="es" block={THREE_SLOT_BLOCK} response={{}} onChange={vi.fn()} disabled={false} />);
    expect(screen.getByTestId('quiz-game-mode-quiz')).toBeTruthy();
    expect(screen.getByTestId('quiz-game-mode-cards')).toBeTruthy();
    expect(screen.getByTestId('quiz-game-mode-match')).toBeTruthy();
  });

  it('withholds match from a two-item block, keeping quiz + cards', () => {
    const TWO_SLOT_BLOCK: QuizBlock = {
      id: 'q1',
      type: 'quiz',
      payload: {
        pools: {},
        slots: [
          { id: 's1', label: 'x ___', input: 'text', answer: ['a'] },
          { id: 's2', label: 'y ___', input: 'text', answer: ['b'] },
        ],
      },
    };
    render(<QuizBlockPractice lang="es" block={TWO_SLOT_BLOCK} response={{}} onChange={vi.fn()} disabled={false} />);
    expect(screen.getByTestId('quiz-game-mode-cards')).toBeTruthy();
    expect(screen.queryByTestId('quiz-game-mode-match')).toBeNull();
  });

  it('renders the quiz slots by default', () => {
    render(<QuizBlockPractice lang="es" block={THREE_SLOT_BLOCK} response={{}} onChange={vi.fn()} disabled={false} />);
    expect(screen.getByTestId('quiz-slot-s1')).toBeTruthy();
    expect(screen.queryByTestId('quiz-flashcards')).toBeNull();
  });

  it('renders Tarjetas when mode="cards"', () => {
    render(
      <QuizBlockPractice
        lang="es"
        block={THREE_SLOT_BLOCK}
        response={{}}
        onChange={vi.fn()}
        disabled={false}
        mode="cards"
        onModeChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('quiz-flashcards')).toBeTruthy();
    expect(screen.queryByTestId('quiz-slot-s1')).toBeNull();
  });

  it('renders Parejas when mode="match"', () => {
    render(
      <QuizBlockPractice
        lang="es"
        block={THREE_SLOT_BLOCK}
        response={{}}
        onChange={vi.fn()}
        disabled={false}
        mode="match"
        onModeChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('quiz-matching')).toBeTruthy();
    expect(screen.queryByTestId('quiz-slot-s1')).toBeNull();
  });

  it('renders Cartas when mode="speak"', () => {
    render(
      <QuizBlockPractice
        lang="es"
        block={THREE_SLOT_BLOCK}
        response={{}}
        onChange={vi.fn()}
        disabled={false}
        mode="speak"
        onModeChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('speaking-cards')).toBeTruthy();
    expect(screen.queryByTestId('quiz-slot-s1')).toBeNull();
  });

  it('renders Ruleta when mode="wheel"', () => {
    render(
      <QuizBlockPractice
        lang="es"
        block={THREE_SLOT_BLOCK}
        response={{}}
        onChange={vi.fn()}
        disabled={false}
        mode="wheel"
        onModeChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('quiz-wheel')).toBeTruthy();
    expect(screen.queryByTestId('quiz-slot-s1')).toBeNull();
  });

  it('renders Anagrama when mode="anagram", filtered to eligible single-word answers', () => {
    render(
      <QuizBlockPractice
        lang="es"
        block={THREE_SLOT_BLOCK}
        response={{}}
        onChange={vi.fn()}
        disabled={false}
        mode="anagram"
        onModeChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('quiz-anagram')).toBeTruthy();
    expect(screen.queryByTestId('quiz-slot-s1')).toBeNull();
  });

  it('renders Ahorcado when mode="hangman", filtered to eligible single-word answers', () => {
    render(
      <QuizBlockPractice
        lang="es"
        block={THREE_SLOT_BLOCK}
        response={{}}
        onChange={vi.fn()}
        disabled={false}
        mode="hangman"
        onModeChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('quiz-hangman')).toBeTruthy();
    expect(screen.queryByTestId('quiz-slot-s1')).toBeNull();
  });

  it('renders Verdadero o falso when mode="truefalse", for a block with pool-backed eligible slots', () => {
    const TRUEFALSE_BLOCK: QuizBlock = {
      id: 'q-tf',
      type: 'quiz',
      payload: {
        pools: { p1: [{ id: 'cat', text: 'cat' }, { id: 'dog', text: 'dog' }] },
        slots: [
          { id: 's1', label: 'The animal is a ___.', input: 'choice', pool: 'p1', answer: ['cat'] },
          { id: 's2', label: 'The pet is a ___.', input: 'choice', pool: 'p1', answer: ['dog'] },
        ],
      },
    };
    render(
      <QuizBlockPractice
        lang="es"
        block={TRUEFALSE_BLOCK}
        response={{}}
        onChange={vi.fn()}
        disabled={false}
        mode="truefalse"
        onModeChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('quiz-truefalse')).toBeTruthy();
    expect(screen.queryByTestId('quiz-slot-s1')).toBeNull();
  });

  it('renders Abre la caja when mode="openbox"', () => {
    render(
      <QuizBlockPractice
        lang="es"
        block={THREE_SLOT_BLOCK}
        response={{}}
        onChange={vi.fn()}
        disabled={false}
        mode="openbox"
        onModeChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('quiz-openbox')).toBeTruthy();
    expect(screen.queryByTestId('quiz-slot-s1')).toBeNull();
  });

  it('reports a mode change through onModeChange', () => {
    const onModeChange = vi.fn();
    render(
      <QuizBlockPractice
        lang="es"
        block={THREE_SLOT_BLOCK}
        response={{}}
        onChange={vi.fn()}
        disabled={false}
        onModeChange={onModeChange}
      />,
    );
    fireEvent.click(screen.getByTestId('quiz-game-mode-cards'));
    expect(onModeChange).toHaveBeenCalledWith('cards');
  });

  it('preserves quiz-mode answers when the response prop is unchanged across a mode switch', () => {
    const { rerender } = render(
      <QuizBlockPractice
        lang="es"
        block={THREE_SLOT_BLOCK}
        response={{ s1: ['sits'] }}
        onChange={vi.fn()}
        disabled={false}
        mode="cards"
        onModeChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('quiz-flashcards')).toBeTruthy();

    rerender(
      <QuizBlockPractice
        lang="es"
        block={THREE_SLOT_BLOCK}
        response={{ s1: ['sits'] }}
        onChange={vi.fn()}
        disabled={false}
        mode="quiz"
        onModeChange={vi.fn()}
      />,
    );
    const input = screen.getByTestId('quiz-slot-s1').querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('sits');
  });
});

describe('QuizBlockPractice — "Ordenar por grupos" (groupsort) restricts its own modes', () => {
  const GROUPSORT_BLOCK: QuizBlock = {
    id: 'q1',
    type: 'quiz',
    template: 'groupsort',
    payload: {
      pools: { p1: [{ id: 'dog', text: 'dog' }, { id: 'cat', text: 'cat' }, { id: 'bread', text: 'bread' }, { id: 'rice', text: 'rice' }] },
      slots: [
        { id: 'g1', label: 'Animals', input: 'group', pool: 'p1', answer: ['dog', 'cat'] },
        { id: 'g2', label: 'Food', input: 'group', pool: 'p1', answer: ['bread', 'rice'] },
      ],
    },
  };

  it('offers only "Básico" and "Ordenar por grupos" — not cards/match/anagram/etc., which would collapse a group to just its first item', () => {
    render(<QuizBlockPractice lang="es" block={GROUPSORT_BLOCK} response={{}} onChange={vi.fn()} disabled={false} />);
    expect(screen.getByTestId('quiz-game-mode-quiz')).toBeTruthy();
    expect(screen.getByTestId('quiz-game-mode-groupsort')).toBeTruthy();
    expect(screen.queryByTestId('quiz-game-mode-cards')).toBeNull();
    expect(screen.queryByTestId('quiz-game-mode-match')).toBeNull();
    expect(screen.queryByTestId('quiz-game-mode-anagram')).toBeNull();
  });

  it('renders the groupsort board when mode="groupsort"', () => {
    render(
      <QuizBlockPractice
        lang="es"
        block={GROUPSORT_BLOCK}
        response={{}}
        onChange={vi.fn()}
        disabled={false}
        mode="groupsort"
        onModeChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('quiz-groupsort')).toBeTruthy();
  });

  it('degrades Básico to an "unavailable" placeholder per group, instead of crashing on the unknown "group" mechanic', () => {
    render(
      <QuizBlockPractice
        lang="es"
        block={GROUPSORT_BLOCK}
        response={{}}
        onChange={vi.fn()}
        disabled={false}
        mode="quiz"
        onModeChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('quiz-slot-g1')).toBeTruthy();
    expect(screen.queryByTestId('quiz-groupsort')).toBeNull();
  });
});
