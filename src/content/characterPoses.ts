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
  }, // GameResult: perfect — framing: RESULT_POSE_FRAMING below
  'vanina/pulgar-arriba': {
    character: 'vanina',
    slug: 'pulgar-arriba',
    // Bugfix, same re-export as `vanina/celebra` above; was [126, 251].
    widths: [320, 639],
    flushEdge: null,
  }, // GameResult: good ("¡Muy bien!") — framing: RESULT_POSE_FRAMING below
  'vanina/casi': {
    character: 'vanina',
    slug: 'casi',
    // Bugfix, same re-export as `vanina/celebra` above; was [131, 263].
    widths: [335, 669],
    flushEdge: null,
  }, // GameResult: retry ("¡Casi! Sigue practicando") — framing: RESULT_POSE_FRAMING below
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

/**
 * Framing metadata for `GameResult`'s "equal head size" sizing (owner
 * follow-up bugfix: her size when you do well must be the SAME as when you
 * lose). A pose's box used to be a flat height per breakpoint (`h-64`/
 * `md:h-80`/`lg:h-[28rem]`), cropped by a fixed `translateY(50%)` — then an
 * earlier pass here equalized the visible HEAD-TO-ABDOMEN slice instead
 * (owner spec: "que siempre se la vea desde el ABDOMEN para arriba"). That
 * fixed `pulgar-arriba`'s crop point but broke her SIZE: her master is a
 * tight bust shot whose canvas ends at mid-torso, never reaching a real
 * abdomen, so her `abdomen` fraction was an extrapolated guess sitting
 * unusually CLOSE under her chin — equalizing that short head-to-abdomen
 * slice against the other two poses' own (much taller, real-hem-to-head)
 * slice scaled her WHOLE image up far more than it should have, inflating
 * her head too (owner report, screenshots `vanina-v2/good-*.png`: ~25%
 * bigger than `celebra`/`casi`).
 *
 * This pass equalizes the HEAD itself instead (`headTop` to `chin`), which
 * is immune to that failure mode: `GameResult.tsx` wires `headTop`/`chin`
 * onto `.game-result-vanina` as `--pose-head`/`--pose-chin`, and
 * `global.css`'s own `height: calc(var(--vanina-head) / (var(--pose-chin) -
 * var(--pose-head)))` cancels back out to EXACTLY `--vanina-head` on screen
 * for every pose, regardless of how short or tall its own head-to-chin
 * fraction is — no extrapolation can inflate the whole image anymore. The
 * crop/rest line still comes from `abdomen` (now wired as `--pose-abdomen`
 * and clamped in CSS with `min(var(--pose-abdomen), 1)`): a REAL feature
 * (the sweater's own hem) for `celebra`/`casi`, or a literal `1` — the
 * master's own bottom edge, no crop at all — for `pulgar-arriba`, which has
 * no real abdomen to point at (see that pose's own comment below).
 *
 * All three fractions are 0 = this pose's master PNG's own top row, 1 = its
 * own bottom row. Measured by looking directly at the processed master
 * (`ChuyoCode_others/Personajes/_procesados/vanina/<slug>.png`, outside the
 * repo) and cross-checked with a throwaway `sharp` pixel scan (not a
 * committed script): `headTop` is the first non-transparent row within the
 * image's own horizontal center (30%-70% of its width, clear of a raised
 * arm at the sides); `chin` is the bottom-most point of the jaw, read off a
 * 2x-zoomed gridlined crop and cross-checked against a dark-pixel-fraction
 * row scan of the neck column (the LAST face-ink row before a clean,
 * near-zero "bare neck" gap that precedes the collar); `abdomen` is read off
 * the sweater's own ribbed hem where the master actually shows it, else `1`.
 */
export interface PoseFraming {
  /** Top of the hair, EXCLUDING a raised arm/hand above it. */
  headTop: number;
  /** Bottom of the chin — the bottom-most point of the face/jaw, before the neck. Drives the box-height formula (equal on-screen HEAD size for every outcome pose); see this const's own header above. */
  chin: number;
  /**
   * The abdomen line — just below the chest/ribs, above the waist — where
   * the master actually shows one. Always `<= 1`: a bust-shot master whose
   * canvas never reaches that far down sets this to exactly `1` (its own
   * bottom edge) instead of an extrapolated guess past it — `global.css`'s
   * own `min(var(--pose-abdomen), 1)` is the defensive CSS-side backstop
   * for this same invariant, not the primary mechanism.
   */
  abdomen: number;
}

