// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { GameItem } from '@/lib/activities/gameModes';
import QuizSpeakingCards from './QuizSpeakingCards';

afterEach(cleanup);

const items: GameItem[] = [
  { id: 's1', prompt: 'What is your favorite color?', answer: 'blue' },
  { id: 's2', prompt: 'Where do you live?', answer: 'a house', explanation: 'Any home works.' },
];

describe('QuizSpeakingCards', () => {
  it('shows the deck and "Repartir", with nothing dealt yet', () => {
    render(<QuizSpeakingCards lang="es" items={items} seed="block-1" />);
    expect(screen.getByTestId('speaking-deck')).toBeTruthy();
    expect(screen.queryByTestId('speaking-card')).toBeNull();
    expect(screen.getByTestId('speaking-deal').textContent).toBe('Repartir');
  });

  it('deals the first card on "Repartir", showing its prompt and a counter', () => {
    render(<QuizSpeakingCards lang="es" items={items} seed="block-1" />);
    fireEvent.click(screen.getByTestId('speaking-deal'));

    expect(screen.getByTestId('speaking-counter').textContent).toBe('Carta 1 de 2');
    expect(screen.getByTestId('speaking-card')).toBeTruthy();
    expect(screen.queryByTestId('speaking-answer')).toBeNull();
  });

  it('reveals the answer (and explanation, when the item has one) matching the dealt card', () => {
    render(<QuizSpeakingCards lang="es" items={items} seed="block-1" />);
    fireEvent.click(screen.getByTestId('speaking-deal'));

    const card = screen.getByTestId('speaking-card');
    const dealt = items.find((item) => card.textContent?.includes(item.prompt));
    expect(dealt).toBeTruthy();

    fireEvent.click(screen.getByTestId('speaking-reveal'));
    const answer = screen.getByTestId('speaking-answer');
    expect(answer.textContent).toContain(dealt!.answer);
    if (dealt!.explanation) expect(answer.textContent).toContain(dealt!.explanation);
  });

  it('deals the next card on "Siguiente carta", resetting the reveal', () => {
    render(<QuizSpeakingCards lang="es" items={items} seed="block-1" />);
    fireEvent.click(screen.getByTestId('speaking-deal'));
    fireEvent.click(screen.getByTestId('speaking-reveal'));
    expect(screen.getByTestId('speaking-answer')).toBeTruthy();

    fireEvent.click(screen.getByTestId('speaking-next'));
    expect(screen.getByTestId('speaking-counter').textContent).toBe('Carta 2 de 2');
    expect(screen.queryByTestId('speaking-answer')).toBeNull();
  });

  it('offers "Barajar de nuevo" once the deck is empty, and reshuffling returns to the deck view', () => {
    render(<QuizSpeakingCards lang="es" items={items} seed="block-1" />);
    fireEvent.click(screen.getByTestId('speaking-deal'));
    fireEvent.click(screen.getByTestId('speaking-next'));

    expect(screen.queryByTestId('speaking-next')).toBeNull();
    expect(screen.getByTestId('speaking-reshuffle')).toBeTruthy();

    fireEvent.click(screen.getByTestId('speaking-reshuffle'));
    expect(screen.getByTestId('speaking-deck')).toBeTruthy();
    expect(screen.queryByTestId('speaking-card')).toBeNull();
  });

  it('renders nothing for an empty item list', () => {
    const { container } = render(<QuizSpeakingCards lang="es" items={[]} seed="block-1" />);
    expect(container.firstChild).toBeNull();
  });

  it('starts a fresh deck when the item list changes', () => {
    const { rerender } = render(<QuizSpeakingCards lang="es" items={items} seed="block-1" />);
    fireEvent.click(screen.getByTestId('speaking-deal'));
    expect(screen.getByTestId('speaking-counter').textContent).toBe('Carta 1 de 2');

    const nextItems: GameItem[] = [{ id: 's9', prompt: 'New question?', answer: 'yes' }];
    rerender(<QuizSpeakingCards lang="es" items={nextItems} seed="block-1" />);
    expect(screen.queryByTestId('speaking-card')).toBeNull();
    expect(screen.getByTestId('speaking-deck')).toBeTruthy();
  });
});
