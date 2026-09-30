// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Textarea } from './textarea';

describe('Textarea', () => {
  it('renders with a minimum of 3 rows by default', () => {
    render(<Textarea data-testid="note" />);
    expect(screen.getByTestId('note').getAttribute('rows')).toBe('3');
  });

  it('uses the shared field classes', () => {
    render(<Textarea data-testid="note" />);
    expect(screen.getByTestId('note').className).toContain('bg-(--color-field)');
  });

  it('does not auto-grow by default (stays resizable, no inline height writes)', () => {
    render(<Textarea data-testid="note" />);
    const el = screen.getByTestId('note') as HTMLTextAreaElement;
    fireEvent.change(el, { target: { value: 'hola' } });
    expect(el.style.height).toBe('');
  });

  it('auto-grows to fit content when autoGrow is set', () => {
    render(<Textarea data-testid="note" autoGrow />);
    const el = screen.getByTestId('note') as HTMLTextAreaElement;
    Object.defineProperty(el, 'scrollHeight', { value: 120, configurable: true });
    fireEvent.change(el, { target: { value: 'contenido largo' } });
    expect(el.style.height).toBe('120px');
  });

  it('forwards onChange alongside its own resize handling', () => {
    const onChange = vi.fn();
    render(<Textarea data-testid="note" autoGrow onChange={onChange} />);
    fireEvent.change(screen.getByTestId('note'), { target: { value: 'x' } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
