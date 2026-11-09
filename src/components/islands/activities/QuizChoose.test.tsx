// @vitest-environment jsdom
/**
 * QuizChoose tests — "Elegir la respuesta": one question per screen, shuffled
 * numbered cards, instant ✓/✕ with the blanks filled in, the "¿Por qué?"
 * panel, the count-up timer and the shared end screen.
 *
 * The options are shuffled on every play, so a card is always found by its
 * own text (and its on-screen position read from `data-position`), never by
 * an assumed position.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Payload } from '@/lib/exercisePayload';
import type { PromptImageRef } from '@/lib/activities/blocks';
import { uploadPath } from '@/lib/activities/paths';
import { GAME_SOUND_MUTE_KEY } from '@/lib/activities/gameSounds';
import QuizChoose from './QuizChoose';

const QUESTION_IMAGE: PromptImageRef = {
  path: uploadPath('a1b2c3d4-0000-4000-8000-000000000001', 'b2c3d4e5-0000-4000-8000-0000000000bb', 'question'),
  width: 480,
  height: 360,
};

/** Two questions: the first with two blanks and an image, the second with one blank and a "¿Por qué?". */
const PAYLOAD: Payload = {
  pools: {
    'q1-options': [
      { id: 'q1-a', text: "wasn't paying / was speaking" },
      { id: 'q1-b', text: "wasn't paying / spoke" },
      { id: 'q1-c', text: 'payed / spoke' },
    ],
    'q2-options': [
      { id: 'q2-a', text: 'goes' },
      { id: 'q2-b', text: 'go' },
      { id: 'q2-c', text: 'going' },
      { id: 'q2-d', text: 'gone' },
    ],
  },
  slots: [
    { id: 'q1', label: 'I ___ attention while the teacher ___.', input: 'choice', pool: 'q1-options', answer: ['q1-a'] },
    {
      id: 'q2',
      label: 'She ___ to school every day.',
      input: 'choice',
      pool: 'q2-options',
      answer: ['q2-a'],
      explanation: 'With "she", the present simple adds -s.',
    },
  ],
};

const PROMPT_IMAGES: Record<string, PromptImageRef> = { q1: QUESTION_IMAGE };

function renderPlayer(payload: Payload = PAYLOAD) {
  return render(<QuizChoose lang="es" payload={payload} promptImages={PROMPT_IMAGES} seed="block-1" />);
}

function cards(): HTMLElement[] {
  return screen.getAllByTestId('choose-option');
}

function card(text: string): HTMLElement {
  const found = cards().find((el) => el.querySelector('[data-option-label]')?.textContent === text);
  if (!found) throw new Error(`no card "${text}"`);
  return found;
}

function blanks(): HTMLElement[] {
  return screen.getAllByTestId('choose-blank');
}

