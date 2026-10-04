// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
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

  it('fades the image in once it loads, and shows a neutral placeholder instead of the browser glyph on error', () => {
    render(<WorksheetPlayer lang="es" image={IMAGE} zones={[]} imageUrl="/img.webp" />);
    const img = screen.getByTestId('worksheet-player').querySelector('img') as HTMLImageElement;
    expect(img.className).toContain('opacity-0');
    fireEvent.load(img);
    expect(img.className).toContain('opacity-100');

    fireEvent.error(img);
    expect(screen.getByTestId('worksheet-player-image-broken')).toBeTruthy();
    expect(screen.getByTestId('worksheet-player').querySelector('img')).toBeNull();
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

/**
 * Clean zones (practice player redesign): the inline input's font size and
 * placeholder visibility are driven by the ZONE'S OWN RENDERED PIXEL BOX
 * (container measurement * the zone's fractional `w`/`h`), not by a fixed
 * `text-xs`/always-on placeholder. jsdom lays out nothing for real, so every
 * test here mocks `getBoundingClientRect` on the measured container
 * explicitly (same precedent as `WorksheetZoneEditor.test.tsx`'s own guard).
 */
describe('WorksheetPlayer — clean zones (practice player redesign)', () => {
  function mockContainerRect(width: number, height: number) {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width,
      height,
      top: 0,
      left: 0,
      right: width,
      bottom: height,
      x: 0,
      y: 0,
      toJSON: () => {},
    });
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows placeholder copy for a wide-enough zone', () => {
    mockContainerRect(1000, 500);
    const wideZone: Zone = { ...TEXT_ZONE, w: 0.3 }; // 300px wide at this container size
    render(<WorksheetPlayer lang="es" image={IMAGE} zones={[wideZone]} imageUrl="/img.webp" />);
    const input = screen.getByTestId('player-zone-z1').querySelector('input') as HTMLInputElement;
    expect(input.placeholder).toBe('Escribir la respuesta');
  });

  it('hides placeholder copy for a narrow zone (< ~120px rendered width)', () => {
    mockContainerRect(1000, 500);
    const narrowZone: Zone = { ...TEXT_ZONE, w: 0.05 }; // 50px wide at this container size
    render(<WorksheetPlayer lang="es" image={IMAGE} zones={[narrowZone]} imageUrl="/img.webp" />);
    const input = screen.getByTestId('player-zone-z1').querySelector('input') as HTMLInputElement;
    expect(input.placeholder).toBe('');
  });

  it('still exposes the field purpose via aria-label when the placeholder is hidden', () => {
    mockContainerRect(1000, 500);
    const narrowZone: Zone = { ...TEXT_ZONE, w: 0.05 };
    render(<WorksheetPlayer lang="es" image={IMAGE} zones={[narrowZone]} imageUrl="/img.webp" />);
    const input = screen.getByTestId('player-zone-z1').querySelector('input') as HTMLInputElement;
    expect(input.getAttribute('aria-label')).toBe('Escribir la respuesta');
  });

  it("scales the input's font size with the zone's rendered height, within the 11-20px range", () => {
    mockContainerRect(1000, 100); // TEXT_ZONE.h = 0.1 -> 10px, floors at 11px
    render(<WorksheetPlayer lang="es" image={IMAGE} zones={[TEXT_ZONE]} imageUrl="/img.webp" />);
    const input = screen.getByTestId('player-zone-z1').querySelector('input') as HTMLInputElement;
    expect(input.style.fontSize).toBe('11px');
  });

  it('caps the font size at 20px for a very tall zone', () => {
    mockContainerRect(1000, 1000); // TEXT_ZONE.h = 0.1 -> 100px, capped at 20px
    render(<WorksheetPlayer lang="es" image={IMAGE} zones={[TEXT_ZONE]} imageUrl="/img.webp" />);
    const input = screen.getByTestId('player-zone-z1').querySelector('input') as HTMLInputElement;
    expect(input.style.fontSize).toBe('20px');
  });

  it('hides the speaker corner badge until the zone is hovered or focused (opacity-0, shown via group-hover/group-focus-within)', () => {
    mockContainerRect(1000, 500);
    const zone: Zone = { ...TEXT_ZONE, speak: 'The cat sat on the mat.' };
    render(<WorksheetPlayer lang="es" image={IMAGE} zones={[zone]} imageUrl="/img.webp" />);
    const badge = screen.getByTestId('player-zone-speak-z1');
    expect(badge.className).toContain('opacity-0');
    expect(badge.className).toContain('group-hover:opacity-100');
    expect(badge.className).toContain('group-focus-within:opacity-100');
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

  it('keeps every tap target reachable once graded, so the learner can still open it to review (D5, "¿Por qué?" needs the sheet reachable post-grading; the sheet\'s own input is what actually locks)', () => {
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
    expect((screen.getByTestId('player-zone-tap-z1') as HTMLButtonElement).disabled).toBe(false);
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

/**
 * D5 "¿Por qué?" — the explanation affordance for an INCORRECT graded zone
 * that has one, desktop inline player only (the mobile tap-target renders
 * its own explanation inside the bottom sheet instead, tested in
 * `WorksheetPracticePlayerMobile.test.tsx`).
 */
describe('WorksheetPlayer — explanation affordance (D5)', () => {
  const EXPLAINED_ZONE: Zone = { ...TEXT_ZONE, explanation: 'Because "sat" is past tense.' };

  it('shows no explanation button before grading, even with an explanation authored', () => {
    render(
      <WorksheetPlayer
        lang="es"
        image={IMAGE}
        zones={[EXPLAINED_ZONE]}
        imageUrl="/img.webp"
        practice={{ values: {}, onChange: () => {} }}
      />,
    );
    expect(screen.queryByTestId('player-zone-explanation-z1')).toBeNull();
  });

  it('shows no explanation button for a CORRECT zone', () => {
    render(
      <WorksheetPlayer
        lang="es"
        image={IMAGE}
        zones={[EXPLAINED_ZONE]}
        imageUrl="/img.webp"
        practice={{ values: { z1: 'sat' }, onChange: () => {}, results: { z1: true } }}
      />,
    );
    expect(screen.queryByTestId('player-zone-explanation-z1')).toBeNull();
  });

  it('shows no explanation button for an incorrect zone with no explanation authored', () => {
    render(
      <WorksheetPlayer
        lang="es"
        image={IMAGE}
        zones={[TEXT_ZONE]}
        imageUrl="/img.webp"
        practice={{ values: { z1: 'dog' }, onChange: () => {}, results: { z1: false } }}
      />,
    );
    expect(screen.queryByTestId('player-zone-explanation-z1')).toBeNull();
  });

  it('shows the explanation button for an INCORRECT zone that has one', () => {
    render(
      <WorksheetPlayer
        lang="es"
        image={IMAGE}
        zones={[EXPLAINED_ZONE]}
        imageUrl="/img.webp"
        practice={{ values: { z1: 'dog' }, onChange: () => {}, results: { z1: false } }}
      />,
    );
    expect(screen.getByTestId('player-zone-explanation-z1')).toBeTruthy();
  });

  it('the popover is hidden until hovered/focused/clicked, and is properly described via aria-describedby', () => {
    render(
      <WorksheetPlayer
        lang="es"
        image={IMAGE}
        zones={[EXPLAINED_ZONE]}
        imageUrl="/img.webp"
        practice={{ values: { z1: 'dog' }, onChange: () => {}, results: { z1: false } }}
      />,
    );
    const button = screen.getByTestId('player-zone-explanation-button-z1');
    const popover = screen.getByTestId('player-zone-explanation-popover-z1');
    expect(popover.className).toContain('opacity-0');
    expect(popover.className).toContain('group-hover:opacity-100');
    expect(popover.className).toContain('group-focus-within:opacity-100');
    expect(button.getAttribute('aria-describedby')).toBe(popover.id);
    expect(popover.textContent).toBe('Because "sat" is past tense.');
  });

  it('clicking the lightbulb opens the popover (aria-expanded true, opacity-100 class)', () => {
    render(
      <WorksheetPlayer
        lang="es"
        image={IMAGE}
        zones={[EXPLAINED_ZONE]}
        imageUrl="/img.webp"
        practice={{ values: { z1: 'dog' }, onChange: () => {}, results: { z1: false } }}
      />,
    );
    const button = screen.getByTestId('player-zone-explanation-button-z1');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByTestId('player-zone-explanation-popover-z1').className).toContain('opacity-100');
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('never shows the explanation button for the mobile tap-target rendering', () => {
    render(
      <WorksheetPlayer
        lang="es"
        image={IMAGE}
        zones={[EXPLAINED_ZONE]}
        imageUrl="/img.webp"
        practice={{ values: { z1: 'dog' }, onChange: () => {}, results: { z1: false } }}
        onZoneTap={() => {}}
      />,
    );
    expect(screen.queryByTestId('player-zone-explanation-z1')).toBeNull();
  });
});
