// @vitest-environment jsdom
/**
 * QuizGroupSort tests — the wiring and the grading rules of the big
 * drag-each-item-into-its-group board, through TAP-TO-PLACE (click a tray
 * tile, then click a group), same reasoning `QuizMatching.test.tsx`'s own
 * header gives for avoiding a simulated real pointer drag in jsdom.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { Payload } from '@/lib/exercisePayload';
import { GAME_SOUND_MUTE_KEY } from '@/lib/activities/gameSounds';
import QuizGroupSort from './QuizGroupSort';

afterEach(cleanup);

const payload: Payload = {
  pools: {
    p1: [
      { id: 'dog', text: 'dog' },
      { id: 'cat', text: 'cat' },
      { id: 'bread', text: 'bread' },
      { id: 'rice', text: 'rice' },
    ],
  },
  slots: [
    { id: 'g1', label: 'Animals', input: 'group', pool: 'p1', answer: ['dog', 'cat'] },
    { id: 'g2', label: 'Food', input: 'group', pool: 'p1', answer: ['bread', 'rice'] },
  ],
};

/** Taps a tray tile, then taps the group's own placement target — its empty placeholder while the group holds nothing yet, otherwise its dropzone. */
function place(itemId: string, groupId: string) {
  fireEvent.click(screen.getByTestId(`groupsort-tile-${itemId}`));
  const empty = screen.queryByTestId(`groupsort-group-empty-${groupId}`);
  if (empty) {
    fireEvent.click(empty);
  } else {
    fireEvent.click(screen.getByTestId(`groupsort-group-dropzone-${groupId}`));
  }
}

function tray() {
  return within(screen.getByTestId('groupsort-tray'));
}

function group(groupId: string) {
  return within(screen.getByTestId(`groupsort-board-group-${groupId}`));
}

beforeEach(() => {
  localStorage.clear();
});

