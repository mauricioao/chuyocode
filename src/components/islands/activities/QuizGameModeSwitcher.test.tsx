// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { GameMode } from '@/lib/activities/gameModes';
import QuizGameModeSwitcher from './QuizGameModeSwitcher';

afterEach(cleanup);

describe('QuizGameModeSwitcher', () => {
  it('renders one control per available mode, in order', () => {
    render(<QuizGameModeSwitcher lang="es" modes={['quiz', 'cards', 'match']} active="quiz" onChange={vi.fn()} />);

    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
    // The active mode's own label also appears in the compact trigger
    // ("Básico ▾", build item 3) — scope to the mode list itself so this
    // assertion is not ambiguous about which "Básico" it means.
    const list = screen.getByTestId('quiz-game-mode-switcher');
    expect(within(list).getByText('Básico')).toBeTruthy();
    expect(within(list).getByText('Tarjetas')).toBeTruthy();
    expect(within(list).getByText('Parejas')).toBeTruthy();
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
    const list = screen.getByTestId('quiz-game-mode-switcher');
    expect(within(list).getByText('Basic')).toBeTruthy();
    expect(within(list).getByText('Cards')).toBeTruthy();
    expect(within(list).getByText('Match')).toBeTruthy();
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

  it('renders "Ahorcado" for the hangman mode', () => {
    render(<QuizGameModeSwitcher lang="es" modes={['quiz', 'hangman']} active="quiz" onChange={vi.fn()} />);
    expect(screen.getAllByRole('radio')).toHaveLength(2);
    expect(screen.getByText('Ahorcado')).toBeTruthy();
  });

  it('renders "Verdadero o falso" for the truefalse mode', () => {
    render(<QuizGameModeSwitcher lang="es" modes={['quiz', 'truefalse']} active="quiz" onChange={vi.fn()} />);
    expect(screen.getAllByRole('radio')).toHaveLength(2);
    expect(screen.getByText('Verdadero o falso')).toBeTruthy();
  });

  it('renders "Abre la caja" for the openbox mode', () => {
    render(<QuizGameModeSwitcher lang="es" modes={['quiz', 'openbox']} active="quiz" onChange={vi.fn()} />);
    expect(screen.getAllByRole('radio')).toHaveLength(2);
    expect(screen.getByText('Abre la caja')).toBeTruthy();
  });

  it('renders no control for a mode with no icon/label wired in yet', () => {
    const futureMode = 'future-mode' as GameMode;
    render(<QuizGameModeSwitcher lang="es" modes={['quiz', futureMode]} active="quiz" onChange={vi.fn()} />);
    expect(screen.getAllByRole('radio')).toHaveLength(1);
  });
});
