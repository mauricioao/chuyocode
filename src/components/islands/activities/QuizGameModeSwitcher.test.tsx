// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import QuizGameModeSwitcher from './QuizGameModeSwitcher';

afterEach(cleanup);

describe('QuizGameModeSwitcher', () => {
  it('renders one control per available mode, in order', () => {
    render(<QuizGameModeSwitcher lang="es" modes={['quiz', 'cards', 'match']} active="quiz" onChange={vi.fn()} />);

    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
    expect(screen.getByText('Preguntas')).toBeTruthy();
    expect(screen.getByText('Tarjetas')).toBeTruthy();
    expect(screen.getByText('Parejas')).toBeTruthy();
  });

  it('only renders modes actually available for the block', () => {
    render(<QuizGameModeSwitcher lang="es" modes={['quiz']} active="quiz" onChange={vi.fn()} />);
    expect(screen.getAllByRole('radio')).toHaveLength(1);
    expect(screen.queryByText('Tarjetas')).toBeNull();
    expect(screen.queryByText('Parejas')).toBeNull();
  });

  it('marks the active mode as checked', () => {
    render(<QuizGameModeSwitcher lang="es" modes={['quiz', 'cards']} active="cards" onChange={vi.fn()} />);
    expect(screen.getByTestId('quiz-game-mode-quiz').getAttribute('aria-checked')).toBe('false');
    expect(screen.getByTestId('quiz-game-mode-cards').getAttribute('aria-checked')).toBe('true');
  });

  it('reports the clicked mode', () => {
    const onChange = vi.fn();
    render(<QuizGameModeSwitcher lang="es" modes={['quiz', 'cards', 'match']} active="quiz" onChange={onChange} />);

    fireEvent.click(screen.getByTestId('quiz-game-mode-match'));
    expect(onChange).toHaveBeenCalledWith('match');
  });

  it('renders English labels for lang="en"', () => {
    render(<QuizGameModeSwitcher lang="en" modes={['quiz', 'cards', 'match']} active="quiz" onChange={vi.fn()} />);
    expect(screen.getByText('Questions')).toBeTruthy();
    expect(screen.getByText('Cards')).toBeTruthy();
    expect(screen.getByText('Match')).toBeTruthy();
  });

  it('renders "Cartas" for the speak mode', () => {
    render(<QuizGameModeSwitcher lang="es" modes={['quiz', 'speak']} active="quiz" onChange={vi.fn()} />);
    expect(screen.getAllByRole('radio')).toHaveLength(2);
    expect(screen.getByText('Cartas')).toBeTruthy();
  });

  it('renders "Ruleta" for the wheel mode', () => {
    render(<QuizGameModeSwitcher lang="es" modes={['quiz', 'wheel']} active="quiz" onChange={vi.fn()} />);
    expect(screen.getAllByRole('radio')).toHaveLength(2);
    expect(screen.getByText('Ruleta')).toBeTruthy();
  });

  it('renders "Anagrama" for the anagram mode', () => {
    render(<QuizGameModeSwitcher lang="es" modes={['quiz', 'anagram']} active="quiz" onChange={vi.fn()} />);
    expect(screen.getAllByRole('radio')).toHaveLength(2);
    expect(screen.getByText('Anagrama')).toBeTruthy();
  });

  it('renders no control for a mode with no icon/label wired in yet', () => {
    render(<QuizGameModeSwitcher lang="es" modes={['quiz', 'hangman']} active="quiz" onChange={vi.fn()} />);
    expect(screen.getAllByRole('radio')).toHaveLength(1);
    expect(screen.queryByTestId('quiz-game-mode-hangman')).toBeNull();
  });
});
