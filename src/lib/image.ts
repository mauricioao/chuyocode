/**
 * Optimized Sanity image pipeline (spec: sanity-image-pipeline).
 *
 * Wraps `@sanity/image-url` to emit responsive `srcset`/`sizes` plus an LQIP
 * blur-up placeholder, so rendered HTML never ships raw full-resolution Sanity
 * CDN URLs (LCP risk, design decision #5).
 *
 * The GROQ projections in `sanity.ts` resolve a cover to `{ url, lqip }`
 * (`cover.asset->{ url, "lqip": metadata.lqip }`), so this helper accepts an
 * asset stub carrying a `url` (preferred) or a raw `_ref`. Missing/empty assets
 * degrade gracefully to empty output instead of throwing, and a missing `lqip`
 * simply omits the placeholder (design: graceful fallback).
 */
import { loadEnv } from './env';
import { createImageUrlBuilder } from '@sanity/image-url';
import type { ImageUrlBuilder } from '@sanity/image-url';

/**
 * CARD contexts that map to distinct width sets and `sizes` hints. Card
 * components key exhaustive lookups off this union (MediaCard's aspect-ratio
 * `Record<MediaVariant, string>` is exactly such a map), so adding a non-card
 * variant here is a breaking change — see {@link HeroVariant}.
 */
export type MediaVariant = 'poster' | 'wide' | 'ranked';

/**
 * HERO-only contexts (spec: hero-logo-background). Kept OUTSIDE
 * {@link MediaVariant} on purpose: neither is a card, and folding them into the
 * card union breaks every exhaustive `Record<MediaVariant, …>` a card component
 * owns. Splitting the unions makes the distinction load-bearing instead of
 * relying on reviewers to remember it.
 */
export type HeroVariant = 'hero' | 'logo';

/** Every variant {@link buildImage} accepts: cards plus hero-only contexts. */
export type ImageVariant = MediaVariant | HeroVariant;

/**
 * Minimal asset reference shape produced by the cover GROQ projection.
 *
 * `url` is the resolved CDN URL (from `cover.asset->url`); `metadata.lqip` is
 * Sanity's auto-generated base64 blur placeholder. `_ref` is accepted as a
 * fallback for callers that pass an unresolved reference.
 */
export interface SanityAssetRef {
  _ref?: string;
  url?: string;
  metadata?: { lqip?: string; dimensions?: { w: number; h: number } };
}

/** Input to {@link buildImage}: the cover asset plus an optional document id. */
export interface BuildImageInput {
  asset?: SanityAssetRef | null;
  _id?: string;
}

/** Render-ready image attributes for an `<img>` element. */
export interface BuildImageResult {
  /** Fallback `src` (largest width of the variant). */
  src: string;
  /** Responsive candidates: `<url> <w>w` descriptors joined by `, `. */
  srcset: string;
  /** `sizes` hint tuned per variant. */
  sizes: string;
  /** Base64 blur-up placeholder, present only when metadata provides it. */
  lqip?: string;
}

/**
 * Variant → responsive width descriptors. Each set has ≥3 widths so the
 * generated `srcset` always satisfies the spec's minimum descriptor count.
 */
const VARIANT_WIDTHS: Record<ImageVariant, readonly number[]> = {
  poster: [360, 480, 640, 768],
  wide: [640, 960, 1280, 1920],
  ranked: [320, 420, 560],
  // `hero` exists because `wide` is tuned for Spotlight's two-column slot
  // (`(min-width: 1024px) 38rem, 100vw`). The HeroCarousel slide is a
  // FULL-BLEED `h-[72vh]` billboard, so reusing `wide` there shipped a `sizes`
  // hint that understates the real rendered width on desktop — the browser
  // could pick a candidate far too small for the LCP image. `hero` declares the
  // truth (`100vw`) and adds a 2560 candidate for wide/HiDPI displays.
  hero: [960, 1280, 1920, 2560],
  // `logo` is a title-treatment PNG rendered inside the hero info panel.
  // CSS cap: max-w-[14rem] mobile / max-w-[22rem] sm+ → rendered at ~352 CSS px
  // on desktop. On 2× displays that needs ~704 device px; on 3× phones the
  // 14rem (224 CSS px) needs ~672 device px. The original set topped at 480w,
  // so every HiDPI screen upscaled — the ENTIRE POINT of a crisp title treatment
  // was defeated. Extended to 960 to cover 2× desktop comfortably and most of
  // 3× at this capped size. DPR reasoning mirrors the `hero` variant above.
  logo: [240, 360, 480, 720, 960],
};

/** Variant → `sizes` attribute value (viewport-aware layout hints). */
const VARIANT_SIZES: Record<ImageVariant, string> = {
  poster: '(min-width: 640px) 18rem, 12rem',
  wide: '(min-width: 1024px) 38rem, 100vw',
  ranked: '11rem',
  hero: '100vw',
  logo: '(min-width: 640px) 22rem, 14rem',
};

/**
 * Lazily-created shared builder, configured from the same env the Sanity client
 * uses. Created once per process; URL parsing works from a full `url` source
 * even though projectId/dataset are still required by the builder.
 */
let builder: ImageUrlBuilder | undefined;

function getBuilder(): ImageUrlBuilder {
  if (!builder) {
    const env = loadEnv();
    builder = createImageUrlBuilder({
      projectId: env.SANITY_PROJECT_ID,
      dataset: env.SANITY_DATASET,
    });
  }
  return builder;
}

/**
 * Resolve the `@sanity/image-url` source from an asset ref. Prefers the
 * projected `url`; falls back to a raw `_ref`. Returns `undefined` when neither
 * is present so callers can short-circuit to a safe empty result.
 */
function toSource(asset: SanityAssetRef): { asset: { url: string } } | { _ref: string } | undefined {
  if (typeof asset.url === 'string' && asset.url.length > 0) {
    return { asset: { url: asset.url } };
  }
  if (typeof asset._ref === 'string' && asset._ref.length > 0) {
    return { _ref: asset._ref };
  }
  return undefined;
}

/**
 * Build responsive image attributes for a cover asset and card variant.
 *
 * Each `srcset` candidate is generated with `?w=<width>&auto=format`; `src`
 * uses the widest variant width. On a missing or empty asset every string field
 * is empty and `lqip` is omitted, so consumers render nothing rather than a
 * broken image. When `metadata.lqip` is absent the placeholder is omitted while
 * the responsive attributes still render (design: graceful fallback).
 */
export function buildImage(
  input: BuildImageInput,
  variant: ImageVariant,
): BuildImageResult {
  const widths = VARIANT_WIDTHS[variant];
  const sizes = VARIANT_SIZES[variant];
  const asset = input.asset ?? undefined;
  const source = asset ? toSource(asset) : undefined;

  if (!source) {
    // Missing/empty asset: safe default with no URLs and no placeholder.
    return { src: '', srcset: '', sizes };
  }

  const b = getBuilder();
  const candidates = widths.map((w) => {
    const url = b.image(source).width(w).auto('format').url();
    return `${url} ${w}w`;
  });
  const largest = widths[widths.length - 1];
  const src = b.image(source).width(largest).auto('format').url();

  const lqip = asset?.metadata?.lqip;

  return {
    src,
    srcset: candidates.join(', '),
    sizes,
    ...(typeof lqip === 'string' && lqip.length > 0 ? { lqip } : {}),
  };
}
