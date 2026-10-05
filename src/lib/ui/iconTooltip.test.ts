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

  it('the trigger is a real group root (load-bearing for the bubble above) and a >=44px touch target', () => {
    expect(ICON_TOOLTIP_TRIGGER_CLASS).toContain('group');
    expect(ICON_TOOLTIP_TRIGGER_CLASS).toContain('relative');
    expect(ICON_TOOLTIP_TRIGGER_CLASS).toContain('size-11');
  });
});
