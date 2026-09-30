// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Field } from './field';
import { Input } from './input';

describe('Field', () => {
  it('renders the label above the control, wired to it via htmlFor/id', () => {
    render(
      <Field label="Correo">
        {({ id }) => <Input id={id} data-testid="control" />}
      </Field>,
    );
    const label = screen.getByText('Correo');
    const control = screen.getByTestId('control');
    expect(label.tagName).toBe('LABEL');
    expect(label.getAttribute('for')).toBe(control.id);
  });

  it('uses a caller-supplied id instead of generating one', () => {
    render(
      <Field label="Correo" htmlFor="email-field">
        {({ id }) => <Input id={id} data-testid="control" />}
      </Field>,
    );
    expect(screen.getByTestId('control').id).toBe('email-field');
  });

  it('renders an optional hint below the control and wires aria-describedby', () => {
    render(
      <Field label="Correo" hint="Usaremos este correo para notificarte">
        {({ id, describedBy }) => (
          <Input id={id} data-testid="control" aria-describedby={describedBy} />
        )}
      </Field>,
    );
    const hint = screen.getByText('Usaremos este correo para notificarte');
    expect(screen.getByTestId('control').getAttribute('aria-describedby')).toBe(hint.id);
  });

  it('renders an error instead of the hint, as an alert, and wires aria-describedby', () => {
    render(
      <Field label="Correo" hint="ignored while there is an error" error="Correo inválido">
        {({ id, describedBy }) => (
          <Input id={id} data-testid="control" aria-describedby={describedBy} aria-invalid />
        )}
      </Field>,
    );
    expect(screen.queryByText('ignored while there is an error')).toBeNull();
    const error = screen.getByText('Correo inválido');
    expect(error.getAttribute('role')).toBe('alert');
    expect(screen.getByTestId('control').getAttribute('aria-describedby')).toBe(error.id);
  });
});
