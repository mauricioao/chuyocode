// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Input } from './input';

describe('Input', () => {
  it('renders a text input by default with the shared field classes', () => {
    render(<Input placeholder="Nombre" />);
    const el = screen.getByPlaceholderText('Nombre');
    expect(el.tagName).toBe('INPUT');
    expect(el.getAttribute('type')).toBe('text');
    expect(el.className).toContain('bg-(--color-field)');
  });

  it('forwards type, and every other native input prop', () => {
    render(<Input type="email" data-testid="email-field" required />);
    const el = screen.getByTestId('email-field');
    expect(el.getAttribute('type')).toBe('email');
    expect(el).toHaveProperty('required', true);
  });

  it('supports a fixed field size override', () => {
    render(<Input fieldSize="sm" data-testid="compact" />);
    expect(screen.getByTestId('compact').className).toContain('h-(--control-h-sm)');
  });

  it('merges a caller className', () => {
    render(<Input className="pl-9" data-testid="with-icon" />);
    expect(screen.getByTestId('with-icon').className).toContain('pl-9');
  });
});
