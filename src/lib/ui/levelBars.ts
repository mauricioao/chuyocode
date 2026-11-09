/**
 * The desk dock's ascending level bars — ONE geometry for both places that
 * draw them: the dock's own level tiles (`DeskScene.astro`, "Ir directo a tu
 * nivel") and the level dropdown's miniature icon (`LevelBars` in
 * `src/components/ui/LevelSelect.tsx`, owner approval 2026-11-09, maquette
 * `propuestas/desplegables` section E: "Alturas del dock … escaladas a 16 px").
 *
 * Pure numbers, no DOM — each caller picks its own colours (the dock uses the
 * light tier fills on its grey tile; the dropdown uses the dark tier tones,
 * since 2px bars in the light ones vanish on white, 1.5:1 and 2:1).
 */
import { LEVELS, type Level } from '@/lib/exerciseTaxonomy';

/** The dock tile's bar heights in px, one per CEFR level, ascending (A1 … C2). */
export const DOCK_BAR_HEIGHTS = [7, 11, 15, 19, 23, 27] as const;

/** A level's CEFR tier letter: A = Básico, B = Intermedio, C = Avanzado. */
export type LevelTier = 'A' | 'B' | 'C';

export function levelTier(level: Level): LevelTier {
  return level[0] as LevelTier;
}

/** How many bars light up: the level's own position in `LEVELS` (A1 → 1 … C2 → 6); none for no level. */
export function filledBarCount(level: Level | null): number {
  return level ? LEVELS.indexOf(level) + 1 : 0;
}

/** The dock heights scaled so the tallest bar is exactly `height` px — same proportions, smaller icon. */
export function miniBarHeights(height: number): number[] {
  const tallest = DOCK_BAR_HEIGHTS[DOCK_BAR_HEIGHTS.length - 1];
  return DOCK_BAR_HEIGHTS.map((h) => (h / tallest) * height);
}
