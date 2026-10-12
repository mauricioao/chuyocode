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
 * Removes the thin straight support-line artifact: a long, perfectly flat
 * run of opaque pixels with background immediately flanking it on both
 * sides (above/below for a horizontal run, left/right for a vertical one).
 * A run that is background-flanked on only one side is a body contour (e.g.
 * a chin or fingertip resting on the line) and is left untouched, per spec.
 *
 * Operates on a flat alpha array (row-major, one byte per pixel) and
 * returns a new array; does not mutate the input.
 */
export function stripSupportLines(alpha, width, height, opts = {}) {
  const {
    gap = 5,
    minRunLength = Math.max(20, Math.round(width * 0.01)),
    opaqueThreshold = 40,
    bgThreshold = 16,
  } = opts;
  const out = Uint8ClampedArray.from(alpha);

  const clearRun = (setPixel, start, end) => {
    if (end - start >= minRunLength) {
      for (let i = start; i < end; i++) setPixel(i);
    }
  };

  // Horizontal runs.
  if (height > gap * 2) {
    for (let y = gap; y < height - gap; y++) {
      let runStart = -1;
      for (let x = 0; x <= width; x++) {
        const candidate =
          x < width &&
          alpha[y * width + x] > opaqueThreshold &&
          alpha[(y - gap) * width + x] <= bgThreshold &&
          alpha[(y + gap) * width + x] <= bgThreshold;
        if (candidate) {
          if (runStart === -1) runStart = x;
        } else if (runStart !== -1) {
          clearRun((xx) => {
            out[y * width + xx] = 0;
          }, runStart, x);
          runStart = -1;
        }
      }
    }
  }

  // Vertical runs (independent pass over the original alpha, merged below).
  if (width > gap * 2) {
    for (let x = gap; x < width - gap; x++) {
      let runStart = -1;
      for (let y = 0; y <= height; y++) {
        const candidate =
          y < height &&
          alpha[y * width + x] > opaqueThreshold &&
          alpha[y * width + (x - gap)] <= bgThreshold &&
          alpha[y * width + (x + gap)] <= bgThreshold;
        if (candidate) {
          if (runStart === -1) runStart = y;
        } else if (runStart !== -1) {
          clearRun((yy) => {
            out[yy * width + x] = 0;
          }, runStart, y);
          runStart = -1;
        }
      }
    }
  }

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
