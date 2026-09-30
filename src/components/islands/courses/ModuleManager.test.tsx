// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import ModuleManager, { type ModuleRecord } from './ModuleManager';

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const COURSE_ID = 'course-1';

afterEach(() => cleanup());

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
  vi.stubGlobal('confirm', vi.fn(() => true));
});

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body };
}

describe('ModuleManager — empty state', () => {
  it('shows the empty state and the add-module form', () => {
    render(<ModuleManager lang="es" courseId={COURSE_ID} initialModules={[]} />);
    expect(screen.getByTestId('modules-empty')).toBeTruthy();
    expect(screen.getByTestId('module-add-form')).toBeTruthy();
  });
});

describe('ModuleManager — modules', () => {
  it('adds a module and clears the input', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse({ id: 'm1' }));
    render(<ModuleManager lang="es" courseId={COURSE_ID} initialModules={[]} />);

    fireEvent.change(screen.getByTestId('module-add-input'), { target: { value: 'Módulo 1' } });
    fireEvent.click(screen.getByTestId('module-add-submit'));

    await waitFor(() => expect(screen.getByTestId('module-m1')).toBeTruthy());
    expect(fetch).toHaveBeenCalledWith(
      `/api/admin/cursos/${COURSE_ID}/modulos`,
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ title: 'Módulo 1' }) }),
    );
    expect((screen.getByTestId('module-add-input') as HTMLInputElement).value).toBe('');
  });

  it('renames a module', async () => {
    const modules: ModuleRecord[] = [{ id: 'm1', position: 0, title: 'Viejo', lessons: [] }];
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse({ ok: true }));
    render(<ModuleManager lang="es" courseId={COURSE_ID} initialModules={modules} />);

    fireEvent.click(screen.getByTestId('module-rename-m1'));
    fireEvent.change(screen.getByTestId('module-rename-input-m1'), { target: { value: 'Nuevo' } });
    fireEvent.click(screen.getByTestId('module-rename-save-m1'));

    await waitFor(() => expect(screen.queryByTestId('module-rename-input-m1')).toBeNull());
    expect(screen.getByTestId('module-m1').textContent).toContain('Nuevo');
  });

  it('deletes a module after confirmation', async () => {
    const modules: ModuleRecord[] = [{ id: 'm1', position: 0, title: 'M1', lessons: [] }];
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse({ ok: true }));
    render(<ModuleManager lang="es" courseId={COURSE_ID} initialModules={modules} />);

    fireEvent.click(screen.getByTestId('module-delete-m1'));

    await waitFor(() => expect(screen.queryByTestId('module-m1')).toBeNull());
    expect(fetch).toHaveBeenCalledWith(`/api/admin/cursos/${COURSE_ID}/modulos/m1/eliminar`, expect.anything());
  });

  it('does not delete when confirm is declined', async () => {
    (window.confirm as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);
    const modules: ModuleRecord[] = [{ id: 'm1', position: 0, title: 'M1', lessons: [] }];
    render(<ModuleManager lang="es" courseId={COURSE_ID} initialModules={modules} />);

    fireEvent.click(screen.getByTestId('module-delete-m1'));

    expect(screen.getByTestId('module-m1')).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('moves a module up and posts the full reordered id list', async () => {
    const modules: ModuleRecord[] = [
      { id: 'm1', position: 0, title: 'Primero', lessons: [] },
      { id: 'm2', position: 1, title: 'Segundo', lessons: [] },
    ];
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse({ ok: true }));
    render(<ModuleManager lang="es" courseId={COURSE_ID} initialModules={modules} />);

    fireEvent.click(screen.getByTestId('module-up-m2'));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        `/api/admin/cursos/${COURSE_ID}/modulos/orden`,
        expect.objectContaining({ body: JSON.stringify({ moduleIds: ['m2', 'm1'] }) }),
      ),
    );
  });

  it('disables the up button on the first module and the down button on the last', () => {
    const modules: ModuleRecord[] = [
      { id: 'm1', position: 0, title: 'Primero', lessons: [] },
      { id: 'm2', position: 1, title: 'Segundo', lessons: [] },
    ];
    render(<ModuleManager lang="es" courseId={COURSE_ID} initialModules={modules} />);
    expect((screen.getByTestId('module-up-m1') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('module-down-m2') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('ModuleManager — lessons', () => {
  const baseModule: ModuleRecord = { id: 'm1', position: 0, title: 'M1', lessons: [] };

  it('adds a lesson through the inline LessonForm', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse({ id: 'l1' }));
    render(<ModuleManager lang="es" courseId={COURSE_ID} initialModules={[baseModule]} />);

    fireEvent.click(screen.getByTestId('lesson-add-m1'));
    fireEvent.change(screen.getByTestId('lesson-title'), { target: { value: 'Lección 1' } });
    fireEvent.change(screen.getByTestId('lesson-markdown'), { target: { value: 'hola' } });
    fireEvent.click(screen.getByTestId('lesson-form-submit'));

    await waitFor(() => expect(screen.getByTestId('lesson-l1')).toBeTruthy());
    expect(fetch).toHaveBeenCalledWith(
      `/api/admin/cursos/${COURSE_ID}/modulos/m1/lecciones`,
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('edits an existing lesson', async () => {
    const withLesson: ModuleRecord = {
      ...baseModule,
      lessons: [{ id: 'l1', position: 0, title: 'Original', kind: 'text', content: { markdown: 'x' }, duration_min: null, is_preview: false }],
    };
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse({ ok: true }));
    render(<ModuleManager lang="es" courseId={COURSE_ID} initialModules={[withLesson]} />);

    fireEvent.click(screen.getByTestId('lesson-edit-l1'));
    fireEvent.change(screen.getByTestId('lesson-title'), { target: { value: 'Editada' } });
    fireEvent.click(screen.getByTestId('lesson-form-submit'));

    await waitFor(() => expect(screen.getByTestId('lesson-l1').textContent).toContain('Editada'));
  });

  it('deletes a lesson after confirmation', async () => {
    const withLesson: ModuleRecord = {
      ...baseModule,
      lessons: [{ id: 'l1', position: 0, title: 'X', kind: 'text', content: { markdown: 'x' }, duration_min: null, is_preview: false }],
    };
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse({ ok: true }));
    render(<ModuleManager lang="es" courseId={COURSE_ID} initialModules={[withLesson]} />);

    fireEvent.click(screen.getByTestId('lesson-delete-l1'));

    await waitFor(() => expect(screen.queryByTestId('lesson-l1')).toBeNull());
  });

  it('shows the "Vista previa" tag for a preview lesson', () => {
    const withLesson: ModuleRecord = {
      ...baseModule,
      lessons: [{ id: 'l1', position: 0, title: 'X', kind: 'text', content: {}, duration_min: null, is_preview: true }],
    };
    render(<ModuleManager lang="es" courseId={COURSE_ID} initialModules={[withLesson]} />);
    expect(screen.getByTestId('lesson-l1').textContent).toContain('Vista previa');
  });

  it('moves a lesson down and posts the full reordered id list', async () => {
    const withLessons: ModuleRecord = {
      ...baseModule,
      lessons: [
        { id: 'l1', position: 0, title: 'Uno', kind: 'text', content: {}, duration_min: null, is_preview: false },
        { id: 'l2', position: 1, title: 'Dos', kind: 'text', content: {}, duration_min: null, is_preview: false },
      ],
    };
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse({ ok: true }));
    render(<ModuleManager lang="es" courseId={COURSE_ID} initialModules={[withLessons]} />);

    fireEvent.click(screen.getByTestId('lesson-down-l1'));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        `/api/admin/cursos/${COURSE_ID}/modulos/m1/lecciones/orden`,
        expect.objectContaining({ body: JSON.stringify({ lessonIds: ['l2', 'l1'] }) }),
      ),
    );
  });
});
