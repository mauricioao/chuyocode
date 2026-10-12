/**
 * Pure keying math for the character chroma-key pipeline (no I/O, no sharp).
 * `process.mjs` drives sharp around these functions; this module stays
 * framework-free so it can be unit tested with plain typed arrays.
 *
 * The source art is AI-generated black ink line art with pure white fill on
 * a flat chroma-green background (hue varies per image, roughly #5EF020 to
 * #2EDD3A, with JPEG artifacts). Some "support" poses (peeking over a ledge,
 * sitting/leaning/hanging on a box) also carry a thin 1-4px black support
 * line baked into the art that must not survive into the output.
 */

/** RGB (0-255 each) to HSV, hue in degrees [0,360), s/v in [0,1]. */
export function rgbToHsv(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  const v = max;
  return { h, s, v };
}

/** Shortest distance between two hues on the color wheel, in degrees. */
export function hueDistance(h1, h2) {
  const diff = Math.abs(h1 - h2) % 360;
  return diff > 180 ? 360 - diff : diff;
}

/**
 * Averages RGB from the four corners of a raw RGBA/RGB buffer to estimate
 * this image's own background green (the hue drifts per generated image).
 */
export function sampleBackground(data, width, height, channels, sampleSize = 12) {
  const size = Math.max(1, Math.min(sampleSize, Math.floor(Math.min(width, height) / 2)));
  const corners = [
    [0, 0],
    [width - size, 0],
    [0, height - size],
    [width - size, height - size],
  ];
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (const [cx, cy] of corners) {
    for (let y = cy; y < cy + size; y++) {
      for (let x = cx; x < cx + size; x++) {
        const i = (y * width + x) * channels;
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
        n++;
      }
    }
  }
  return { r: r / n, g: g / n, b: b / n };
}

/**
 * Alpha (0-255) for one pixel given the sampled background hue. Near-black
 * ink and near-white fill are always kept opaque regardless of hue (both can
 * sit right next to the green and must never be keyed out); green-hued
 * pixels fade out over a soft feather band so the anti-aliased edge blends
 * instead of hard-cutting.
 */
export function keyAlpha(r, g, b, bgHsv, opts = {}) {
  const { hueTolerance = 16, hueFeather = 16, satMin = 0.22, valueMin = 0.16 } = opts;
  const { h, s, v } = rgbToHsv(r, g, b);
  if (s < satMin || v < valueMin) return 255;
  const hd = hueDistance(h, bgHsv.h);
  if (hd > hueTolerance + hueFeather) return 255;
  if (hd <= hueTolerance) return 0;
  const t = (hd - hueTolerance) / hueFeather;
  return Math.round(255 * (1 - t));
}

/**
 * Suppresses green spill on a partially-transparent edge pixel by pulling
 * the green channel toward the red/blue ceiling. No-ops on fully opaque
 * pixels (the white fill / black ink interior) and fully transparent ones.
 */
export function despill(r, g, b, alpha) {
  if (alpha <= 0 || alpha >= 255) return { r, g, b };
  const ceiling = Math.max(r, b);
  if (g <= ceiling) return { r, g, b };
  const mix = 1 - alpha / 255;
  const newG = g - (g - ceiling) * mix;
  return { r, g: Math.round(newG), b };
}

/**
 * Flood-fills from the canvas border to find the single *exterior*
 * background region — the open page around the character — as opposed to
 * small background-colored pockets fully enclosed by ink (e.g. the gaps
 * between curl loops in dense curly hair, which key out to transparent just
 * like the real background but are not connected to it).
 *
 * `stripSupportLines` uses this to tell "floats in open space" (a real prop
 * line) apart from "happens to have a nearby enclosed gap" (ordinary hair/
 * clothing texture) — both read as nearby transparent pixels, but only the
 * former is actually open.
 *
 * Returns a Uint8Array mask (1 = exterior background) the same size as
 * `alpha`.
 */
