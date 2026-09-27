// @vitest-environment jsdom
/**
 * ExercisePublishFlow — the network wiring slice 17 adds around the shell
 * (design.md §8 "Publish flow"). `ExerciseAuthorIsland` stays a pure-prop
 * component (its own test file covers the draft/editor behaviour); this
 * component owns the `fetch` to `POST /api/ejercicios/[id]/guardar` and
 * renders the result: saved, published, validation issues (existing es/en
 * `ValidationCode` copy), terms required, and other errors.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createEmptyDraft } from '@/lib/authoringDraft';
import ExercisePublishFlow from './ExercisePublishFlow';

const EXERCISE_ID = '3f1a2b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b';

function stubFetch(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    status,
    json: async () => body,
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function draftWithOneSentence() {
  const draft = createEmptyDraft();
  return {
    ...draft,
    slots: [{ id: 'slot-1', label: 'The cat ___ on the mat', input: 'text', answer: ['sat'] }],
    blocks: [{ kind: 'row' as const, id: 'row-1', slotId: 'slot-1' }],
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ExercisePublishFlow — request shape', () => {
  it('POSTs the exact AuthoringSaveInput shape to the exercise-scoped endpoint', async () => {
    const fetchMock = stubFetch(200, { ok: true, slug: 'ordering-coffee', url: '/ingles/A1/present-simple/ordering-coffee' });
    render(<ExercisePublishFlow lang="en" exerciseId={EXERCISE_ID} initialDraft={draftWithOneSentence()} />);

    fireEvent.click(screen.getByTestId('save-draft'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`/api/ejercicios/${EXERCISE_ID}/guardar`);
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      payload: { pools: {}, slots: draftWithOneSentence().slots, blocks: draftWithOneSentence().blocks },
      blocks: draftWithOneSentence().blocks,
      publish: false,
      acceptedTerms: false,
    });
  });
});

describe('ExercisePublishFlow — save result', () => {
  it('shows a saved confirmation on a plain draft save', async () => {
    stubFetch(200, { ok: true, slug: 'ordering-coffee', url: '/ingles/A1/present-simple/ordering-coffee' });
    render(<ExercisePublishFlow lang="en" exerciseId={EXERCISE_ID} initialDraft={draftWithOneSentence()} />);

    fireEvent.click(screen.getByTestId('save-draft'));
    await waitFor(() => expect(screen.getByTestId('save-status')).toBeTruthy());
    expect(screen.getByTestId('save-status').textContent).toMatch(/saved/i);
  });

  it('shows the resolved URL on a successful publish', async () => {
    stubFetch(200, { ok: true, slug: 'ordering-coffee', url: '/ingles/A1/present-simple/ordering-coffee' });
    render(<ExercisePublishFlow lang="en" exerciseId={EXERCISE_ID} initialDraft={draftWithOneSentence()} />);

    fireEvent.click(screen.getByTestId('accept-terms'));
    fireEvent.click(screen.getByTestId('publish-exercise'));
    await waitFor(() => expect(screen.getByTestId('save-status')).toBeTruthy());
    expect(screen.getByTestId('save-status').textContent).toContain('/en/ingles/A1/present-simple/ordering-coffee');
  });
});

describe('ExercisePublishFlow — errors', () => {
  it('renders validation issues using the existing ValidationCode copy', async () => {
    stubFetch(422, { ok: false, issues: [{ code: 'pool_empty', severity: 'error', slotId: null, poolName: 'opts', blockId: null }] });
    render(<ExercisePublishFlow lang="en" exerciseId={EXERCISE_ID} initialDraft={draftWithOneSentence()} />);

    fireEvent.click(screen.getByTestId('save-draft'));
    await waitFor(() => expect(screen.getByTestId('save-error')).toBeTruthy());
    expect(screen.getByTestId('save-error').textContent).toMatch(/this pool has no items/i);
  });

  it('renders a terms-required message', async () => {
    stubFetch(422, { ok: false, code: 'terms_required' });
    render(<ExercisePublishFlow lang="en" exerciseId={EXERCISE_ID} initialDraft={draftWithOneSentence()} />);

    fireEvent.click(screen.getByTestId('publish-exercise'));
    await waitFor(() => expect(screen.getByTestId('save-error')).toBeTruthy());
    expect(screen.getByTestId('save-error').textContent).toMatch(/terms/i);
  });

  it('renders a generic error message on a network failure', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);
    render(<ExercisePublishFlow lang="en" exerciseId={EXERCISE_ID} initialDraft={draftWithOneSentence()} />);

    fireEvent.click(screen.getByTestId('save-draft'));
    await waitFor(() => expect(screen.getByTestId('save-error')).toBeTruthy());
  });

  it('renders a forbidden message on a 403', async () => {
    stubFetch(403, { ok: false, code: 'forbidden' });
    render(<ExercisePublishFlow lang="es" exerciseId={EXERCISE_ID} initialDraft={draftWithOneSentence()} />);

    fireEvent.click(screen.getByTestId('save-draft'));
    await waitFor(() => expect(screen.getByTestId('save-error')).toBeTruthy());
    expect(screen.getByTestId('save-error').textContent).toMatch(/permiso/i);
  });
});
