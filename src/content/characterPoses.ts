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
    // Bugfix (owner report: "sale con blur y pixeleada") — re-exported at
    // `displayHeightCss: 448` (`export-web.mjs`), matching GameResult's own
    // tallest rendered height (`lg:h-[28rem]`); was [99, 198].
    widths: [251, 503],
    flushEdge: null,
  }, // GameResult: perfect
  'vanina/pulgar-arriba': {
    character: 'vanina',
    slug: 'pulgar-arriba',
    // Bugfix, same re-export as `vanina/celebra` above; was [126, 251].
    widths: [320, 639],
    flushEdge: null,
  }, // GameResult: good ("¡Muy bien!")
  'vanina/casi': {
    character: 'vanina',
    slug: 'casi',
    // Bugfix, same re-export as `vanina/celebra` above; was [131, 263].
    widths: [335, 669],
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

/**
 * The 3 poses `GameResult.tsx`'s own `OUTCOME_POSE` ever shows on the
 * end-of-round screen (`perfect` -> `celebra`, `good` -> `pulgar-arriba`,
 * `retry` -> `casi`) — see that module's own comment above `OUTCOME_POSE`.
 * Duplicated here rather than imported FROM there, to avoid a cycle
 * (`GameResult.tsx` already imports this module, for the srcset helpers
 * above) — `GameResult.test.tsx` cross-checks this list against the real
 * `OUTCOME_POSE` export so the two can never silently drift apart.
 */
export const GAME_RESULT_OUTCOME_POSES: readonly CharacterPoseKey[] = [
  'vanina/celebra',
  'vanina/pulgar-arriba',
  'vanina/casi',
];

/** Sentinel for {@link preloadCharacterPoses} — see that function's own header for why it is module-level, not a per-call guard. */
let gameResultPosesPreloaded = false;

/**
 * Warms the browser's HTTP cache for every `GameResult` outcome pose the
 * instant a template activity mounts — long before any round actually ends
 * (bugfix; owner report "Vanina aparece de golpe"; verified diagnosis: her
 * pose `<img>` only became paintable ~180ms after `GameResult` itself
 * mounted on a good connection, much later on a slow one, since nothing had
 * ever fetched it before then — her CSS entrance played out before she had
 * anything to paint). Plain `new Image()` instances, never inserted into
 * the DOM (only the browser's HTTP cache matters here, not a visible
 * element), each carrying the SAME per-format `srcset` the real `<picture>`
 * in `GameResult.tsx` builds from `characterPoseSrcSet` — both `avif` and
 * `webp`, since a bare `Image()` cannot repeat `<picture>`'s own
 * `<source type>` negotiation; this warms whichever candidate the browser
 * ends up actually choosing there instead of guessing just one.
 *
 * IDEMPOTENT for the page's whole life (a module-level flag, not a
 * per-call guard): every template mould reaches this same outcome screen
 * and `QuizBlockPractice` mounts all four of them, so without this flag
 * switching game modes would re-issue the same 6 requests over and over.
 *
 * SSR-safe: `typeof Image === 'undefined'` on the server (Astro SSR) — same
 * guard shape `GameResult.tsx`'s own `typeof document === 'undefined'` uses.
 */
export function preloadCharacterPoses(): void {
  if (gameResultPosesPreloaded || typeof Image === 'undefined') return;
  gameResultPosesPreloaded = true;
  for (const pose of GAME_RESULT_OUTCOME_POSES) {
    for (const format of ['avif', 'webp'] as const) {
      const img = new Image();
      img.srcset = characterPoseSrcSet(pose, format);
      img.src = characterPoseFallbackSrc(pose);
    }
  }
}
