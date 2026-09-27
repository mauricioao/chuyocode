// @vitest-environment jsdom
/**
 * ExerciseAuthorIsland — the shell wiring: adding/removing blocks, the
 * disabled-until-wired Save/Publish contract slice 17 must fill in, and the
 * live preview reacting to a block edit.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createEmptyDraft } from '@/lib/authoringDraft';
import ExerciseAuthorIsland from './ExerciseAuthorIsland';

afterEach(cleanup);

describe('ExerciseAuthorIsland', () => {
  it('shows the empty state with no blocks yet', () => {
    render(<ExerciseAuthorIsland lang="en" initialDraft={createEmptyDraft()} />);
    expect(screen.getByText(/no parts yet/i)).toBeTruthy();
  });

  it('adds a sentence block, which appears in the block list and the live preview', () => {
    render(<ExerciseAuthorIsland lang="en" initialDraft={createEmptyDraft()} />);

    fireEvent.click(screen.getByTestId('add-row-block'));

    expect(screen.getByTestId('exercise-author-island').querySelector('textarea')).toBeTruthy();
    // The preview mounts the real ExerciseIsland once there is a slot to show.
    expect(screen.getByTestId('exercise-preview').querySelector('[data-testid="exercise-submit"]')).toBeTruthy();
  });

  it('typing a sentence updates the live preview WYSIWYG', () => {
    render(<ExerciseAuthorIsland lang="en" initialDraft={createEmptyDraft()} />);
    fireEvent.click(screen.getByTestId('add-row-block'));

    const textarea = screen.getByTestId('exercise-author-island').querySelector('textarea');
    expect(textarea).toBeTruthy();
    fireEvent.change(textarea as HTMLTextAreaElement, {
      target: { value: 'The cat ___ on the mat' },
    });

    // The real ExerciseIsland renders each part's spoken position, which
    // includes the slot's own label text for a screen reader.
    const preview = screen.getByTestId('exercise-preview');
    expect(preview.textContent).toContain('on the mat');
  });

  it('removes a block via its own remove control', () => {
    render(<ExerciseAuthorIsland lang="en" initialDraft={createEmptyDraft()} />);
    fireEvent.click(screen.getByTestId('add-prose-block'));
    expect(screen.getByTestId('exercise-author-island').querySelector('textarea')).toBeTruthy();

    const removeButtons = screen
      .getByTestId('exercise-author-island')
      .querySelectorAll('button[aria-label^="Remove"]');
    fireEvent.click(removeButtons[0] as HTMLElement);

    expect(screen.getByText(/no parts yet/i)).toBeTruthy();
  });

  it('renders Save/Publish disabled and explains why when onSave is absent', () => {
    render(<ExerciseAuthorIsland lang="en" initialDraft={createEmptyDraft()} />);
    expect((screen.getByTestId('save-draft') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('publish-exercise') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('save-unavailable')).toBeTruthy();
  });

  it('enables Save/Publish once onSave is supplied, and forwards the exact save-flow shape', () => {
    const onSave = vi.fn();
    render(<ExerciseAuthorIsland lang="en" initialDraft={createEmptyDraft()} onSave={onSave} />);

    expect((screen.getByTestId('save-draft') as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByTestId('save-unavailable')).toBeNull();

    fireEvent.click(screen.getByTestId('publish-exercise'));

    expect(onSave).toHaveBeenCalledWith({
      payload: { pools: {}, slots: [], blocks: [] },
      blocks: [],
      publish: true,
      acceptedTerms: false,
    });
  });

  it('includes the accepted-terms checkbox state in the save payload', () => {
    const onSave = vi.fn();
    render(<ExerciseAuthorIsland lang="en" initialDraft={createEmptyDraft()} onSave={onSave} />);

    fireEvent.click(screen.getByTestId('accept-terms'));
    fireEvent.click(screen.getByTestId('save-draft'));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ acceptedTerms: true, publish: false }));
  });
});
