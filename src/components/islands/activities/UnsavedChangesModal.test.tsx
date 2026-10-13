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

  // Owner report ("botón fuera de la caja"), UI round 2 follow-up: a
  // full-width button can never overflow its own dialog at any width, so
  // the kit's iOS-style three-action alert — a full-width capsule stack —
  // makes the original overflow structurally impossible, not just wrapped.
  it('stacks every action full width in a single column, never a row, at any width', () => {
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
    const actions = screen.getByTestId('unsaved-modal-save-and-leave').closest('div');
    expect(actions?.className).toContain('flex-col');
    expect(actions?.className).not.toContain('sm:flex-row');
    expect(actions?.className).not.toContain('flex-col-reverse');

    for (const testId of ['unsaved-modal-save-and-leave', 'unsaved-modal-leave', 'unsaved-modal-cancel']) {
      const button = screen.getByTestId(testId);
      expect(button.className).toContain('w-full');
      expect(button.className).toContain('rounded-full');
    }
  });

  // Owner spec: primary first, both in the DOM (so no CSS reordering trick
  // is needed) and visually (no `flex-col-reverse`).
  it('orders the actions primary first: Guardar y salir, Salir sin guardar, Cancelar', () => {
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
    const actions = screen.getByTestId('unsaved-modal-save-and-leave').closest('div') as HTMLElement;
    const testIds = Array.from(actions.children).map((child) => child.getAttribute('data-testid'));
    expect(testIds).toEqual(['unsaved-modal-save-and-leave', 'unsaved-modal-leave', 'unsaved-modal-cancel']);
  });

  // Owner spec: primary (filled default), secondary (the kit's own
  // `secondary` variant — already used elsewhere, e.g. `ShareDialog`), quiet
  // (`ghost`) — three distinct visual weights, never two buttons reading the
  // same.
  it('gives each action its own weight: primary (default), secondary, quiet (ghost)', () => {
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
    expect(screen.getByTestId('unsaved-modal-save-and-leave').getAttribute('data-variant')).toBe('default');
    expect(screen.getByTestId('unsaved-modal-leave').getAttribute('data-variant')).toBe('secondary');
    expect(screen.getByTestId('unsaved-modal-cancel').getAttribute('data-variant')).toBe('ghost');
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
