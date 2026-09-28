// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import SubmitForReviewDialog from './SubmitForReviewDialog';

afterEach(() => cleanup());

describe('SubmitForReviewDialog', () => {
  it('renders nothing (closed) when open is false', () => {
    render(
      <SubmitForReviewDialog
        lang="es"
        open={false}
        submitting={false}
        errorMessage={null}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.queryByTestId('submit-for-review-dialog')).toBeNull();
  });

  it('shows the title, the rights checkbox (unchecked), and disables confirm until it is checked', () => {
    render(
      <SubmitForReviewDialog
        lang="es"
        open
        submitting={false}
        errorMessage={null}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    const checkbox = screen.getByTestId('submit-rights-checkbox') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    expect((screen.getByTestId('submit-dialog-confirm') as HTMLButtonElement).disabled).toBe(true);
  });

  it('enables confirm once the rights checkbox is checked, and calls onConfirm', () => {
    const onConfirm = vi.fn();
    render(
      <SubmitForReviewDialog
        lang="es"
        open
        submitting={false}
        errorMessage={null}
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId('submit-rights-checkbox'));
    const confirmBtn = screen.getByTestId('submit-dialog-confirm') as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(false);
    fireEvent.click(confirmBtn);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('resets the checkbox back to unchecked whenever it re-opens', () => {
    const { rerender } = render(
      <SubmitForReviewDialog
        lang="es"
        open
        submitting={false}
        errorMessage={null}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId('submit-rights-checkbox'));
    expect((screen.getByTestId('submit-rights-checkbox') as HTMLInputElement).checked).toBe(true);

    rerender(
      <SubmitForReviewDialog
        lang="es"
        open={false}
        submitting={false}
        errorMessage={null}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    rerender(
      <SubmitForReviewDialog
        lang="es"
        open
        submitting={false}
        errorMessage={null}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect((screen.getByTestId('submit-rights-checkbox') as HTMLInputElement).checked).toBe(false);
  });

  it('shows the submitting label and disables both buttons while submitting', () => {
    render(
      <SubmitForReviewDialog
        lang="es"
        open
        submitting
        errorMessage={null}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByTestId('submit-dialog-confirm').textContent).toContain('Enviando');
    expect((screen.getByTestId('submit-dialog-cancel') as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows an inline error message when given one', () => {
    render(
      <SubmitForReviewDialog
        lang="es"
        open
        submitting={false}
        errorMessage="No se pudo enviar la actividad. Intentar de nuevo."
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByTestId('submit-dialog-error').textContent).toContain('No se pudo enviar');
  });

  it('calls onCancel when the cancel button is clicked', () => {
    const onCancel = vi.fn();
    render(
      <SubmitForReviewDialog
        lang="es"
        open
        submitting={false}
        errorMessage={null}
        onConfirm={() => {}}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByTestId('submit-dialog-cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('renders English copy for lang="en"', () => {
    render(
      <SubmitForReviewDialog
        lang="en"
        open
        submitting={false}
        errorMessage={null}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByTestId('submit-for-review-dialog').textContent).toContain('Submit this activity for review');
  });
});
