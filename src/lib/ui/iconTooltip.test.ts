import { describe, it, expect } from 'vitest';
import { ICON_TOOLTIP_BUBBLE_CLASS, ICON_TOOLTIP_TRIGGER_CLASS } from './iconTooltip';

// Guards against an accidental regression to the one shared "icon button +
// hover/focus tooltip" pattern (T2: practice page action bar) — both plain
// Astro links and React island buttons depend on these exact class strings.
describe('iconTooltip', () => {
  it('reveals the bubble on hover AND keyboard focus, never only on click/focus-without-visible-focus', () => {
    expect(ICON_TOOLTIP_BUBBLE_CLASS).toContain('group-hover:opacity-100');
    expect(ICON_TOOLTIP_BUBBLE_CLASS).toContain('group-focus-within:opacity-100');
    expect(ICON_TOOLTIP_BUBBLE_CLASS).toContain('opacity-0');
  });

  it('never blocks clicks on whatever sits under it (pointer-events-none)', () => {
    expect(ICON_TOOLTIP_BUBBLE_CLASS).toContain('pointer-events-none');
  });

  it('never forces horizontal scroll, even anchored near a screen edge (viewport-clamped max-width)', () => {
    expect(ICON_TOOLTIP_BUBBLE_CLASS).toContain('max-w-[min(12rem,calc(100vw-2rem))]');
  });

  it('the trigger is a real group root (load-bearing for the bubble above) and a flat 36px touch target at every width (T2 titlebar polish — no more desk:size-11 step-up)', () => {
    expect(ICON_TOOLTIP_TRIGGER_CLASS).toContain('group');
    expect(ICON_TOOLTIP_TRIGGER_CLASS).toContain('relative');
    expect(ICON_TOOLTIP_TRIGGER_CLASS).toContain('size-9');
    expect(ICON_TOOLTIP_TRIGGER_CLASS).not.toContain('desk:size-11');
  });

  // T2 titlebar polish (owner report: "quita los bordes de esos íconos...
  // no aportan nada salvo hacer más alta la barra superior"): the trigger
  // keeps its `border` utility (box model, and a real border still shows on
  // `focus-visible:border-ring`) but is transparent at rest — never
  // `border-border`, which painted a visible square around every icon
  // button for no reason the owner wanted.
  it('never shows a visible border at rest', () => {
    expect(ICON_TOOLTIP_TRIGGER_CLASS).not.toContain('border-border');
  });
});
