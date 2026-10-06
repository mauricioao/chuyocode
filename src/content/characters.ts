/**
 * Characters — named mascots for the Inglés visual refresh (phase 2, owner
 * reference: town.com's "ligeramente" cheerful treatment layered onto the
 * existing sober "paper and ink" look — soft bubbles, pill labels,
 * highlighted words, and named characters next to key moments).
 *
 * REAL ART (phase 2b): one Open Peeps bust each (Pablo Stanley, CC0 —
 * github.com/openpeeps.com, credited on `/[lang]/creditos`), square-cropped
 * (the source templates are 720×972 portraits; `Character` renders a square
 * sticker, same box as `Emoji`) and run through `scripts/optimize-image.mjs`
 * into `public/images/characters/`, exactly like the Fluent Emoji set
 * (`@lib/emoji.ts`'s own header covers the AVIF/WebP settings).
 *
 * TIGHTER CROP (phase 2c, "larger character art"): re-cropped tighter on the
 * bust (less empty margin around the head/shoulders) so the art still reads
 * clearly at the bigger sizes this pass introduces on content screens (up to
 * 120px CSS — the hub title's floated BRUNO). AVIF + WebP at 128/256px
 * (1x/2x density, so 1x covers every call site up to 128 CSS px), `-v2-`
 * versioned so the re-crop never serves stale bytes under the old `-v1-`
 * URLs. `characterSrcSet`/`characterFallbackSrc` below build those paths
 * from the slug alone, same shape as `emojiSrcSet`/`emojiFallbackSrc`.
 *
 * Each entry's `ready` flag still gates `Character` (`.astro`/`.tsx`, same
 * server/island split as `Emoji.astro`/`Emoji.tsx` over `@lib/emoji.ts`):
 * while `false`, it renders the closest Fluent Emoji sticker
 * (`emojiFallback`) instead, with the SAME uppercase name label. Kept live
 * (not deleted now that every current entry is `true`) so a future sixth
 * character can ship copy-first — fallback art today, real art later — with
 * no component or call-site change either way.
 */
import type { EmojiName } from '@lib/emoji';

export interface CharacterDef {
  /** Uppercase display name rendered letter-spaced beside the art, e.g. "PACO". */
  name: string;
  /** Reserved for a future call site with no adjacent visible name label — every CURRENT call site renders `name` as real text next to the art, so `Character` defaults to a decorative image (`alt=""`) and never reads this on its own (see that component's own header). */
  alt: { es: string; en: string };
  /** Fluent Emoji sticker shown INSTEAD of the real art while `ready` is false. */
  emojiFallback: EmojiName;
  ready: boolean;
}

export const CHARACTERS = {
  paco: {
    name: 'PACO',
    alt: { es: 'Paco', en: 'Paco' },
    emojiFallback: 'llama',
    ready: true,
  },
  luna: {
    name: 'LUNA',
    alt: { es: 'Luna', en: 'Luna' },
    emojiFallback: 'books',
    ready: true,
  },
  mia: {
    name: 'MIA',
    alt: { es: 'Mia', en: 'Mia' },
    emojiFallback: 'sparkles',
    ready: true,
  },
  bruno: {
    name: 'BRUNO',
    alt: { es: 'Bruno', en: 'Bruno' },
    emojiFallback: 'waving-hand',
    ready: true,
  },
  tobi: {
    name: 'TOBI',
    alt: { es: 'Tobi', en: 'Tobi' },
    emojiFallback: 'rocket',
    ready: true,
  },
} as const satisfies Record<string, CharacterDef>;

export type CharacterSlug = keyof typeof CHARACTERS;

/**
 * Asset pipeline for the real art — mirrors `@lib/emoji.ts`'s
 * `emojiSrcSet`/`emojiFallbackSrc` exactly (see that module's own header for
 * why `x` density descriptors are the right shape for a small, fixed-CSS-size
 * sticker). Every character ships at 128/256px — 1x/2x — which comfortably
 * covers every current `Character` call site's `size` prop, up to the hub
 * title's floated 120px BRUNO.
 */
const CHARACTERS_DIR = '/images/characters';
export const CHARACTER_WIDTHS = [128, 256] as const;

/** One format's full `srcset` value for `slug`, e.g. `".../paco-v2-128.avif 1x, .../paco-v2-256.avif 2x"`. */
export function characterSrcSet(slug: CharacterSlug, format: 'avif' | 'webp'): string {
  return CHARACTER_WIDTHS.map((width, index) => `${CHARACTERS_DIR}/${slug}-v2-${width}.${format} ${2 ** index}x`).join(', ');
}

/** The plain `<img src>` fallback for browsers with neither `<picture>` source matching — the smallest WebP. */
export function characterFallbackSrc(slug: CharacterSlug): string {
  return `${CHARACTERS_DIR}/${slug}-v2-${CHARACTER_WIDTHS[0]}.webp`;
}
