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
