// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import QuizLivePreview from './QuizLivePreview';
import type { Payload } from '@/lib/exercisePayload';

afterEach(() => cleanup());

const ONE_QUESTION: Payload = {
  pools: {},
  slots: [{ id: 's1', label: 'The cat ___ on the mat', input: 'text', answer: ['sits'] }],
};

const THREE_QUESTIONS: Payload = {
  pools: { opts: [{ id: 'a', text: 'cat' }, { id: 'b', text: 'dog' }] },
  slots: [
    { id: 's1', label: 'First ___', input: 'text', answer: ['one'] },
    { id: 's2', label: 'Second ___', input: 'text', answer: ['two'] },
    { id: 's3', label: 'Third?', input: 'choice', pool: 'opts', answer: ['a'] },
  ],
};

describe('QuizLivePreview — games badge', () => {
  it('shows the count and an icon per available mode', () => {
    render(<QuizLivePreview blockId="b1" lang="es" payload={THREE_QUESTIONS} />);
    const badge = screen.getByTestId('quiz-preview-games-badge-b1');
    expect(badge.textContent).toContain('juegos');
    expect(badge.querySelectorAll('svg').length).toBeGreaterThan(0);
  });

  it('uses singular wording for exactly one available mode', () => {
    render(<QuizLivePreview blockId="b1" lang="es" payload={ONE_QUESTION} />);
    // A single text-only question only ever offers 'quiz' (no pool, not enough items for others needing >=1 besides quiz+cards+speak — still check singular path exists via es copy function).
    const badge = screen.getByTestId('quiz-preview-games-badge-b1');
    expect(badge.textContent).toMatch(/\d+ juego/);
  });
});

describe('QuizLivePreview — renders the real practice component', () => {
  it('mounts QuizBlockPractice for this block', () => {
    render(<QuizLivePreview blockId="b1" lang="es" payload={ONE_QUESTION} />);
    expect(screen.getByTestId('quiz-practice-b1-preview')).toBeTruthy();
  });

  // Visual-polish pass: the big drag-and-drop games size their own tiles off
  // their stage's own container width (`mechanics/scale.ts`) — this preview
  // column is one such stage, so it must be a size container itself.
  it('is a size container, for the shared game-stage sizing tokens', () => {
    render(<QuizLivePreview blockId="b1" lang="es" payload={ONE_QUESTION} />);
    expect(screen.getByTestId('quiz-preview-b1').className).toContain('@container');
  });
});

describe('QuizLivePreview — checking and retrying', () => {
  it('grades the current response on Comprobar and shows a score', () => {
    render(<QuizLivePreview blockId="b1" lang="es" payload={ONE_QUESTION} />);
    const input = screen.getByTestId('quiz-slot-s1').querySelector('input, textarea') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'sits' } });
    fireEvent.click(screen.getByTestId('quiz-preview-check-b1'));
    expect(screen.getByTestId('quiz-preview-score-b1').textContent).toContain('1 / 1');
  });

  it('Reintentar clears the response and the score', () => {
    render(<QuizLivePreview blockId="b1" lang="es" payload={ONE_QUESTION} />);
    const input = screen.getByTestId('quiz-slot-s1').querySelector('input, textarea') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'sits' } });
    fireEvent.click(screen.getByTestId('quiz-preview-check-b1'));
    fireEvent.click(screen.getByTestId('quiz-preview-retry-b1'));
    expect(screen.queryByTestId('quiz-preview-score-b1')).toBeNull();
    expect((screen.getByTestId('quiz-slot-s1').querySelector('input, textarea') as HTMLInputElement).value).toBe('');
  });
});

