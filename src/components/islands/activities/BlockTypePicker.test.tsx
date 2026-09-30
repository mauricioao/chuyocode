// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import BlockTypePicker from './BlockTypePicker';

describe('BlockTypePicker', () => {
  it('renders the worksheet and questions cards, in Spanish', () => {
    render(<BlockTypePicker lang="es" onSelectWorksheet={vi.fn()} onSelectQuestions={vi.fn()} />);
    expect(screen.getByTestId('picker-worksheet').textContent).toContain('Hoja de trabajo');
    expect(screen.getByTestId('picker-questions').textContent).toContain('Preguntas');
  });

  it('renders in English', () => {
    render(<BlockTypePicker lang="en" onSelectWorksheet={vi.fn()} onSelectQuestions={vi.fn()} />);
    expect(screen.getByTestId('picker-worksheet').textContent).toContain('Worksheet');
    expect(screen.getByTestId('picker-questions').textContent).toContain('Questions');
  });

  it('calls onSelectWorksheet when the worksheet card is chosen', () => {
    const onSelectWorksheet = vi.fn();
    render(<BlockTypePicker lang="es" onSelectWorksheet={onSelectWorksheet} onSelectQuestions={vi.fn()} />);
    fireEvent.click(screen.getByTestId('picker-worksheet'));
    expect(onSelectWorksheet).toHaveBeenCalledTimes(1);
  });

  it('calls onSelectQuestions when the questions card is chosen', () => {
    const onSelectQuestions = vi.fn();
    render(<BlockTypePicker lang="es" onSelectWorksheet={vi.fn()} onSelectQuestions={onSelectQuestions} />);
    fireEvent.click(screen.getByTestId('picker-questions'));
    expect(onSelectQuestions).toHaveBeenCalledTimes(1);
  });

  it('is idle by default: neither card is disabled or busy', () => {
    render(<BlockTypePicker lang="es" onSelectWorksheet={vi.fn()} onSelectQuestions={vi.fn()} />);
    const worksheetButton = screen.getByTestId('picker-worksheet') as HTMLButtonElement;
    const questionsButton = screen.getByTestId('picker-questions') as HTMLButtonElement;
    expect(worksheetButton.disabled).toBe(false);
    expect(questionsButton.disabled).toBe(false);
    expect(worksheetButton.getAttribute('aria-busy')).toBe('false');
    expect(questionsButton.getAttribute('aria-busy')).toBe('false');
  });

  describe('busyCard="worksheet"', () => {
    it('marks the worksheet card aria-busy, disables both, and dims only the questions card', () => {
      const onSelectWorksheet = vi.fn();
      const onSelectQuestions = vi.fn();
      render(
        <BlockTypePicker
          lang="es"
          onSelectWorksheet={onSelectWorksheet}
          onSelectQuestions={onSelectQuestions}
          busyCard="worksheet"
        />,
      );
      const worksheetButton = screen.getByTestId('picker-worksheet') as HTMLButtonElement;
      const questionsButton = screen.getByTestId('picker-questions') as HTMLButtonElement;

      expect(worksheetButton.disabled).toBe(true);
      expect(questionsButton.disabled).toBe(true);
      expect(worksheetButton.getAttribute('aria-busy')).toBe('true');
      expect(questionsButton.getAttribute('aria-busy')).toBe('false');
      expect(worksheetButton.className).not.toContain('opacity-50');
      expect(questionsButton.className).toContain('opacity-50');

      fireEvent.click(worksheetButton);
      fireEvent.click(questionsButton);
      expect(onSelectWorksheet).not.toHaveBeenCalled();
      expect(onSelectQuestions).not.toHaveBeenCalled();
    });

    it('renders a spinning CircleNotch in place of the worksheet card icon', () => {
      render(
        <BlockTypePicker lang="es" onSelectWorksheet={vi.fn()} onSelectQuestions={vi.fn()} busyCard="worksheet" />,
      );
      const worksheetIcon = screen.getByTestId('picker-worksheet').querySelector('svg');
      expect(worksheetIcon?.getAttribute('class')).toContain('animate-spin');
    });
  });

  describe('busyCard="questions"', () => {
    it('marks the questions card aria-busy, disables both, and dims only the worksheet card', () => {
      render(
        <BlockTypePicker lang="es" onSelectWorksheet={vi.fn()} onSelectQuestions={vi.fn()} busyCard="questions" />,
      );
      const worksheetButton = screen.getByTestId('picker-worksheet') as HTMLButtonElement;
      const questionsButton = screen.getByTestId('picker-questions') as HTMLButtonElement;

      expect(questionsButton.getAttribute('aria-busy')).toBe('true');
      expect(worksheetButton.getAttribute('aria-busy')).toBe('false');
      expect(questionsButton.className).not.toContain('opacity-50');
      expect(worksheetButton.className).toContain('opacity-50');
    });
  });
});
