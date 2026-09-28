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

  it('disables both cards when disabled is set', () => {
    const onSelectWorksheet = vi.fn();
    const onSelectQuestions = vi.fn();
    render(
      <BlockTypePicker
        lang="es"
        onSelectWorksheet={onSelectWorksheet}
        onSelectQuestions={onSelectQuestions}
        disabled
      />,
    );
    const worksheetButton = screen.getByTestId('picker-worksheet') as HTMLButtonElement;
    const questionsButton = screen.getByTestId('picker-questions') as HTMLButtonElement;
    expect(worksheetButton.disabled).toBe(true);
    expect(questionsButton.disabled).toBe(true);
    fireEvent.click(worksheetButton);
    fireEvent.click(questionsButton);
    expect(onSelectWorksheet).not.toHaveBeenCalled();
    expect(onSelectQuestions).not.toHaveBeenCalled();
  });
});
