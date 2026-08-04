/**
 * Random-side sections utility (random-side-news-layout).
 *
 * Pure function that takes raw `sections[]` from {@link ARTICLE_BY_SLUG_QUERY},
 * assigns a per-request `side` for each section via an injectable `rng`, and
 * selects the correct-language body. Designed for strict TDD: zero I/O, zero
 * mocks, injectable randomness.
 */
import type { Lang } from './i18n';

export interface SectionImage {
  asset?: { url?: string; metadata?: { lqip?: string } } | null;
}

export interface SectionInput {
  image?: SectionImage | null;
  alt?: string;
  body?: { es?: unknown; en?: unknown } | null;
}

export interface BuiltSection {
  /** The raw image asset stub (passed through for buildImage). */
  image: SectionImage;
  /** Coalesced alt text (defaults to ''). */
  alt: string;
  /** The selected block array for the active locale (lang > es > ''). */
  body: unknown;
  /** Random side for this SSR request. */
  side: 'left' | 'right';
}

/**
 * Shape section inputs into render-ready built sections.
 *
 * @param sections - Raw section array from Sanity (null-safe).
 * @param lang     - Active locale ('es' | 'en').
 * @param rng      - Injectable random-number callback (defaults to `Math.random`).
 */
export function buildSections(
  sections: SectionInput[] | null | undefined,
  lang: Lang,
  rng: () => number = Math.random,
): BuiltSection[] {
  if (!Array.isArray(sections)) {
    return [];
  }
  if (sections.length === 0) {
    return [];
  }

  return sections.map((section) => {
    const image: SectionImage = section?.image ?? {};
    const alt = section?.alt ?? '';

    // lang > es > ''
    const body: unknown =
      section?.body?.[lang] ?? section?.body?.es ?? '';

    const side: 'left' | 'right' = rng() > 0.5 ? 'left' : 'right';

    return { image, alt, body, side };
  });
}
