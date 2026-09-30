// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import LessonForm from './LessonForm';

// jsdom has no ResizeObserver; `Checkbox` (Radix) reads one via
// `@radix-ui/react-use-size` — same stub precedent as
// `WorksheetZoneEditor.test.tsx`, minimal here since nothing in this file
// asserts on resize behavior.
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
});

function submitProps(overrides: Partial<Parameters<typeof LessonForm>[0]> = {}) {
  return {
    lang: 'es' as const,
    onSubmit: vi.fn().mockResolvedValue({ ok: true }),
    onCancel: vi.fn(),
    submitLabel: 'Agregar lección',
    submittingLabel: 'Agregando…',
    ...overrides,
  };
}

describe('LessonForm — text kind (default)', () => {
  it('renders a markdown textarea and a live sanitized preview', () => {
    render(<LessonForm {...submitProps()} />);
    fireEvent.change(screen.getByTestId('lesson-markdown'), { target: { value: '**hola**' } });
    expect(screen.getByTestId('lesson-markdown-preview').innerHTML).toContain('<strong>hola</strong>');
  });

  it('strips a raw script tag from the preview', () => {
    render(<LessonForm {...submitProps()} />);
    fireEvent.change(screen.getByTestId('lesson-markdown'), {
      target: { value: 'hola <script>alert(1)</script>' },
    });
    expect(screen.getByTestId('lesson-markdown-preview').innerHTML).not.toContain('<script');
  });

  it('submits { markdown } as content', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: true });
    render(<LessonForm {...submitProps({ onSubmit })} />);
    fireEvent.change(screen.getByTestId('lesson-title'), { target: { value: 'Lección 1' } });
    fireEvent.change(screen.getByTestId('lesson-markdown'), { target: { value: 'hola' } });
    fireEvent.click(screen.getByTestId('lesson-form-submit'));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        title: 'Lección 1',
        kind: 'text',
        content: { markdown: 'hola' },
        duration_min: null,
        is_preview: false,
      }),
    );
  });
});

describe('LessonForm — video kind', () => {
  it('shows a URL input and submits { url }', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: true });
    render(<LessonForm {...submitProps({ onSubmit })} />);
    fireEvent.change(screen.getByTestId('lesson-kind'), { target: { value: 'video' } });
    fireEvent.change(screen.getByTestId('lesson-title'), { target: { value: 'Video 1' } });
    fireEvent.change(screen.getByTestId('lesson-video-url'), { target: { value: 'https://youtu.be/x' } });
    fireEvent.click(screen.getByTestId('lesson-form-submit'));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'video', content: { url: 'https://youtu.be/x' } }),
      ),
    );
  });
});

describe('LessonForm — activity kind', () => {
  it('searches (debounced) and lets the author pick a result', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ activities: [{ id: 'a1', title: 'Presente simple', level: 'A1' }] }),
    });
    render(<LessonForm {...submitProps()} />);
    fireEvent.change(screen.getByTestId('lesson-kind'), { target: { value: 'activity' } });
    fireEvent.change(screen.getByTestId('lesson-activity-search'), { target: { value: 'presente' } });

    // Real 300ms debounce, real timers — simpler and more robust than
    // fighting fake timers against `waitFor`'s own internal polling.
    await waitFor(() => expect(screen.getByTestId('lesson-activity-option-a1')).toBeTruthy(), { timeout: 2000 });

    fireEvent.click(screen.getByTestId('lesson-activity-option-a1'));
    expect(screen.getByTestId('lesson-activity-selected').textContent).toContain('Presente simple');
    expect(fetch).toHaveBeenCalledWith('/api/admin/cursos/actividades/buscar?q=presente');
  });

  it('submits { activityId } once an activity is selected', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ activities: [{ id: 'a1', title: 'Presente simple', level: 'A1' }] }),
    });
    const onSubmit = vi.fn().mockResolvedValue({ ok: true });
    render(<LessonForm {...submitProps({ onSubmit })} />);
    fireEvent.change(screen.getByTestId('lesson-kind'), { target: { value: 'activity' } });
    fireEvent.change(screen.getByTestId('lesson-activity-search'), { target: { value: 'presente' } });
    await waitFor(() => screen.getByTestId('lesson-activity-option-a1'), { timeout: 2000 });
    fireEvent.click(screen.getByTestId('lesson-activity-option-a1'));

    fireEvent.change(screen.getByTestId('lesson-title'), { target: { value: 'Práctica' } });
    fireEvent.click(screen.getByTestId('lesson-form-submit'));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ content: { activityId: 'a1' } })),
    );
  });
});

describe('LessonForm — errors and cancel', () => {
  it('shows the mapped error message when onSubmit fails', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: false, error: 'invalid_content' });
    render(<LessonForm {...submitProps({ onSubmit })} />);
    fireEvent.change(screen.getByTestId('lesson-title'), { target: { value: 'X' } });
    fireEvent.click(screen.getByTestId('lesson-form-submit'));
    const error = await screen.findByTestId('lesson-form-error');
    expect(error.textContent).toBeTruthy();
  });

  it('calls onCancel when Cancelar is clicked', () => {
    const onCancel = vi.fn();
    render(<LessonForm {...submitProps({ onCancel })} />);
    fireEvent.click(screen.getByTestId('lesson-form-cancel'));
    expect(onCancel).toHaveBeenCalled();
  });
});

describe('LessonForm — editing', () => {
  it('seeds every field from `initial`', () => {
    render(
      <LessonForm
        {...submitProps()}
        initial={{
          id: 'l1',
          title: 'Lección existente',
          kind: 'text',
          content: { markdown: 'contenido' },
          duration_min: 5,
          is_preview: true,
        }}
      />,
    );
    expect((screen.getByTestId('lesson-title') as HTMLInputElement).value).toBe('Lección existente');
    expect((screen.getByTestId('lesson-markdown') as HTMLTextAreaElement).value).toBe('contenido');
    expect((screen.getByTestId('lesson-duration') as HTMLInputElement).value).toBe('5');
  });
});