function pressKey(key: string, target: Element | Window = window) {
  fireEvent.keyDown(target, { key });
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('QuizChoose — the question screen', () => {
  it('shows the sentence with its blanks, the context image and one numbered card per option', () => {
    renderPlayer();

    expect(screen.getByTestId('choose-sentence').textContent).toBe('I espacio en blanco attention while the teacher espacio en blanco.');
    expect(blanks()).toHaveLength(2);
    expect(blanks().every((b) => b.getAttribute('data-filled') === null)).toBe(true);
    expect(screen.getByTestId('choose-image').getAttribute('src')).toContain(QUESTION_IMAGE.path.split('/').pop()!);

    expect(cards().map((c) => c.tagName)).toEqual(['BUTTON', 'BUTTON', 'BUTTON']);
    expect(cards().map((c) => c.getAttribute('data-position'))).toEqual(['1', '2', '3']);
    expect(cards().map((c) => c.querySelector('[data-option-label]')!.textContent).sort()).toEqual(
      ["payed / spoke", "wasn't paying / spoke", "wasn't paying / was speaking"],
    );
  });

  it('shows the timer, the score and the position', () => {
    renderPlayer();
    expect(screen.getByTestId('choose-timer').textContent).toContain('0:00');
    expect(screen.getByTestId('choose-score').textContent).toContain('0');
    expect(screen.getByTestId('choose-position').textContent).toBe('1 de 2');

    act(() => vi.advanceTimersByTime(3000));
    expect(screen.getByTestId('choose-timer').textContent).toContain('0:03');
  });

  it('shows no image for a question without one', () => {
    render(<QuizChoose lang="es" payload={PAYLOAD} seed="block-1" />);
    expect(screen.queryByTestId('choose-image')).toBeNull();
  });

  it('picks a card with the number key of its position', () => {
    renderPlayer();
    const target = card('payed / spoke');
    pressKey(target.getAttribute('data-position')!);
    expect(card('payed / spoke').getAttribute('data-mark')).toBe('wrong');
  });

  it('ignores number keys while another board covers this one ("modo enfoque" mounts a second board on top)', () => {
    renderPlayer();
    const cover = document.createElement('div');
    document.body.appendChild(cover);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      { x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, toJSON: () => ({}) } as DOMRect,
    );
    const elementFromPoint = vi.fn(() => cover as Element);
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: elementFromPoint });

    pressKey('1');
    expect(cards().some((c) => c.getAttribute('data-mark'))).toBe(false);

    elementFromPoint.mockReturnValue(screen.getByTestId('choose-sentence'));
    pressKey('1');
    expect(cards()[0]!.getAttribute('data-mark')).not.toBeNull();

    // `delete` restores jsdom's own (absent) implementation.
    delete (document as { elementFromPoint?: unknown }).elementFromPoint;
    vi.restoreAllMocks();
    cover.remove();
  });

  it('ignores number keys typed into a text field', () => {
    renderPlayer();
    const input = document.createElement('input');
    document.body.appendChild(input);
    pressKey('1', input);
    expect(cards().some((c) => c.getAttribute('data-mark'))).toBe(false);
    input.remove();
  });
});

describe('QuizChoose — answering', () => {
  it('a correct pick: ✓ on the card, score +1, blanks filled in order, then moves on by itself', () => {
    renderPlayer();
    fireEvent.click(card("wasn't paying / was speaking"));

    const picked = card("wasn't paying / was speaking");
    expect(picked.getAttribute('data-mark')).toBe('correct');
    expect(picked.textContent).toContain('Correcta');
    expect(screen.getByTestId('choose-score').textContent).toContain('1');
    expect(blanks().map((b) => [b.textContent, b.getAttribute('data-filled')])).toEqual([
      ["wasn't paying", ''],
      ['was speaking', ''],
    ]);
    expect(screen.getByTestId('choose-live-region').textContent).toBe('¡Correcto!');
    // Every card is locked once answered.
    expect(cards().every((c) => (c as HTMLButtonElement).disabled)).toBe(true);

    act(() => vi.advanceTimersByTime(1199));
    expect(screen.getByTestId('choose-position').textContent).toBe('1 de 2');
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByTestId('choose-position').textContent).toBe('2 de 2');
    expect(screen.getByTestId('choose-sentence').textContent).toBe('She espacio en blanco to school every day.');
  });

  it('a wrong pick: ✕ on the card, ✓ on the right one, no score, the right answer in the blanks', () => {
    renderPlayer();
    fireEvent.click(card('payed / spoke'));

    expect(card('payed / spoke').getAttribute('data-mark')).toBe('wrong');
    expect(card('payed / spoke').textContent).toContain('Incorrecta');
    expect(card("wasn't paying / was speaking").getAttribute('data-mark')).toBe('reveal');
    expect(card("wasn't paying / was speaking").textContent).toContain('Correcta');
    expect(card("wasn't paying / spoke").getAttribute('data-mark')).toBeNull();
    expect(screen.getByTestId('choose-score').textContent).toContain('0');
    expect(blanks().map((b) => b.textContent)).toEqual(["wasn't paying", 'was speaking']);
    expect(screen.getByTestId('choose-live-region').textContent).toBe(
      "Incorrecto. La respuesta correcta es: wasn't paying / was speaking",
    );
  });

  it('a wrong pick with no explanation waits about 2 seconds, then moves on', () => {
    renderPlayer();
    fireEvent.click(card('payed / spoke'));
    expect(screen.queryByTestId('choose-why')).toBeNull();

    act(() => vi.advanceTimersByTime(1999));
    expect(screen.getByTestId('choose-position').textContent).toBe('1 de 2');
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByTestId('choose-position').textContent).toBe('2 de 2');
  });

  it('a wrong pick with an explanation shows "¿Por qué?" and waits for "Siguiente"', () => {
    renderPlayer();
    fireEvent.click(card("wasn't paying / was speaking"));
    act(() => vi.advanceTimersByTime(1200));

    fireEvent.click(card('gone'));
    const why = screen.getByTestId('choose-why');
    expect(why.textContent).toContain('¿Por qué?');
    expect(why.textContent).toContain('With "she", the present simple adds -s.');
    const next = screen.getByRole('button', { name: 'Siguiente' });
    expect(document.activeElement).toBe(next);

    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.queryByTestId('game-result')).toBeNull();

    fireEvent.click(next);
    expect(screen.getByTestId('game-result')).toBeTruthy();
  });

  it('moves focus to the new sentence on each new question', () => {
    renderPlayer();
    fireEvent.click(card("wasn't paying / was speaking"));
    act(() => vi.advanceTimersByTime(1200));
    expect(document.activeElement).toBe(screen.getByTestId('choose-sentence'));
  });
});

