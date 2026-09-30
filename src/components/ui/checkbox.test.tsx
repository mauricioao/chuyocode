// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Checkbox } from './checkbox';

describe('Checkbox', () => {
  it('renders unchecked by default (data-state=unchecked)', () => {
    render(<Checkbox data-testid="agree" />);
    expect(screen.getByTestId('agree').getAttribute('data-state')).toBe('unchecked');
  });

  it('toggles to checked on click and calls onCheckedChange', () => {
    const onCheckedChange = vi.fn();
    render(<Checkbox data-testid="agree" onCheckedChange={onCheckedChange} />);
    fireEvent.click(screen.getByTestId('agree'));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('renders a fill indicator only while checked', () => {
    const { rerender } = render(<Checkbox data-testid="agree" checked={false} />);
    expect(document.querySelector('[data-slot="checkbox-indicator"] svg')).toBeNull();
    rerender(<Checkbox data-testid="agree" checked />);
    expect(document.querySelector('[data-slot="checkbox-indicator"] svg')).not.toBeNull();
  });
});
