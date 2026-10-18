/**
 * Character POSES — the new line-art mascots from the visual-polish pass
 * (DIRECCION-VISUAL.md §4: Vanina the teacher, Paco the desk companion),
 * NOT the older Open Peeps bust badges in `./characters.ts` (`CHARACTERS`,
 * five decorative stickers — `paco`, `luna`, `mia`, `bruno`, `tobi` — used
 * elsewhere on Inglés). A deliberate SIBLING module, not an extension of
 * that one: both files happen to use the slug `paco`, for two unrelated
 * characters, and folding this registry into `CHARACTERS` would collide
 * those two identities under one key.
 *
 * Source: `scripts/characters/process.mjs` chroma-keys the AI-generated
 * poses into transparent PNG masters (`ChuyoCode_others/Personajes/
 * _procesados/<character>/<slug>.png`, outside the repo); this registry
 * describes only the SUBSET `scripts/characters/export-web.mjs` actually
 * exported into `public/images/characters/<character>/<slug>-<width>.
 * {avif,webp}` — the poses a real call site renders today. Adding a new
 * call site means adding a row to BOTH that script's own `POSES` list and
 * `CHARACTER_POSES` below (kept in sync by hand, not generated — see that
 * script's own header), then re-running it.
 *
 * `widths` are the two EXPORTED file widths (1x, 2x pixel density), already
 * baked into each file's own name — unlike `./characters.ts`'s
 * `CHARACTER_WIDTHS`, every pose has its OWN pair here, since these are
 * portrait character cutouts at varying aspect ratios/display sizes, not one
 * uniform square badge.
 *
 * MIRRORED SIDE PEEKS, NEVER A SECOND FILE: the generator always draws a
 * "peeking" pose facing the SAME way regardless of which side it peeks
 * from (owner note, DIRECCION-VISUAL.md §4.5) — e.g. `asoma-izquierda`
 * (peeking from the left) and the mirror image a caller would want for
 * peeking from the RIGHT are the same artwork, flipped. A future caller
 * that needs the opposite side reuses the SAME exported pose with Tailwind's
 * `-scale-x-100` (`transform: scaleX(-1)`) rather than asking
 * `export-web.mjs` to ship a second file — no entry for that mirrored side
 * belongs in this registry. Not needed yet: the one peek wired today
 * (`vanina/asoma-izquierda`, `DeskWindowManager.astro`) only ever shows on
 * one side (the window's own left edge).
 */

type CharacterName = 'vanina' | 'paco';

/** The side that sits flush (zero padding) against whatever UI edge the pose conceptually rests against — `null` when the pose floats free on every side. Mirrors `process.mjs`'s own `flushEdge` entries. */
type FlushEdge = 'top' | 'bottom' | 'left' | 'right' | null;

export interface CharacterPose {
  character: CharacterName;
  slug: string;
  /** `[1x width, 2x width]`, in CSS px — the two file widths actually exported. */
  widths: readonly [number, number];
  flushEdge: FlushEdge;
}

/**
 * Every pose a real call site renders. See each row's own trailing comment
 * for which one. `widths` must match `export-web.mjs`'s own printed output
 * exactly — `characterPoses.test.ts` does not re-derive these from disk (no
 * filesystem access from a unit test), so a re-export with a changed
 * `displayHeightCss` must update the matching row here too.
 */
export const CHARACTER_POSES = {
  'vanina/avatar': {
    character: 'vanina',
    slug: 'avatar',
    widths: [114, 227],
    flushEdge: null,
  }, // DeskHelper.astro's own avatar
  'paco/avatar': {
    character: 'paco',
    slug: 'avatar',
    widths: [69, 137],
    flushEdge: null,
  }, // reserved for a future Paco-as-helper call site; not wired in today
  'vanina/celebra': {
    character: 'vanina',
    slug: 'celebra',
    widths: [99, 198],
    flushEdge: null,
  }, // GameResult: perfect
  'vanina/pulgar-arriba': {
    character: 'vanina',
    slug: 'pulgar-arriba',
    widths: [126, 251],
    flushEdge: null,
  }, // GameResult: good ("¡Muy bien!")
  'vanina/casi': {
    character: 'vanina',
    slug: 'casi',
    widths: [131, 263],
    flushEdge: null,
  }, // GameResult: retry ("¡Casi! Sigue practicando")
  'vanina/asoma-izquierda': {
    character: 'vanina',
    slug: 'asoma-izquierda',
    widths: [40, 80],
    flushEdge: 'right',
  }, // peeking from the exercise window's own outer left edge, desktop only
  'paco/sentado-borde': {
    character: 'paco',
    slug: 'sentado-borde',
    widths: [71, 142],
    flushEdge: null,
  }, // sitting on a desk widget's top edge
} as const satisfies Record<string, CharacterPose>;

export type CharacterPoseKey = keyof typeof CHARACTER_POSES;

const CHARACTERS_DIR = '/images/characters';

/** One format's full `srcset` value for `pose`, e.g. `".../vanina/avatar-114.avif 1x, .../vanina/avatar-227.avif 2x"` — same `x`-density shape `./characters.ts`'s own `characterSrcSet` uses. */
export function characterPoseSrcSet(pose: CharacterPoseKey, format: 'avif' | 'webp'): string {
  const { character, slug, widths } = CHARACTER_POSES[pose];
  return widths.map((width, index) => `${CHARACTERS_DIR}/${character}/${slug}-${width}.${format} ${index + 1}x`).join(', ');
}

/** The plain `<img src>` fallback for browsers with neither `<picture>` source matching — the smallest (1x) WebP. */
export function characterPoseFallbackSrc(pose: CharacterPoseKey): string {
  const { character, slug, widths } = CHARACTER_POSES[pose];
  return `${CHARACTERS_DIR}/${character}/${slug}-${widths[0]}.webp`;
}

/** The 1x file's own intrinsic width — for an `<img width>` attribute (height comes from the caller's own fixed CSS display size). */
export function characterPoseWidth(pose: CharacterPoseKey): number {
  return CHARACTER_POSES[pose].widths[0];
}
