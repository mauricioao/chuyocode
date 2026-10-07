// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { DESKTOP_QUERY } from '@/hooks/useIsDesktop';
import { renderThenHydrate } from '@/testSupport/hydrationHarness';
import ActivityPracticeIsland from './ActivityPracticeIsland';
import type { Block, WorksheetBlock, QuizBlock } from '@/lib/activities/blocks';

afterEach(() => cleanup());

const WORKSHEET: WorksheetBlock = {
  id: 'w1',
  type: 'worksheet',
  rotation: 0,
  image: { path: 'activity-images/act-1/img-1.webp', width: 800, height: 400 },
  zones: [
    { id: 'z1', x: 0.1, y: 0.1, w: 0.2, h: 0.1, kind: 'text', answers: ['cat'] },
    { id: 'z2', x: 0.5, y: 0.5, w: 0.2, h: 0.1, kind: 'choice', answers: ['blue'], options: ['blue', 'red'] },
  ],
};

const SECOND_WORKSHEET: WorksheetBlock = {
  id: 'w2',
  type: 'worksheet',
  rotation: 0,
  image: { path: 'activity-images/act-1/img-2.webp', width: 800, height: 400 },
  zones: [{ id: 'z3', x: 0.1, y: 0.1, w: 0.2, h: 0.1, kind: 'text', answers: ['dog'] }],
};

const QUIZ: QuizBlock = {
  id: 'q1',
  type: 'quiz',
  payload: {
    pools: {},
    slots: [{ id: 's1', label: 'The cat ___ on the mat', input: 'text', answer: ['sits'] }],
  },
};

function renderIsland(blocks: Block[]) {
  return render(<ActivityPracticeIsland lang="es" blocks={blocks} />);
}

describe('ActivityPracticeIsland — rendering blocks (one at a time)', () => {
  it('renders the only block directly, through the practice player, with no tab bar', () => {
    renderIsland([WORKSHEET]);
    expect(screen.getByTestId('worksheet-player')).toBeTruthy();
    expect(screen.queryByRole('tablist')).toBeNull();
  });

  it('renders a quiz block through the real quiz practice renderer, not a placeholder', () => {
    renderIsland([QUIZ]);
    expect(screen.getByTestId('quiz-practice-q1')).toBeTruthy();
    expect(screen.getByTestId('quiz-slot-s1')).toBeTruthy();
    expect(screen.queryByTestId('worksheet-player')).toBeNull();
  });

  it('mounts only the ACTIVE block — the other tab is not in the DOM at all', () => {
    renderIsland([WORKSHEET, QUIZ]);
    expect(screen.getByTestId('worksheet-player')).toBeTruthy();
    expect(screen.queryByTestId('quiz-practice-q1')).toBeNull();

    fireEvent.click(screen.getByTestId('practice-tab-q1'));

    expect(screen.queryByTestId('worksheet-player')).toBeNull();
    expect(screen.getByTestId('quiz-practice-q1')).toBeTruthy();
  });
});

