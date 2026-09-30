// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { GameItem } from '@/lib/activities/gameModes';
import QuizHangman from './QuizHangman';

afterEach(cleanup);

const items: GameItem[] = [
  { id: 's1', prompt: 'A small feline pet?', answer: 'cat' },
  { id: 's2', prompt: 'A yellow fruit?', answer: 'banana' },
];

describe('QuizHangman', () => {
  it('shows the clue, counter, six full lives, and masked letters', () => {
    render(<QuizHangman lang="es" items={items} />);
    expect(screen.getByText('A small feline pet?')).toBeTruthy();
    expect(screen.getByTestId('hangman-counter').textContent).toBe('Palabra 1 de 2');
    expect(screen.getByTestId('hangman-lives').getAttribute('aria-label')).toBe('Vidas: 6 / 6');
    expect(screen.getByTestId('hangman-letter-0').textContent).toBe('_');
  });

  it('reveals a correctly guessed letter and marks its key green', () => {
    render(<QuizHangman lang="es" items={items} />);
    fireEvent.click(screen.getByTestId('hangman-key-C'));
    expect(screen.getByTestId('hangman-letter-0').textContent).toBe('C');
    expect(screen.getByTestId('hangman-key-C').className).toContain('border-emerald-500');
    expect(screen.getByTestId('hangman-key-C').hasAttribute('disabled')).toBe(true);
  });

  it('loses one life on a wrong guess', () => {
    render(<QuizHangman lang="es" items={items} />);
    fireEvent.click(screen.getByTestId('hangman-key-Z')); // not in "cat"
    expect(screen.getByTestId('hangman-lives').getAttribute('aria-label')).toBe('Vidas: 5 / 6');
    expect(screen.getByTestId('hangman-key-Z').className).toContain('border-destructive');
  });

  it('wins once every letter is guessed, offering "Siguiente palabra"', () => {
    render(<QuizHangman lang="es" items={items} />);
    fireEvent.click(screen.getByTestId('hangman-key-C'));
    fireEvent.click(screen.getByTestId('hangman-key-A'));
    fireEvent.click(screen.getByTestId('hangman-key-T'));

    expect(screen.getByTestId('hangman-live-region').textContent).toBe('¡Lo lograste!');
    expect(screen.getByTestId('hangman-next')).toBeTruthy();
  });

  it('loses after six wrong guesses, revealing the word', () => {
    render(<QuizHangman lang="es" items={items} />);
    for (const letter of ['Z', 'X', 'Q', 'J', 'K', 'W']) {
      fireEvent.click(screen.getByTestId(`hangman-key-${letter}`));
    }
    expect(screen.getByTestId('hangman-lives').getAttribute('aria-label')).toBe('Vidas: 0 / 6');
    expect(screen.getByTestId('hangman-live-region').textContent).toBe('Se acabaron los intentos.');
    // Revealed even though never guessed directly.
    expect(screen.getByTestId('hangman-letter-0').textContent).toBe('C');
    expect(screen.getByTestId('hangman-letter-1').textContent).toBe('A');
    expect(screen.getByTestId('hangman-letter-2').textContent).toBe('T');
    expect(screen.getByTestId('hangman-next')).toBeTruthy();
  });

  it('ignores further guesses once the round is over', () => {
    render(<QuizHangman lang="es" items={items} />);
    fireEvent.click(screen.getByTestId('hangman-key-C'));
    fireEvent.click(screen.getByTestId('hangman-key-A'));
    fireEvent.click(screen.getByTestId('hangman-key-T')); // won
    fireEvent.click(screen.getByTestId('hangman-key-B')); // ignored, no-op
    expect(screen.getByTestId('hangman-lives').getAttribute('aria-label')).toBe('Vidas: 6 / 6');
  });

  it('advances to the next word on "Siguiente palabra"', () => {
    render(<QuizHangman lang="es" items={items} />);
    fireEvent.click(screen.getByTestId('hangman-key-C'));
    fireEvent.click(screen.getByTestId('hangman-key-A'));
    fireEvent.click(screen.getByTestId('hangman-key-T'));
    fireEvent.click(screen.getByTestId('hangman-next'));

    expect(screen.getByTestId('hangman-counter').textContent).toBe('Palabra 2 de 2');
    expect(screen.getByText('A yellow fruit?')).toBeTruthy();
    expect(screen.getByTestId('hangman-lives').getAttribute('aria-label')).toBe('Vidas: 6 / 6');
  });

  it('guesses a letter on a matching physical key press', () => {
    render(<QuizHangman lang="es" items={items} />);
    fireEvent.keyDown(screen.getByTestId('quiz-hangman'), { key: 'c' });
    expect(screen.getByTestId('hangman-letter-0').textContent).toBe('C');
  });

  it('reaches a done state after the last word, with a "Jugar de nuevo" restart', () => {
    render(<QuizHangman lang="es" items={items} />);
    for (const letter of ['C', 'A', 'T']) fireEvent.click(screen.getByTestId(`hangman-key-${letter}`));
    fireEvent.click(screen.getByTestId('hangman-next'));
    for (const letter of ['B', 'A', 'N']) fireEvent.click(screen.getByTestId(`hangman-key-${letter}`));
    fireEvent.click(screen.getByTestId('hangman-next'));

    expect(screen.getByTestId('hangman-done')).toBeTruthy();
    fireEvent.click(screen.getByTestId('hangman-play-again'));
    expect(screen.getByTestId('hangman-counter').textContent).toBe('Palabra 1 de 2');
  });

  it('renders nothing for an empty item list', () => {
    const { container } = render(<QuizHangman lang="es" items={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('starts over when the item list changes', () => {
    const { rerender } = render(<QuizHangman lang="es" items={items} />);
    fireEvent.click(screen.getByTestId('hangman-key-Z'));
    expect(screen.getByTestId('hangman-lives').getAttribute('aria-label')).toBe('Vidas: 5 / 6');

    const nextItems: GameItem[] = [{ id: 's9', prompt: 'A cold drink?', answer: 'soda' }];
    rerender(<QuizHangman lang="es" items={nextItems} />);
    expect(screen.getByTestId('hangman-lives').getAttribute('aria-label')).toBe('Vidas: 6 / 6');
  });
});
