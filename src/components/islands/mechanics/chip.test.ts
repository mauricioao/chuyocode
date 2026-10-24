/**
 * chip.ts tests — the shared big-stage chip size (owner spec: "aumentar un
 * poco el tamaño y centrar dentro de las cápsulas el texto") and its
 * colour-filled variant (owner spec: "las cápsulas que sean de colores de
 * nuestra paleta"), used by `QuizMatching`/`QuizReorder`/`QuizCloze`/
 * `QuizGroupSort`.
 */
import { describe, expect, it } from 'vitest';
import { BLANK_EMPTY, BLANK_FILLED, CHIP_MATERIAL, CHIP_PLACED, CHIP_STAGE, stageChipColorClass } from './chip';

describe('CHIP_STAGE (shared big-stage chip size)', () => {
  it('is 48px tall, 18px semibold text, ~20px horizontal padding', () => {
    expect(CHIP_STAGE).toContain('min-h-[clamp(3rem,');
    expect(CHIP_STAGE).toContain('text-[clamp(1.125rem,');
    expect(CHIP_STAGE).toContain('font-semibold');
    expect(CHIP_STAGE).toContain('px-[clamp(1.25rem,');
  });

  it('centres its label both horizontally and vertically', () => {
    expect(CHIP_STAGE).toContain('text-center');
    expect(CHIP_STAGE).toContain('items-center');
    expect(CHIP_STAGE).toContain('justify-center');
  });

  it('still hugs its own word — a floor width, not a fixed/stretched one', () => {
    expect(CHIP_STAGE).toContain('min-w-11');
    // A literal `w-<n>` (fixed width) token, never just any string
    // containing "w-" (which `min-w-11` itself would false-positive on).
    expect(CHIP_STAGE.split(/\s+/)).not.toEqual(expect.arrayContaining([expect.stringMatching(/^w-\d/)]));
  });
});

describe('stageChipColorClass (the colour-filled chip variant)', () => {
  it('fills from the shared tile palette by the given index', () => {
    expect(stageChipColorClass(0)).toContain('bg-tile-1');
    expect(stageChipColorClass(1)).toContain('bg-tile-2');
  });

  it('sets white text, never the rest material\'s own ink text colour', () => {
    expect(stageChipColorClass(0)).toContain('text-white');
  });

  it('never fills red or green — those stay reserved for the ✓/✕ marks', () => {
    for (let i = 0; i < 6; i++) {
      const cls = stageChipColorClass(i);
      expect(cls).not.toMatch(/bg-(red|green|success|destructive)/);
    }
  });

  it('uses the matte pressed-key lip shadow token instead of the grey-glass elevation shadow', () => {
    expect(stageChipColorClass(0)).toContain('shadow-[var(--shadow-chip-color)]');
    expect(stageChipColorClass(0)).not.toContain('shadow-elevation-1');
  });

  it('carries the shared "chip-color" class, so global.css can style its own hover without a comma-bearing arbitrary value', () => {
    expect(stageChipColorClass(0).split(/\s+/)).toContain('chip-color');
  });

  it('uses a visible ink outline for focus, not the usual sky ring', () => {
    const cls = stageChipColorClass(0);
    expect(cls).toContain('focus-visible:outline-2');
    expect(cls).toContain('focus-visible:outline-offset-2');
    expect(cls).toContain('focus-visible:outline-foreground');
  });

  it('still carries the shared chip size', () => {
    expect(stageChipColorClass(0)).toContain('min-h-[clamp(3rem,');
    expect(stageChipColorClass(0)).toContain('text-[clamp(1.125rem,');
  });
});

describe('CHIP_MATERIAL (the rest material, activity-templates-polish pass)', () => {
  it('fills with the top-lit grey gradient token, not a flat colour', () => {
    expect(CHIP_MATERIAL).toContain('bg-[image:var(--chip-rest-bg)]');
  });

  it('uses the layered rest shadow token', () => {
    expect(CHIP_MATERIAL).toContain('shadow-[var(--shadow-chip-rest)]');
  });

  // Deliberately NO hover/transition utility of its own — every caller
  // already appends its own (`gameTileTransitionClassName`, or a one-off
  // `hover:-translate-y-*`), and `tailwind-merge` drops whichever one of two
  // same-group utilities is listed FIRST — a shared one here used to lose to
  // `QuizAnagram`/`QuizHangman`'s own (see `chip.ts`'s own header).
  it('declares no hover/transition utility of its own, so a caller\'s own hover never loses to it in tailwind-merge', () => {
    expect(CHIP_MATERIAL).not.toMatch(/\bhover:-translate-y/);
    expect(CHIP_MATERIAL).not.toMatch(/\btransition-\[/);
  });
});

describe('CHIP_PLACED (a tile placed in a box/blank/group)', () => {
  it('uses the raised shadow token, not the generic elevation-2', () => {
    expect(CHIP_PLACED).toContain('shadow-[var(--shadow-chip-raised)]');
    expect(CHIP_PLACED).not.toContain('shadow-elevation-2');
  });
});

describe('BLANK_EMPTY / BLANK_FILLED (the shared well, activity-templates-polish pass)', () => {
  it('BLANK_EMPTY dashes at 1.5px in --input, over the well wash + inset shadow tokens', () => {
    expect(BLANK_EMPTY).toContain('border-[1.5px]');
    expect(BLANK_EMPTY).toContain('border-dashed');
    expect(BLANK_EMPTY).toContain('border-input');
    expect(BLANK_EMPTY).toContain('bg-[var(--well-bg)]');
    expect(BLANK_EMPTY).toContain('shadow-[var(--well-shadow)]');
  });

  it('BLANK_FILLED matches the same 1.5px border width, so filling a well never resizes its box', () => {
    expect(BLANK_FILLED).toContain('border-[1.5px]');
    expect(BLANK_FILLED).toContain('border-solid');
    expect(BLANK_FILLED).toContain('border-transparent');
  });
});
