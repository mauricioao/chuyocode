// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TaskProgress } from './task-progress';

describe('TaskProgress', () => {
  it('shows the label, a determinate progress bar, and announces it politely/busy', () => {
    render(<TaskProgress label="Convirtiendo página 2 de 5" progress={0.4} />);
    expect(screen.getByTestId('task-progress-label').textContent).toBe('Convirtiendo página 2 de 5');
    const bar = screen.getByTestId('task-progress-bar');
    expect(bar.getAttribute('aria-valuenow')).toBe('40');
    expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true');
  });

  it('shows an optional thumbnail', () => {
    render(<TaskProgress label="x" progress={0} thumbnailUrl="blob:page-1" thumbnailAlt="Página 1" />);
    expect(screen.getByAltText('Página 1').getAttribute('src')).toBe('blob:page-1');
  });

  it('shows a cancel button and fires onCancel', () => {
    const onCancel = vi.fn();
    render(<TaskProgress label="x" progress={0} cancel={{ label: 'Cancelar', onCancel }} />);
    fireEvent.click(screen.getByTestId('task-progress-cancel'));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('omits the cancel button when no cancel prop is given', () => {
    render(<TaskProgress label="x" progress={0} />);
    expect(screen.queryByTestId('task-progress-cancel')).toBeNull();
  });

  it('shows the error state instead of cancel, with retry and choose-another actions', () => {
    const onRetry = vi.fn();
    const onChooseAnother = vi.fn();
    render(
      <TaskProgress
        label="Subiendo página 3 de 5"
        progress={0.5}
        cancel={{ label: 'Cancelar', onCancel: vi.fn() }}
        error={{
          message: 'No se pudo subir el archivo.',
          retryLabel: 'Reintentar',
          onRetry,
          chooseAnotherLabel: 'Elegir otro archivo',
          onChooseAnother,
        }}
      />,
    );

    expect(screen.getByRole('alert').textContent).toContain('No se pudo subir el archivo.');
    expect(screen.queryByTestId('task-progress-cancel')).toBeNull();
    expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('false');

    fireEvent.click(screen.getByTestId('task-progress-retry'));
    expect(onRetry).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByTestId('task-progress-choose-another'));
    expect(onChooseAnother).toHaveBeenCalledOnce();
  });

  it('clamps progress to [0, 100]%', () => {
    const { rerender } = render(<TaskProgress label="x" progress={-1} />);
    expect(screen.getByTestId('task-progress-bar').getAttribute('aria-valuenow')).toBe('0');
    rerender(<TaskProgress label="x" progress={2} />);
    expect(screen.getByTestId('task-progress-bar').getAttribute('aria-valuenow')).toBe('100');
  });
});
