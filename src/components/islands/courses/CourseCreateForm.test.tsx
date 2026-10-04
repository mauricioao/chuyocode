// @vitest-environment jsdom
/**
 * CourseCreateForm tests — the "Nuevo curso" admin form
 * (`POST /api/admin/cursos`). Previously untested; this file is scoped to
 * the behavior touched by the coherent-loading-states pass: the submit
 * button's own loading state (spinner + aria-busy + stable width, instead
 * of a disabled-only button with no loading prop) and a toast on failure.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const { toastErrorMock } = vi.hoisted(() => ({ toastErrorMock: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: toastErrorMock } }));

import CourseCreateForm from './CourseCreateForm';
import { UI_LABELS } from '@/lib/i18n';

const t = UI_LABELS.es.admin.cursos;

function fillForm() {
  fireEvent.change(screen.getByTestId('course-create-slug'), { target: { value: 'react-basico' } });
  fireEvent.change(screen.getByTestId('course-create-title'), { target: { value: 'React básico' } });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('CourseCreateForm — submitting', () => {
  it('navigates to the new course on success', async () => {
    const assign = vi.fn();
    Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, assign } });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ course: { id: 'c1' } }) }),
    );
    render(<CourseCreateForm lang="es" />);
    fillForm();
    fireEvent.click(screen.getByTestId('course-create-submit'));

    await waitFor(() => expect(assign).toHaveBeenCalledWith('/es/admin/cursos/c1'));
  });

  it('shows the submit button as loading/aria-busy with its label unchanged while in flight', async () => {
    let release: (() => void) | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise((resolve) => { release = () => resolve({ ok: true, json: async () => ({ course: { id: 'c1' } }) }); })),
    );
    render(<CourseCreateForm lang="es" />);
    fillForm();
    fireEvent.click(screen.getByTestId('course-create-submit'));

    const submit = screen.getByTestId('course-create-submit') as HTMLButtonElement;
    expect(submit.getAttribute('aria-busy')).toBe('true');
    expect(submit.disabled).toBe(true);
    expect(submit.textContent).toContain(t.createButton);
    release?.();
  });

  it('shows an inline error and a toast on failure, re-enabling the button', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'duplicate_slug' }) }));
    render(<CourseCreateForm lang="es" />);
    fillForm();
    fireEvent.click(screen.getByTestId('course-create-submit'));

    const errors = t.errors as Record<string, string>;
    await waitFor(() => expect(screen.getByTestId('course-create-error').textContent).toBe(errors.duplicate_slug));
    expect(toastErrorMock).toHaveBeenCalledWith(errors.duplicate_slug);
    expect((screen.getByTestId('course-create-submit') as HTMLButtonElement).disabled).toBe(false);
  });
});
