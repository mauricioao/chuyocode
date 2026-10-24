/**
 * Backdrop presets for an activity's background (plantillas: fondo, owner
 * decision 2026-10-23, `PROPUESTA-PLANTILLAS-2026-10-23.md` §b/§d/§f2) — the
 * one place that maps a stable, persisted {@link BackdropPreset} key to its
 * own CSS custom property and its own i18n label key. Zero I/O, zero React
 * — same posture as `clozeSentences.ts`/`groupSort.ts`. `BackgroundPicker.tsx`
 * and `ModerationBlockPreview.tsx` both read a preset through these two
 * functions rather than each inventing its own mapping.
 *
 * The five keys are STABLE, PERSISTED STRINGS (`blocks.ts`'s own
 * `BackdropPreset`, validated by `parseBlockBackground`) — never rename one;
 * add a new preset instead, with its own gradient in `global.css` and its own
 * label key in `i18n.ts`.
 */
import type { BackdropPreset } from './blocks';

/** The five presets, in the order offered by `BackgroundPicker.tsx`'s own panel (matches the proposal's own §d token list). */
export const BACKDROP_PRESETS: readonly BackdropPreset[] = ['sky', 'mint', 'sun', 'lavender', 'slate'];

/**
 * This preset's own CSS custom property — a `linear-gradient(...)`, defined
 * under `[data-theme='ingles']` in `global.css`'s "Activity backdrops"
 * block. Usable directly as a `background-image`/`background` value.
 */
export function backdropCssVar(preset: BackdropPreset): string {
  return `var(--backdrop-${preset})`;
}

/** This preset's own i18n label key, under `activities.background.*` (`i18n.ts`, both `es`/`en`). An exhaustive switch so a sixth preset fails to compile here until its own label key is added — see this file's own header. */
export function backdropLabelKey(
  preset: BackdropPreset,
): 'presetSky' | 'presetMint' | 'presetSun' | 'presetLavender' | 'presetSlate' {
  switch (preset) {
    case 'sky':
      return 'presetSky';
    case 'mint':
      return 'presetMint';
    case 'sun':
      return 'presetSun';
    case 'lavender':
      return 'presetLavender';
    case 'slate':
      return 'presetSlate';
  }
}
