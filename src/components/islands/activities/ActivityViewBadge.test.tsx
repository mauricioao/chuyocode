// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { renderThenHydrate } from '@/testSupport/hydrationHarness';
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

  it('renders the eye icon with the visible count and an accessible name with no "already viewed" note for a first view', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ viewCount: 1 }) }),
    );
    render(<ActivityViewBadge lang="es" activityId="act-1" />);
    await waitFor(() => expect(screen.getByTestId('activity-view-badge')).toBeTruthy());
    const badge = screen.getByTestId('activity-view-badge');
    expect(badge.textContent).toBe('1');
    expect(badge.getAttribute('aria-label')).toBe('1 vista');
    expect(badge.getAttribute('title')).toBeNull();
  });

  it('notes "Ya lo viste" in the tooltip/aria (never as visible text) for a returning view', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ viewCount: 23 }) }),
    );
    render(<ActivityViewBadge lang="es" activityId="act-1" />);
    await waitFor(() => expect(screen.getByTestId('activity-view-badge')).toBeTruthy());
    const badge = screen.getByTestId('activity-view-badge');
    // Visible text is only the number — never a "· Ya lo viste · N veces" strip.
    expect(badge.textContent).toBe('23');
    expect(badge.getAttribute('aria-label')).toBe('23 vistas');
    expect(badge.getAttribute('title')).toBe('Ya lo viste');
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
    const badge = screen.getByTestId('activity-view-badge');
    expect(badge.getAttribute('aria-label')).toBe('2 views');
    expect(badge.getAttribute('title')).toBe("You've seen this");
  });
});

describe('ActivityViewBadge — hydration (Bug 1, React error #418)', () => {
  it('does not report a recoverable hydration error', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    const { recoverableErrors } = await renderThenHydrate(() => <ActivityViewBadge lang="es" activityId="act-1" />);
    expect(recoverableErrors).toEqual([]);
  });
});
