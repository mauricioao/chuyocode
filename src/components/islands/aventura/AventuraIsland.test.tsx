// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { findVoseo } from '@/lib/neutralSpanish';
import { parseSceneOrThrow } from '@/lib/aventura/scene';
import AventuraIsland, { COPY, PANEL_STORAGE_KEY } from './AventuraIsland';

const speaker = { name: 'Tom', sprite: 'innkeeper' };

const scene = parseSceneOrThrow({
  id: 'test-scene',
  title: 'Test scene',
  background: 'inn',
  lines: [
    { id: 'l1', speaker, en: 'Hello there!', es: '¡Hola!' },
    {
      id: 'l2',
      speaker,
      en: 'Pick one.',
      es: 'Elige uno.',
      choice: {
        question_es: '¿Cuál es correcta?',
        options: [
          { en: 'Wrong one', correct: false, feedback_es: 'No es correcta.' },
          { en: 'Right one', correct: true, feedback_es: '¡Correcto!' },
        ],
      },
    },
    {
      id: 'l3',
      speaker,
      en: 'The end is near.',
      es: 'El final está cerca.',
      grammar: { title: 'Test grammar', note: 'A test note.' },
    },
  ],
});

/** jsdom ships neither `speechSynthesis` nor `SpeechSynthesisUtterance` — same fake as `SpeakButton.test.tsx`. */
function installSynth() {
  const synth = {
    getVoices: vi.fn(() => []),
    speak: vi.fn(),
    cancel: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, writable: true, configurable: true });
  Object.defineProperty(window, 'SpeechSynthesisUtterance', {
    value: class {
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
    },
    writable: true,
    configurable: true,
  });
}

function uninstallSynth() {
  Reflect.deleteProperty(window, 'speechSynthesis');
  Reflect.deleteProperty(window, 'SpeechSynthesisUtterance');
}

describe('AventuraIsland', () => {
  afterEach(() => {
    cleanup();
    uninstallSynth();
    localStorage.clear();
  });

  it('reveals the first line progressively, and clicking the screen skips the typewriter', () => {
    render(<AventuraIsland scene={scene} lang="es" />);

    const lineEl = screen.getByTestId('aventura-line-en');
    expect(lineEl.textContent).toBe('');

    fireEvent.click(screen.getByTestId('aventura-screen'));
    expect(lineEl.textContent).toBe('Hello there!');
  });

  it('a second click/Enter advances to the next line once the typewriter is done', () => {
    render(<AventuraIsland scene={scene} lang="es" />);

    fireEvent.click(screen.getByTestId('aventura-screen')); // skip
    fireEvent.click(screen.getByTestId('aventura-screen')); // advance

    expect(screen.getByTestId('aventura-choice-menu')).not.toBeNull();
  });

  it('keyboard: Enter finishes typing, then advances', () => {
    render(<AventuraIsland scene={scene} lang="es" />);
    const lineEl = screen.getByTestId('aventura-line-en');

    fireEvent.keyDown(window, { key: 'Enter' });
    expect(lineEl.textContent).toBe('Hello there!');

    fireEvent.keyDown(window, { key: 'Enter' });
    expect(screen.getByTestId('aventura-choice-menu')).not.toBeNull();
  });

  it('choice menu: ArrowDown moves the ► cursor, Enter selects — wrong answer offers retry', () => {
    render(<AventuraIsland scene={scene} lang="es" />);
    fireEvent.keyDown(window, { key: 'Enter' }); // finish typing l1
    fireEvent.keyDown(window, { key: 'Enter' }); // advance to l2 (choice)

    // Default cursor on option 0 ("Wrong one") — select it directly.
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(screen.getByTestId('aventura-choice-feedback').textContent).toBe('No es correcta.');

    fireEvent.click(screen.getByTestId('aventura-choice-retry'));
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    fireEvent.keyDown(window, { key: 'Enter' });

    // Correct now — feedback/retry UI disappears, and advancing (skip then
    // move) reaches line 3.
    expect(screen.queryByTestId('aventura-choice-feedback')).toBeNull();
    fireEvent.keyDown(window, { key: 'Enter' }); // finish typing l2's own line
    fireEvent.keyDown(window, { key: 'Enter' }); // advance to l3

    expect(screen.getByTestId('aventura-grammar-text')).not.toBeNull();
  });

  it('X/Backspace goes back to the previous line, re-asking an unanswered choice', () => {
    render(<AventuraIsland scene={scene} lang="es" />);
    fireEvent.keyDown(window, { key: 'Enter' });
    fireEvent.keyDown(window, { key: 'Enter' }); // now on l2, choice pending

    fireEvent.keyDown(window, { key: 'x' });
    expect(screen.getByTestId('aventura-line-en')).not.toBeNull();
    expect(screen.queryByTestId('aventura-choice-menu')).toBeNull(); // back on l1, no choice

    fireEvent.keyDown(window, { key: 'Enter' });
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(screen.getByTestId('aventura-choice-menu')).not.toBeNull(); // re-asked
  });

  it('reaches the end screen after the last line and can restart', () => {
    render(<AventuraIsland scene={scene} lang="es" />);
    fireEvent.keyDown(window, { key: 'Enter' });
    fireEvent.keyDown(window, { key: 'Enter' }); // l2, choice
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    fireEvent.keyDown(window, { key: 'Enter' }); // correct
    fireEvent.keyDown(window, { key: 'Enter' }); // finish typing l2
    fireEvent.keyDown(window, { key: 'Enter' }); // advance to l3
    fireEvent.keyDown(window, { key: 'Enter' }); // finish typing l3
    fireEvent.keyDown(window, { key: 'Enter' }); // advance -> end

    expect(screen.getByTestId('aventura-end-screen')).not.toBeNull();
    expect(within(screen.getByTestId('aventura-end-screen')).getByText('Test grammar')).not.toBeNull();

    fireEvent.click(screen.getByTestId('aventura-restart'));
    expect(screen.getByTestId('aventura-screen')).not.toBeNull();
  });

  it('translation panel toggle persists to localStorage and hides the translation', () => {
    render(<AventuraIsland scene={scene} lang="es" />);
    expect(screen.getByTestId('aventura-translation-text')).not.toBeNull();

    fireEvent.click(screen.getByTestId('aventura-toggle-translation'));
    expect(screen.queryByTestId('aventura-translation-text')).toBeNull();
    expect(JSON.parse(localStorage.getItem(PANEL_STORAGE_KEY)!)).toEqual({
      translation: false,
      grammar: true,
    });
  });

  it('respects a previously-persisted panel preference on a fresh mount', async () => {
    localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify({ translation: false, grammar: true }));
    render(<AventuraIsland scene={scene} lang="es" />);

    // The preference hydrates in an effect after mount.
    await act(async () => {});
    expect(screen.queryByTestId('aventura-translation-text')).toBeNull();
  });

  it('renders a SpeakButton for the current line', () => {
    installSynth();
    render(<AventuraIsland scene={scene} lang="en" />);
    expect(screen.getByTestId('speak-button')).not.toBeNull();
  });

  it('renders nothing extra when speech is unsupported (no crash)', () => {
    render(<AventuraIsland scene={scene} lang="en" />);
    expect(screen.queryByTestId('speak-button')).toBeNull();
  });

  it('uses neutral Spanish copy (no voseo)', () => {
    expect(findVoseo(COPY.es)).toEqual([]);
  });
});
