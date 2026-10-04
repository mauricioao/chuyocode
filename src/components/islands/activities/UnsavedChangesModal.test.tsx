// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import UnsavedChangesModal from './UnsavedChangesModal';

afterEach(() => cleanup());

const LABELS = {
  title: 'El ejercicio tiene cambios sin guardar',
  saveAndLeave: 'Guardar y salir',
  leaveWithoutSaving: 'Salir sin guardar',
  cancel: 'Cancelar',
  saveError: 'No se pudo guardar. Inténtalo de nuevo.',
};

describe('UnsavedChangesModal', () => {
  it('renders nothing (closed) when open is false', () => {
    render(
      <UnsavedChangesModal
        open={false}
        saving={false}
        error={false}
        labels={LABELS}
        onSaveAndLeave={() => {}}
        onLeaveWithoutSaving={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.queryByTestId('unsaved-changes-modal')).toBeNull();
  });

  it('shows the title and all three choices when open', () => {
    render(
      <UnsavedChangesModal
        open
        saving={false}
        error={false}
        labels={LABELS}
        onSaveAndLeave={() => {}}
        onLeaveWithoutSaving={() => {}}
        onCancel={() => {}}
      />,
    );
    const modal = screen.getByTestId('unsaved-changes-modal');
    expect(modal.textContent).toContain(LABELS.title);
    expect(screen.getByTestId('unsaved-modal-save-and-leave')).toBeTruthy();
    expect(screen.getByTestId('unsaved-modal-leave')).toBeTruthy();
    expect(screen.getByTestId('unsaved-modal-cancel')).toBeTruthy();
  });

  it('calls the right handler for each choice', () => {
    const onSaveAndLeave = vi.fn();
    const onLeaveWithoutSaving = vi.fn();
    const onCancel = vi.fn();
    render(
      <UnsavedChangesModal
        open
        saving={false}
        error={false}
        labels={LABELS}
        onSaveAndLeave={onSaveAndLeave}
        onLeaveWithoutSaving={onLeaveWithoutSaving}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByTestId('unsaved-modal-save-and-leave'));
    fireEvent.click(screen.getByTestId('unsaved-modal-leave'));
    fireEvent.click(screen.getByTestId('unsaved-modal-cancel'));
    expect(onSaveAndLeave).toHaveBeenCalledTimes(1);
    expect(onLeaveWithoutSaving).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('disables "Guardar y salir" and shows it as loading/aria-busy while saving', () => {
    render(
      <UnsavedChangesModal
        open
        saving
        error={false}
        labels={LABELS}
        onSaveAndLeave={() => {}}
        onLeaveWithoutSaving={() => {}}
        onCancel={() => {}}
      />,
    );
    const saveAndLeave = screen.getByTestId('unsaved-modal-save-and-leave') as HTMLButtonElement;
    expect(saveAndLeave.disabled).toBe(true);
    expect(saveAndLeave.getAttribute('aria-busy')).toBe('true');
  });

  it('shows an inline error after a failed save-and-leave, without closing', () => {
    render(
      <UnsavedChangesModal
        open
        saving={false}
        error
        labels={LABELS}
        onSaveAndLeave={() => {}}
        onLeaveWithoutSaving={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByTestId('unsaved-modal-error').textContent).toContain(LABELS.saveError);
    expect(screen.getByTestId('unsaved-changes-modal')).toBeTruthy();
  });

  it('calls onCancel when dismissed via the overlay/Escape (Radix onOpenChange)', () => {
    const onCancel = vi.fn();
    render(
      <UnsavedChangesModal
        open
        saving={false}
        error={false}
        labels={LABELS}
        onSaveAndLeave={() => {}}
        onLeaveWithoutSaving={() => {}}
        onCancel={onCancel}
      />,
    );
    fireEvent.keyDown(screen.getByTestId('unsaved-changes-modal'), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
  });
});
