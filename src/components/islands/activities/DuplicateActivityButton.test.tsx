// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { renderThenHydrate } from '@/testSupport/hydrationHarness';
import DuplicateActivityButton from './DuplicateActivityButton';

const ACTIVITY_ID = '11111111-1111-1111-1111-111111111111';

afterEach(() => cleanup());

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

describe('DuplicateActivityButton', () => {
  it('renders the trigger, idle — an icon button with an aria-label and a hover/focus tooltip, not visible text', () => {
    render(<DuplicateActivityButton lang="es" activityId={ACTIVITY_ID} navigate={vi.fn()} />);
    const button = screen.getByTestId('duplicate-activity-button');
    expect(button.getAttribute('aria-label')).toBe('Duplicar');
    const tooltip = button.querySelector('[role="tooltip"]');
    expect(tooltip?.textContent).toBe('Duplicar');
    expect(button.getAttribute('aria-describedby')).toBe(tooltip?.id);
    expect(screen.queryByTestId('duplicate-activity-error')).toBeNull();
  });

  it('POSTs to the duplicate endpoint and navigates to the new editor on success', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'new-activity-1' }),
    });
    const navigate = vi.fn();
    render(<DuplicateActivityButton lang="es" activityId={ACTIVITY_ID} navigate={navigate} />);

    fireEvent.click(screen.getByTestId('duplicate-activity-button'));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/es/crear/new-activity-1'));
    expect(fetch).toHaveBeenCalledWith(`/api/actividades/${ACTIVITY_ID}/duplicar`, { method: 'POST' });
  });

  it('navigates with the lang prop, not a hardcoded one', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'new-activity-1' }),
    });
    const navigate = vi.fn();
    render(<DuplicateActivityButton lang="en" activityId={ACTIVITY_ID} navigate={navigate} />);
    fireEvent.click(screen.getByTestId('duplicate-activity-button'));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/en/crear/new-activity-1'));
  });

  it('shows the daily_limit message and never navigates on a 429', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'daily_limit' }),
    });
    const navigate = vi.fn();
    render(<DuplicateActivityButton lang="es" activityId={ACTIVITY_ID} navigate={navigate} />);
    fireEvent.click(screen.getByTestId('duplicate-activity-button'));

    const error = await screen.findByTestId('duplicate-activity-error');
    expect(error.textContent).toBe('Se alcanzó el límite diario de duplicados. Inténtalo mañana.');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('shows the upload_limit message on that error', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'upload_limit' }),
    });
    render(<DuplicateActivityButton lang="es" activityId={ACTIVITY_ID} navigate={vi.fn()} />);
    fireEvent.click(screen.getByTestId('duplicate-activity-button'));

    const error = await screen.findByTestId('duplicate-activity-error');
    expect(error.textContent).toMatch(/espacio/);
  });

  it('falls back to the generic error message when fetch itself rejects', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network down'));
    render(<DuplicateActivityButton lang="es" activityId={ACTIVITY_ID} navigate={vi.fn()} />);
    fireEvent.click(screen.getByTestId('duplicate-activity-button'));

    const error = await screen.findByTestId('duplicate-activity-error');
    expect(error.textContent).toBe('No se pudo duplicar la actividad. Inténtalo de nuevo.');
  });

  it('shows "Duplicando…" while the request is in flight', async () => {
    let resolveFetch!: (value: unknown) => void;
    (fetch as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );
    render(<DuplicateActivityButton lang="es" activityId={ACTIVITY_ID} navigate={vi.fn()} />);
    fireEvent.click(screen.getByTestId('duplicate-activity-button'));

    await waitFor(() =>
      expect(screen.getByTestId('duplicate-activity-button').getAttribute('aria-label')).toContain('Duplicando'),
    );
    resolveFetch({ ok: true, json: async () => ({ id: 'new-activity-1' }) });
  });
});

describe('DuplicateActivityButton — hydration (Bug 1, React error #418)', () => {
  it('does not report a recoverable hydration error', async () => {
    const { recoverableErrors } = await renderThenHydrate(() => (
      <DuplicateActivityButton lang="es" activityId={ACTIVITY_ID} navigate={() => {}} />
    ));
    expect(recoverableErrors).toEqual([]);
  });
});