describe('QuizGroupSort', () => {
  it('renders one box per group and one tray tile per item', () => {
    render(<QuizGroupSort lang="es" payload={payload} seed="block-1" />);
    expect(screen.getByTestId('groupsort-board-group-g1').textContent).toContain('Animals');
    expect(screen.getByTestId('groupsort-board-group-g2').textContent).toContain('Food');
    for (const id of ['dog', 'cat', 'bread', 'rice']) {
      expect(tray().getByTestId(`groupsort-tile-${id}`)).toBeTruthy();
    }
  });

  it('renders nothing when the payload has no eligible group', () => {
    const { container } = render(
      <QuizGroupSort lang="es" payload={{ pools: {}, slots: [] }} seed="block-1" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('places a tray tile into a group by tapping the tile then the group', () => {
    render(<QuizGroupSort lang="es" payload={payload} seed="block-1" />);
    place('dog', 'g1');

    expect(group('g1').getByTestId('groupsort-tile-dog')).toBeTruthy();
    expect(tray().queryByTestId('groupsort-tile-dog')).toBeNull();
  });

  it('sends a placed item back to the tray by tapping it (nothing picked)', () => {
    render(<QuizGroupSort lang="es" payload={payload} seed="block-1" />);
    place('dog', 'g1');
    fireEvent.click(group('g1').getByTestId('groupsort-tile-dog'));

    expect(group('g1').queryByTestId('groupsort-tile-dog')).toBeNull();
    expect(tray().getByTestId('groupsort-tile-dog')).toBeTruthy();
  });

  it('disables "Comprobar" until every item has been placed somewhere', () => {
    render(<QuizGroupSort lang="es" payload={payload} seed="block-1" />);
    expect((screen.getByTestId('groupsort-check') as HTMLButtonElement).disabled).toBe(true);

    place('dog', 'g1');
    place('cat', 'g1');
    place('bread', 'g2');
    expect((screen.getByTestId('groupsort-check') as HTMLButtonElement).disabled).toBe(true);

    place('rice', 'g2');
    expect((screen.getByTestId('groupsort-check') as HTMLButtonElement).disabled).toBe(false);
  });

  describe('"Comprobar"', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('a fully correct board settles every item green and shows the final result', () => {
      render(<QuizGroupSort lang="es" payload={payload} seed="block-1" />);
      place('dog', 'g1');
      place('cat', 'g1');
      place('bread', 'g2');
      place('rice', 'g2');
      fireEvent.click(screen.getByTestId('groupsort-check'));
      act(() => vi.advanceTimersByTime(1000));

      expect(screen.getByTestId('game-result-score').textContent).toBe('4 de 4 a la primera');
      expect(screen.getByTestId('game-result').getAttribute('data-outcome')).toBe('perfect');
      expect(screen.getByTestId('game-result-play-again')).toBeTruthy();
      // "Comprobar" only ever reaches "done" at 100%, so there is nothing to review.
      expect(screen.queryByTestId('game-result-review')).toBeNull();
    });

    it('a wrong placement shakes and stays in place, fixable, without finishing the round', () => {
      render(<QuizGroupSort lang="es" payload={payload} seed="block-1" />);
      place('dog', 'g2'); // wrong group on purpose
      place('cat', 'g1');
      place('bread', 'g2');
      place('rice', 'g2');
      fireEvent.click(screen.getByTestId('groupsort-check'));

      expect(screen.queryByTestId('game-result')).toBeNull();
      expect(screen.getByTestId('groupsort-tile-dog').className).toContain('border-destructive');
      // Correct ones from the same check already settled green.
      expect(screen.getByTestId('groupsort-tile-cat').className).toContain('border-success-strong');

      // Fixable: tap it back to the tray and place it correctly.
      fireEvent.click(group('g2').getByTestId('groupsort-tile-dog'));
      place('dog', 'g1');
      fireEvent.click(screen.getByTestId('groupsort-check'));
      act(() => vi.advanceTimersByTime(1000));

      // Every item is eventually correct (4/4), but "dog" was wrong on its
      // FIRST check — the honest score only counts the other three.
      expect(screen.getByTestId('game-result-score').textContent).toBe('3 de 4 a la primera');
      expect(screen.getByTestId('game-result').getAttribute('data-outcome')).toBe('good');
    });

    describe('✓/✕ marks (UX audit F10: correct/wrong must not rely on colour alone)', () => {
      it('shows no marks before "Comprobar" is pressed', () => {
        render(<QuizGroupSort lang="es" payload={payload} seed="block-1" />);
        place('dog', 'g1');

        expect(screen.queryByTestId('grade-mark-correct')).toBeNull();
        expect(screen.queryByTestId('grade-mark-wrong')).toBeNull();
        expect(screen.getByTestId('groupsort-live-region').textContent).toBe('');
      });

      it('marks correct items ✓ and the wrong one ✕ on the same check, and announces the summary', () => {
        render(<QuizGroupSort lang="es" payload={payload} seed="block-1" />);
        place('dog', 'g2'); // wrong group on purpose
        place('cat', 'g1');
        place('bread', 'g2');
        place('rice', 'g2');
        fireEvent.click(screen.getByTestId('groupsort-check'));

        expect(within(screen.getByTestId('groupsort-tile-dog')).getByTestId('grade-mark-wrong')).toBeTruthy();
        expect(screen.getByTestId('groupsort-tile-dog').getAttribute('aria-label')).toContain('incorrecta');
        expect(within(screen.getByTestId('groupsort-tile-cat')).getByTestId('grade-mark-correct')).toBeTruthy();
        expect(screen.getByTestId('groupsort-tile-cat').getAttribute('aria-label')).toContain('correcta');
        expect(screen.getByTestId('groupsort-live-region').textContent).toBe('3 correctas, 1 incorrecta');
      });

      it('reports only what the CURRENT check graded, not the running total', () => {
        render(<QuizGroupSort lang="es" payload={payload} seed="block-1" />);
        place('dog', 'g2'); // wrong on purpose
        place('cat', 'g1');
        place('bread', 'g2');
        place('rice', 'g2');
        fireEvent.click(screen.getByTestId('groupsort-check'));

        fireEvent.click(group('g2').getByTestId('groupsort-tile-dog'));
        place('dog', 'g1');
        fireEvent.click(screen.getByTestId('groupsort-check'));

        // Cat/bread/rice were already locked by the first check and are
        // never re-graded — only "dog" was part of THIS check.
        expect(screen.getByTestId('groupsort-live-region').textContent).toBe('1 correcta');
      });
    });

    it('scores by FIRST-TRY accuracy even when every item is eventually locked correct', () => {
      render(<QuizGroupSort lang="es" payload={payload} seed="block-1" />);
      place('dog', 'g2'); // wrong on purpose
      place('cat', 'g2'); // wrong on purpose
      place('bread', 'g2');
      place('rice', 'g2');
      fireEvent.click(screen.getByTestId('groupsort-check'));

      fireEvent.click(group('g2').getByTestId('groupsort-tile-dog'));
      place('dog', 'g1');
      fireEvent.click(group('g2').getByTestId('groupsort-tile-cat'));
      place('cat', 'g1');
      fireEvent.click(screen.getByTestId('groupsort-check'));
      act(() => vi.advanceTimersByTime(1000));

      // Only "bread" and "rice" were right on their first check (2/4) —
      // below 70%, so the headline is the "retry" one, never "¡Perfecto!".
      expect(screen.getByTestId('game-result-score').textContent).toBe('2 de 4 a la primera');
      expect(screen.getByTestId('game-result').getAttribute('data-outcome')).toBe('retry');
    });

    it('a locked (correct) item can no longer be picked up', () => {
      render(<QuizGroupSort lang="es" payload={payload} seed="block-1" />);
      place('dog', 'g1');
      place('cat', 'g2'); // wrong, so the round does not finish
      place('bread', 'g2');
      place('rice', 'g2');
      fireEvent.click(screen.getByTestId('groupsort-check'));

      expect((screen.getByTestId('groupsort-tile-dog') as HTMLButtonElement).disabled).toBe(true);
    });

    it('"Jugar de nuevo" on the result screen starts a fresh, empty board', () => {
      render(<QuizGroupSort lang="es" payload={payload} seed="block-1" />);
      place('dog', 'g1');
      place('cat', 'g1');
      place('bread', 'g2');
      place('rice', 'g2');
      fireEvent.click(screen.getByTestId('groupsort-check'));
      act(() => vi.advanceTimersByTime(1000));

      fireEvent.click(screen.getByTestId('game-result-play-again'));

      expect(screen.queryByTestId('game-result')).toBeNull();
      for (const id of ['dog', 'cat', 'bread', 'rice']) {
        expect(tray().getByTestId(`groupsort-tile-${id}`)).toBeTruthy();
      }
    });
  });

  describe('the sound mute toggle', () => {
    it('is unmuted by default and persists a mute across a remount', () => {
      const { unmount } = render(<QuizGroupSort lang="es" payload={payload} seed="block-1" />);
      expect(screen.getByTestId('game-sound-toggle').getAttribute('aria-pressed')).toBe('false');

      fireEvent.click(screen.getByTestId('game-sound-toggle'));
      expect(localStorage.getItem(GAME_SOUND_MUTE_KEY)).toBe('true');
      unmount();

      render(<QuizGroupSort lang="es" payload={payload} seed="block-1" />);
      expect(screen.getByTestId('game-sound-toggle').getAttribute('aria-pressed')).toBe('true');
    });
  });

  describe('layout (visual-polish-2 pass: controls must never overlap the board, "Comprobar" must never scroll away)', () => {
    it('keeps the chrome row (sound toggle) from ever shrinking', () => {
      render(<QuizGroupSort lang="es" payload={payload} seed="block-1" />);
      expect(screen.getByTestId('groupsort-controls').className).toContain('flex-none');
    });

    // FLOATING COMPROBAR (build item 5): "Comprobar" is now a `fixed`
    // bottom-right overlay — see `scale.ts`'s own `FLOATING_CHECK_BAR_CLASS`
    // header.
    it('floats "Comprobar" fixed at the stage\'s own bottom-right, out of the scrollable board/tray area', () => {
      render(<QuizGroupSort lang="es" payload={payload} seed="block-1" />);
      expect(screen.getByTestId('groupsort-stage').contains(screen.getByTestId('groupsort-check'))).toBe(false);
      expect(screen.getByTestId('groupsort-actions').className).toContain('fixed');
    });

    it('offsets the floating Comprobar further left when rendered inside the editor', () => {
      render(<QuizGroupSort lang="es" payload={payload} seed="block-1" editorOffset />);
      expect(screen.getByTestId('groupsort-actions').className).toContain('lg:right-20');
    });
  });
});
