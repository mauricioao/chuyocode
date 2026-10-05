// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { GameItem } from '@/lib/activities/gameModes';
import QuizAnagram from './QuizAnagram';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// `id` on each tray tile is the letter's ORIGINAL position in the target
// word (assigned before shuffling) — clicking tile ids in numeric order
// always spells the word correctly, regardless of how the tray itself is
// laid out. Every answer below uses distinct letters so a keyboard letter
// press is unambiguous too.
const items: GameItem[] = [
  { id: 's1', prompt: 'A small feline pet?', answer: 'cat' },
  { id: 's2', prompt: 'A yellow fruit?', answer: 'banana' },
];

function clickInOrder(count: number) {
  for (let i = 0; i < count; i += 1) {
    fireEvent.click(screen.getByTestId(`anagram-tile-${i}`));
  }
}

describe('QuizAnagram', () => {
  it('shows the first word\'s clue, counter, and one tray tile per letter', () => {
    render(<QuizAnagram lang="es" items={items} seed="block-1" />);
    expect(screen.getByText('A small feline pet?')).toBeTruthy();
    expect(screen.getByTestId('anagram-counter').textContent).toBe('Palabra 1 de 2');
    expect(screen.getByTestId('anagram-tile-0')).toBeTruthy();
    expect(screen.getByTestId('anagram-tile-1')).toBeTruthy();
    expect(screen.getByTestId('anagram-tile-2')).toBeTruthy();
    expect(screen.getByTestId('anagram-slot-0').textContent).toBe('');
  });

  it('fills a slot per tap, in order', () => {
    render(<QuizAnagram lang="es" items={items} seed="block-1" />);
    fireEvent.click(screen.getByTestId('anagram-tile-0'));
    expect(screen.getByTestId('anagram-slot-0').textContent).toBe('C');
    expect(screen.getByTestId('anagram-tile-0').hasAttribute('disabled')).toBe(true);
  });

  it('marks every slot green and offers "Siguiente palabra" once spelled correctly', () => {
    render(<QuizAnagram lang="es" items={items} seed="block-1" />);
    clickInOrder(3); // C-A-T, in order
    expect(screen.getByTestId('anagram-slot-0').className).toContain('border-success-strong');
    expect(screen.getByTestId('anagram-next')).toBeTruthy();
    expect(screen.getByTestId('anagram-live-region').textContent).toBe('¡Correcto!');
  });

  it('advances to the next word on "Siguiente palabra"', () => {
    render(<QuizAnagram lang="es" items={items} seed="block-1" />);
    clickInOrder(3);
    fireEvent.click(screen.getByTestId('anagram-next'));

    expect(screen.getByTestId('anagram-counter').textContent).toBe('Palabra 2 de 2');
    expect(screen.getByText('A yellow fruit?')).toBeTruthy();
    expect(screen.getByTestId('anagram-slot-0').textContent).toBe('');
  });

  it('flashes red on a wrong order, then auto-clears back to an empty tray', () => {
    vi.useFakeTimers();
    render(<QuizAnagram lang="es" items={items} seed="block-1" />);
    fireEvent.click(screen.getByTestId('anagram-tile-2')); // T
    fireEvent.click(screen.getByTestId('anagram-tile-1')); // A
    fireEvent.click(screen.getByTestId('anagram-tile-0')); // C -> "TAC", wrong

    expect(screen.getByTestId('anagram-slot-0').className).toContain('border-destructive');
    expect(screen.getByTestId('anagram-live-region').textContent).toBe('Inténtalo de nuevo.');
    expect(screen.queryByTestId('anagram-next')).toBeNull();

    act(() => vi.advanceTimersByTime(600));
    expect(screen.getByTestId('anagram-slot-0').textContent).toBe('');
    expect(screen.getByTestId('anagram-tile-0').hasAttribute('disabled')).toBe(false);
  });

  it('removes the last placed letter on "Deshacer"', () => {
    render(<QuizAnagram lang="es" items={items} seed="block-1" />);
    fireEvent.click(screen.getByTestId('anagram-tile-0'));
    fireEvent.click(screen.getByTestId('anagram-tile-1'));
    expect(screen.getByTestId('anagram-slot-1').textContent).toBe('A');

    fireEvent.click(screen.getByTestId('anagram-backspace'));
    expect(screen.getByTestId('anagram-slot-1').textContent).toBe('');
    expect(screen.getByTestId('anagram-tile-1').hasAttribute('disabled')).toBe(false);
  });

  it('disables "Deshacer" when nothing is placed yet', () => {
    render(<QuizAnagram lang="es" items={items} seed="block-1" />);
    expect(screen.getByTestId('anagram-backspace').hasAttribute('disabled')).toBe(true);
  });

  it('places a tile on a matching physical key press', () => {
    render(<QuizAnagram lang="es" items={items} seed="block-1" />);
    const board = screen.getByTestId('quiz-anagram');
    fireEvent.keyDown(board, { key: 'c' });
    fireEvent.keyDown(board, { key: 'A' });
    fireEvent.keyDown(board, { key: 't' });

    expect(screen.getByTestId('anagram-slot-0').textContent).toBe('C');
    expect(screen.getByTestId('anagram-slot-1').textContent).toBe('A');
    expect(screen.getByTestId('anagram-slot-2').textContent).toBe('T');
    expect(screen.getByTestId('anagram-next')).toBeTruthy();
  });

  it('undoes the last letter on a physical Backspace', () => {
    render(<QuizAnagram lang="es" items={items} seed="block-1" />);
    const board = screen.getByTestId('quiz-anagram');
    fireEvent.keyDown(board, { key: 'c' });
    fireEvent.keyDown(board, { key: 'Backspace' });
    expect(screen.getByTestId('anagram-slot-0').textContent).toBe('');
  });

  it('reaches a done state after the last word, with a "Jugar de nuevo" restart', () => {
    render(<QuizAnagram lang="es" items={items} seed="block-1" />);
    clickInOrder(3);
    fireEvent.click(screen.getByTestId('anagram-next'));
    clickInOrder(6); // B-A-N-A-N-A
    fireEvent.click(screen.getByTestId('anagram-next'));

    expect(screen.getByTestId('anagram-done')).toBeTruthy();

    fireEvent.click(screen.getByTestId('anagram-play-again'));
    expect(screen.getByTestId('anagram-counter').textContent).toBe('Palabra 1 de 2');
  });

  it('renders nothing for an empty item list', () => {
    const { container } = render(<QuizAnagram lang="es" items={[]} seed="block-1" />);
    expect(container.firstChild).toBeNull();
  });

  it('starts over when the item list changes', () => {
    const { rerender } = render(<QuizAnagram lang="es" items={items} seed="block-1" />);
    clickInOrder(3);
    fireEvent.click(screen.getByTestId('anagram-next'));
    expect(screen.getByTestId('anagram-counter').textContent).toBe('Palabra 2 de 2');

    const nextItems: GameItem[] = [{ id: 's9', prompt: 'A cold drink?', answer: 'soda' }];
    rerender(<QuizAnagram lang="es" items={nextItems} seed="block-1" />);
    expect(screen.getByTestId('anagram-counter').textContent).toBe('Palabra 1 de 1');
  });
});
