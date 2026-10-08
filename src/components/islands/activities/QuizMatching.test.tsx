// @vitest-environment jsdom
/**
 * QuizMatching tests — the wiring and the grading rules of the big
 * drag-and-drop board, through TAP-TO-PLACE (click a tray tile, then click
 * a slot), same reasoning `DropRenderer.test.tsx`'s own header gives for
 * why ITS tests avoid simulating real pointer drags: jsdom has no layout
 * engine, so dnd-kit's collision detection cannot be exercised meaningfully
 * here. Tap-to-place drives the exact same state transitions a drop would.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { GameItem } from '@/lib/activities/gameModes';
import { GAME_SOUND_MUTE_KEY } from '@/lib/activities/gameSounds';
import QuizMatching from './QuizMatching';

afterEach(cleanup);

const items: GameItem[] = [
  { id: 's1', prompt: 'The cat ____ on the mat.', answer: 'sits' },
  { id: 's2', prompt: 'What color is the sky?', answer: 'blue' },
  { id: 's3', prompt: 'How many days in a week?', answer: 'seven' },
];

/** Places `tileId` into `promptId`'s slot via tap-to-place. */
function place(tileId: string, promptId: string) {
  fireEvent.click(screen.getByTestId(`matching-tile-${tileId}`));
  fireEvent.click(screen.getByTestId(`matching-slot-button-${promptId}`));
}

/**
 * A tray tile and the SAME tile once placed share one `data-testid` (by
 * design — the game-feel engine's drop animation depends on one
 * `useDraggable` id per tile, in only one place at a time). Tray presence
 * is therefore checked scoped to the tray list, not page-wide.
 */
function tray() {
  return within(screen.getByTestId('matching-tray'));
}

beforeEach(() => {
  localStorage.clear();
});

