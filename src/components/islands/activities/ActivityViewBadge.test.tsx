// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import ActivityViewBadge from './ActivityViewBadge';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ActivityViewBadge', () => {
  it('renders nothing before the request resolves', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    render(<ActivityViewBadge lang="es" activityId="act-1" />);
    expect(screen.queryByTestId('activity-view-badge')).toBeNull();
  });

  it('posts to the visto endpoint for this activity on mount', () => {
    const fetchMock = vi.fn(() => new Promise(() => {}));
    vi.stubGlobal('fetch', fetchMock);
    render(<ActivityViewBadge lang="es" activityId="act-1" />);
    expect(fetchMock).toHaveBeenCalledWith('/api/actividades/act-1/visto', { method: 'POST' });
  });

  it('shows "Primera vez" for a first view (count 1)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ viewCount: 1 }) }),
    );
    render(<ActivityViewBadge lang="es" activityId="act-1" />);
    await waitFor(() => expect(screen.getByTestId('activity-view-badge')).toBeTruthy());
    expect(screen.getByTestId('activity-view-badge').textContent).toBe('· Primera vez');
  });

  it('shows "Ya lo viste · N veces" for a returning view', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ viewCount: 4 }) }),
    );
    render(<ActivityViewBadge lang="es" activityId="act-1" />);
    await waitFor(() => expect(screen.getByTestId('activity-view-badge')).toBeTruthy());
    expect(screen.getByTestId('activity-view-badge').textContent).toBe('· Ya lo viste · 4 veces');
  });

  it('renders nothing when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
    render(<ActivityViewBadge lang="es" activityId="act-1" />);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByTestId('activity-view-badge')).toBeNull();
  });

  it('renders nothing when fetch itself rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    render(<ActivityViewBadge lang="es" activityId="act-1" />);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByTestId('activity-view-badge')).toBeNull();
  });

  it('renders English copy for lang="en"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ viewCount: 2 }) }),
    );
    render(<ActivityViewBadge lang="en" activityId="act-1" />);
    await waitFor(() => expect(screen.getByTestId('activity-view-badge')).toBeTruthy());
    expect(screen.getByTestId('activity-view-badge').textContent).toContain("You've seen this");
  });
});