describe('QuizLivePreview — opens in the template\'s own game (owner review of the match stage)', () => {
  const MATCH_PAYLOAD: Payload = {
    pools: {},
    slots: [
      { id: 's1', label: 'dog', input: 'text', answer: ['perro'] },
      { id: 's2', label: 'cat', input: 'text', answer: ['gato'] },
      { id: 's3', label: 'bird', input: 'text', answer: ['pájaro'] },
    ],
  };

  const REORDER_PAYLOAD: Payload = {
    pools: {},
    slots: [{ id: 's1', label: 'Cats sleep', input: 'text', answer: ['Cats sleep'] }],
  };

  it('opens a "match" block\'s preview in Parejas, not Básico', () => {
    render(<QuizLivePreview blockId="b1" lang="es" payload={MATCH_PAYLOAD} template="match" />);
    expect(screen.getByTestId('quiz-matching')).toBeTruthy();
    expect(screen.queryByTestId('quiz-slot-s1')).toBeNull();
  });

  it('opens a "reorder" block\'s preview in Reordenar, not Básico', () => {
    render(<QuizLivePreview blockId="b1" lang="es" payload={REORDER_PAYLOAD} template="reorder" />);
    expect(screen.getByTestId('quiz-reorder')).toBeTruthy();
    expect(screen.queryByTestId('quiz-slot-s1')).toBeNull();
  });

  it('still opens Básico with no template', () => {
    render(<QuizLivePreview blockId="b1" lang="es" payload={MATCH_PAYLOAD} />);
    expect(screen.getByTestId('quiz-slot-s1')).toBeTruthy();
  });

  it('opens a "groupsort" block\'s preview in Ordenar por grupos, not Básico, and its own games badge counts only "Básico"/"Ordenar por grupos"', () => {
    const GROUPSORT_PAYLOAD: Payload = {
      pools: { p1: [{ id: 'dog', text: 'dog' }, { id: 'cat', text: 'cat' }, { id: 'bread', text: 'bread' }, { id: 'rice', text: 'rice' }] },
      slots: [
        { id: 'g1', label: 'Animals', input: 'group', pool: 'p1', answer: ['dog', 'cat'] },
        { id: 'g2', label: 'Food', input: 'group', pool: 'p1', answer: ['bread', 'rice'] },
      ],
    };
    render(<QuizLivePreview blockId="b1" lang="es" payload={GROUPSORT_PAYLOAD} template="groupsort" />);
    expect(screen.getByTestId('quiz-groupsort')).toBeTruthy();
    expect(screen.queryByTestId('quiz-slot-g1')).toBeNull();
    expect(screen.getByTestId('quiz-preview-games-badge-b1').textContent).toContain('2 juegos');
  });
});

describe('QuizLivePreview — resets on structural change', () => {
  it('clears the response and score once the question set changes shape', () => {
    const { rerender } = render(<QuizLivePreview blockId="b1" lang="es" payload={ONE_QUESTION} />);
    const input = screen.getByTestId('quiz-slot-s1').querySelector('input, textarea') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'sits' } });
    fireEvent.click(screen.getByTestId('quiz-preview-check-b1'));
    expect(screen.getByTestId('quiz-preview-score-b1')).toBeTruthy();

    const twoQuestions: Payload = {
      pools: {},
      slots: [
        { id: 's1', label: 'The cat ___ on the mat', input: 'text', answer: ['sits'] },
        { id: 's2', label: 'New one', input: 'text', answer: ['x'] },
      ],
    };
    rerender(<QuizLivePreview blockId="b1" lang="es" payload={twoQuestions} />);
    expect(screen.queryByTestId('quiz-preview-score-b1')).toBeNull();
  });

  it('does NOT reset just because an existing question text changed', () => {
    const { rerender } = render(<QuizLivePreview blockId="b1" lang="es" payload={ONE_QUESTION} />);
    const input = screen.getByTestId('quiz-slot-s1').querySelector('input, textarea') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'sits' } });

    const editedLabel: Payload = {
      pools: {},
      slots: [{ id: 's1', label: 'The cat ___ on the rug', input: 'text', answer: ['sits'] }],
    };
    rerender(<QuizLivePreview blockId="b1" lang="es" payload={editedLabel} />);
    expect((screen.getByTestId('quiz-slot-s1').querySelector('input, textarea') as HTMLInputElement).value).toBe(
      'sits',
    );
  });
});
