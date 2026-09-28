// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import SaveStatusIndicator from './SaveStatusIndicator';

afterEach(() => cleanup());

const LABELS = {
  saving: 'Guardando cambios',
  saved: 'Cambios guardados',
  error: 'No se pudo guardar',
  unsaved: 'Cambios sin guardar',
  retry: 'Reintentar',
  errorRetry: 'No se pudo guardar, reintentar',
};

describe('SaveStatusIndicator', () => {
  it('shows a spinning icon while saving', () => {
    render(<SaveStatusIndicator status="saving" onRetry={() => {}} labels={LABELS} />);
    const el = screen.getByTestId('save-status');
    expect(el.getAttribute('data-status')).toBe('saving');
    expect(el.querySelector('svg')?.getAttribute('class')).toContain('animate-spin');
  });

  it('never renders the old text label, only an accessible name', () => {
    render(<SaveStatusIndicator status="saved" onRetry={() => {}} labels={LABELS} />);
    const el = screen.getByTestId('save-status');
    expect(el.textContent).toBe(''); // icon only, no visible text
    expect(el.getAttribute('aria-label')).toBe('Cambios guardados');
  });

  it('maps "saved" to a fill CheckCircle in the success color', () => {
    render(<SaveStatusIndicator status="saved" onRetry={() => {}} labels={LABELS} />);
    const el = screen.getByTestId('save-status');
    expect(el.getAttribute('data-status')).toBe('saved');
    expect(el.querySelector('svg')?.getAttribute('class')).toContain('text-success');
  });

  it('maps "idle" (nothing saved yet) to the same "saved" appearance', () => {
    render(<SaveStatusIndicator status="idle" onRetry={() => {}} labels={LABELS} />);
    expect(screen.getByTestId('save-status').getAttribute('data-status')).toBe('saved');
  });

  it('maps "pending" to data-status "unsaved"', () => {
    render(<SaveStatusIndicator status="pending" onRetry={() => {}} labels={LABELS} />);
    expect(screen.getByTestId('save-status').getAttribute('data-status')).toBe('unsaved');
  });

  it('shows an icon-only retry action on error, which is never silent', () => {
    const onRetry = vi.fn();
    render(<SaveStatusIndicator status="error" onRetry={onRetry} labels={LABELS} />);
    expect(screen.getByTestId('save-status').getAttribute('data-status')).toBe('error');
    const retry = screen.getByTestId('save-retry');
    expect(retry.textContent).toBe(''); // icon only, no visible "Reintentar" text
    expect(retry.getAttribute('aria-label')).toBe('No se pudo guardar, reintentar');
    fireEvent.click(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
