// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { renderThenHydrate } from '@/testSupport/hydrationHarness';
import ReportActivityButton from './ReportActivityButton';

const ACTIVITY_ID = '11111111-1111-1111-1111-111111111111';

afterEach(() => cleanup());

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

describe('ReportActivityButton — closed by default', () => {
  it('shows only the trigger button, no dialog', () => {
    render(<ReportActivityButton lang="es" activityId={ACTIVITY_ID} />);
    expect(screen.queryByTestId('report-activity-button')).not.toBeNull();
    expect(screen.queryByTestId('report-activity-dialog')).toBeNull();
  });

  // T2 (practice page action bar redesign): icon-only trigger, the label as
  // its accessible name, and a hover/focus tooltip carrying that same label.
  it('is an icon button whose accessible name and tooltip are both "Reportar"', () => {
    render(<ReportActivityButton lang="es" activityId={ACTIVITY_ID} />);
    const button = screen.getByTestId('report-activity-button');
    expect(button.getAttribute('aria-label')).toBe('Reportar');
    const tooltip = button.querySelector('[role="tooltip"]');
    expect(tooltip?.textContent).toBe('Reportar');
    expect(button.getAttribute('aria-describedby')).toBe(tooltip?.id);
  });
});

describe('ReportActivityButton — the dialog', () => {
  it('opens on click, with confirm disabled until a reason is chosen', () => {
    render(<ReportActivityButton lang="es" activityId={ACTIVITY_ID} />);
    fireEvent.click(screen.getByTestId('report-activity-button'));

    expect(screen.queryByTestId('report-activity-dialog')).not.toBeNull();
    expect((screen.getByTestId('report-dialog-confirm') as HTMLButtonElement).disabled).toBe(true);
  });

  it('enables confirm once a reason is picked', () => {
    render(<ReportActivityButton lang="es" activityId={ACTIVITY_ID} />);
    fireEvent.click(screen.getByTestId('report-activity-button'));
    fireEvent.click(screen.getByTestId('report-reason-inappropriate'));
    expect((screen.getByTestId('report-dialog-confirm') as HTMLButtonElement).disabled).toBe(false);
  });

  it('resets reason/details/status every time it re-opens', () => {
    render(<ReportActivityButton lang="es" activityId={ACTIVITY_ID} />);
    fireEvent.click(screen.getByTestId('report-activity-button'));
    fireEvent.click(screen.getByTestId('report-reason-other'));
    fireEvent.change(screen.getByTestId('report-details'), { target: { value: 'algo' } });
    fireEvent.click(screen.getByTestId('report-dialog-cancel'));

    fireEvent.click(screen.getByTestId('report-activity-button'));
    expect((screen.getByTestId('report-dialog-confirm') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('report-details') as HTMLTextAreaElement).value).toBe('');
  });

  it('closes on cancel without calling fetch', () => {
    render(<ReportActivityButton lang="es" activityId={ACTIVITY_ID} />);
    fireEvent.click(screen.getByTestId('report-activity-button'));
    fireEvent.click(screen.getByTestId('report-dialog-cancel'));
    expect(screen.queryByTestId('report-activity-dialog')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('ReportActivityButton — submitting', () => {
  it('shows the confirm button as loading/aria-busy and disables it while the request is in flight', async () => {
    let resolveFetch!: (value: { ok: boolean; json: () => Promise<unknown> }) => void;
    (fetch as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );

    render(<ReportActivityButton lang="es" activityId={ACTIVITY_ID} />);
    fireEvent.click(screen.getByTestId('report-activity-button'));
    fireEvent.click(screen.getByTestId('report-reason-other'));
    fireEvent.click(screen.getByTestId('report-dialog-confirm'));

    const confirm = screen.getByTestId('report-dialog-confirm') as HTMLButtonElement;
    expect(confirm.getAttribute('aria-busy')).toBe('true');
    expect(confirm.disabled).toBe(true);

    await waitFor(() => resolveFetch({ ok: true, json: async () => ({ ok: true, hidden: false }) }));
  });

  it('POSTs the chosen reason and trimmed details, then shows the success message', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, hidden: false }),
    });

    render(<ReportActivityButton lang="es" activityId={ACTIVITY_ID} />);
    fireEvent.click(screen.getByTestId('report-activity-button'));
    fireEvent.click(screen.getByTestId('report-reason-copyright'));
    fireEvent.change(screen.getByTestId('report-details'), { target: { value: '  no es suyo  ' } });
    fireEvent.click(screen.getByTestId('report-dialog-confirm'));

    await waitFor(() => expect(screen.queryByTestId('report-success')).not.toBeNull());

    expect(fetch).toHaveBeenCalledWith(
      `/api/actividades/${ACTIVITY_ID}/reportar`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ reason: 'copyright', details: 'no es suyo' }),
      }),
    );
  });

  it('shows the localized error message for a known error code', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'self_report' }),
    });

    render(<ReportActivityButton lang="es" activityId={ACTIVITY_ID} />);
    fireEvent.click(screen.getByTestId('report-activity-button'));
    fireEvent.click(screen.getByTestId('report-reason-other'));
    fireEvent.click(screen.getByTestId('report-dialog-confirm'));

    await waitFor(() => expect(screen.queryByTestId('report-error')).not.toBeNull());
    expect(screen.getByTestId('report-error').textContent).toContain('propia actividad');
  });

  it('falls back to the generic error message on a network failure', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('offline'));

    render(<ReportActivityButton lang="es" activityId={ACTIVITY_ID} />);
    fireEvent.click(screen.getByTestId('report-activity-button'));
    fireEvent.click(screen.getByTestId('report-reason-other'));
    fireEvent.click(screen.getByTestId('report-dialog-confirm'));

    await waitFor(() => expect(screen.queryByTestId('report-error')).not.toBeNull());
    expect(screen.getByTestId('report-error').textContent).toContain('No se pudo enviar el reporte');
  });

  it('renders English copy for lang="en"', () => {
    render(<ReportActivityButton lang="en" activityId={ACTIVITY_ID} />);
    fireEvent.click(screen.getByTestId('report-activity-button'));
    expect(screen.getByTestId('report-activity-dialog').textContent).toContain('Report this activity');
  });
});

describe('ReportActivityButton — hydration (Bug 1, React error #418)', () => {
  it('does not report a recoverable hydration error', async () => {
    const { recoverableErrors } = await renderThenHydrate(() => (
      <ReportActivityButton lang="es" activityId={ACTIVITY_ID} />
    ));
    expect(recoverableErrors).toEqual([]);
  });
});
