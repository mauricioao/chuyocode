// @vitest-environment jsdom
/**
 * ReactionControl tests (slice 9, design.md §4 "API", task 9.5).
 *
 * `authed` is a PROP, never derived from a Supabase call (design §2) — this
 * is the one behaviour under test, alongside the reaction it POSTs. Every
 * dislike must carry one taxonomy reason before it is sent, mirroring the
 * server's own rejection of a reason-less dislike.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { findVoseo } from '@/lib/neutralSpanish';
import ReactionControl, { COPY, reactionEndpoint } from './ReactionControl';

const ID = '3f1a2b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b';

function stubFetch(body: unknown, ok = true) {
  const fetchMock = vi.fn().mockResolvedValue({ ok, json: async () => body });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ReactionControl — auth gating', () => {
  it('renders nothing at all when not authenticated', () => {
    const { container } = render(
      <ReactionControl exerciseId={ID} authed={false} lang="es" />,
    );
    expect(container.childNodes.length).toBe(0);
  });

  it('renders when authenticated', () => {
    render(<ReactionControl exerciseId={ID} authed lang="es" />);
    expect(screen.getByTestId('reaction-control')).toBeTruthy();
  });
});

describe('ReactionControl — liking', () => {
  it('POSTs a like with no reason to the reactions endpoint for THIS exercise', async () => {
    const fetchMock = stubFetch({ ok: true });
    render(<ReactionControl exerciseId={ID} authed lang="es" />);
    fireEvent.click(screen.getByTestId('reaction-like'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(reactionEndpoint(ID));
    expect(JSON.parse(init.body as string)).toEqual({ kind: 'like' });
    await waitFor(() =>
      expect(screen.getByTestId('reaction-like').getAttribute('aria-busy')).toBe('false'),
    );
  });
});

describe('ReactionControl — disliking', () => {
  it('sends nothing when no reason is picked yet', () => {
    const fetchMock = stubFetch({ ok: true });
    render(<ReactionControl exerciseId={ID} authed lang="es" />);
    fireEvent.click(screen.getByTestId('reaction-dislike'));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POSTs the picked reason once one is selected', async () => {
    const fetchMock = stubFetch({ ok: true });
    render(<ReactionControl exerciseId={ID} authed lang="es" />);
    fireEvent.change(screen.getByTestId('reaction-reason'), {
      target: { value: 'typo' },
    });
    fireEvent.click(screen.getByTestId('reaction-dislike'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(reactionEndpoint(ID));
    expect(JSON.parse(init.body as string)).toEqual({ kind: 'dislike', reason: 'typo' });
    await waitFor(() =>
      expect(screen.getByTestId('reaction-dislike').getAttribute('aria-busy')).toBe('false'),
    );
  });
});

describe('ReactionControl — copy', () => {
  it('writes its Spanish in neutral Spanish, with no voseo', () => {
    expect(findVoseo(COPY.es)).toEqual([]);
  });

  it('localizes to English', () => {
    render(<ReactionControl exerciseId={ID} authed lang="en" />);
    expect(screen.getByText(COPY.en.like)).toBeTruthy();
  });
});
