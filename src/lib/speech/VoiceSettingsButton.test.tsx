// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { findVoseo, voseoWords } from '@/lib/neutralSpanish';
import VoiceSettingsButton, { COPY } from './VoiceSettingsButton';

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

function installSynth(voices: Array<{ name: string; lang: string; voiceURI?: string; localService?: boolean }> = []) {
  const synth = {
    getVoices: vi.fn(() => voices),
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

const NATURAL = { name: 'Microsoft Aria Online (Natural)', lang: 'en-US', voiceURI: 'natural', localService: false };
const DAVID = { name: 'Microsoft David Desktop - English (United States)', lang: 'en-US', voiceURI: 'david', localService: true };
const SONIA = { name: 'Microsoft Sonia Online (Natural)', lang: 'en-GB', voiceURI: 'sonia', localService: false };

describe('VoiceSettingsButton', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    uninstallSynth();
    window.localStorage.clear();
  });

  it('renders nothing when speechSynthesis is unsupported', () => {
    uninstallSynth();
    render(<VoiceSettingsButton lang="en" />);
    expect(screen.queryByTestId('voice-settings-trigger')).toBeNull();
  });

  it('renders the trigger, collapsed, when supported', () => {
    installSynth([NATURAL]);
    render(<VoiceSettingsButton lang="en" />);
    expect(screen.getByTestId('voice-settings-trigger')).not.toBeNull();
    expect(screen.queryByTestId('voice-settings-panel')).toBeNull();
  });

  it('opens the panel on trigger click and closes it on a second click', () => {
    installSynth([NATURAL]);
    render(<VoiceSettingsButton lang="en" />);
    const trigger = screen.getByTestId('voice-settings-trigger');

    fireEvent.click(trigger);
    expect(screen.getByTestId('voice-settings-panel')).not.toBeNull();

    fireEvent.click(trigger);
    expect(screen.queryByTestId('voice-settings-panel')).toBeNull();
  });

  it('closes on Escape', () => {
    installSynth([NATURAL]);
    render(<VoiceSettingsButton lang="en" />);
    fireEvent.click(screen.getByTestId('voice-settings-trigger'));
    expect(screen.getByTestId('voice-settings-panel')).not.toBeNull();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('voice-settings-panel')).toBeNull();
  });

  it('closes on an outside click', () => {
    installSynth([NATURAL]);
    render(
      <div>
        <VoiceSettingsButton lang="en" />
        <button data-testid="outside">outside</button>
      </div>,
    );
    fireEvent.click(screen.getByTestId('voice-settings-trigger'));
    expect(screen.getByTestId('voice-settings-panel')).not.toBeNull();

    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(screen.queryByTestId('voice-settings-panel')).toBeNull();
  });

  it('marks the US accent pressed by default, switches to UK on click', () => {
    installSynth([NATURAL, SONIA]);
    render(<VoiceSettingsButton lang="en" />);
    fireEvent.click(screen.getByTestId('voice-settings-trigger'));

    const us = screen.getByRole('button', { name: COPY.en.accentUS });
    const uk = screen.getByRole('button', { name: COPY.en.accentUK });
    expect(us.getAttribute('aria-pressed')).toBe('true');
    expect(uk.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(uk);
    expect(uk.getAttribute('aria-pressed')).toBe('true');
    expect(us.getAttribute('aria-pressed')).toBe('false');
  });

  it('lists English voices best-scored first, marking the top one recommended', () => {
    installSynth([DAVID, NATURAL]);
    render(<VoiceSettingsButton lang="en" />);
    fireEvent.click(screen.getByTestId('voice-settings-trigger'));

    const select = screen.getByTestId('voice-settings-select') as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.text);
    expect(options).toEqual(['Microsoft Aria Online (Natural) (Recommended)', 'Microsoft David Desktop - English (United States)']);
    expect(select.value).toBe('natural'); // automatic best pick, no explicit choice made yet
  });

  it('persists an explicit voice choice via the select', () => {
    installSynth([DAVID, NATURAL]);
    render(<VoiceSettingsButton lang="en" />);
    fireEvent.click(screen.getByTestId('voice-settings-trigger'));

    const select = screen.getByTestId('voice-settings-select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'david' } });

    expect(window.localStorage.getItem('chuyocode:speech-voice-preference')).toBe(
      JSON.stringify({ accent: 'US', voiceURI: 'david' }),
    );
  });

  it('shows a "no voices" message instead of the select when there is no English voice', () => {
    installSynth([{ name: 'Español', lang: 'es-ES' }]);
    render(<VoiceSettingsButton lang="en" />);
    fireEvent.click(screen.getByTestId('voice-settings-trigger'));

    expect(screen.queryByTestId('voice-settings-select')).toBeNull();
    expect(screen.getByText(COPY.en.noVoices)).not.toBeNull();
  });

  it('speaks the sample sentence when Probar/Test is pressed', () => {
    const synth = installSynth([NATURAL]);
    render(<VoiceSettingsButton lang="en" />);
    fireEvent.click(screen.getByTestId('voice-settings-trigger'));

    act(() => {
      fireEvent.click(screen.getByTestId('voice-settings-test'));
    });

    expect(synth.speak).toHaveBeenCalledTimes(1);
  });

  it('uses neutral Spanish copy (no voseo)', () => {
    expect(findVoseo(COPY.es)).toEqual([]);
    expect(voseoWords('Elegí tu voz favorita.')).toEqual(['Elegí']);
  });
});