/**
 * {@link PoseFraming} for exactly the 3 {@link GAME_RESULT_OUTCOME_POSES} —
 * a separate map, not a field on `CharacterPose` itself: `CHARACTER_POSES`
 * is `as const satisfies Record<string, CharacterPose>`, which keeps each
 * entry's own NARROWEST literal type; an optional field present on only 3 of
 * the 7 entries makes `CHARACTER_POSES[key].framing` a type error for a
 * generic `CharacterPoseKey` (TypeScript refuses a property access that's
 * entirely ABSENT — not just `undefined` — from part of a union). Keyed on
 * exactly those 3 string literals (not derived from `GAME_RESULT_OUTCOME_
 * POSES`, which is typed as a plain `readonly CharacterPoseKey[]`) so a 4th
 * key here would be a compile error, not a silently-ignored entry.
 */
export const RESULT_POSE_FRAMING: Record<'vanina/celebra' | 'vanina/pulgar-arriba' | 'vanina/casi', PoseFraming> = {
  'vanina/celebra': {
    // Master is 1336x2380 (full-body jump, arms up). headTop=0.067: first
    // opaque row within columns 30%-70% (y=160) — well clear of the raised
    // arms, which sit outside that band. chin=0.27: the bottom of the open-
    // mouth laugh's jaw (y≈642), right before the turtleneck collar's own
    // ribbed top edge (~0.29) — confirmed against the real 1440x900
    // `vanina-v2/perfect-*.png` screenshot's own on-screen head span too.
    // abdomen=0.47: the sweater's own ribbed hem starts at y=1190 (0.498 —
    // confirmed with a luma scan: its dark-pixel fraction jumps from the
    // cable-knit's ~0.11 baseline to 0.20+ right at that row); 0.47 sits
    // just above it, in the hem's own last plain stretch.
    headTop: 0.067,
    chin: 0.27,
    abdomen: 0.47,
  },
  'vanina/pulgar-arriba': {
    // Master is 1636x2293 (tight bust shot, one thumbs-up hand). headTop=
    // 0.019: first opaque row within columns 30%-70%. chin=0.285: confirmed
    // TWO ways — a 2x-zoomed gridlined crop read, and a dark-pixel-fraction
    // row scan of the neck column (x 42%-62%) showing a clean 7-row ZERO
    // gap (bare neck, no ink at all) from y=0.287 to y=0.308 — chin is the
    // last face-ink row (0.284, darkFrac 0.162) right before that gap.
    // abdomen=1: this master's own canvas ends at mid-torso — it never
    // reaches a real abdomen/hem, so the crop instead rests on the
    // master's OWN bottom edge. Bugfix: the previous value here (0.73) was
    // an extrapolated GUESS with no real feature behind it, sitting
    // unusually close under the chin — equalizing that short head-to-
    // abdomen slice against the other two poses' own taller one is exactly
    // what inflated her whole image, head included, ~25% bigger (owner
    // report, `vanina-v2/good-*.png`); the "equal head size" formula this
    // pose framing now feeds does not have that failure mode, so `abdomen`
    // only ever affects the crop/rest line, never the head's own size.
    headTop: 0.019,
    chin: 0.285,
    abdomen: 1,
  },
  'vanina/casi': {
    // Master is 1776x2378 (tight bust shot, hand on head). headTop=0.019:
    // first opaque row within columns 30%-70%. chin=0.3: 2x-zoomed
    // gridlined crop read, just below the smiling mouth and before the
    // turtleneck collar begins (~0.32-0.34) — confirmed against the real
    // 1440x900 `vanina-v2/retry-*.png` screenshot's own on-screen head span
    // too. abdomen=0.78: unchanged — the sweater's own ribbed hem starts at
    // y=1966 (0.827 — same luma-jump signal as `celebra`'s own, baseline
    // ~0.11 to 0.20+); 0.78 sits just above it, a REAL feature this master
    // actually shows (never an extrapolated guess, unlike `pulgar-arriba`'s
    // own above).
    headTop: 0.019,
    chin: 0.3,
    abdomen: 0.78,
  },
};

/**
 * `pose`'s own {@link PoseFraming} — every caller today only ever asks for
 * one of the 3 `GameResult` outcome poses, which all carry one; throws for
 * any other pose rather than silently sizing it wrong.
 */
export function characterPoseFraming(pose: CharacterPoseKey): PoseFraming {
  const framing = (RESULT_POSE_FRAMING as Partial<Record<CharacterPoseKey, PoseFraming>>)[pose];
  if (!framing) throw new Error(`characterPoseFraming: "${pose}" has no framing metadata`);
  return framing;
}

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