describe('QuizChoose — the end of the play', () => {
  function playOneRightOneWrong() {
    renderPlayer();
    fireEvent.click(card("wasn't paying / was speaking"));
    act(() => vi.advanceTimersByTime(1200));
    fireEvent.click(card('go'));
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
  }

  it('shows the shared result screen with the score and the time of the play', () => {
    renderPlayer();
    fireEvent.click(card("wasn't paying / was speaking"));
    act(() => vi.advanceTimersByTime(1200));
    act(() => vi.advanceTimersByTime(2000));
    fireEvent.click(card('go'));
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));

    expect(screen.getByTestId('game-result-score').textContent).toBe('1 de 2 correctas');
    expect(screen.getByTestId('game-result-time').textContent).toBe('en 0:03');
  });

  it('"Repasar las que fallé" replays only the missed questions', () => {
    playOneRightOneWrong();
    fireEvent.click(screen.getByTestId('game-result-review'));

    expect(screen.getByTestId('choose-position').textContent).toBe('1 de 1');
    expect(screen.getByTestId('choose-sentence').textContent).toBe('She espacio en blanco to school every day.');
    expect(screen.getByTestId('choose-score').textContent).toContain('0');

    fireEvent.click(card('goes'));
    act(() => vi.advanceTimersByTime(1200));
    expect(screen.getByTestId('game-result-score').textContent).toBe('1 de 1 correctas');
  });

  it('"Jugar de nuevo" starts every question again from zero', () => {
    playOneRightOneWrong();
    fireEvent.click(screen.getAllByTestId('game-result-play-again')[0]!);

    expect(screen.getByTestId('choose-position').textContent).toBe('1 de 2');
    expect(screen.getByTestId('choose-score').textContent).toContain('0');
    expect(screen.getByTestId('choose-timer').textContent).toContain('0:00');
  });
});

describe('QuizChoose — sound', () => {
  function stubAudio() {
    const createOscillator = vi.fn(() => ({
      type: '',
      frequency: { setValueAtTime: vi.fn() },
      start: vi.fn(),
      stop: vi.fn(),
      connect: vi.fn(),
    }));
    const ctor = vi.fn(function FakeAudioContext() {
      return {
        currentTime: 0,
        createOscillator,
        createGain: vi.fn(() => ({
          gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
          connect: vi.fn(),
        })),
        destination: {},
      } as unknown as AudioContext;
    });
    vi.stubGlobal('AudioContext', ctor);
    return { ctor, createOscillator };
  }

  it('plays a cue on a pick while sound is on', () => {
    const { createOscillator } = stubAudio();
    renderPlayer();
    fireEvent.click(card('payed / spoke'));
    expect(createOscillator).toHaveBeenCalled();
  });

  it('plays nothing once muted, and the mute survives a remount', () => {
    const { ctor } = stubAudio();
    const { unmount } = renderPlayer();
    fireEvent.click(screen.getByTestId('game-sound-toggle'));
    expect(localStorage.getItem(GAME_SOUND_MUTE_KEY)).toBe('true');
    unmount();

    renderPlayer();
    expect(screen.getByTestId('game-sound-toggle').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(card('payed / spoke'));
    act(() => vi.advanceTimersByTime(2000));
    expect(ctor).not.toHaveBeenCalled();
  });
});