describe('QuizMatching', () => {
  it('renders one prompt row and one tray tile per item', () => {
    render(<QuizMatching lang="es" items={items} seed="block-1" />);
    for (const item of items) {
      expect(screen.getByTestId(`matching-prompt-${item.id}`)).toBeTruthy();
      expect(screen.getByTestId(`matching-slot-${item.id}`)).toBeTruthy();
      expect(screen.getByTestId(`matching-tile-${item.id}`)).toBeTruthy();
    }
  });

  it('renders nothing for an empty item list', () => {
    const { container } = render(<QuizMatching lang="es" items={[]} seed="block-1" />);
    expect(container.firstChild).toBeNull();
  });

  it('places a tray tile into a slot by tapping the tile then the slot', () => {
    render(<QuizMatching lang="es" items={items} seed="block-1" />);
    place('s1', 's1');

    expect(screen.getByTestId('matching-slot-s1').getAttribute('data-filled')).toBe('true');
    // Placed: no longer offered in the tray.
    expect(tray().queryByTestId('matching-tile-s1')).toBeNull();
  });

  it('un-picks a tile tapped a second time, placing nothing', () => {
    render(<QuizMatching lang="es" items={items} seed="block-1" />);
    fireEvent.click(screen.getByTestId('matching-tile-s1'));
    fireEvent.click(screen.getByTestId('matching-tile-s1'));
    expect(screen.getByTestId('matching-tile-s1').getAttribute('aria-pressed')).toBe('false');

    // The slot button is disabled with nothing picked.
    expect((screen.getByTestId('matching-slot-button-s1') as HTMLButtonElement).disabled).toBe(true);
  });

  // Tap-replacing an already-filled slot is intentionally out of scope for
  // tap-to-place — same posture `DropRenderer.tsx`'s own header documents:
  // remove the resident first, then tap-place the new tile. A real drag
  // (verified separately, by browser, not by jsdom) replaces it directly.
  it('removing the resident first, then placing a different tile, swaps which tile a slot holds', () => {
    render(<QuizMatching lang="es" items={items} seed="block-1" />);
    place('s1', 's1');
    fireEvent.click(screen.getByTestId('matching-tile-s1')); // remove the resident
    place('s2', 's1');

    expect(screen.getByTestId('matching-slot-s1').getAttribute('data-filled')).toBe('true');
    // s1's tile is back in the tray, s2's tile is gone from it.
    expect(tray().getByTestId('matching-tile-s1')).toBeTruthy();
    expect(tray().queryByTestId('matching-tile-s2')).toBeNull();
  });

  it('a placed tile can be removed back to the tray by tapping it', () => {
    render(<QuizMatching lang="es" items={items} seed="block-1" />);
    place('s1', 's1');

    fireEvent.click(screen.getByTestId('matching-tile-s1'));

    expect(screen.getByTestId('matching-slot-s1').getAttribute('data-filled')).toBeFalsy();
    expect(screen.getByTestId('matching-tile-s1')).toBeTruthy();
  });

  describe('"Comprobar"', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('settles a correct placement in green and reaches the final score', () => {
      render(<QuizMatching lang="es" items={items} seed="block-1" />);
      place('s1', 's1');
      place('s2', 's2');
      place('s3', 's3');

      fireEvent.click(screen.getByTestId('matching-check'));
      act(() => vi.advanceTimersByTime(1000));

      expect(screen.getByTestId('matching-result').textContent).toBe('3 de 3 correctas');
    });

    it('bounces a wrong placement back to the tray and scores it as incorrect', () => {
      render(<QuizMatching lang="es" items={items} seed="block-1" />);
      place('s1', 's2'); // wrong: s1's answer in s2's slot
      place('s3', 's3'); // correct

      fireEvent.click(screen.getByTestId('matching-check'));
      // Mid-settle: the wrong tile still visibly flags red in its slot.
      expect(screen.getByTestId('matching-slot-s2').className).toContain('border-destructive');

      act(() => vi.advanceTimersByTime(1000));

      expect(screen.getByTestId('matching-result').textContent).toBe('1 de 3 correctas');
    });

    it('counts an unplaced prompt as incorrect', () => {
      render(<QuizMatching lang="es" items={items} seed="block-1" />);
      place('s1', 's1');
      // s2 and s3 left unplaced.

      fireEvent.click(screen.getByTestId('matching-check'));
      act(() => vi.advanceTimersByTime(1000));

      expect(screen.getByTestId('matching-result').textContent).toBe('1 de 3 correctas');
    });

    it('offers "Reintentar" on the result screen, which starts a fresh round', () => {
      render(<QuizMatching lang="es" items={items} seed="block-1" />);
      place('s1', 's1');
      fireEvent.click(screen.getByTestId('matching-check'));
      act(() => vi.advanceTimersByTime(1000));

      fireEvent.click(screen.getByTestId('matching-retry'));

      expect(screen.queryByTestId('matching-result')).toBeNull();
      expect(screen.getByTestId('quiz-matching')).toBeTruthy();
      for (const item of items) {
        expect(screen.getByTestId(`matching-tile-${item.id}`)).toBeTruthy();
      }
    });

    it('disables Comprobar and the board while settling', () => {
      render(<QuizMatching lang="es" items={items} seed="block-1" />);
      place('s1', 's1');
      fireEvent.click(screen.getByTestId('matching-check'));

      expect((screen.getByTestId('matching-check') as HTMLButtonElement).disabled).toBe(true);
      expect((screen.getByTestId('matching-tile-s2') as HTMLButtonElement).disabled).toBe(true);

      act(() => vi.advanceTimersByTime(1000));
    });
  });

  it('"Reiniciar" clears every placement and reshuffles the tray', () => {
    render(<QuizMatching lang="es" items={items} seed="block-1" />);
    place('s1', 's1');

    fireEvent.click(screen.getByTestId('matching-reset'));

    expect(screen.getByTestId('matching-slot-s1').getAttribute('data-filled')).toBeFalsy();
    expect(screen.getByTestId('matching-tile-s1')).toBeTruthy();
  });

  describe('the sound mute toggle', () => {
    it('is unmuted by default and persists a mute across a remount', () => {
      const { unmount } = render(<QuizMatching lang="es" items={items} seed="block-1" />);
      expect(screen.getByTestId('game-sound-toggle').getAttribute('aria-pressed')).toBe('false');

      fireEvent.click(screen.getByTestId('game-sound-toggle'));
      expect(screen.getByTestId('game-sound-toggle').getAttribute('aria-pressed')).toBe('true');
      expect(localStorage.getItem(GAME_SOUND_MUTE_KEY)).toBe('true');
      unmount();

      render(<QuizMatching lang="es" items={items} seed="block-1" />);
      expect(screen.getByTestId('game-sound-toggle').getAttribute('aria-pressed')).toBe('true');
    });
  });

  describe('empty slots (build item 4, "quieter empty slots")', () => {
    it('keeps "Casilla vacía" as the accessible name, without repeating it as visible text', () => {
      render(<QuizMatching lang="es" items={items} seed="block-1" />);
      const slotButton = screen.getByTestId('matching-slot-button-s1');
      expect(slotButton.getAttribute('aria-label')).toBe('Casilla vacía');
      expect(slotButton.textContent).toBe('');
    });
  });
});