export function computeExteriorMask(alpha, width, height, bgThreshold = 16) {
  const mask = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let qHead = 0;
  let qTail = 0;
  const isBg = (idx) => alpha[idx] <= bgThreshold;
  const seed = (idx) => {
    if (isBg(idx) && !mask[idx]) {
      mask[idx] = 1;
      queue[qTail++] = idx;
    }
  };
  for (let x = 0; x < width; x++) {
    seed(x); // top row
    seed((height - 1) * width + x); // bottom row
  }
  for (let y = 0; y < height; y++) {
    seed(y * width); // left column
    seed(y * width + width - 1); // right column
  }
  while (qHead < qTail) {
    const idx = queue[qHead++];
    const x = idx % width;
    const y = (idx - x) / width;
    if (x > 0) seed(idx - 1);
    if (x < width - 1) seed(idx + 1);
    if (y > 0) seed(idx - width);
    if (y < height - 1) seed(idx + width);
  }
  return mask;
}

/**
 * Removes the stray support-line artifact: a long, perfectly straight run of
 * dark ink (a row or column with zero deviation) representing a box/ledge
 * edge the generator baked into "peeking/leaning/sitting/hanging" poses.
 *
 * A straight run alone is not enough to call it a prop line — a hand-drawn
 * body contour (a pant leg, a raised sleeve) is often straight for a long
 * stretch too, and always has solid body fill immediately on its inner side
 * for its *entire* length. A real prop line, by contrast, is drawn as an
 * independent flat surface: somewhere along it, it floats completely free in
 * open background — nothing but background on *both* perpendicular sides —
 * because the line keeps going past where the body actually is. So the test
 * is two-phase per run:
 *
 *   1. Confirm: walking outward from the run on both perpendicular sides,
 *      does some stretch of it reach background on both sides before
 *      reaching solid fill on either? If never, it's a body contour — leave
 *      the whole run untouched.
 *   2. Once confirmed as a prop line, remove it along its *entire* length,
 *      including the stretch that merely touches the body on one side (e.g.
 *      a chin or a hand resting on it — the body is simply cut there, and
 *      the trimmed image's own edge becomes that cut, so no stroke is
 *      needed) — except any stretch genuinely enclosed by body fill on
 *      *both* sides (a decorative line fully inside a sleeve or hem, which
 *      a prop line never actually passes through, but a worth keeping the
 *      distinction for).
 *
 * `dark` flags ink-candidate pixels (opaque + low brightness), computed by
 * the caller from the same despilled RGB used to build `alpha`. `exterior`
 * is the mask from `computeExteriorMask`: only background connected to the
 * canvas border counts as "floating in open space" — an enclosed pocket
 * (e.g. a gap between curl loops in dense hair) never does, no matter how
 * close it sits to a long straight ink run, so ordinary hair/clothing
 * texture is never mistaken for a prop line. Operates on flat row-major
 * arrays and returns a new alpha array; does not mutate.
 */
