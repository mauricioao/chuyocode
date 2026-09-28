// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { findVoseo, voseoWords } from '@/lib/neutralSpanish';
import SpeakButton, { COPY, SLOW_RATE } from './SpeakButton';

/** A minimal stand-in for `SpeechSynthesisUtterance` — jsdom ships neither it nor `speechSynthesis`. */
class FakeUtterance {
  text: string;
  lang = '';
  rate = 1;
  voice: unknown = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}

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
    value: FakeUtterance,
    writable: true,
    configurable: true,
  });
  return synth;
}

function uninstallSynth() {
  Reflect.deleteProperty(window, 'speechSynthesis');
  Reflect.deleteProperty(window, 'SpeechSynthesisUtterance');
}

describe('SpeakButton', () => {
  afterEach(() => {
    cleanup();
    uninstallSynth();
  });

  it('renders nothing when speechSynthesis is unsupported', () => {
    uninstallSynth();
    render(<SpeakButton text="Hello" lang="en" />);
    expect(screen.queryByTestId('speak-button')).toBeNull();
  });

  it('renders nothing when there is no speakable text', () => {
    installSynth();
    const { rerender } = render(<SpeakButton text="" lang="en" />);
    expect(screen.queryByTestId('speak-button')).toBeNull();
    rerender(<SpeakButton text="   " lang="en" />);
    expect(screen.queryByTestId('speak-button')).toBeNull();
    rerender(<SpeakButton text={null} lang="en" />);
    expect(screen.queryByTestId('speak-button')).toBeNull();
  });

  it('renders both the normal and slow buttons by default, localized', () => {
    installSynth();
    render(<SpeakButton text="The cat sits." lang="es" />);
    expect(screen.getByRole('button', { name: COPY.es.speak })).not.toBeNull();
    expect(screen.getByRole('button', { name: COPY.es.speakSlow })).not.toBeNull();
  });

  it('falls back to English copy for an unknown locale', () => {
    installSynth();
    render(<SpeakButton text="The cat sits." lang="fr" />);
    expect(screen.getByRole('button', { name: COPY.en.speak })).not.toBeNull();
  });

  it('renders only the normal button in compact mode', () => {
    installSynth();
    render(<SpeakButton text="The cat sits." lang="en" compact />);
    expect(screen.getByTestId('speak-button')).not.toBeNull();
    expect(screen.queryByTestId('speak-button-slow')).toBeNull();
  });

  it('speaks at normal rate when the main button is pressed', () => {
    const synth = installSynth();
    render(<SpeakButton text="The cat sits." lang="en" />);
    fireEvent.click(screen.getByTestId('speak-button'));

    expect(synth.speak).toHaveBeenCalledTimes(1);
    const utterance = synth.speak.mock.calls[0][0] as FakeUtterance;
    expect(utterance.text).toBe('The cat sits.');
    expect(utterance.rate).toBe(1);
  });

  it('speaks at the slow rate when the slow button is pressed', () => {
    const synth = installSynth();
    render(<SpeakButton text="The cat sits." lang="en" />);
    fireEvent.click(screen.getByTestId('speak-button-slow'));

    const utterance = synth.speak.mock.calls[0][0] as FakeUtterance;
    expect(utterance.rate).toBe(SLOW_RATE);
  });

  it('marks the pressed button aria-pressed while speaking, and clears it once done', () => {
    const synth = installSynth();
    render(<SpeakButton text="The cat sits." lang="en" />);
    const normal = screen.getByTestId('speak-button');
    const slow = screen.getByTestId('speak-button-slow');

    expect(normal.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(normal);
    expect(normal.getAttribute('aria-pressed')).toBe('true');
    expect(slow.getAttribute('aria-pressed')).toBe('false');

    const utterance = synth.speak.mock.calls[0][0] as FakeUtterance;
    act(() => utterance.onend?.());
    expect(normal.getAttribute('aria-pressed')).toBe('false');
  });

  it('reads authored ___ blanks as "blank"', () => {
    const synth = installSynth();
    render(<SpeakButton text="The cat ___ on the mat." lang="en" />);
    fireEvent.click(screen.getByTestId('speak-button'));
    const utterance = synth.speak.mock.calls[0][0] as FakeUtterance;
    expect(utterance.text).toBe('The cat blank on the mat.');
  });

  it('uses neutral Spanish copy (no voseo)', () => {
    expect(findVoseo(COPY.es)).toEqual([]);
    // Triangulation: proves the detector this file imports actually fires,
    // so the guard above is not vacuously green.
    expect(voseoWords('Escuchá esta oración.')).toEqual(['Escuchá']);
  });
});