describe('ActivityPracticeIsland — tab bar (practice player redesign)', () => {
  it('hides the tab bar entirely with a single block — no empty bar, not even to host zoom controls', () => {
    renderIsland([WORKSHEET]);
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryByTestId('practice-tab-w1')).toBeNull();
    expect(screen.queryByTestId('practice-tab-row')).toBeNull();
  });

  it('shows a role="tablist" with a tab per block once there are 2+', () => {
    renderIsland([WORKSHEET, QUIZ]);
    expect(screen.getByRole('tablist')).toBeTruthy();
    expect(screen.getByTestId('practice-tab-w1').textContent).toContain('Hoja 1');
    expect(screen.getByTestId('practice-tab-q1').textContent).toContain('Preguntas');
  });

  it('uses the block\'s own name over the positional default', () => {
    renderIsland([{ ...WORKSHEET, name: 'Mi hoja' }, QUIZ]);
    expect(screen.getByTestId('practice-tab-w1').textContent).toContain('Mi hoja');
  });

  it('marks the active tab with aria-selected', () => {
    renderIsland([WORKSHEET, QUIZ]);
    expect(screen.getByTestId('practice-tab-w1').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('practice-tab-q1').getAttribute('aria-selected')).toBe('false');
    fireEvent.click(screen.getByTestId('practice-tab-q1'));
    expect(screen.getByTestId('practice-tab-w1').getAttribute('aria-selected')).toBe('false');
    expect(screen.getByTestId('practice-tab-q1').getAttribute('aria-selected')).toBe('true');
  });

  it('moves focus and selection with ArrowRight/ArrowLeft, wrapping at the ends', () => {
    renderIsland([WORKSHEET, QUIZ]);
    const w1 = screen.getByTestId('practice-tab-w1');
    const q1 = screen.getByTestId('practice-tab-q1');

    fireEvent.keyDown(w1, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(q1);
    expect(q1.getAttribute('aria-selected')).toBe('true');

    fireEvent.keyDown(q1, { key: 'ArrowRight' }); // wraps past the last tab
    expect(document.activeElement).toBe(w1);

    fireEvent.keyDown(w1, { key: 'ArrowLeft' }); // wraps before the first tab
    expect(document.activeElement).toBe(q1);
  });

  it('Home/End jump to the first/last tab', () => {
    renderIsland([WORKSHEET, SECOND_WORKSHEET, QUIZ]);
    const w1 = screen.getByTestId('practice-tab-w1');
    fireEvent.keyDown(w1, { key: 'End' });
    expect(document.activeElement).toBe(screen.getByTestId('practice-tab-q1'));
    fireEvent.keyDown(screen.getByTestId('practice-tab-q1'), { key: 'Home' });
    expect(document.activeElement).toBe(w1);
  });

  it('only a roving tabIndex=0 tab is in the natural tab order', () => {
    renderIsland([WORKSHEET, QUIZ]);
    expect(screen.getByTestId('practice-tab-w1').tabIndex).toBe(0);
    expect(screen.getByTestId('practice-tab-q1').tabIndex).toBe(-1);
  });

  it('preserves answers in a tab across switching away and back', () => {
    renderIsland([WORKSHEET, QUIZ]);
    const input = screen.getByTestId('player-zone-z1').querySelector('input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'cat' } });

    fireEvent.click(screen.getByTestId('practice-tab-q1'));
    fireEvent.click(screen.getByTestId('practice-tab-w1'));

    const inputAgain = screen.getByTestId('player-zone-z1').querySelector('input') as HTMLInputElement;
    expect(inputAgain.value).toBe('cat');
  });

  it('keeps the zoom slot mounted across every tab (no footer height jump), populated only on a worksheet tab', () => {
    renderIsland([WORKSHEET, QUIZ]);
    expect(screen.getByTestId('worksheet-zoom-slot')).toBeTruthy();
    expect(screen.getByTestId('practice-zoom-in')).toBeTruthy();

    fireEvent.click(screen.getByTestId('practice-tab-q1'));
    expect(screen.getByTestId('worksheet-zoom-slot')).toBeTruthy();
    expect(screen.queryByTestId('practice-zoom-in')).toBeNull();

    fireEvent.click(screen.getByTestId('practice-tab-w1'));
    expect(screen.getByTestId('practice-zoom-in')).toBeTruthy();
  });

  it('never renders a zoom slot for an activity with no worksheet block at all', () => {
    renderIsland([QUIZ]);
    expect(screen.queryByTestId('worksheet-zoom-slot')).toBeNull();
  });

  it('shows each tab its own result once graded, with a green check when every gradable item in it is correct', () => {
    renderIsland([WORKSHEET, QUIZ]);
    const textInput = screen.getByTestId('player-zone-z1').querySelector('input') as HTMLInputElement;
    fireEvent.change(textInput, { target: { value: 'cat' } });
    const select = screen.getByTestId('player-zone-z2').querySelector('select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'blue' } });

    fireEvent.click(screen.getByTestId('practice-tab-q1'));
    const quizInput = screen.getByTestId('quiz-slot-s1').querySelector('input') as HTMLInputElement;
    fireEvent.change(quizInput, { target: { value: 'wrong' } });

    fireEvent.click(screen.getByTestId('practice-check-button'));

    expect(screen.getByTestId('practice-tab-result-w1').textContent).toContain('2/2');
    expect(screen.getByTestId('practice-tab-result-w1').className).toContain('text-success');
    expect(screen.getByTestId('practice-tab-result-q1').textContent).toContain('0/1');
    expect(screen.getByTestId('practice-tab-result-q1').className).not.toContain('text-success');
  });

  it('shows no tab result before Comprobar has run', () => {
    renderIsland([WORKSHEET, QUIZ]);
    expect(screen.queryByTestId('practice-tab-result-w1')).toBeNull();
    expect(screen.queryByTestId('practice-tab-result-q1')).toBeNull();
  });
});

describe('ActivityPracticeIsland — footer (Comprobar/Reintentar, no sticky bar)', () => {
  it('shows no footer when there is nothing gradable at all', () => {
    const unavailableQuiz: QuizBlock = {
      id: 'q2',
      type: 'quiz',
      payload: { pools: {}, slots: [{ id: 's1', label: 'x', input: 'hotspot', answer: ['x'] }] },
    };
    renderIsland([unavailableQuiz]);
    expect(screen.queryByTestId('practice-footer')).toBeNull();
  });

  it('shows Comprobar for a quiz-only activity — a quiz question alone is gradable content', () => {
    renderIsland([QUIZ]);
    expect(screen.getByTestId('practice-footer')).toBeTruthy();
    expect(screen.getByTestId('practice-check-button')).toBeTruthy();
  });

  it('is a plain static row, never a sticky/floating bar', () => {
    renderIsland([QUIZ]);
    expect(screen.getByTestId('practice-footer').className).not.toContain('sticky');
    expect(screen.getByTestId('practice-footer').className).not.toContain('fixed');
  });

  it('puts the zoom controls inside the FOOTER, on the left of Comprobar/Reintentar, for a single worksheet block', () => {
    renderIsland([WORKSHEET]);
    expect(screen.queryByTestId('practice-tab-row')).toBeNull();
    const footer = screen.getByTestId('practice-footer');
    const zoomSlot = screen.getByTestId('worksheet-zoom-slot');
    const checkButton = screen.getByTestId('practice-check-button');
    expect(footer.contains(zoomSlot)).toBe(true);
    expect(footer.contains(checkButton)).toBe(true);
    // Document order: the zoom slot comes before Comprobar (left before right).
    expect(
      zoomSlot.compareDocumentPosition(checkButton) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('shows Comprobar before grading', () => {
    renderIsland([WORKSHEET]);
    expect(screen.getByTestId('practice-check-button')).toBeTruthy();
    expect(screen.queryByTestId('practice-retry-button')).toBeNull();
  });

  it('grades every zone and shows the combined score on Comprobar', () => {
    renderIsland([WORKSHEET]);
    const textInput = screen.getByTestId('player-zone-z1').querySelector('input') as HTMLInputElement;
    fireEvent.change(textInput, { target: { value: 'cat' } });
    const select = screen.getByTestId('player-zone-z2').querySelector('select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'blue' } });

    fireEvent.click(screen.getByTestId('practice-check-button'));

    expect(screen.getByTestId('practice-score').textContent).toContain('2 / 2');
    expect(screen.getByTestId('player-zone-result-z1').textContent).toBe('Correcto');
    expect(screen.getByTestId('player-zone-result-z2').textContent).toBe('Correcto');
  });

  it('combines zones across MULTIPLE worksheet blocks into one score, from the footer regardless of the active tab', () => {
    renderIsland([WORKSHEET, SECOND_WORKSHEET]);
    fireEvent.click(screen.getByTestId('practice-check-button'));
    // Nothing filled in: 0 correct out of 3 total zones (z1, z2, z3).
    expect(screen.getByTestId('practice-score').textContent).toContain('0 / 3');
  });

  describe('result emoji (visual-identity decision, 2026-10-04)', () => {
    it('shows no result emoji before Comprobar has run', () => {
      renderIsland([WORKSHEET]);
      expect(screen.queryByTestId('practice-result-emoji')).toBeNull();
    });

    it('shows the party popper only once every gradable item is correct', () => {
      renderIsland([WORKSHEET]);
      const textInput = screen.getByTestId('player-zone-z1').querySelector('input') as HTMLInputElement;
      fireEvent.change(textInput, { target: { value: 'cat' } });
      const select = screen.getByTestId('player-zone-z2').querySelector('select') as HTMLSelectElement;
      fireEvent.change(select, { target: { value: 'blue' } });

      fireEvent.click(screen.getByTestId('practice-check-button'));

      const img = screen.getByTestId('practice-result-emoji').querySelector('img') as HTMLImageElement;
      expect(img.getAttribute('src')).toContain('party-popper');
    });

    it('shows the thinking face instead once at least one gradable item is wrong', () => {
      renderIsland([WORKSHEET, SECOND_WORKSHEET]);
      // Nothing filled in — every zone grades wrong (0 / 3).
      fireEvent.click(screen.getByTestId('practice-check-button'));

      const img = screen.getByTestId('practice-result-emoji').querySelector('img') as HTMLImageElement;
      expect(img.getAttribute('src')).toContain('thinking-face');
    });
  });

  it('swaps Comprobar for Reintentar once graded', () => {
    renderIsland([WORKSHEET]);
    fireEvent.click(screen.getByTestId('practice-check-button'));
    expect(screen.queryByTestId('practice-check-button')).toBeNull();
    expect(screen.getByTestId('practice-retry-button')).toBeTruthy();
  });

  it('disables inputs once graded', () => {
    renderIsland([WORKSHEET]);
    fireEvent.click(screen.getByTestId('practice-check-button'));
    const textInput = screen.getByTestId('player-zone-z1').querySelector('input') as HTMLInputElement;
    expect(textInput.disabled).toBe(true);
  });

  it('Reintentar clears every answer and result, and re-enables inputs', () => {
    renderIsland([WORKSHEET]);
    const textInput = screen.getByTestId('player-zone-z1').querySelector('input') as HTMLInputElement;
    fireEvent.change(textInput, { target: { value: 'cat' } });
    fireEvent.click(screen.getByTestId('practice-check-button'));

    fireEvent.click(screen.getByTestId('practice-retry-button'));

    expect(screen.queryByTestId('practice-score')).toBeNull();
    expect(screen.queryByTestId('player-zone-result-z1')).toBeNull();
    const freshInput = screen.getByTestId('player-zone-z1').querySelector('input') as HTMLInputElement;
    expect(freshInput.value).toBe('');
    expect(freshInput.disabled).toBe(false);
    expect(screen.getByTestId('practice-check-button')).toBeTruthy();
  });
});

describe('ActivityPracticeIsland — quiz questions grade into the combined score', () => {
  it('grades a quiz-only activity and shows per-question feedback', () => {
    renderIsland([QUIZ]);
    const input = screen.getByTestId('quiz-slot-s1').querySelector('input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'sits' } });

    fireEvent.click(screen.getByTestId('practice-check-button'));

    expect(screen.getByTestId('practice-score').textContent).toContain('1 / 1');
    expect(screen.getByTestId('quiz-slot-result-s1').textContent).toBe('Correcto');
  });

  it('combines worksheet zones AND quiz questions into one score, across tabs', () => {
    renderIsland([WORKSHEET, QUIZ]);
    const zoneInput = screen.getByTestId('player-zone-z1').querySelector('input') as HTMLInputElement;
    fireEvent.change(zoneInput, { target: { value: 'cat' } });
    const zoneSelect = screen.getByTestId('player-zone-z2').querySelector('select') as HTMLSelectElement;
    fireEvent.change(zoneSelect, { target: { value: 'blue' } });

    fireEvent.click(screen.getByTestId('practice-tab-q1'));
    const quizInput = screen.getByTestId('quiz-slot-s1').querySelector('input') as HTMLInputElement;
    fireEvent.change(quizInput, { target: { value: 'wrong' } });

    fireEvent.click(screen.getByTestId('practice-check-button'));

    // 2 correct worksheet zones + 0 correct quiz question, out of 2 + 1 = 3.
    expect(screen.getByTestId('practice-score').textContent).toContain('2 / 3');
    expect(screen.getByTestId('quiz-slot-result-s1').textContent).toBe('Incorrecto');
  });

  it('a quiz slot with no shipped renderer is excluded from the denominator', () => {
    const unavailableQuiz: QuizBlock = {
      id: 'q2',
      type: 'quiz',
      payload: {
        pools: {},
        slots: [
          { id: 's1', label: 'x', input: 'text', answer: ['cat'] },
          { id: 's2', label: 'y', input: 'hotspot', answer: ['z'] },
        ],
      },
    };
    renderIsland([unavailableQuiz]);
    const input = screen.getByTestId('quiz-slot-s1').querySelector('input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'cat' } });

    fireEvent.click(screen.getByTestId('practice-check-button'));

    expect(screen.getByTestId('practice-score').textContent).toContain('1 / 1');
    expect(screen.getByTestId('slot-unavailable-s2')).toBeTruthy();
  });

  it('Reintentar clears quiz answers and results too', () => {
    renderIsland([QUIZ]);
    const input = screen.getByTestId('quiz-slot-s1').querySelector('input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'sits' } });
    fireEvent.click(screen.getByTestId('practice-check-button'));

    fireEvent.click(screen.getByTestId('practice-retry-button'));

    expect(screen.queryByTestId('quiz-slot-result-s1')).toBeNull();
    const freshInput = screen.getByTestId('quiz-slot-s1').querySelector('input') as HTMLInputElement;
    expect(freshInput.value).toBe('');
    expect(freshInput.disabled).toBe(false);
  });
});

/** D4 "Escuchar/Listen" — Comprobar/Reintentar stop whichever question was being read aloud. */
describe('ActivityPracticeIsland — speech (D4)', () => {
  function installSynth() {
    const synth = {
      getVoices: () => [],
      speak: vi.fn(),
      cancel: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    Object.defineProperty(window, 'speechSynthesis', { value: synth, writable: true, configurable: true });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      value: class {
        constructor(public text: string) {}
      },
      writable: true,
      configurable: true,
    });
    return synth;
  }

  afterEach(() => {
    Reflect.deleteProperty(window, 'speechSynthesis');
    Reflect.deleteProperty(window, 'SpeechSynthesisUtterance');
  });

  it('stops speech when Comprobar is pressed', () => {
    const synth = installSynth();
    renderIsland([QUIZ]);

    fireEvent.click(screen.getByTestId('speak-button'));
    synth.cancel.mockClear();
    fireEvent.click(screen.getByTestId('practice-check-button'));

    expect(synth.cancel).toHaveBeenCalled();
  });

  it('stops speech when Reintentar is pressed', () => {
    const synth = installSynth();
    renderIsland([QUIZ]);

    fireEvent.click(screen.getByTestId('practice-check-button'));
    fireEvent.click(screen.getByTestId('speak-button'));
    synth.cancel.mockClear();
    fireEvent.click(screen.getByTestId('practice-retry-button'));

    expect(synth.cancel).toHaveBeenCalled();
  });
});

/** D1 "Una actividad, muchos juegos" — the footer's Comprobar hint while a quiz tab sits in an alternate game mode. */
describe('ActivityPracticeIsland — quiz game modes (D1)', () => {
  const THREE_QUESTION_QUIZ: QuizBlock = {
    id: 'q1',
    type: 'quiz',
    payload: {
      pools: {},
      slots: [
        { id: 's1', label: 'The cat ___ on the mat', input: 'text', answer: ['sits'] },
        { id: 's2', label: 'What color is the sky?', input: 'text', answer: ['blue'] },
        { id: 's3', label: 'How many days in a week?', input: 'text', answer: ['seven'] },
      ],
    },
  };

  it('shows no Comprobar hint while the quiz tab is in Preguntas mode', () => {
    renderIsland([THREE_QUESTION_QUIZ]);
    expect(screen.queryByTestId('practice-quiz-mode-hint')).toBeNull();
  });

  it('shows the Comprobar hint once the tab switches to Tarjetas', () => {
    renderIsland([THREE_QUESTION_QUIZ]);
    fireEvent.click(screen.getByTestId('quiz-game-mode-cards'));
    expect(screen.getByTestId('practice-quiz-mode-hint').textContent).toBe(
      'Comprobar corrige el modo "Preguntas".',
    );
  });

  it('hides the hint again once switched back to Preguntas', () => {
    renderIsland([THREE_QUESTION_QUIZ]);
    fireEvent.click(screen.getByTestId('quiz-game-mode-cards'));
    fireEvent.click(screen.getByTestId('quiz-game-mode-quiz'));
    expect(screen.queryByTestId('practice-quiz-mode-hint')).toBeNull();
  });

  it('preserves Preguntas-mode answers across a switch to Tarjetas and back', () => {
    renderIsland([THREE_QUESTION_QUIZ]);
    const input = screen.getByTestId('quiz-slot-s1').querySelector('input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'sits' } });

    fireEvent.click(screen.getByTestId('quiz-game-mode-cards'));
    expect(screen.getByTestId('quiz-flashcards')).toBeTruthy();

    fireEvent.click(screen.getByTestId('quiz-game-mode-quiz'));
    const inputAgain = screen.getByTestId('quiz-slot-s1').querySelector('input') as HTMLInputElement;
    expect(inputAgain.value).toBe('sits');
  });

  it('also shows the Comprobar hint in Parejas mode, and preserves the underlying quiz block', () => {
    renderIsland([THREE_QUESTION_QUIZ]);
    fireEvent.click(screen.getByTestId('quiz-game-mode-match'));
    expect(screen.getByTestId('quiz-matching')).toBeTruthy();
    expect(screen.getByTestId('practice-quiz-mode-hint').textContent).toBe(
      'Comprobar corrige el modo "Preguntas".',
    );
  });

  it('remembers the chosen mode across a tab switch away and back', () => {
    renderIsland([WORKSHEET, THREE_QUESTION_QUIZ]);
    fireEvent.click(screen.getByTestId('practice-tab-q1'));
    fireEvent.click(screen.getByTestId('quiz-game-mode-cards'));
    expect(screen.getByTestId('quiz-flashcards')).toBeTruthy();

    fireEvent.click(screen.getByTestId('practice-tab-w1'));
    expect(screen.getByTestId('worksheet-player')).toBeTruthy();

    fireEvent.click(screen.getByTestId('practice-tab-q1'));
    expect(screen.getByTestId('quiz-flashcards')).toBeTruthy();
  });
});

describe('ActivityPracticeIsland — hydration (Bug 1, React error #418)', () => {
  // A zone with `speak` and a quiz slot both mount `SpeakButton` — the
  // island's own real path to every island this bug report named.
  const SPEAKABLE_WORKSHEET: WorksheetBlock = {
    ...WORKSHEET,
    zones: [{ ...WORKSHEET.zones[0], speak: 'The cat sits.' }, WORKSHEET.zones[1]],
  };

  it('does not report a recoverable hydration error on a narrow (mobile) viewport', async () => {
    const { recoverableErrors } = await renderThenHydrate(
      () => <ActivityPracticeIsland lang="es" blocks={[SPEAKABLE_WORKSHEET, QUIZ]} />,
      { matches: () => false, speechSynthesisSupported: true },
    );
    expect(recoverableErrors).toEqual([]);
  });

  it('does not report a recoverable hydration error on a wide (desktop) viewport', async () => {
    const { recoverableErrors } = await renderThenHydrate(
      () => <ActivityPracticeIsland lang="es" blocks={[SPEAKABLE_WORKSHEET, QUIZ]} />,
      { matches: (query) => query === DESKTOP_QUERY, speechSynthesisSupported: true },
    );
    expect(recoverableErrors).toEqual([]);
  });

  it('does not report a recoverable hydration error when the browser has no speechSynthesis either', async () => {
    const { recoverableErrors } = await renderThenHydrate(
      () => <ActivityPracticeIsland lang="es" blocks={[SPEAKABLE_WORKSHEET, QUIZ]} />,
      { matches: (query) => query === DESKTOP_QUERY, speechSynthesisSupported: false },
    );
    expect(recoverableErrors).toEqual([]);
  });
});

describe('ActivityPracticeIsland — "Modo enfoque" (full-screen exercise mode, owner spec 2026-10-07)', () => {
  // The real toggle is a plain `<button>` `[id].astro` renders in the
  // window's title bar — a SEPARATE hydration island from this one, wired
  // here by `id` (`FOCUS_MODE_TOGGLE_ID`). Simulated here exactly the way
  // it really exists on the page: a bare DOM node, not part of this
  // component's own render tree.
  function mountToggleButton(): HTMLButtonElement {
    const button = document.createElement('button');
    button.id = 'activity-focus-mode-toggle';
    button.setAttribute('aria-pressed', 'false');
    document.body.appendChild(button);
    return button;
  }

  afterEach(() => {
    document.getElementById('activity-focus-mode-toggle')?.remove();
  });

  it('is not rendered until toggled on', () => {
    mountToggleButton();
    renderIsland([WORKSHEET]);
    expect(screen.queryByTestId('practice-focus-mode')).toBeNull();
  });

  it('opens on a click of the external toggle button, and keeps aria-pressed in sync', () => {
    const toggle = mountToggleButton();
    renderIsland([WORKSHEET]);

    fireEvent.click(toggle);
    expect(screen.getByTestId('practice-focus-mode')).toBeTruthy();
    expect(toggle.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(toggle);
    expect(screen.queryByTestId('practice-focus-mode')).toBeNull();
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
  });

  it('renders the active block inside it — the same practice player, not a placeholder', () => {
    const toggle = mountToggleButton();
    renderIsland([WORKSHEET]);
    fireEvent.click(toggle);
    const focusMode = screen.getByTestId('practice-focus-mode');
    expect(focusMode.querySelector('[data-testid="worksheet-player"]')).toBeTruthy();
  });

  it('shows no page bar for a single-block activity, but always shows Comprobar', () => {
    const toggle = mountToggleButton();
    renderIsland([WORKSHEET]);
    fireEvent.click(toggle);
    expect(screen.queryByTestId('practice-focus-mode-prev')).toBeNull();
    expect(screen.queryByTestId('practice-focus-mode-next')).toBeNull();
    expect(screen.getByTestId('practice-focus-mode-check')).toBeTruthy();
  });

  it('shows the page bar for a multi-block activity, and only shows Comprobar on the LAST page', () => {
    const toggle = mountToggleButton();
    renderIsland([WORKSHEET, QUIZ]);
    fireEvent.click(toggle);

    expect(screen.getByTestId('practice-focus-mode-page').textContent).toBe('1 / 2');
    expect(screen.queryByTestId('practice-focus-mode-check')).toBeNull();

    fireEvent.click(screen.getByTestId('practice-focus-mode-next'));
    expect(screen.getByTestId('practice-focus-mode-page').textContent).toBe('2 / 2');
    expect(screen.getByTestId('practice-focus-mode-check')).toBeTruthy();

    // ‹/› wrap around, same as the normal tab row's own ArrowLeft/Right.
    fireEvent.click(screen.getByTestId('practice-focus-mode-next'));
    expect(screen.getByTestId('practice-focus-mode-page').textContent).toBe('1 / 2');
  });

  it('shares its answers/results with the normal view — nothing resets on enter or exit', () => {
    const toggle = mountToggleButton();
    renderIsland([WORKSHEET]);

    const normalInput = screen.getByTestId('player-zone-z1').querySelector('input') as HTMLInputElement;
    fireEvent.change(normalInput, { target: { value: 'cat' } });

    fireEvent.click(toggle); // enter focus mode
    const focusModeInput = screen
      .getByTestId('practice-focus-mode')
      .querySelector('[data-testid="player-zone-z1"] input') as HTMLInputElement;
    expect(focusModeInput.value).toBe('cat');

    fireEvent.click(screen.getByTestId('practice-focus-mode-check'));
    // WORKSHEET has two zones (z1 filled correctly, z2 left blank).
    expect(screen.getByTestId('practice-focus-mode-score').textContent).toContain('1 / 2');

    fireEvent.click(toggle); // exit focus mode
    // The SAME grading is still reflected in the normal footer — Comprobar
    // was never reset by entering/exiting.
    expect(screen.getByTestId('practice-score').textContent).toContain('1 / 2');
  });

  it('Escape exits focus mode', () => {
    const toggle = mountToggleButton();
    renderIsland([WORKSHEET]);
    fireEvent.click(toggle);
    expect(screen.getByTestId('practice-focus-mode')).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('practice-focus-mode')).toBeNull();
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
  });

  it('the exit control closes it', () => {
    const toggle = mountToggleButton();
    renderIsland([WORKSHEET]);
    fireEvent.click(toggle);
    fireEvent.click(screen.getByTestId('practice-focus-mode-exit'));
    expect(screen.queryByTestId('practice-focus-mode')).toBeNull();
  });

  it('ArrowRight/ArrowLeft change the page while focus mode is active', () => {
    const toggle = mountToggleButton();
    renderIsland([WORKSHEET, QUIZ]);
    fireEvent.click(toggle);
    expect(screen.getByTestId('practice-focus-mode-page').textContent).toBe('1 / 2');

    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(screen.getByTestId('practice-focus-mode-page').textContent).toBe('2 / 2');

    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    expect(screen.getByTestId('practice-focus-mode-page').textContent).toBe('1 / 2');
  });

  it('never hijacks ArrowLeft/ArrowRight while typing in an answer field', () => {
    const toggle = mountToggleButton();
    renderIsland([WORKSHEET, QUIZ]);
    fireEvent.click(toggle);

    const input = screen
      .getByTestId('practice-focus-mode')
      .querySelector('[data-testid="player-zone-z1"] input') as HTMLInputElement;
    input.focus();
    fireEvent.keyDown(input, { key: 'ArrowRight' });

    // Still page 1 — the key reached the input (cursor movement), not the pager.
    expect(screen.getByTestId('practice-focus-mode-page').textContent).toBe('1 / 2');
  });
});
