// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { TrueFalseItem } from '@/lib/activities/gameModes';
import QuizTrueFalse from './QuizTrueFalse';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const items: TrueFalseItem[] = [
  { id: 's1', statement: 'The cat sits on the mat.', isTrue: true },
  { id: 's2', statement: 'The sky is green.', isTrue: false },
];

describe('QuizTrueFalse', () => {
  it('shows the first statement, counter, and timer at 00:00', () => {
    render(<QuizTrueFalse lang="es" items={items} />);
    expect(screen.getByTestId('truefalse-statement').textContent).toBe('The cat sits on the mat.');
    expect(screen.getByTestId('truefalse-counter').textContent).toBe('Afirmación 1 de 2');
    expect(screen.getByTestId('truefalse-timer').textContent).toBe('00:00');
  });

  it('ticks the timer once a second', () => {
    vi.useFakeTimers();
    render(<QuizTrueFalse lang="es" items={items} />);
    act(() => vi.advanceTimersByTime(3000));
    expect(screen.getByTestId('truefalse-timer').textContent).toBe('00:03');
  });

  it('marks a correct "Verdadero" tap green and gives live-region feedback', () => {
    vi.useFakeTimers();
    render(<QuizTrueFalse lang="es" items={items} />);
    fireEvent.click(screen.getByTestId('truefalse-true')); // item 1 is true
    expect(screen.getByTestId('truefalse-true').className).toContain('border-emerald-500');
    expect(screen.getByTestId('truefalse-live-region').textContent).toBe('Correcto');
    expect(screen.getByTestId('truefalse-true').hasAttribute('disabled')).toBe(true);
    expect(screen.getByTestId('truefalse-false').hasAttribute('disabled')).toBe(true);
  });

  it('marks a wrong tap red, highlighting the actually-correct button too', () => {
    vi.useFakeTimers();
    render(<QuizTrueFalse lang="es" items={items} />);
    fireEvent.click(screen.getByTestId('truefalse-false')); // item 1 is true, so this is wrong
    expect(screen.getByTestId('truefalse-false').className).toContain('border-destructive');
    expect(screen.getByTestId('truefalse-true').className).toContain('border-emerald-500');
    expect(screen.getByTestId('truefalse-live-region').textContent).toBe('Incorrecto');
  });

  it('auto-advances to the next statement after the read pause', () => {
    vi.useFakeTimers();
    render(<QuizTrueFalse lang="es" items={items} />);
    fireEvent.click(screen.getByTestId('truefalse-true'));
    act(() => vi.advanceTimersByTime(900));

    expect(screen.getByTestId('truefalse-counter').textContent).toBe('Afirmación 2 de 2');
    expect(screen.getByTestId('truefalse-statement').textContent).toBe('The sky is green.');
    expect(screen.getByTestId('truefalse-true').hasAttribute('disabled')).toBe(false);
  });

  it('ignores a second tap while feedback is showing', () => {
    vi.useFakeTimers();
    render(<QuizTrueFalse lang="es" items={items} />);
    fireEvent.click(screen.getByTestId('truefalse-true')); // correct
    fireEvent.click(screen.getByTestId('truefalse-false')); // ignored, disabled
    act(() => vi.advanceTimersByTime(900));
    // Still advanced only ONE statement, and the score only counted once.
    fireEvent.click(screen.getByTestId('truefalse-false')); // item 2 is false: correct
    act(() => vi.advanceTimersByTime(900));

    expect(screen.getByTestId('truefalse-score').textContent).toContain('2 / 2');
  });

  it('shows the final score and stops the timer once every statement is answered', () => {
    vi.useFakeTimers();
    render(<QuizTrueFalse lang="es" items={items} />);
    fireEvent.click(screen.getByTestId('truefalse-true')); // correct
    act(() => vi.advanceTimersByTime(900));
    fireEvent.click(screen.getByTestId('truefalse-true')); // item 2 is false: wrong
    act(() => vi.advanceTimersByTime(900));

    expect(screen.getByTestId('truefalse-done')).toBeTruthy();
    expect(screen.getByTestId('truefalse-score').textContent).toContain('1 / 2');

    const before = screen.getByTestId('truefalse-score').textContent;
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByTestId('truefalse-score').textContent).toBe(before);
  });

  it('restarts on "Jugar de nuevo"', () => {
    vi.useFakeTimers();
    render(<QuizTrueFalse lang="es" items={items} />);
    fireEvent.click(screen.getByTestId('truefalse-true'));
    act(() => vi.advanceTimersByTime(900));
    fireEvent.click(screen.getByTestId('truefalse-false'));
    act(() => vi.advanceTimersByTime(900));

    fireEvent.click(screen.getByTestId('truefalse-play-again'));
    expect(screen.getByTestId('truefalse-counter').textContent).toBe('Afirmación 1 de 2');
    expect(screen.getByTestId('truefalse-timer').textContent).toBe('00:00');
  });

  it('renders nothing for an empty item list', () => {
    const { container } = render(<QuizTrueFalse lang="es" items={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('starts over when the item list changes', () => {
    vi.useFakeTimers();
    const { rerender } = render(<QuizTrueFalse lang="es" items={items} />);
    fireEvent.click(screen.getByTestId('truefalse-true'));
    act(() => vi.advanceTimersByTime(900));
    expect(screen.getByTestId('truefalse-counter').textContent).toBe('Afirmación 2 de 2');

    const nextItems: TrueFalseItem[] = [{ id: 'n1', statement: 'New statement.', isTrue: true }];
    rerender(<QuizTrueFalse lang="es" items={nextItems} />);
    expect(screen.getByTestId('truefalse-counter').textContent).toBe('Afirmación 1 de 1');
  });
});
