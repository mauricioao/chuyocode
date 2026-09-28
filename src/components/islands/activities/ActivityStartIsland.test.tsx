// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import ActivityStartIsland from './ActivityStartIsland';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ActivityStartIsland', () => {
  it('creates an activity and navigates to its editor when Worksheet is chosen', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'new-activity-1' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const navigate = vi.fn();

    render(<ActivityStartIsland lang="es" navigate={navigate} />);
    fireEvent.click(screen.getByTestId('picker-worksheet'));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/es/crear/new-activity-1'));

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/actividades',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ lang: 'es', blocks: [] }),
      }),
    );
  });

  it('shows a creating state while the request is in flight', async () => {
    let resolveFetch!: (value: unknown) => void;
    const fetchMock = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<ActivityStartIsland lang="es" navigate={vi.fn()} />);
    fireEvent.click(screen.getByTestId('picker-worksheet'));

    expect(await screen.findByTestId('start-creating')).toBeTruthy();

    resolveFetch({ ok: true, json: async () => ({ id: 'x' }) });
  });

  it('shows an error state when the request fails (non-ok response)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
    const navigate = vi.fn();

    render(<ActivityStartIsland lang="es" navigate={navigate} />);
    fireEvent.click(screen.getByTestId('picker-worksheet'));

    expect(await screen.findByTestId('start-error')).toBeTruthy();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('shows an error state when fetch itself throws (offline)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    render(<ActivityStartIsland lang="es" navigate={vi.fn()} />);
    fireEvent.click(screen.getByTestId('picker-worksheet'));

    expect(await screen.findByTestId('start-error')).toBeTruthy();
  });

  it('creates an activity, seeds one empty quiz block, and navigates when Questions is chosen', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'new-activity-2' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const navigate = vi.fn();

    render(<ActivityStartIsland lang="es" navigate={navigate} />);
    fireEvent.click(screen.getByTestId('picker-questions'));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/es/crear/new-activity-2'));

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/actividades',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ lang: 'es', blocks: [] }) }),
    );
    const guardarCall = fetchMock.mock.calls.find(([url]) => url === '/api/actividades/new-activity-2/guardar');
    expect(guardarCall).toBeTruthy();
    const body = JSON.parse((guardarCall?.[1] as { body: string }).body);
    expect(body.title).toBe('Sin título');
    expect(body.level).toBeNull();
    expect(body.blocks).toEqual([
      expect.objectContaining({ type: 'quiz', payload: { pools: {}, slots: [] } }),
    ]);
  });

  it('still navigates to the editor when the Questions seed save fails (best-effort)', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/actividades') {
        return Promise.resolve({ ok: true, json: async () => ({ id: 'new-activity-3' }) });
      }
      return Promise.reject(new Error('offline'));
    });
    vi.stubGlobal('fetch', fetchMock);
    const navigate = vi.fn();

    render(<ActivityStartIsland lang="es" navigate={navigate} />);
    fireEvent.click(screen.getByTestId('picker-questions'));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/es/crear/new-activity-3'));
  });
});
