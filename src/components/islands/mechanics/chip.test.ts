/**
 * chip.ts tests — the shared big-stage chip size (owner spec: "aumentar un
 * poco el tamaño y centrar dentro de las cápsulas el texto") and its
 * colour-filled variant (owner spec: "las cápsulas que sean de colores de
 * nuestra paleta"), used by `QuizMatching`/`QuizReorder`/`QuizCloze`/
 * `QuizGroupSort`.
 */
import { describe, expect, it } from 'vitest';
import { CHIP_STAGE, stageChipColorClass } from './chip';

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

  it('uses a matte pressed-key lip shadow instead of the grey-glass elevation shadow', () => {
    expect(stageChipColorClass(0)).toContain('shadow-[inset_0_-3px_0_rgb(0_0_0/0.18)]');
    expect(stageChipColorClass(0)).not.toContain('shadow-elevation-1');
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
