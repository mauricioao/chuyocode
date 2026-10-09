// @vitest-environment jsdom
/**
 * QuizCloze tests — the wiring and grading rules of "Completar la frase",
 * through TAP-TO-PLACE (tap a tray tile, tap a blank to place it, tap a
 * filled blank to remove it), same reasoning `QuizReorder.test.tsx`'s own
 * header gives for avoiding a simulated real pointer drag in jsdom.
 *
 * Every pool item id here is author-controlled, so tiles are targeted by
 * their own stable test id rather than by tray position — unlike
 * `QuizReorder`'s 2-word anti-identity trick, this game's shared tray has no
 * such guarantee over its own shuffle order.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Payload } from '@/lib/exercisePayload';
import { GAME_SOUND_MUTE_KEY } from '@/lib/activities/gameSounds';
import QuizCloze from './QuizCloze';

afterEach(cleanup);
beforeEach(() => {
  localStorage.clear();
});

/** Two sentences, one blank each, sharing one pool. */
const TWO_SENTENCE_PAYLOAD: Payload = {
  pools: {
    pool: [
      { id: 'w-sleep', text: 'sleep' },
      { id: 'w-bark', text: 'bark' },
    ],
  },
  slots: [
    { id: 'slot-s0b0', label: 'Cats ___.', input: 'drop', pool: 'pool', answer: ['w-sleep'] },
    { id: 'slot-s1b0', label: 'Dogs ___.', input: 'drop', pool: 'pool', answer: ['w-bark'] },
  ],
  blocks: [
    { kind: 'row', id: 'row-cz-s0-b0-1', slotId: 'slot-s0b0' },
    { kind: 'row', id: 'row-cz-s1-b0-1', slotId: 'slot-s1b0' },
  ],
};

/** One sentence with TWO blanks, plus a distractor in the shared pool. */
const TWO_BLANK_PAYLOAD: Payload = {
  pools: {
    pool: [
      { id: 'w-was', text: 'was' },
      { id: 'w-received', text: 'received' },
      { id: 'w-is', text: 'is' }, // distractor, no slot claims it
    ],
  },
  slots: [
    { id: 'slot-s0b0', label: 'I ___ travelling when I received a phone call.', input: 'drop', pool: 'pool', answer: ['w-was'] },
    { id: 'slot-s0b1', label: 'I was travelling when I ___ a phone call.', input: 'drop', pool: 'pool', answer: ['w-received'] },
  ],
  blocks: [
    { kind: 'row', id: 'row-cz-s0-b0-1', slotId: 'slot-s0b0' },
    { kind: 'row', id: 'row-cz-s0-b1-2', slotId: 'slot-s0b1' },
  ],
};

