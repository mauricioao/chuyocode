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

      expect(screen.getByTestId('game-result-score').textContent).toBe('3 de 3 correctas');
      expect(screen.getByTestId('game-result').getAttribute('data-outcome')).toBe('perfect');
    });

    it('bounces a wrong placement back to the tray and scores it as incorrect', () => {
      render(<QuizMatching lang="es" items={items} seed="block-1" />);
      place('s1', 's2'); // wrong: s1's answer in s2's slot
      place('s2', 's1'); // wrong: s2's answer in s1's slot (every slot filled — UX audit finding 3)
      place('s3', 's3'); // correct

      fireEvent.click(screen.getByTestId('matching-check'));
      // Mid-settle: the wrong tile still visibly flags red in its slot.
      expect(screen.getByTestId('matching-slot-s2').className).toContain('border-destructive');

      act(() => vi.advanceTimersByTime(1000));

      expect(screen.getByTestId('game-result-score').textContent).toBe('1 de 3 correctas');
      expect(screen.getByTestId('game-result').getAttribute('data-outcome')).toBe('retry');
    });

    describe('✓/✕ marks (UX audit F10: correct/wrong must not rely on colour alone)', () => {
      it('shows no marks before "Comprobar" is pressed', () => {
        render(<QuizMatching lang="es" items={items} seed="block-1" />);
        place('s1', 's1');

        expect(screen.queryByTestId('grade-mark-correct')).toBeNull();
        expect(screen.queryByTestId('grade-mark-wrong')).toBeNull();
        expect(screen.getByTestId('matching-live-region').textContent).toBe('');
      });

      it('marks a correct slot with a ✓ badge and "correcta" in its accessible name, and announces the summary', () => {
        render(<QuizMatching lang="es" items={items} seed="block-1" />);
        place('s1', 's1');
        place('s2', 's2');
        place('s3', 's3');

        fireEvent.click(screen.getByTestId('matching-check'));

        const slot = screen.getByTestId('matching-slot-s1');
        expect(within(slot).getByTestId('grade-mark-correct')).toBeTruthy();
        expect(screen.getByTestId('matching-tile-s1').getAttribute('aria-label')).toContain('correcta');
        expect(screen.getByTestId('matching-live-region').textContent).toBe('3 correctas');
      });

      it('marks a wrong slot with a ✕ badge and "incorrecta" in its accessible name during the brief settle window', () => {
        render(<QuizMatching lang="es" items={items} seed="block-1" />);
        place('s1', 's2'); // wrong: s1's answer in s2's slot
        place('s2', 's1'); // wrong: s2's answer in s1's slot (every slot filled — UX audit finding 3)
        place('s3', 's3'); // correct

        fireEvent.click(screen.getByTestId('matching-check'));

        const wrongSlot = screen.getByTestId('matching-slot-s2');
        expect(within(wrongSlot).getByTestId('grade-mark-wrong')).toBeTruthy();
        expect(screen.getByTestId('matching-tile-s1').getAttribute('aria-label')).toContain('incorrecta');
        expect(screen.getByTestId('matching-live-region').textContent).toBe('1 correcta, 2 incorrectas');

        // Gone once the wrong tile settles back into the tray.
        act(() => vi.advanceTimersByTime(1000));
        expect(screen.queryByTestId('grade-mark-wrong')).toBeNull();
      });

      it('clears every mark and the announcement on "Jugar de nuevo"', () => {
        render(<QuizMatching lang="es" items={items} seed="block-1" />);
        place('s1', 's1');
        place('s2', 's2');
        place('s3', 's3');
        fireEvent.click(screen.getByTestId('matching-check'));
        act(() => vi.advanceTimersByTime(1000));
        expect(screen.getByTestId('matching-live-region').textContent).not.toBe('');

        fireEvent.click(screen.getByTestId('game-result-play-again'));

        expect(screen.queryByTestId('grade-mark-correct')).toBeNull();
        expect(screen.getByTestId('matching-live-region').textContent).toBe('');
      });
    });

    it('offers "Jugar de nuevo" on the result screen, which starts a fresh round', () => {
      render(<QuizMatching lang="es" items={items} seed="block-1" />);
      place('s1', 's1');
      place('s2', 's2');
      place('s3', 's3');
      fireEvent.click(screen.getByTestId('matching-check'));
      act(() => vi.advanceTimersByTime(1000));

      fireEvent.click(screen.getByTestId('game-result-play-again'));

      expect(screen.queryByTestId('game-result')).toBeNull();
      expect(screen.getByTestId('quiz-matching')).toBeTruthy();
      for (const item of items) {
        expect(screen.getByTestId(`matching-tile-${item.id}`)).toBeTruthy();
      }
    });

    it('offers "Repasar las que fallé" only when there were mistakes, keeping the correct pair placed and sending only the wrong one back', () => {
      render(<QuizMatching lang="es" items={items} seed="block-1" />);
      place('s1', 's2'); // wrong: s1's answer in s2's slot
      place('s2', 's1'); // wrong: s2's answer in s1's slot (every slot filled — UX audit finding 3)
      place('s3', 's3'); // correct
      fireEvent.click(screen.getByTestId('matching-check'));
      act(() => vi.advanceTimersByTime(1000));

      expect(screen.getByTestId('game-result-review')).toBeTruthy();
      fireEvent.click(screen.getByTestId('game-result-review'));

      expect(screen.queryByTestId('game-result')).toBeNull();
      // s3's slot kept its correct tile, locked (no longer offered in the tray).
      expect(screen.getByTestId('matching-slot-s3').getAttribute('data-filled')).toBe('true');
      expect(tray().queryByTestId('matching-tile-s3')).toBeNull();
      // s1's and s2's slots are empty again, their tiles back in the tray.
      expect(screen.getByTestId('matching-slot-s2').getAttribute('data-filled')).toBeFalsy();
      expect(tray().getByTestId('matching-tile-s1')).toBeTruthy();

      // Both s1 and s2 were wrong (swapped) on the first check — placing
      // both tiles correctly and checking again reaches a perfect score.
      place('s1', 's1');
      place('s2', 's2');
      fireEvent.click(screen.getByTestId('matching-check'));
      act(() => vi.advanceTimersByTime(1000));

      expect(screen.getByTestId('game-result-score').textContent).toBe('3 de 3 correctas');
      expect(screen.queryByTestId('game-result-review')).toBeNull();
    });

    it('omits "Repasar las que fallé" on a perfect round', () => {
      render(<QuizMatching lang="es" items={items} seed="block-1" />);
      place('s1', 's1');
      place('s2', 's2');
      place('s3', 's3');
      fireEvent.click(screen.getByTestId('matching-check'));
      act(() => vi.advanceTimersByTime(1000));

      expect(screen.queryByTestId('game-result-review')).toBeNull();
    });

    it('hides "Reiniciar" (it would duplicate "Jugar de nuevo") while the result screen is shown, and brings it back once play resumes', () => {
      render(<QuizMatching lang="es" items={items} seed="block-1" />);
      place('s1', 's1');
      place('s2', 's2');
      place('s3', 's3');
      expect(screen.getByTestId('matching-reset')).toBeTruthy();

      fireEvent.click(screen.getByTestId('matching-check'));
      act(() => vi.advanceTimersByTime(1000));

      expect(screen.queryByTestId('matching-reset')).toBeNull();
      // The sound toggle stays.
      expect(screen.getByTestId('game-sound-toggle')).toBeTruthy();

      fireEvent.click(screen.getByTestId('game-result-play-again'));
      expect(screen.getByTestId('matching-reset')).toBeTruthy();
    });

    it('threads `nextHref`/`guest` down to the shared GameResult screen', () => {
      render(
        <QuizMatching
          lang="es"
          items={items}
          seed="block-1"
          nextHref="/es/ingles/actividades?nivel=a1"
          guest={{ signUpHref: '/es/auth/entrar?mode=signup&next=%2Fes%2Fx' }}
        />,
      );
      place('s1', 's1');
      place('s2', 's2');
      place('s3', 's3');
      fireEvent.click(screen.getByTestId('matching-check'));
      act(() => vi.advanceTimersByTime(1000));

      expect(screen.getByTestId('game-result-next').getAttribute('href')).toBe('/es/ingles/actividades?nivel=a1');
      expect(screen.getByTestId('game-result-guest-banner')).toBeTruthy();
    });

    it('disables Comprobar and the board while settling', () => {
      render(<QuizMatching lang="es" items={items} seed="block-1" />);
      place('s1', 's1');
      place('s2', 's2');
      place('s3', 's3');
      fireEvent.click(screen.getByTestId('matching-check'));

      expect((screen.getByTestId('matching-check') as HTMLButtonElement).disabled).toBe(true);
      expect((screen.getByTestId('matching-tile-s2') as HTMLButtonElement).disabled).toBe(true);

      act(() => vi.advanceTimersByTime(1000));
    });

    describe('requires every slot filled before grading (UX audit finding 3, RECORRIDO-2026-10-15.md #3)', () => {
      it('does not grade and announces how many are left when slots are still empty', () => {
        render(<QuizMatching lang="es" items={items} seed="block-1" />);
        place('s1', 's1');
        // s2 and s3 left unplaced.

        fireEvent.click(screen.getByTestId('matching-check'));

        expect(screen.getByTestId('matching-live-region').textContent).toBe('Te faltan 2 por ubicar.');
        // The round keeps going — no grading, no result screen.
        expect(screen.queryByTestId('game-result')).toBeNull();
        expect(screen.queryByTestId('grade-mark-correct')).toBeNull();
        expect(screen.queryByTestId('grade-mark-wrong')).toBeNull();
        expect((screen.getByTestId('matching-check') as HTMLButtonElement).disabled).toBe(false);
      });

      it('uses the singular copy when exactly one slot is left', () => {
        render(<QuizMatching lang="es" items={items} seed="block-1" />);
        place('s1', 's1');
        place('s2', 's2');
        // s3 left unplaced.

        fireEvent.click(screen.getByTestId('matching-check'));

        expect(screen.getByTestId('matching-live-region').textContent).toBe('Te falta 1 por ubicar.');
      });

      it('clears the missing-slots notice once another tile is placed', () => {
        render(<QuizMatching lang="es" items={items} seed="block-1" />);
        place('s1', 's1');
        fireEvent.click(screen.getByTestId('matching-check'));
        expect(screen.getByTestId('matching-live-region').textContent).toBe('Te faltan 2 por ubicar.');

        place('s2', 's2');

        expect(screen.getByTestId('matching-live-region').textContent).toBe('');
      });

      it('grades normally once every slot is filled, in English too', () => {
        render(<QuizMatching lang="en" items={items} seed="block-1" />);
        place('s1', 's1');

        fireEvent.click(screen.getByTestId('matching-check'));
        expect(screen.getByTestId('matching-live-region').textContent).toBe('You still have 2 to place.');

        place('s2', 's2');
        place('s3', 's3');
        fireEvent.click(screen.getByTestId('matching-check'));
        act(() => vi.advanceTimersByTime(1000));

        expect(screen.getByTestId('game-result-score').textContent).toBe('3 of 3 correct');
      });

      // Coordinator review of ac75119: the sr-only announcement alone left a
      // sighted student with nothing visible after tapping "Comprobar" —
      // the notice must also show as real, visible DOM content, and the
      // still-empty slot(s) should draw the eye to where to place next.
      describe('a VISIBLE notice next to "Comprobar" (coordinator follow-up)', () => {
        it('shows the notice as real, visible DOM content — not only inside the sr-only live region', () => {
          render(<QuizMatching lang="es" items={items} seed="block-1" />);
          place('s1', 's1');

          fireEvent.click(screen.getByTestId('matching-check'));

          const notice = screen.getByTestId('matching-missing-notice');
          expect(notice.textContent).toBe('Te faltan 2 por ubicar.');
          // Not the sr-only region, and not visually hidden itself.
          expect(screen.getByTestId('matching-live-region').contains(notice)).toBe(false);
          expect(notice.className).not.toContain('sr-only');
        });

        it('shows no notice before "Comprobar" is pressed, or once the board is complete', () => {
          render(<QuizMatching lang="es" items={items} seed="block-1" />);
          place('s1', 's1');
          expect(screen.queryByTestId('matching-missing-notice')).toBeNull();

          place('s2', 's2');
          place('s3', 's3');
          fireEvent.click(screen.getByTestId('matching-check'));
          expect(screen.queryByTestId('matching-missing-notice')).toBeNull();
        });

        it('hides the visible notice once another tile is placed, same as the sr-only announcement', () => {
          render(<QuizMatching lang="es" items={items} seed="block-1" />);
          place('s1', 's1');
          fireEvent.click(screen.getByTestId('matching-check'));
          expect(screen.getByTestId('matching-missing-notice')).toBeTruthy();

          place('s2', 's2');

          expect(screen.queryByTestId('matching-missing-notice')).toBeNull();
        });

        it('pulses the still-empty slot(s) so the student sees where to place, respecting reduced motion', () => {
          render(<QuizMatching lang="es" items={items} seed="block-1" />);
          place('s1', 's1');

          fireEvent.click(screen.getByTestId('matching-check'));

          expect(screen.getByTestId('matching-slot-s2').className).toContain('animate-pulse');
          expect(screen.getByTestId('matching-slot-s2').className).toContain('motion-reduce:animate-none');
          expect(screen.getByTestId('matching-slot-s3').className).toContain('animate-pulse');
          // The filled slot is not highlighted — only the empty ones are.
          expect(screen.getByTestId('matching-slot-s1').className).not.toContain('animate-pulse');
        });

        it('stops pulsing once the notice clears (next placement)', () => {
          render(<QuizMatching lang="es" items={items} seed="block-1" />);
          place('s1', 's1');
          fireEvent.click(screen.getByTestId('matching-check'));
          expect(screen.getByTestId('matching-slot-s2').className).toContain('animate-pulse');

          place('s2', 's2');

          expect(screen.getByTestId('matching-slot-s3').className).not.toContain('animate-pulse');
        });
      });
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

  describe('layout (visual-polish-2 pass: a 5+ pair board must fit the stage, never overlap its own controls)', () => {
    it('keeps the chrome row (sound toggle + Reiniciar) from ever shrinking, so it cannot be squeezed over the board', () => {
      render(<QuizMatching lang="es" items={items} seed="block-1" />);
      expect(screen.getByTestId('matching-controls').className).toContain('flex-none');
    });

    // FLOATING COMPROBAR (build item 5): "Comprobar" is now a `fixed`
    // bottom-right overlay (never in the scrollable board/tray flow at
    // all), same place in every game — see `scale.ts`'s own
    // `FLOATING_CHECK_BAR_CLASS` header.
    it('floats "Comprobar" fixed at the stage\'s own bottom-right, out of the scrollable board/tray area', () => {
      render(<QuizMatching lang="es" items={items} seed="block-1" />);
      expect(screen.getByTestId('matching-actions').className).toContain('fixed');
      expect(screen.getByTestId('matching-actions').className).toContain('bottom-4');
      expect(screen.getByTestId('matching-actions').className).toContain('right-4');
      // Never a descendant of the scrollable prompts grid — a sibling of it.
      expect(screen.getByTestId('matching-prompts').contains(screen.getByTestId('matching-check'))).toBe(false);
    });

    it('offsets the floating Comprobar further left when rendered inside the editor (clears the docked side toolbar)', () => {
      render(<QuizMatching lang="es" items={items} seed="block-1" editorOffset />);
      expect(screen.getByTestId('matching-actions').className).toContain('lg:right-20');
    });

    it('stays one column for a short board (3 pairs, at/under the many-pairs threshold)', () => {
      render(<QuizMatching lang="es" items={items} seed="block-1" />);
      const grid = screen.getByTestId('matching-prompts').className;
      expect(grid).toContain('grid-cols-1');
      expect(grid).not.toContain('@lg:grid-cols-2');
    });

    it('switches to a two-column grid on a wide stage once there are many pairs (5+)', () => {
      const manyItems: GameItem[] = [
        ...items,
        { id: 's4', prompt: 'Prompt 4', answer: 'four' },
        { id: 's5', prompt: 'Prompt 5', answer: 'five' },
      ];
      render(<QuizMatching lang="es" items={manyItems} seed="block-1" />);
      expect(screen.getByTestId('matching-prompts').className).toContain('@lg:grid-cols-2');
    });
  });

  // Stage layout system (visual-polish pass, owner bug: "el borde de cada
  // ejercicio se corta y es muy ancho el ejercicio").
  describe('stage layout system', () => {
    it('reserves the safe inset as padding on the scrollable stage, so a row\'s own decorations never touch a clipping edge', () => {
      render(<QuizMatching lang="es" items={items} seed="block-1" />);
      expect(screen.getByTestId('matching-stage-scroll').className).toContain('p-[var(--stage-safe-inset)]');
    });

    it('caps the prompts column at a readable measure, centred in the stage', () => {
      render(<QuizMatching lang="es" items={items} seed="block-1" />);
      const grid = screen.getByTestId('matching-prompts').className;
      expect(grid).toContain('max-w-[760px]');
      expect(grid).toContain('mx-auto');
    });

    it('lays out a prompt row as a two-equal-column grid (term | slot) with the kit\'s row anatomy, stacking under a narrow container', () => {
      render(<QuizMatching lang="es" items={items} seed="block-1" />);
      const row = screen.getByTestId('matching-prompt-s1').className;
      expect(row).toContain('grid');
      expect(row).toContain('grid-cols-1');
      expect(row).toContain('@[420px]:grid-cols-2');
      expect(row).toContain('gap-4');
      expect(row).toContain('py-3');
      expect(row).toContain('px-4');
      expect(row).toContain('min-h-16');
      expect(row).toContain('rounded-[20px]');
    });

    it('settles a correct row with an INSET ring, never a plain ring that would paint outside the row\'s own box', () => {
      vi.useFakeTimers();
      render(<QuizMatching lang="es" items={items} seed="block-1" />);
      place('s1', 's1');
      place('s2', 's2');
      place('s3', 's3');
      fireEvent.click(screen.getByTestId('matching-check'));

      expect(screen.getByTestId('matching-prompt-s1').className).toContain('ring-inset');
      vi.useRealTimers();
    });
  });

  // UI pass (owner spec screenshot: "mover las opciones arriba, las
  // cápsulas que sean de colores de nuestra paleta y siempre variadas,
  // aumentar un poco el tamaño y centrar dentro de las cápsulas el texto").
  describe('the tray, moved above the board and coloured (UI pass)', () => {
    it('renders the tray of options above the pairs list, in DOM order', () => {
      render(<QuizMatching lang="es" items={items} seed="block-1" />);
      const scroll = screen.getByTestId('matching-stage-scroll');
      const tray = screen.getByTestId('matching-tray');
      const prompts = screen.getByTestId('matching-prompts');
      const children = Array.from(scroll.children);

      expect(children.indexOf(tray)).toBeGreaterThanOrEqual(0);
      expect(children.indexOf(tray)).toBeLessThan(children.indexOf(prompts));
    });

    it('centres the tray over the same board width as the pairs list', () => {
      render(<QuizMatching lang="es" items={items} seed="block-1" />);
      expect(screen.getByTestId('matching-tray').className).toContain('max-w-[760px]');
      expect(screen.getByTestId('matching-tray').className).toContain('mx-auto');
    });

    it('colours every tray chip from the shared tile palette', () => {
      render(<QuizMatching lang="es" items={items} seed="block-1" />);
      for (const item of items) {
        expect(screen.getByTestId(`matching-tile-${item.id}`).className).toMatch(/\bbg-tile-[1-6]\b/);
      }
    });

    it('gives neighbouring tray chips different colours', () => {
      render(<QuizMatching lang="es" items={items} seed="block-1" />);
      const colours = items.map((item) => screen.getByTestId(`matching-tile-${item.id}`).className.match(/bg-tile-[1-6]/)![0]);
      expect(new Set(colours).size).toBe(colours.length);
    });

    it('keeps a chip\'s own colour once it is placed into a slot', () => {
      render(<QuizMatching lang="es" items={items} seed="block-1" />);
      const before = screen.getByTestId('matching-tile-s1').className.match(/bg-tile-[1-6]/)![0];

      place('s1', 's1');

      const after = screen.getByTestId('matching-tile-s1').className.match(/bg-tile-[1-6]/)![0];
      expect(after).toBe(before);
    });

    it('centres the chip\'s own text, both horizontally and vertically', () => {
      render(<QuizMatching lang="es" items={items} seed="block-1" />);
      const cls = screen.getByTestId('matching-tile-s1').className;
      expect(cls).toContain('text-center');
      expect(cls).toContain('items-center');
      expect(cls).toContain('justify-center');
    });

    it('sizes the chip at the bigger kit scale (48px tall, 18px semibold text, ~20px side padding)', () => {
      render(<QuizMatching lang="es" items={items} seed="block-1" />);
      const cls = screen.getByTestId('matching-tile-s1').className;
      expect(cls).toContain('min-h-[clamp(3rem,');
      expect(cls).toContain('text-[clamp(1.125rem,');
      expect(cls).toContain('font-semibold');
      expect(cls).toContain('px-[clamp(1.25rem,');
    });
  });
});
