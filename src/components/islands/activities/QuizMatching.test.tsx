// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { GameItem } from '@/lib/activities/gameModes';
import QuizMatching from './QuizMatching';

afterEach(cleanup);

const items: GameItem[] = [
  { id: 's1', prompt: 'The cat ____ on the mat.', answer: 'sits' },
  { id: 's2', prompt: 'What color is the sky?', answer: 'blue' },
  { id: 's3', prompt: 'How many days in a week?', answer: 'seven' },
];

describe('QuizMatching', () => {
  it('renders one tile per item, in each column', () => {
    render(<QuizMatching lang="es" items={items} seed="block-1" />);
    for (const item of items) {
      expect(screen.getByTestId(`matching-prompt-${item.id}`)).toBeTruthy();
      expect(screen.getByTestId(`matching-answer-${item.id}`)).toBeTruthy();
    }
    expect(screen.getByTestId('matching-pairs').textContent).toBe('Parejas: 0 / 3');
  });

  it('locks a correct pair, updating the counter', () => {
    render(<QuizMatching lang="es" items={items} seed="block-1" />);
    fireEvent.click(screen.getByTestId('matching-prompt-s1'));
    fireEvent.click(screen.getByTestId('matching-answer-s1'));

    expect(screen.getByTestId('matching-pairs').textContent).toBe('Parejas: 1 / 3');
    expect(screen.getByTestId('matching-prompt-s1').hasAttribute('disabled')).toBe(true);
    expect(screen.getByTestId('matching-answer-s1').hasAttribute('disabled')).toBe(true);
  });

  it('works selecting the answer first, then the prompt', () => {
    render(<QuizMatching lang="es" items={items} seed="block-1" />);
    fireEvent.click(screen.getByTestId('matching-answer-s2'));
    fireEvent.click(screen.getByTestId('matching-prompt-s2'));
    expect(screen.getByTestId('matching-pairs').textContent).toBe('Parejas: 1 / 3');
  });

  it('deselects a tile clicked twice in a row, so the next answer click alone matches nothing', () => {
    render(<QuizMatching lang="es" items={items} seed="block-1" />);
    const prompt = screen.getByTestId('matching-prompt-s1');
    fireEvent.click(prompt); // select
    fireEvent.click(prompt); // deselect
    fireEvent.click(screen.getByTestId('matching-answer-s1')); // nothing was selected -> just selects the answer
    expect(screen.getByTestId('matching-pairs').textContent).toBe('Parejas: 0 / 3');

    fireEvent.click(prompt); // completes the pair from the still-selected answer
    expect(screen.getByTestId('matching-pairs').textContent).toBe('Parejas: 1 / 3');
  });

  describe('a wrong attempt', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('flashes both tiles and resets the selection, without locking a pair', () => {
      render(<QuizMatching lang="es" items={items} seed="block-1" />);
      fireEvent.click(screen.getByTestId('matching-prompt-s1'));
      fireEvent.click(screen.getByTestId('matching-answer-s2'));

      expect(screen.getByTestId('matching-pairs').textContent).toBe('Parejas: 0 / 3');
      expect(screen.getByTestId('matching-prompt-s1').className).toContain('border-destructive');
      expect(screen.getByTestId('matching-answer-s2').className).toContain('border-destructive');

      act(() => vi.advanceTimersByTime(700));
      expect(screen.getByTestId('matching-prompt-s1').className).not.toContain('border-destructive');
    });

    it('ignores a click while the wrong-attempt flash is showing', () => {
      render(<QuizMatching lang="es" items={items} seed="block-1" />);
      fireEvent.click(screen.getByTestId('matching-prompt-s1'));
      fireEvent.click(screen.getByTestId('matching-answer-s2')); // wrong, now flashing

      fireEvent.click(screen.getByTestId('matching-prompt-s3')); // ignored while flashing
      act(() => vi.advanceTimersByTime(700));
      fireEvent.click(screen.getByTestId('matching-answer-s3'));
      expect(screen.getByTestId('matching-pairs').textContent).toBe('Parejas: 0 / 3');
    });
  });

  describe('the timer', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('starts at 00:00 and ticks once a second', () => {
      render(<QuizMatching lang="es" items={items} seed="block-1" />);
      expect(screen.getByTestId('matching-timer').textContent).toBe('00:00');
      act(() => vi.advanceTimersByTime(3000));
      expect(screen.getByTestId('matching-timer').textContent).toBe('00:03');
    });

    it('stops ticking once every pair is matched, and shows the completion message', () => {
      render(<QuizMatching lang="es" items={items} seed="block-1" />);
      for (const item of items) {
        fireEvent.click(screen.getByTestId(`matching-prompt-${item.id}`));
        fireEvent.click(screen.getByTestId(`matching-answer-${item.id}`));
      }
      expect(screen.getByTestId('matching-completed').textContent).toBe('¡Completado en 00:00!');

      act(() => vi.advanceTimersByTime(5000));
      expect(screen.getByTestId('matching-completed').textContent).toBe('¡Completado en 00:00!');
    });
  });

  it('"Reiniciar" clears matches, the timer, and the selection', () => {
    vi.useFakeTimers();
    render(<QuizMatching lang="es" items={items} seed="block-1" />);
    fireEvent.click(screen.getByTestId('matching-prompt-s1'));
    fireEvent.click(screen.getByTestId('matching-answer-s1'));
    act(() => vi.advanceTimersByTime(4000));

    fireEvent.click(screen.getByTestId('matching-reset'));

    expect(screen.getByTestId('matching-pairs').textContent).toBe('Parejas: 0 / 3');
    expect(screen.getByTestId('matching-timer').textContent).toBe('00:00');
    expect(screen.getByTestId('matching-prompt-s1').hasAttribute('disabled')).toBe(false);
    vi.useRealTimers();
  });

  it('renders nothing for an empty item list', () => {
    const { container } = render(<QuizMatching lang="es" items={[]} seed="block-1" />);
    expect(container.firstChild).toBeNull();
  });
});
