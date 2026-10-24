// @vitest-environment jsdom
/**
 * QuizReorder tests — the wiring and the grading rules of the "Reordenar"
 * board, through TAP-TO-APPEND (click a tray word, click a placed word to
 * remove it), same reasoning `QuizMatching.test.tsx`'s own header gives for
 * avoiding a simulated real pointer drag in jsdom.
 *
 * Every test sentence here is exactly 2 words on purpose: `QuizReorder`'s
 * own anti-identity shuffle rule guarantees a 2-word tray is ALWAYS the
 * swapped order (there are only two permutations, and "already correct" is
 * the one forbidden one), so the tray's own word order is deterministic and
 * assertable without reaching into the seeded shuffle itself.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { GameItem } from '@/lib/activities/gameModes';
import { GAME_SOUND_MUTE_KEY } from '@/lib/activities/gameSounds';
import QuizReorder from './QuizReorder';
import { STAGE_CONTENT_MEASURE } from '@/components/islands/mechanics/scale';

afterEach(cleanup);

const items: GameItem[] = [
  { id: 's0', prompt: '', answer: 'Cats sleep' },
  { id: 's1', prompt: '', answer: 'Dogs bark' },
];

function tray() {
  return within(screen.getByTestId('reorder-tray'));
}

function line(index: number) {
  return within(screen.getByTestId(`reorder-line-${index}`));
}

beforeEach(() => {
  localStorage.clear();
});

describe('QuizReorder', () => {
  // Mobile review 2026-10-17: on a wide stage the word tray hugged the left
  // edge while the sentence line sat centred at the reading measure.
  it('caps the word tray at the same centred measure as the sentence line', () => {
    render(<QuizReorder lang="es" items={items} seed="block-1" />);
    const trayClasses = screen.getByTestId('reorder-tray').className.split(' ');
    for (const token of STAGE_CONTENT_MEASURE.split(' ')) expect(trayClasses).toContain(token);
  });

  it('renders nothing for an empty item list', () => {
    const { container } = render(<QuizReorder lang="es" items={[]} seed="block-1" />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the sentence stepper and the scrambled tray, never in the correct order', () => {
    render(<QuizReorder lang="es" items={items} seed="block-1" />);
    expect(screen.getByTestId('reorder-position').textContent).toBe('1 de 2');
    // Anti-identity rule: a 2-word sentence's tray is always swapped.
    const trayTiles = tray().getAllByRole('button');
    expect(trayTiles.map((b) => b.textContent)).toEqual(['sleep', 'Cats']);
    expect(screen.getByTestId('reorder-line-0').textContent).toContain('Toca o arrastra una palabra para empezar');
  });

  it('appends a tray word to the line by tapping it, in tap order', () => {
    render(<QuizReorder lang="es" items={items} seed="block-1" />);
    fireEvent.click(screen.getByTestId('reorder-tile-0-w1')); // "sleep"
    fireEvent.click(screen.getByTestId('reorder-tile-0-w0')); // "Cats"

    expect(line(0).getAllByRole('button').map((b) => b.textContent)).toEqual(['sleep', 'Cats']);
    expect(tray().queryByTestId('reorder-tile-0-w1')).toBeNull();
    expect(tray().queryByTestId('reorder-tile-0-w0')).toBeNull();
  });

  it('sends a placed word back to the tray by tapping it', () => {
    render(<QuizReorder lang="es" items={items} seed="block-1" />);
    fireEvent.click(screen.getByTestId('reorder-tile-0-w1'));
    fireEvent.click(screen.getByTestId('reorder-tile-0-w1'));

    expect(line(0).queryByTestId('reorder-tile-0-w1')).toBeNull();
    expect(tray().getByTestId('reorder-tile-0-w1')).toBeTruthy();
  });

  it('disables "Comprobar" until every word is placed', () => {
    render(<QuizReorder lang="es" items={items} seed="block-1" />);
    expect((screen.getByTestId('reorder-check') as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByTestId('reorder-tile-0-w1'));
    expect((screen.getByTestId('reorder-check') as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByTestId('reorder-tile-0-w0'));
    expect((screen.getByTestId('reorder-check') as HTMLButtonElement).disabled).toBe(false);
  });

  describe('"Comprobar"', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('a correct order advances to the next sentence', () => {
      render(<QuizReorder lang="es" items={items} seed="block-1" />);
      fireEvent.click(screen.getByTestId('reorder-tile-0-w0')); // "Cats"
      fireEvent.click(screen.getByTestId('reorder-tile-0-w1')); // "sleep"
      fireEvent.click(screen.getByTestId('reorder-check'));
      act(() => vi.advanceTimersByTime(1000));

      expect(screen.getByTestId('reorder-position').textContent).toBe('2 de 2');
      expect(tray().getAllByRole('button').map((b) => b.textContent)).toEqual(['bark', 'Dogs']);
    });

    it('a wrong order flags the misplaced words and stays fixable, without advancing', () => {
      render(<QuizReorder lang="es" items={items} seed="block-1" />);
      fireEvent.click(screen.getByTestId('reorder-tile-0-w1')); // "sleep" (wrong first)
      fireEvent.click(screen.getByTestId('reorder-tile-0-w0')); // "Cats"
      fireEvent.click(screen.getByTestId('reorder-check'));

      expect(screen.getByTestId('reorder-position').textContent).toBe('1 de 2');
      expect(screen.getByTestId('reorder-tile-0-w1').className).toContain('border-destructive');

      // Fixable: tap it back out and re-add in the right order.
      fireEvent.click(screen.getByTestId('reorder-tile-0-w1'));
      fireEvent.click(screen.getByTestId('reorder-tile-0-w1'));
      expect(line(0).getAllByRole('button').map((b) => b.textContent)).toEqual(['Cats', 'sleep']);
    });

    describe('✓/✕ marks (UX audit F10: correct/wrong must not rely on colour alone)', () => {
      it('shows no marks before "Comprobar" is pressed', () => {
        render(<QuizReorder lang="es" items={items} seed="block-1" />);
        fireEvent.click(screen.getByTestId('reorder-tile-0-w1'));

        expect(screen.queryByTestId('grade-mark-correct')).toBeNull();
        expect(screen.queryByTestId('grade-mark-wrong')).toBeNull();
        expect(screen.getByTestId('reorder-live-region').textContent).toBe('');
      });

      it('marks every word ✓ during the brief settle window for a correct order, and announces the summary', () => {
        render(<QuizReorder lang="es" items={items} seed="block-1" />);
        fireEvent.click(screen.getByTestId('reorder-tile-0-w0')); // "Cats"
        fireEvent.click(screen.getByTestId('reorder-tile-0-w1')); // "sleep"
        fireEvent.click(screen.getByTestId('reorder-check'));

        expect(line(0).getAllByTestId('grade-mark-correct')).toHaveLength(2);
        expect(screen.getByTestId('reorder-tile-0-w0').getAttribute('aria-label')).toContain('correcta');
        expect(screen.getByTestId('reorder-live-region').textContent).toBe('2 correctas');

        // Gone once the sentence advances.
        act(() => vi.advanceTimersByTime(1000));
        expect(screen.queryByTestId('grade-mark-correct')).toBeNull();
      });

      it('marks every misplaced word ✕ (both swapped here), and announces the summary', () => {
        render(<QuizReorder lang="es" items={items} seed="block-1" />);
        fireEvent.click(screen.getByTestId('reorder-tile-0-w1')); // "sleep" (wrong first)
        fireEvent.click(screen.getByTestId('reorder-tile-0-w0')); // "Cats"
        fireEvent.click(screen.getByTestId('reorder-check'));

        expect(line(0).getAllByTestId('grade-mark-wrong')).toHaveLength(2);
        expect(screen.getByTestId('reorder-tile-0-w1').getAttribute('aria-label')).toContain('incorrecta');
        expect(screen.getByTestId('reorder-live-region').textContent).toBe('2 incorrectas');
      });

      it('clears the ✕ marks once a wrong word is removed from the line', () => {
        render(<QuizReorder lang="es" items={items} seed="block-1" />);
        fireEvent.click(screen.getByTestId('reorder-tile-0-w1'));
        fireEvent.click(screen.getByTestId('reorder-tile-0-w0'));
        fireEvent.click(screen.getByTestId('reorder-check'));
        expect(screen.getAllByTestId('grade-mark-wrong').length).toBeGreaterThan(0);

        fireEvent.click(screen.getByTestId('reorder-tile-0-w1')); // remove it

        expect(screen.queryByTestId('grade-mark-wrong')).toBeNull();
      });
    });

    it('reaching the end shows the shared GameResult screen, perfect and with no "Repasar"', () => {
      render(<QuizReorder lang="es" items={items} seed="block-1" />);
      fireEvent.click(screen.getByTestId('reorder-tile-0-w0'));
      fireEvent.click(screen.getByTestId('reorder-tile-0-w1'));
      fireEvent.click(screen.getByTestId('reorder-check'));
      act(() => vi.advanceTimersByTime(1000));

      fireEvent.click(screen.getByTestId('reorder-tile-1-w0'));
      fireEvent.click(screen.getByTestId('reorder-tile-1-w1'));
      fireEvent.click(screen.getByTestId('reorder-check'));
      act(() => vi.advanceTimersByTime(1000));

      expect(screen.getByTestId('game-result-score').textContent).toBe('2 de 2 a la primera');
      expect(screen.getByTestId('game-result').getAttribute('data-outcome')).toBe('perfect');
      expect(screen.getByTestId('game-result-play-again')).toBeTruthy();
      // Every sentence had to be solved to get here, so there is nothing to review.
      expect(screen.queryByTestId('game-result-review')).toBeNull();
    });

    it('scores by FIRST-TRY accuracy, not eventual completion: a sentence gotten wrong before being fixed does not count', () => {
      render(<QuizReorder lang="es" items={items} seed="block-1" />);
      // Sentence 0: wrong on the first check (words swapped), then fixed.
      fireEvent.click(screen.getByTestId('reorder-tile-0-w1')); // "sleep" first — wrong order
      fireEvent.click(screen.getByTestId('reorder-tile-0-w0'));
      fireEvent.click(screen.getByTestId('reorder-check'));
      // Fix it: remove both, re-add in the right order.
      fireEvent.click(screen.getByTestId('reorder-tile-0-w1'));
      fireEvent.click(screen.getByTestId('reorder-tile-0-w0'));
      fireEvent.click(screen.getByTestId('reorder-tile-0-w0'));
      fireEvent.click(screen.getByTestId('reorder-tile-0-w1'));
      fireEvent.click(screen.getByTestId('reorder-check'));
      act(() => vi.advanceTimersByTime(1000));

      // Sentence 1: correct on the first try.
      fireEvent.click(screen.getByTestId('reorder-tile-1-w0'));
      fireEvent.click(screen.getByTestId('reorder-tile-1-w1'));
      fireEvent.click(screen.getByTestId('reorder-check'));
      act(() => vi.advanceTimersByTime(1000));

      // Both sentences were eventually solved (2/2), but only ONE was right
      // on its first check — the honest score is "1 de 2 a la primera".
      expect(screen.getByTestId('game-result-score').textContent).toBe('1 de 2 a la primera');
      expect(screen.getByTestId('game-result').getAttribute('data-outcome')).toBe('retry');
    });

    it('"Jugar de nuevo" on the result screen starts a fresh round at sentence 1', () => {
      render(<QuizReorder lang="es" items={items} seed="block-1" />);
      fireEvent.click(screen.getByTestId('reorder-tile-0-w0'));
      fireEvent.click(screen.getByTestId('reorder-tile-0-w1'));
      fireEvent.click(screen.getByTestId('reorder-check'));
      act(() => vi.advanceTimersByTime(1000));
      fireEvent.click(screen.getByTestId('reorder-tile-1-w0'));
      fireEvent.click(screen.getByTestId('reorder-tile-1-w1'));
      fireEvent.click(screen.getByTestId('reorder-check'));
      act(() => vi.advanceTimersByTime(1000));

      fireEvent.click(screen.getByTestId('game-result-play-again'));

      expect(screen.queryByTestId('game-result')).toBeNull();
      expect(screen.getByTestId('reorder-position').textContent).toBe('1 de 2');
    });
  });

  it('‹ › navigate between sentences without losing either one’s progress', () => {
    render(<QuizReorder lang="es" items={items} seed="block-1" />);
    fireEvent.click(screen.getByTestId('reorder-tile-0-w1')); // place "sleep" only, leave incomplete

    fireEvent.click(screen.getByTestId('reorder-next'));
    expect(screen.getByTestId('reorder-position').textContent).toBe('2 de 2');

    fireEvent.click(screen.getByTestId('reorder-prev'));
    expect(screen.getByTestId('reorder-position').textContent).toBe('1 de 2');
    expect(line(0).getByTestId('reorder-tile-0-w1')).toBeTruthy();
  });

  it('disables ‹ at the first sentence and › at the last', () => {
    render(<QuizReorder lang="es" items={items} seed="block-1" />);
    expect((screen.getByTestId('reorder-prev') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId('reorder-next'));
    expect((screen.getByTestId('reorder-next') as HTMLButtonElement).disabled).toBe(true);
  });

  describe('the sound mute toggle', () => {
    it('is unmuted by default and persists a mute across a remount', () => {
      const { unmount } = render(<QuizReorder lang="es" items={items} seed="block-1" />);
      expect(screen.getByTestId('game-sound-toggle').getAttribute('aria-pressed')).toBe('false');

      fireEvent.click(screen.getByTestId('game-sound-toggle'));
      expect(localStorage.getItem(GAME_SOUND_MUTE_KEY)).toBe('true');
      unmount();

      render(<QuizReorder lang="es" items={items} seed="block-1" />);
      expect(screen.getByTestId('game-sound-toggle').getAttribute('aria-pressed')).toBe('true');
    });
  });

  describe('layout (visual-polish-2 pass: controls must never overlap the board, "Comprobar" must never scroll away)', () => {
    it('keeps the chrome row (‹ › pager + sound toggle) from ever shrinking', () => {
      render(<QuizReorder lang="es" items={items} seed="block-1" />);
      expect(screen.getByTestId('reorder-controls').className).toContain('flex-none');
    });

    // FLOATING COMPROBAR (build item 5): "Comprobar" is now a `fixed`
    // bottom-right overlay — see `scale.ts`'s own `FLOATING_CHECK_BAR_CLASS`
    // header.
    it('floats "Comprobar" fixed at the stage\'s own bottom-right, out of the scrollable line/tray area', () => {
      render(<QuizReorder lang="es" items={items} seed="block-1" />);
      const checkButton = screen.getByTestId('reorder-check');
      expect(screen.getByTestId('reorder-actions').className).toContain('fixed');
      expect(screen.getByTestId('reorder-stage').contains(checkButton)).toBe(false);
    });
  });

  // Stage layout system (visual-polish pass, owner bug: "el borde de cada
  // ejercicio se corta y es muy ancho el ejercicio").
  describe('stage layout system', () => {
    it('reserves the safe inset as padding on the scrollable stage', () => {
      render(<QuizReorder lang="es" items={items} seed="block-1" />);
      expect(screen.getByTestId('reorder-stage').className).toContain('p-[var(--stage-safe-inset)]');
    });

    it('caps the sentence line at a readable measure, centred in the stage', () => {
      render(<QuizReorder lang="es" items={items} seed="block-1" />);
      const line = screen.getByTestId('reorder-line-0').className;
      expect(line).toContain('max-w-[760px]');
      expect(line).toContain('mx-auto');
    });
  });
});