export function stripSupportLines(alpha, dark, exterior, width, height, opts = {}) {
  const {
    minRunLength = Math.max(50, Math.round(Math.min(width, height) * 0.025)),
    scanDistance = 20,
    fillRun = 3,
    minFloatingPixels = 6,
    fillThreshold = 200,
  } = opts;
  const out = Uint8ClampedArray.from(alpha);

  /**
   * Walks outward from (not including) the run pixel in one direction,
   * looking for the first clear verdict: exterior background (returns
   * 'open') or a run of solid opaque fill (returns 'fill'). 'unknown' if
   * neither is reached within `scanDistance` (stays inside ambiguous/ink
   * pixels, or runs off the canvas).
   */
  function scanSide(getSample, maxSteps) {
    let consecutiveFill = 0;
    for (let s = 1; s <= maxSteps; s++) {
      const sample = getSample(s);
      if (sample === null) return 'open'; // ran off the canvas: nothing out there
      const [a, isDark, isExterior] = sample;
      if (isExterior) return 'open';
      if (a >= fillThreshold && !isDark) {
        consecutiveFill++;
        if (consecutiveFill >= fillRun) return 'fill';
      } else {
        consecutiveFill = 0;
      }
    }
    return 'unknown';
  }

  function processAxis(axisWidth, axisHeight, at, perpAt, writeIndex) {
    // `at(main, cross)` reads the candidate/dark flag along the run;
    // `perpAt(main, cross, step)` reads a perpendicular neighbor `step` away;
    // `writeIndex(main, cross)` maps back to the flat (x, y) alpha index.
    for (let cross = 0; cross < axisHeight; cross++) {
      let runStart = -1;
      for (let main = 0; main <= axisWidth; main++) {
        const isCandidate = main < axisWidth && at(main, cross) === 1;
        if (isCandidate) {
          if (runStart === -1) runStart = main;
          continue;
        }
        if (runStart === -1) continue;
        const runEnd = main;
        if (runEnd - runStart >= minRunLength) {
          const sides = [];
          for (let m = runStart; m < runEnd; m++) {
            const a = scanSide((s) => perpAt(m, cross, -s), scanDistance);
            const b = scanSide((s) => perpAt(m, cross, s), scanDistance);
            sides.push([a, b]);
          }
          const floatingPixels = sides.filter(([a, b]) => a === 'open' && b === 'open').length;
          if (floatingPixels >= minFloatingPixels) {
            // Confirmed prop line: remove everything except stretches fully
            // enclosed by body fill on both sides.
            for (let m = runStart; m < runEnd; m++) {
              const [a, b] = sides[m - runStart];
              if (!(a === 'fill' && b === 'fill')) out[writeIndex(m, cross)] = 0;
            }
          }
        }
        runStart = -1;
      }
    }
  }

  // Horizontal runs: `cross` is the row y, `main` is x.
  processAxis(
    width,
    height,
    (x, y) => dark[y * width + x],
    (x, y, step) => {
      const yy = y + step;
      if (yy < 0 || yy >= height) return null;
      const idx = yy * width + x;
      return [alpha[idx], dark[idx] === 1, exterior[idx] === 1];
    },
    (x, y) => y * width + x,
  );

  // Vertical runs: `cross` is the column x, `main` is y.
  processAxis(
    height,
    width,
    (y, x) => dark[y * width + x],
    (y, x, step) => {
      const xx = x + step;
      if (xx < 0 || xx >= width) return null;
      const idx = y * width + xx;
      return [alpha[idx], dark[idx] === 1, exterior[idx] === 1];
    },
    (y, x) => y * width + x,
  );

  return out;
}

/**
 * Tight bounding box of non-transparent content, or null if the image is
 * empty. `threshold` ignores near-invisible antialiasing dust.
 */
export function computeContentBBox(alpha, width, height, threshold = 10) {
  let left = width;
  let right = -1;
  let top = height;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (alpha[y * width + x] > threshold) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  if (right < left || bottom < top) return null;
  return { left, top, right, bottom, width: right - left + 1, height: bottom - top + 1 };
}

/**
 * Turns a content bbox into the final output canvas geometry: uniform ~2%
 * padding on every side except `flushEdge`, which gets zero padding so the
 * cut sits exactly on the output's edge.
 *
 * @param {{ width: number, height: number }} bbox
 * @param {{ paddingFraction?: number, flushEdge?: 'top' | 'bottom' | 'left' | 'right' | null }} [options]
 */
export function layoutWithPadding(bbox, { paddingFraction = 0.02, flushEdge = null } = {}) {
  const longSide = Math.max(bbox.width, bbox.height);
  const pad = Math.round(longSide * paddingFraction);
  const padTop = flushEdge === 'top' ? 0 : pad;
  const padBottom = flushEdge === 'bottom' ? 0 : pad;
  const padLeft = flushEdge === 'left' ? 0 : pad;
  const padRight = flushEdge === 'right' ? 0 : pad;
  return {
    pad,
    padTop,
    padBottom,
    padLeft,
    padRight,
    outWidth: bbox.width + padLeft + padRight,
    outHeight: bbox.height + padTop + padBottom,
  };
}