describe('QuizCloze', () => {
  it('renders nothing when the payload has no playable sentence', () => {
    const { container } = render(<QuizCloze lang="es" payload={{ pools: {}, slots: [] }} seed="block-1" />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the sentence stepper and every blank word in the shared tray', () => {
    render(<QuizCloze lang="es" payload={TWO_SENTENCE_PAYLOAD} seed="block-1" />);
    expect(screen.getByTestId('cloze-position').textContent).toBe('1 de 2');
    expect(screen.getByTestId('cloze-tile-w-sleep')).toBeTruthy();
    expect(screen.getByTestId('cloze-tile-w-bark')).toBeTruthy();
  });

  it('places a tray tile into a blank by tapping the tile then the blank', () => {
    render(<QuizCloze lang="es" payload={TWO_SENTENCE_PAYLOAD} seed="block-1" />);
    fireEvent.click(screen.getByTestId('cloze-tile-w-sleep'));
    fireEvent.click(screen.getByTestId('cloze-blank-slot-s0b0'));

    expect(screen.getByTestId('cloze-blank-slot-s0b0').textContent).toBe('sleep');
    expect(screen.queryByTestId('cloze-tile-w-sleep')).toBeNull();
  });

  it('a word placed in one sentence is no longer offered while viewing another (shared tray)', () => {
    render(<QuizCloze lang="es" payload={TWO_SENTENCE_PAYLOAD} seed="block-1" />);
    fireEvent.click(screen.getByTestId('cloze-tile-w-sleep'));
    fireEvent.click(screen.getByTestId('cloze-blank-slot-s0b0'));

    fireEvent.click(screen.getByTestId('cloze-next'));
    expect(screen.getByTestId('cloze-position').textContent).toBe('2 de 2');
    expect(screen.queryByTestId('cloze-tile-w-sleep')).toBeNull();
    expect(screen.getByTestId('cloze-tile-w-bark')).toBeTruthy();
  });

  it('tapping a filled blank sends its word back to the tray', () => {
    render(<QuizCloze lang="es" payload={TWO_SENTENCE_PAYLOAD} seed="block-1" />);
    fireEvent.click(screen.getByTestId('cloze-tile-w-sleep'));
    fireEvent.click(screen.getByTestId('cloze-blank-slot-s0b0'));
    fireEvent.click(screen.getByTestId('cloze-blank-slot-s0b0'));

    expect(screen.getByTestId('cloze-blank-slot-s0b0').textContent).toBe('___');
    expect(screen.getByTestId('cloze-tile-w-sleep')).toBeTruthy();
  });

  it('disables "Comprobar" until every blank of the current sentence is filled', () => {
    render(<QuizCloze lang="es" payload={TWO_BLANK_PAYLOAD} seed="block-1" />);
    expect((screen.getByTestId('cloze-check') as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByTestId('cloze-tile-w-was'));
    fireEvent.click(screen.getByTestId('cloze-blank-slot-s0b0'));
    expect((screen.getByTestId('cloze-check') as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByTestId('cloze-tile-w-received'));
    fireEvent.click(screen.getByTestId('cloze-blank-slot-s0b1'));
    expect((screen.getByTestId('cloze-check') as HTMLButtonElement).disabled).toBe(false);
  });

  describe('"Comprobar"', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('a fully correct sentence advances to the next one', () => {
      render(<QuizCloze lang="es" payload={TWO_SENTENCE_PAYLOAD} seed="block-1" />);
      fireEvent.click(screen.getByTestId('cloze-tile-w-sleep'));
      fireEvent.click(screen.getByTestId('cloze-blank-slot-s0b0'));
      fireEvent.click(screen.getByTestId('cloze-check'));
      act(() => vi.advanceTimersByTime(1000));

      expect(screen.getByTestId('cloze-position').textContent).toBe('2 de 2');
    });

    it('flags only the wrong blank, stays fixable, and does not advance', () => {
      render(<QuizCloze lang="es" payload={TWO_BLANK_PAYLOAD} seed="block-1" />);
      // Swap the two answers on purpose.
      fireEvent.click(screen.getByTestId('cloze-tile-w-received'));
      fireEvent.click(screen.getByTestId('cloze-blank-slot-s0b0'));
      fireEvent.click(screen.getByTestId('cloze-tile-w-was'));
      fireEvent.click(screen.getByTestId('cloze-blank-slot-s0b1'));
      fireEvent.click(screen.getByTestId('cloze-check'));

      expect(screen.getByTestId('cloze-position').textContent).toBe('1 de 1');
      expect(screen.getByTestId('cloze-blank-slot-s0b0').className).toContain('border-destructive');
      expect(screen.getByTestId('cloze-blank-slot-s0b1').className).toContain('border-destructive');

      // Fixable: clear both wrong blanks, then place the right words.
      fireEvent.click(screen.getByTestId('cloze-blank-slot-s0b0'));
      fireEvent.click(screen.getByTestId('cloze-blank-slot-s0b1'));
      fireEvent.click(screen.getByTestId('cloze-tile-w-was'));
      fireEvent.click(screen.getByTestId('cloze-blank-slot-s0b0'));
      expect(screen.getByTestId('cloze-blank-slot-s0b0').textContent).toBe('was');
    });

    it('reaching the end shows the final score and "Reintentar"', () => {
      render(<QuizCloze lang="es" payload={TWO_SENTENCE_PAYLOAD} seed="block-1" />);
      fireEvent.click(screen.getByTestId('cloze-tile-w-sleep'));
      fireEvent.click(screen.getByTestId('cloze-blank-slot-s0b0'));
      fireEvent.click(screen.getByTestId('cloze-check'));
      act(() => vi.advanceTimersByTime(1000));

      fireEvent.click(screen.getByTestId('cloze-tile-w-bark'));
      fireEvent.click(screen.getByTestId('cloze-blank-slot-s1b0'));
      fireEvent.click(screen.getByTestId('cloze-check'));
      act(() => vi.advanceTimersByTime(1000));

      expect(screen.getByTestId('cloze-result').textContent).toBe('2 de 2 correctas');
      expect(screen.getByTestId('cloze-retry')).toBeTruthy();
    });

    it('"Reintentar" starts a fresh round at sentence 1', () => {
      render(<QuizCloze lang="es" payload={TWO_SENTENCE_PAYLOAD} seed="block-1" />);
      fireEvent.click(screen.getByTestId('cloze-tile-w-sleep'));
      fireEvent.click(screen.getByTestId('cloze-blank-slot-s0b0'));
      fireEvent.click(screen.getByTestId('cloze-check'));
      act(() => vi.advanceTimersByTime(1000));
      fireEvent.click(screen.getByTestId('cloze-tile-w-bark'));
      fireEvent.click(screen.getByTestId('cloze-blank-slot-s1b0'));
      fireEvent.click(screen.getByTestId('cloze-check'));
      act(() => vi.advanceTimersByTime(1000));

      fireEvent.click(screen.getByTestId('cloze-retry'));

      expect(screen.queryByTestId('cloze-result')).toBeNull();
      expect(screen.getByTestId('cloze-position').textContent).toBe('1 de 2');
    });
  });

  it('‹ › navigate between sentences without losing either one’s progress', () => {
    render(<QuizCloze lang="es" payload={TWO_SENTENCE_PAYLOAD} seed="block-1" />);
    fireEvent.click(screen.getByTestId('cloze-tile-w-sleep'));
    fireEvent.click(screen.getByTestId('cloze-blank-slot-s0b0'));

    fireEvent.click(screen.getByTestId('cloze-next'));
    expect(screen.getByTestId('cloze-position').textContent).toBe('2 de 2');

    fireEvent.click(screen.getByTestId('cloze-prev'));
    expect(screen.getByTestId('cloze-position').textContent).toBe('1 de 2');
    expect(screen.getByTestId('cloze-blank-slot-s0b0').textContent).toBe('sleep');
  });

  it('disables ‹ at the first sentence and › at the last', () => {
    render(<QuizCloze lang="es" payload={TWO_SENTENCE_PAYLOAD} seed="block-1" />);
    expect((screen.getByTestId('cloze-prev') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId('cloze-next'));
    expect((screen.getByTestId('cloze-next') as HTMLButtonElement).disabled).toBe(true);
  });

  describe('the sound mute toggle', () => {
    it('is unmuted by default and persists a mute across a remount', () => {
      const { unmount } = render(<QuizCloze lang="es" payload={TWO_SENTENCE_PAYLOAD} seed="block-1" />);
      expect(screen.getByTestId('game-sound-toggle').getAttribute('aria-pressed')).toBe('false');

      fireEvent.click(screen.getByTestId('game-sound-toggle'));
      expect(localStorage.getItem(GAME_SOUND_MUTE_KEY)).toBe('true');
      unmount();

      render(<QuizCloze lang="es" payload={TWO_SENTENCE_PAYLOAD} seed="block-1" />);
      expect(screen.getByTestId('game-sound-toggle').getAttribute('aria-pressed')).toBe('true');
    });
  });

  describe('layout (visual-polish-2 pass: controls must never overlap the board, "Comprobar" must never scroll away)', () => {
    it('keeps the chrome row (‹ › pager + sound toggle) from ever shrinking', () => {
      render(<QuizCloze lang="es" payload={TWO_SENTENCE_PAYLOAD} seed="block-1" />);
      expect(screen.getByTestId('cloze-controls').className).toContain('flex-none');
    });

    // FLOATING COMPROBAR (build item 5): "Comprobar" is now a `fixed`
    // bottom-right overlay — see `scale.ts`'s own `FLOATING_CHECK_BAR_CLASS`
    // header.
    it('floats "Comprobar" fixed at the stage\'s own bottom-right, out of the scrollable sentence/tray area', () => {
      render(<QuizCloze lang="es" payload={TWO_SENTENCE_PAYLOAD} seed="block-1" />);
      expect(screen.getByTestId('cloze-stage').contains(screen.getByTestId('cloze-check'))).toBe(false);
      expect(screen.getByTestId('cloze-actions').className).toContain('fixed');
    });

    it('offsets the floating Comprobar further left when rendered inside the editor', () => {
      render(<QuizCloze lang="es" payload={TWO_SENTENCE_PAYLOAD} seed="block-1" editorOffset />);
      expect(screen.getByTestId('cloze-actions').className).toContain('lg:right-20');
    });
  });
});
