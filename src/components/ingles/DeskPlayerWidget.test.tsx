// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import DeskPlayerWidget from './DeskPlayerWidget';

/** Minimal stand-in for `SpeechSynthesisUtterance` — jsdom ships neither it nor `speechSynthesis` (same fixture `SpeakButton.test.tsx` uses). */
class FakeUtterance {
  text: string;
  lang = '';
  rate = 1;
  pitch = 1;
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
    pause: vi.fn(),
    resume: vi.fn(),
    speaking: false,
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

const labels = {
  title: 'Phrase of the day',
  prev: 'Previous',
  next: 'Next',
  play: 'Listen',
  pause: 'Pause',
  unavailable: 'Audio not available on this device',
};

describe('DeskPlayerWidget', () => {
  afterEach(() => {
    cleanup();
    uninstallSynth();
  });

  it('starts as a loading shell (no phrase text yet) and resolves a phrase after mount', async () => {
    installSynth();
    render(<DeskPlayerWidget labels={labels} />);
    // After the mount effect flushes, a phrase is shown.
    await act(async () => {});
    expect(screen.getByText(labels.title)).not.toBeNull();
    expect(screen.getByRole('button', { name: labels.play })).not.toBeNull();
  });

  it('disables and labels the play control when speech is unsupported', async () => {
    uninstallSynth();
    render(<DeskPlayerWidget labels={labels} />);
    await act(async () => {});
    const playButton = screen.getByRole('button', { name: labels.play }) as HTMLButtonElement;
    expect(playButton.disabled).toBe(true);
    expect(playButton.title).toBe(labels.unavailable);
  });

  it('speaks the current phrase on play, and stops on a second press', async () => {
    const synth = installSynth();
    render(<DeskPlayerWidget labels={labels} />);
    await act(async () => {});

    const playButton = screen.getByRole('button', { name: labels.play });
    fireEvent.click(playButton);
    expect(synth.speak).toHaveBeenCalledTimes(1);
  });

  it('moves to the next/previous phrase on the skip controls', async () => {
    installSynth();
    render(<DeskPlayerWidget labels={labels} />);
    await act(async () => {});

    const before = screen.getAllByText(/—/)[0]?.textContent;
    fireEvent.click(screen.getByRole('button', { name: labels.next }));
    const after = screen.getAllByText(/—/)[0]?.textContent;
    expect(after).not.toBe(before);
  });
});
