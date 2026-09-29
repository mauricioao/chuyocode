// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import WorksheetPlayer from './WorksheetPlayer';
import type { Zone } from '@/lib/activities/blocks';

const IMAGE = { path: 'activity-images/act-1/img-1.webp', width: 800, height: 400 };

const TEXT_ZONE: Zone = { id: 'z1', x: 0.1, y: 0.2, w: 0.3, h: 0.1, kind: 'text', answers: ['sat'] };
const CHOICE_ZONE: Zone = {
  id: 'z2',
  x: 0.5,
  y: 0.5,
  w: 0.2,
  h: 0.1,
  kind: 'choice',
  answers: ['b'],
  options: ['a', 'b', 'c'],
};

describe('WorksheetPlayer', () => {
  it('renders the image', () => {
    render(<WorksheetPlayer lang="es" image={IMAGE} zones={[]} imageUrl="/img.webp" />);
    const img = screen.getByTestId('worksheet-player').querySelector('img') as HTMLImageElement;
    expect(img.src).toContain('/img.webp');
  });

  it('shows the not-graded notice', () => {
    render(<WorksheetPlayer lang="es" image={IMAGE} zones={[]} imageUrl="/img.webp" />);
    expect(screen.getByTestId('worksheet-player').textContent).toContain('no corrige');
  });

  it('shows the English not-graded notice', () => {
    render(<WorksheetPlayer lang="en" image={IMAGE} zones={[]} imageUrl="/img.webp" />);
    expect(screen.getByTestId('worksheet-player').textContent).toContain('does not grade');
  });

  it('renders a text input for a text zone, positioned by its fractional rect', () => {
    render(<WorksheetPlayer lang="es" image={IMAGE} zones={[TEXT_ZONE]} imageUrl="/img.webp" />);
    const wrapper = screen.getByTestId('player-zone-z1');
    expect(wrapper.style.left).toBe('10%');
    expect(wrapper.style.top).toBe('20%');
    expect(wrapper.style.width).toBe('30%');
    expect(wrapper.style.height).toBe('10%');
    expect(wrapper.querySelector('input[type="text"]')).toBeTruthy();
  });

  it('renders a select with its options for a choice zone', () => {
    render(<WorksheetPlayer lang="es" image={IMAGE} zones={[CHOICE_ZONE]} imageUrl="/img.webp" />);
    const wrapper = screen.getByTestId('player-zone-z2');
    const select = wrapper.querySelector('select');
    expect(select).toBeTruthy();
    const optionValues = Array.from(select?.querySelectorAll('option') ?? []).map((o) => o.value);
    expect(optionValues).toEqual(['', 'a', 'b', 'c']);
  });

  it('renders neither input nor select values pre-filled (not graded, blank start)', () => {
    render(<WorksheetPlayer lang="es" image={IMAGE} zones={[TEXT_ZONE]} imageUrl="/img.webp" />);
    const input = screen.getByTestId('player-zone-z1').querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('');
  });
});

describe('WorksheetPlayer — rotation (creator polish round 2)', () => {
  it('swaps the container aspect ratio for a 90deg rotation', () => {
    render(<WorksheetPlayer lang="es" image={IMAGE} zones={[]} imageUrl="/img.webp" rotation={90} />);
    const container = screen.getByTestId('worksheet-player').querySelector('div.relative') as HTMLElement;
    // IMAGE is 800x400 -> rotated 90deg the displayed size is 400x800.
    expect(container.style.aspectRatio).toBe('400 / 800');
  });

  it('keeps the container aspect ratio unchanged for a 180deg rotation', () => {
    render(<WorksheetPlayer lang="es" image={IMAGE} zones={[]} imageUrl="/img.webp" rotation={180} />);
    const container = screen.getByTestId('worksheet-player').querySelector('div.relative') as HTMLElement;
    expect(container.style.aspectRatio).toBe('800 / 400');
  });

  it('positions a zone by the same fractional rect regardless of rotation (already in the rotated space)', () => {
    render(<WorksheetPlayer lang="es" image={IMAGE} zones={[TEXT_ZONE]} imageUrl="/img.webp" rotation={270} />);
    const wrapper = screen.getByTestId('player-zone-z1');
    expect(wrapper.style.left).toBe('10%');
    expect(wrapper.style.top).toBe('20%');
  });
});

