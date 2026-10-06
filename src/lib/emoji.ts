/**
 * Emoji — shared slug list + srcset math for the Fluent Emoji sticker accents
 * (visual-identity decision, 2026-10-04: "papel y tinta, ordenado" — cream
 * paper and ink, hand-drawn people, and Microsoft Fluent Emoji 3D as small
 * "sticker" accents used sparingly at key moments).
 *
 * Fluent Emoji is MIT licensed (github.com/microsoft/fluentui-emoji,
 * "Copyright (c) Microsoft Corporation") — credited on `/[lang]/creditos`.
 *
 * One source of truth so `Emoji.astro` (plain pages/components) and
 * `Emoji.tsx` (React islands) can never drift apart on which slugs exist or
 * how their responsive sources are built.
 *
 * Assets are pre-generated, never at request time, via
 * `pnpm images:optimize <input> public/images/emoji <slug>-v1 64 128 256`
 * from a curated set of Fluent Emoji 3D PNGs kept OUTSIDE the repo
 * (`ChuyoCode_others/Ingles/emoji/`, same posture as the home's Inglés
 * banner source — see `scripts/optimize-image.mjs`'s own header for the
 * AVIF/WebP quality settings).
 *
 * Every slug ships at exactly three raster widths (64/128/256px), used as
 * DENSITY descriptors (1x/2x/4x) rather than width descriptors: unlike the
 * home's Inglés banner (a full-bleed image whose CSS width varies with the
 * viewport, needing `w` descriptors + `sizes`), this component always
 * renders at a small, FIXED CSS size (the `size` prop — a sticker accent,
 * 32-64px) — so `x` descriptors are the right shape here.
 */

/** Every slug currently shipped. Extend this (plus the matching assets under `public/images/emoji/`) to add a new sticker. */
export const EMOJI_NAMES = [
  'party-popper',
  'star-struck',
  'thinking-face',
  'light-bulb',
  'books',
  'llama',
  'trophy',
  'sparkles',
  'waving-hand',
  'rocket',
  // Desk hub folders ("desktop" redesign PART 3, owner spec 2026-10-06):
  // "Actividades de la comunidad" and the "Para ti hoy" folder's star.
  'busts-in-silhouette',
  'glowing-star',
] as const;

export type EmojiName = (typeof EMOJI_NAMES)[number];

/** Raster widths every slug ships at, in density order (64 -> 1x, 128 -> 2x, 256 -> 4x). */
export const EMOJI_WIDTHS = [64, 128, 256] as const;

const EMOJI_DIR = '/images/emoji';

/** One format's full `srcset` value for `name`, e.g. `".../party-popper-v1-64.avif 1x, .../party-popper-v1-128.avif 2x, .../party-popper-v1-256.avif 4x"`. */
export function emojiSrcSet(name: EmojiName, format: 'avif' | 'webp'): string {
  return EMOJI_WIDTHS.map((width, index) => `${EMOJI_DIR}/${name}-v1-${width}.${format} ${2 ** index}x`).join(', ');
}

/** The plain `<img src>` fallback for browsers with neither `<picture>` source matching — the smallest WebP. */
export function emojiFallbackSrc(name: EmojiName): string {
  return `${EMOJI_DIR}/${name}-v1-${EMOJI_WIDTHS[0]}.webp`;
}
