// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import BlockTypePicker from './BlockTypePicker';

describe('BlockTypePicker', () => {
  it('renders the worksheet and questions cards, in Spanish', () => {
    render(<BlockTypePicker lang="es" onSelectWorksheet={vi.fn()} />);
    expect(screen.getByTestId('picker-worksheet').textContent).toContain('Hoja de trabajo');
    expect(screen.getByTestId('picker-questions').textContent).toContain('Preguntas');
    expect(screen.getByTestId('picker-questions').textContent).toContain('Pronto');
  });

  it('renders in English', () => {
    render(<BlockTypePicker lang="en" onSelectWorksheet={vi.fn()} />);
    expect(screen.getByTestId('picker-worksheet').textContent).toContain('Worksheet');
    expect(screen.getByTestId('picker-questions').textContent).toContain('Soon');
  });

  it('calls onSelectWorksheet when the worksheet card is chosen', () => {
    const onSelectWorksheet = vi.fn();
    render(<BlockTypePicker lang="es" onSelectWorksheet={onSelectWorksheet} />);
    fireEvent.click(screen.getByTestId('picker-worksheet'));
    expect(onSelectWorksheet).toHaveBeenCalledTimes(1);
  });

  it('marks the questions card disabled and never clickable', () => {
    render(<BlockTypePicker lang="es" onSelectWorksheet={vi.fn()} />);
    expect(screen.getByTestId('picker-questions').getAttribute('aria-disabled')).toBe('true');
  });

  it('disables the worksheet card when disabled is set', () => {
    const onSelectWorksheet = vi.fn();
    render(<BlockTypePicker lang="es" onSelectWorksheet={onSelectWorksheet} disabled />);
    const button = screen.getByTestId('picker-worksheet') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(onSelectWorksheet).not.toHaveBeenCalled();
  });
});