describe('WorksheetPlayer — practice mode (PR D, "Activities practice")', () => {
  it('hides the "not graded" notice when practice is given', () => {
    render(
      <WorksheetPlayer
        lang="es"
        image={IMAGE}
        zones={[]}
        imageUrl="/img.webp"
        practice={{ values: {}, onChange: () => {} }}
      />,
    );
    expect(screen.getByTestId('worksheet-player').textContent).not.toContain('no corrige');
  });

  it('binds a text zone to practice.values and calls onChange while typing', () => {
    const onChange = vi.fn();
    render(
      <WorksheetPlayer
        lang="es"
        image={IMAGE}
        zones={[TEXT_ZONE]}
        imageUrl="/img.webp"
        practice={{ values: { z1: 'sa' }, onChange }}
      />,
    );
    const input = screen.getByTestId('player-zone-z1').querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('sa');
    fireEvent.change(input, { target: { value: 'sat' } });
    expect(onChange).toHaveBeenCalledWith('z1', 'sat');
  });

  it('binds a choice zone to practice.values and calls onChange on selection', () => {
    const onChange = vi.fn();
    render(
      <WorksheetPlayer
        lang="es"
        image={IMAGE}
        zones={[CHOICE_ZONE]}
        imageUrl="/img.webp"
        practice={{ values: {}, onChange }}
      />,
    );
    const select = screen.getByTestId('player-zone-z2').querySelector('select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'b' } });
    expect(onChange).toHaveBeenCalledWith('z2', 'b');
  });

  it('renders no correctness indicator before grading (no results yet)', () => {
    render(
      <WorksheetPlayer
        lang="es"
        image={IMAGE}
        zones={[TEXT_ZONE]}
        imageUrl="/img.webp"
        practice={{ values: {}, onChange: () => {} }}
      />,
    );
    expect(screen.queryByTestId('player-zone-result-z1')).toBeNull();
  });

  it('marks a correct zone with an accessible "Correcto" label', () => {
    render(
      <WorksheetPlayer
        lang="es"
        image={IMAGE}
        zones={[TEXT_ZONE]}
        imageUrl="/img.webp"
        practice={{ values: { z1: 'sat' }, onChange: () => {}, results: { z1: true } }}
      />,
    );
    expect(screen.getByTestId('player-zone-result-z1').textContent).toBe('Correcto');
  });

  it('marks an incorrect zone with an accessible "Incorrecto" label', () => {
    render(
      <WorksheetPlayer
        lang="es"
        image={IMAGE}
        zones={[TEXT_ZONE]}
        imageUrl="/img.webp"
        practice={{ values: { z1: 'dog' }, onChange: () => {}, results: { z1: false } }}
      />,
    );
    expect(screen.getByTestId('player-zone-result-z1').textContent).toBe('Incorrecto');
  });

  it('disables every input once practice.disabled is true', () => {
    render(
      <WorksheetPlayer
        lang="es"
        image={IMAGE}
        zones={[TEXT_ZONE, CHOICE_ZONE]}
        imageUrl="/img.webp"
        practice={{ values: {}, onChange: () => {}, disabled: true }}
      />,
    );
    expect((screen.getByTestId('player-zone-z1').querySelector('input') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByTestId('player-zone-z2').querySelector('select') as HTMLSelectElement).disabled).toBe(true);
  });

  it('re-enables inputs and clears the correctness indicator after Reintentar (results/disabled cleared)', () => {
    const { rerender } = render(
      <WorksheetPlayer
        lang="es"
        image={IMAGE}
        zones={[TEXT_ZONE]}
        imageUrl="/img.webp"
        practice={{ values: { z1: 'dog' }, onChange: () => {}, results: { z1: false }, disabled: true }}
      />,
    );
    expect(screen.getByTestId('player-zone-result-z1')).toBeTruthy();

    rerender(
      <WorksheetPlayer
        lang="es"
        image={IMAGE}
        zones={[TEXT_ZONE]}
        imageUrl="/img.webp"
        practice={{ values: {}, onChange: () => {} }}
      />,
    );
    expect(screen.queryByTestId('player-zone-result-z1')).toBeNull();
    expect((screen.getByTestId('player-zone-z1').querySelector('input') as HTMLInputElement).disabled).toBe(false);
  });
});

describe('WorksheetPlayer — onZoneTap (mobile per-zone bottom sheet)', () => {
  it('renders a tap target instead of an inline input/select when onZoneTap is given', () => {
    render(
      <WorksheetPlayer
        lang="es"
        image={IMAGE}
        zones={[TEXT_ZONE, CHOICE_ZONE]}
        imageUrl="/img.webp"
        practice={{ values: {}, onChange: () => {} }}
        onZoneTap={() => {}}
      />,
    );
    expect(screen.getByTestId('player-zone-z1').querySelector('input')).toBeNull();
    expect(screen.getByTestId('player-zone-z2').querySelector('select')).toBeNull();
    expect(screen.getByTestId('player-zone-tap-z1')).toBeTruthy();
    expect(screen.getByTestId('player-zone-tap-z2')).toBeTruthy();
  });

  it('calls onZoneTap with the zone id when tapped', () => {
    const onZoneTap = vi.fn();
    render(
      <WorksheetPlayer
        lang="es"
        image={IMAGE}
        zones={[TEXT_ZONE]}
        imageUrl="/img.webp"
        practice={{ values: {}, onChange: () => {} }}
        onZoneTap={onZoneTap}
      />,
    );
    fireEvent.click(screen.getByTestId('player-zone-tap-z1'));
    expect(onZoneTap).toHaveBeenCalledWith('z1');
  });

  it('shows the current answer, and the empty placeholder when unanswered', () => {
    const { rerender } = render(
      <WorksheetPlayer
        lang="es"
        image={IMAGE}
        zones={[TEXT_ZONE]}
        imageUrl="/img.webp"
        practice={{ values: {}, onChange: () => {} }}
        onZoneTap={() => {}}
      />,
    );
    expect(screen.getByTestId('player-zone-tap-z1').textContent).toContain('Sin responder');

    rerender(
      <WorksheetPlayer
        lang="es"
        image={IMAGE}
        zones={[TEXT_ZONE]}
        imageUrl="/img.webp"
        practice={{ values: { z1: 'sat' }, onChange: () => {} }}
        onZoneTap={() => {}}
      />,
    );
    expect(screen.getByTestId('player-zone-tap-z1').textContent).toContain('sat');
  });

  it('marks the active zone (the one open in the caller\'s sheet) as pressed', () => {
    render(
      <WorksheetPlayer
        lang="es"
        image={IMAGE}
        zones={[TEXT_ZONE, CHOICE_ZONE]}
        imageUrl="/img.webp"
        practice={{ values: {}, onChange: () => {} }}
        onZoneTap={() => {}}
        activeZoneId="z1"
      />,
    );
    expect(screen.getByTestId('player-zone-tap-z1').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('player-zone-tap-z2').getAttribute('aria-pressed')).toBe('false');
  });

  it('disables every tap target once graded (locked, same as the inline inputs)', () => {
    render(
      <WorksheetPlayer
        lang="es"
        image={IMAGE}
        zones={[TEXT_ZONE]}
        imageUrl="/img.webp"
        practice={{ values: { z1: 'sat' }, onChange: () => {}, results: { z1: true }, disabled: true }}
        onZoneTap={() => {}}
      />,
    );
    expect((screen.getByTestId('player-zone-tap-z1') as HTMLButtonElement).disabled).toBe(true);
  });

  it('still exposes the graded result for a screen reader', () => {
    render(
      <WorksheetPlayer
        lang="es"
        image={IMAGE}
        zones={[TEXT_ZONE]}
        imageUrl="/img.webp"
        practice={{ values: { z1: 'sat' }, onChange: () => {}, results: { z1: true } }}
        onZoneTap={() => {}}
      />,
    );
    expect(screen.getByTestId('player-zone-result-z1').textContent).toBe('Correcto');
  });
});

/**
 * D4 "Escuchar/Listen" — a small speaker affordance for a zone the author
 * gave text to, in both the desktop inline player (this describe block) and
 * the editor's own preview mode (which mounts this exact same component
 * with `practice` omitted). The mobile tap-target (`onZoneTap`) never shows
 * this badge — the mobile sheet gets its own SpeakButton instead, tested in
 * `WorksheetPracticePlayerMobile.test.tsx`.
 */
describe('WorksheetPlayer — speak affordance (D4)', () => {
  function installSynth() {
    Object.defineProperty(window, 'speechSynthesis', {
      value: { getVoices: () => [], speak: vi.fn(), cancel: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      value: class {
        constructor(public text: string) {}
      },
      writable: true,
      configurable: true,
    });
  }

  function uninstallSynth() {
    Reflect.deleteProperty(window, 'speechSynthesis');
    Reflect.deleteProperty(window, 'SpeechSynthesisUtterance');
  }

  it('shows no speak affordance for a zone with no speak text', () => {
    installSynth();
    render(<WorksheetPlayer lang="es" image={IMAGE} zones={[TEXT_ZONE]} imageUrl="/img.webp" />);
    expect(screen.queryByTestId('player-zone-speak-z1')).toBeNull();
    uninstallSynth();
  });

  it('shows a speak affordance for a zone with speak text, in creator preview mode', () => {
    installSynth();
    const zone: Zone = { ...TEXT_ZONE, speak: 'The cat sat on the mat.' };
    render(<WorksheetPlayer lang="es" image={IMAGE} zones={[zone]} imageUrl="/img.webp" />);
    expect(screen.getByTestId('player-zone-speak-z1')).toBeTruthy();
    uninstallSynth();
  });

  it('shows a speak affordance for a zone with speak text, in the real practice player', () => {
    installSynth();
    const zone: Zone = { ...TEXT_ZONE, speak: 'The cat sat on the mat.' };
    render(
      <WorksheetPlayer
        lang="es"
        image={IMAGE}
        zones={[zone]}
        imageUrl="/img.webp"
        practice={{ values: {}, onChange: () => {} }}
      />,
    );
    expect(screen.getByTestId('player-zone-speak-z1')).toBeTruthy();
    uninstallSynth();
  });

  it('never shows the corner badge for the mobile tap-target rendering', () => {
    installSynth();
    const zone: Zone = { ...TEXT_ZONE, speak: 'The cat sat on the mat.' };
    render(
      <WorksheetPlayer
        lang="es"
        image={IMAGE}
        zones={[zone]}
        imageUrl="/img.webp"
        practice={{ values: {}, onChange: () => {} }}
        onZoneTap={() => {}}
      />,
    );
    expect(screen.queryByTestId('player-zone-speak-z1')).toBeNull();
    uninstallSynth();
  });
});
