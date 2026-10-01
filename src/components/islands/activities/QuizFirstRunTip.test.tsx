// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import QuizFirstRunTip from './QuizFirstRunTip';

afterEach(() => cleanup());

function renderTip(overrides: Partial<React.ComponentProps<typeof QuizFirstRunTip>> = {}) {
  return render(
    <QuizFirstRunTip
      active={true}
      text="Escribe la pregunta"
      isLast={false}
      nextLabel="Siguiente"
      doneLabel="Listo"
      dismissLabel="Omitir"
      onNext={vi.fn()}
      onDismiss={vi.fn()}
      {...overrides}
    >
      <span data-testid="anchor">target</span>
    </QuizFirstRunTip>,
  );
}

describe('QuizFirstRunTip', () => {
  it('always renders its children, regardless of active', () => {
    renderTip({ active: false });
    expect(screen.getByTestId('anchor')).toBeTruthy();
    expect(screen.queryByTestId('quiz-first-run-tip')).toBeNull();
  });

  it('shows the bubble with its text only while active', () => {
    renderTip({ active: true, text: 'Toca el círculo de la correcta' });
    expect(screen.getByTestId('quiz-first-run-tip').textContent).toContain('Toca el círculo de la correcta');
  });

  it('shows "Siguiente" when not the last step, "Listo" when it is', () => {
    const { rerender } = renderTip({ isLast: false });
    expect(screen.getByTestId('quiz-first-run-tip-next').textContent).toBe('Siguiente');

    rerender(
      <QuizFirstRunTip
        active
        text="Agrega otra pregunta"
        isLast
        nextLabel="Siguiente"
        doneLabel="Listo"
        dismissLabel="Omitir"
        onNext={vi.fn()}
        onDismiss={vi.fn()}
      >
        <span>target</span>
      </QuizFirstRunTip>,
    );
    expect(screen.getByTestId('quiz-first-run-tip-next').textContent).toBe('Listo');
  });

  it('calls onNext/onDismiss when their buttons are clicked', () => {
    const onNext = vi.fn();
    const onDismiss = vi.fn();
    renderTip({ onNext, onDismiss });
    fireEvent.click(screen.getByTestId('quiz-first-run-tip-next'));
    fireEvent.click(screen.getByTestId('quiz-first-run-tip-dismiss'));
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('never renders a blocking overlay: no fixed-position backdrop element', () => {
    renderTip();
    const bubble = screen.getByTestId('quiz-first-run-tip');
    expect(bubble.className).not.toContain('fixed');
    expect(bubble.className).not.toContain('inset-0');
  });

  it('clamps its own width so it stays inside a phone viewport', () => {
    renderTip();
    expect(screen.getByTestId('quiz-first-run-tip').className).toContain('calc(100vw-2rem)');
  });
});
