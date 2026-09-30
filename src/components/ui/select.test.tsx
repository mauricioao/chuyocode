// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Select } from './select';

describe('Select', () => {
  it('renders a real native select (keeps mobile pickers + accessibility)', () => {
    render(
      <Select data-testid="level" defaultValue="a1">
        <option value="a1">A1</option>
        <option value="a2">A2</option>
      </Select>,
    );
    const el = screen.getByTestId('level');
    expect(el.tagName).toBe('SELECT');
  });

  it('hides the native arrow (appearance-none) and uses the shared field look', () => {
    render(
      <Select data-testid="level">
        <option value="a1">A1</option>
      </Select>,
    );
    expect(screen.getByTestId('level').className).toContain('appearance-none');
    expect(screen.getByTestId('level').className).toContain('bg-(--color-field)');
  });

  it('renders a decorative Phosphor chevron next to the control', () => {
    const { container } = render(
      <Select data-testid="level">
        <option value="a1">A1</option>
      </Select>,
    );
    const chevron = container.querySelector('svg[aria-hidden="true"]');
    expect(chevron).not.toBeNull();
  });

  it('forwards value/onChange like a normal controlled select', () => {
    render(
      <Select data-testid="level" value="a2" onChange={() => {}}>
        <option value="a1">A1</option>
        <option value="a2">A2</option>
      </Select>,
    );
    expect((screen.getByTestId('level') as HTMLSelectElement).value).toBe('a2');
  });
});
