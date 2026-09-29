// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { GameItem } from '@/lib/activities/gameModes';
import QuizFlashcards from './QuizFlashcards';

afterEach(cleanup);

const items: GameItem[] = [
  { id: 's1', prompt: 'The cat ____ on the mat.', answer: 'sits' },
  { id: 's2', prompt: 'What color is the sky?', answer: 'blue', explanation: 'The sky scatters blue light.' },
  { id: 's3', prompt: 'How many days in a week?', answer: 'seven' },
];

describe('QuizFlashcards', () => {
  it('shows the first card front-side, with the answer face hidden from assistive tech', () => {
    render(<QuizFlashcards lang="es" items={items} seed="block-1" />);
    expect(within(screen.getByTestId('flashcard-front')).getByText('The cat ____ on the mat.')).toBeTruthy();
    expect(screen.getByTestId('flashcard-front').getAttribute('aria-hidden')).toBe('false');
    expect(screen.getByTestId('flashcard-back').getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByTestId('flashcards-progress').textContent).toBe('1 / 3');
  });

  it('flips to the answer face on click', () => {
    render(<QuizFlashcards lang="es" items={items} seed="block-1" />);
    fireEvent.click(screen.getByTestId('flashcard'));
    expect(within(screen.getByTestId('flashcard-back')).getByText('sits')).toBeTruthy();
    expect(screen.getByTestId('flashcard-inner').getAttribute('data-flipped')).toBe('true');
    expect(screen.getByTestId('flashcard-front').getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByTestId('flashcard-back').getAttribute('aria-hidden')).toBe('false');
  });

  it('flips on Space', () => {
    render(<QuizFlashcards lang="es" items={items} seed="block-1" />);
    fireEvent.keyDown(screen.getByTestId('flashcard'), { key: ' ' });
    expect(screen.getByTestId('flashcard-inner').getAttribute('data-flipped')).toBe('true');
  });

  it('shows the explanation on the answer face only when the item has one', () => {
    render(<QuizFlashcards lang="es" items={items} seed="block-1" />);
    fireEvent.click(screen.getByTestId('flashcards-next')); // -> item 2, which has an explanation
    fireEvent.click(screen.getByTestId('flashcard'));
    expect(within(screen.getByTestId('flashcard-back')).getByText('The sky scatters blue light.')).toBeTruthy();

    fireEvent.click(screen.getByTestId('flashcards-prev')); // -> item 1, no explanation
    fireEvent.click(screen.getByTestId('flashcard'));
    expect(within(screen.getByTestId('flashcard-back')).getByText('sits')).toBeTruthy();
    expect(within(screen.getByTestId('flashcard-back')).queryByText('The sky scatters blue light.')).toBeNull();
  });

  it('navigates forward and back, resetting the flip each time', () => {
    render(<QuizFlashcards lang="es" items={items} seed="block-1" />);
    fireEvent.click(screen.getByTestId('flashcard'));
    expect(screen.getByText('sits')).toBeTruthy();

    fireEvent.click(screen.getByTestId('flashcards-next'));
    expect(screen.getByTestId('flashcards-progress').textContent).toBe('2 / 3');
    expect(screen.queryByText('sits')).toBeNull();
    expect(screen.getByText('What color is the sky?')).toBeTruthy();

    fireEvent.click(screen.getByTestId('flashcards-prev'));
    expect(screen.getByTestId('flashcards-progress').textContent).toBe('1 / 3');
    expect(screen.getByText('The cat ____ on the mat.')).toBeTruthy();
  });

  it('disables "Anterior" on the first card', () => {
    render(<QuizFlashcards lang="es" items={items} seed="block-1" />);
    expect(screen.getByTestId('flashcards-prev').hasAttribute('disabled')).toBe(true);
  });

  it('reaches a done state after the last card', () => {
    render(<QuizFlashcards lang="es" items={items} seed="block-1" />);
    fireEvent.click(screen.getByTestId('flashcards-next'));
    fireEvent.click(screen.getByTestId('flashcards-next'));
    fireEvent.click(screen.getByTestId('flashcards-next'));
    expect(screen.getByTestId('flashcards-done')).toBeTruthy();
  });

  it('builds a review pile from "Repasar" and offers to replay just it at the end', () => {
    render(<QuizFlashcards lang="es" items={items} seed="block-1" />);
    fireEvent.click(screen.getByTestId('flashcards-review')); // card 1 -> review pile
    fireEvent.click(screen.getByTestId('flashcards-knew')); // card 2 -> known
    fireEvent.click(screen.getByTestId('flashcards-knew')); // card 3 -> known, deck ends

    expect(screen.getByTestId('flashcards-done')).toBeTruthy();
    const replay = screen.getByTestId('flashcards-replay-review');
    expect(replay.textContent).toContain('1');

    fireEvent.click(replay);
    expect(screen.getByTestId('flashcards-progress').textContent).toBe('1 / 1');
    expect(screen.getByText('The cat ____ on the mat.')).toBeTruthy();
  });

  it('offers no replay button when nothing was flagged for review', () => {
    render(<QuizFlashcards lang="es" items={items} seed="block-1" />);
    fireEvent.click(screen.getByTestId('flashcards-knew'));
    fireEvent.click(screen.getByTestId('flashcards-knew'));
    fireEvent.click(screen.getByTestId('flashcards-knew'));
    expect(screen.queryByTestId('flashcards-replay-review')).toBeNull();
  });

  it('"La sabía" removes a card already in the review pile', () => {
    render(<QuizFlashcards lang="es" items={items} seed="block-1" />);
    fireEvent.click(screen.getByTestId('flashcards-review')); // card 1 -> review
    fireEvent.click(screen.getByTestId('flashcards-prev'));
    fireEvent.click(screen.getByTestId('flashcards-knew')); // card 1 -> known again
    fireEvent.click(screen.getByTestId('flashcards-knew'));
    fireEvent.click(screen.getByTestId('flashcards-knew'));
    expect(screen.queryByTestId('flashcards-replay-review')).toBeNull();
  });

  it('shuffling resets to the first card', () => {
    render(<QuizFlashcards lang="es" items={items} seed="block-1" />);
    fireEvent.click(screen.getByTestId('flashcards-next'));
    expect(screen.getByTestId('flashcards-progress').textContent).toBe('2 / 3');

    fireEvent.click(screen.getByTestId('flashcards-shuffle'));
    expect(screen.getByTestId('flashcards-progress').textContent).toBe('1 / 3');
  });
});
