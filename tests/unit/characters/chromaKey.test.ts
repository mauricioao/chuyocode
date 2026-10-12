import { describe, expect, it } from 'vitest';
import {
  computeContentBBox,
  despill,
  hueDistance,
  keyAlpha,
  layoutWithPadding,
  rgbToHsv,
  sampleBackground,
  stripSupportLines,
} from '../../../scripts/characters/chromaKey.mjs';

describe('rgbToHsv', () => {
  it('reads pure chroma green as a saturated, bright green hue', () => {
    const { h, s, v } = rgbToHsv(0x5e, 0xf0, 0x20);
    expect(h).toBeGreaterThan(90);
    expect(h).toBeLessThan(120);
    expect(s).toBeGreaterThan(0.8);
    expect(v).toBeGreaterThan(0.9);
  });

  it('gives black zero saturation and zero value', () => {
    expect(rgbToHsv(0, 0, 0)).toEqual({ h: 0, s: 0, v: 0 });
  });

  it('gives white zero saturation and full value', () => {
    const { s, v } = rgbToHsv(255, 255, 255);
    expect(s).toBe(0);
    expect(v).toBe(1);
  });
});

describe('hueDistance', () => {
  it('is zero for identical hues', () => {
    expect(hueDistance(120, 120)).toBe(0);
  });

  it('wraps around 360', () => {
    expect(hueDistance(5, 355)).toBe(10);
  });

  it('is symmetric', () => {
    expect(hueDistance(30, 200)).toBe(hueDistance(200, 30));
  });
});

describe('sampleBackground', () => {
  it('averages the four corners, ignoring a different-colored center', () => {
    const width = 20;
    const height = 20;
    const channels = 4;
    const data = new Uint8ClampedArray(width * height * channels);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * channels;
        data[i] = 0x2e;
        data[i + 1] = 0xdd;
        data[i + 2] = 0x3a;
        data[i + 3] = 255;
      }
    }
    // Paint an unrelated color in the middle, away from every corner sample.
    for (let y = 8; y < 12; y++) {
      for (let x = 8; x < 12; x++) {
        const i = (y * width + x) * channels;
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
      }
    }
    const bg = sampleBackground(data, width, height, channels, 4);
    expect(bg.r).toBeCloseTo(0x2e, 0);
    expect(bg.g).toBeCloseTo(0xdd, 0);
    expect(bg.b).toBeCloseTo(0x3a, 0);
  });
});

describe('keyAlpha', () => {
  const bgHsv = rgbToHsv(0x5e, 0xf0, 0x20);

  it('keys pure background green fully transparent', () => {
    expect(keyAlpha(0x5e, 0xf0, 0x20, bgHsv)).toBe(0);
  });

  it('keeps black ink fully opaque', () => {
    expect(keyAlpha(10, 10, 10, bgHsv)).toBe(255);
  });

  it('keeps white fill fully opaque', () => {
    expect(keyAlpha(250, 250, 248, bgHsv)).toBe(255);
  });

  it('keeps an unrelated saturated color (e.g. skin tone) opaque', () => {
    expect(keyAlpha(0xd9, 0xa5, 0x7a, bgHsv)).toBe(255);
  });

  it('softens a hue-shifted fringe pixel (e.g. JPEG ringing) instead of a hard cut', () => {
    // ~23deg off the sampled background hue, inside the feather band: a
    // hard hue cutoff would leave a visible fringe, so this must land
    // strictly between fully transparent and fully opaque.
    const edge = keyAlpha(77, 153, 83, bgHsv);
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(255);
  });

  it('keys a slightly different green hue (per-image drift) as background too', () => {
    const driftedBg = rgbToHsv(0x2e, 0xdd, 0x3a);
    expect(keyAlpha(0x2e, 0xdd, 0x3a, driftedBg)).toBe(0);
  });
});

describe('despill', () => {
  it('leaves fully opaque pixels untouched', () => {
    expect(despill(10, 20, 10, 255)).toEqual({ r: 10, g: 20, b: 10 });
  });

  it('leaves fully transparent pixels untouched', () => {
    expect(despill(10, 200, 10, 0)).toEqual({ r: 10, g: 200, b: 10 });
  });

  it('pulls a green-dominant semi-transparent edge pixel toward the red/blue ceiling', () => {
    const result = despill(200, 230, 200, 128);
    expect(result.g).toBeLessThan(230);
    expect(result.g).toBeGreaterThanOrEqual(200);
    expect(result.r).toBe(200);
    expect(result.b).toBe(200);
  });

  it('does not boost green when it is not the dominant channel', () => {
    expect(despill(50, 20, 200, 128)).toEqual({ r: 50, g: 20, b: 200 });
  });
});

describe('stripSupportLines', () => {
  function buildGrid(width: number, height: number, fill: (x: number, y: number) => number) {
    const alpha = new Uint8ClampedArray(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) alpha[y * width + x] = fill(x, y);
    }
    return alpha;
  }

  it('removes a long horizontal line flanked by background above and below', () => {
    const width = 100;
    const height = 40;
    const lineY = 20;
    const alpha = buildGrid(width, height, (_x, y) => (y === lineY ? 255 : 0));
    const result = stripSupportLines(alpha, width, height);
    for (let x = 0; x < width; x++) {
      expect(result[lineY * width + x]).toBe(0);
    }
  });

  it('removes a long vertical line flanked by background left and right', () => {
    const width = 40;
    const height = 100;
    const lineX = 20;
    const alpha = buildGrid(width, height, (x, _y) => (x === lineX ? 255 : 0));
    const result = stripSupportLines(alpha, width, height);
    for (let y = 0; y < height; y++) {
      expect(result[y * width + lineX]).toBe(0);
    }
  });

  it('keeps a line segment that touches a body mass on one side (e.g. a chin resting on it)', () => {
    const width = 100;
    const height = 40;
    const lineY = 20;
    // Body mass fills rows 0..19 for x in [40,60): the chin sits right above
    // the line, so that stretch of the line is the body's own bottom edge.
    const alpha = buildGrid(width, height, (x, y) => {
      if (x >= 40 && x < 60 && y < lineY) return 255; // body above
      if (y === lineY) return 255; // the full-width line
      return 0;
    });
    const result = stripSupportLines(alpha, width, height);
    // Background-flanked stretches of the line are gone.
    expect(result[lineY * width + 5]).toBe(0);
    expect(result[lineY * width + 90]).toBe(0);
    // The stretch under the body is left as the body's own contour.
    expect(result[lineY * width + 45]).toBe(255);
  });

  it('leaves a short stroke (e.g. an eyebrow) alone when shorter than the minimum run length', () => {
    const width = 100;
    const height = 40;
    const lineY = 20;
    const alpha = buildGrid(width, height, (x, y) => (y === lineY && x >= 30 && x < 35 ? 255 : 0));
    const result = stripSupportLines(alpha, width, height);
    for (let x = 30; x < 35; x++) {
      expect(result[lineY * width + x]).toBe(255);
    }
  });

  it('does not touch body content far from any background-flanked line', () => {
    const width = 50;
    const height = 50;
    const alpha = buildGrid(width, height, (x, y) => (x > 10 && x < 40 && y > 10 && y < 40 ? 255 : 0));
    const result = stripSupportLines(alpha, width, height);
    expect(Array.from(result)).toEqual(Array.from(alpha));
  });
});

describe('computeContentBBox', () => {
  it('returns null for a fully transparent image', () => {
    const alpha = new Uint8ClampedArray(100);
    expect(computeContentBBox(alpha, 10, 10)).toBeNull();
  });

  it('finds the tight box around opaque content', () => {
    const width = 10;
    const height = 10;
    const alpha = new Uint8ClampedArray(width * height);
    alpha[3 * width + 2] = 255;
    alpha[3 * width + 5] = 255;
    alpha[6 * width + 2] = 255;
    const bbox = computeContentBBox(alpha, width, height);
    expect(bbox).toEqual({ left: 2, right: 5, top: 3, bottom: 6, width: 4, height: 4 });
  });

  it('ignores near-invisible antialiasing dust below the threshold', () => {
    const width = 10;
    const height = 10;
    const alpha = new Uint8ClampedArray(width * height);
    alpha[0] = 3; // dust, below default threshold of 10
    alpha[5 * width + 5] = 255;
    const bbox = computeContentBBox(alpha, width, height);
    expect(bbox).toEqual({ left: 5, right: 5, top: 5, bottom: 5, width: 1, height: 1 });
  });
});

describe('layoutWithPadding', () => {
  const bbox = { left: 0, top: 0, right: 199, bottom: 99, width: 200, height: 100 };

  it('applies uniform ~2% padding on every side when there is no flush edge', () => {
    const layout = layoutWithPadding(bbox);
    expect(layout.pad).toBe(4); // round(200 * 0.02)
    expect(layout.padTop).toBe(4);
    expect(layout.padBottom).toBe(4);
    expect(layout.padLeft).toBe(4);
    expect(layout.padRight).toBe(4);
    expect(layout.outWidth).toBe(208);
    expect(layout.outHeight).toBe(108);
  });

  it('zeroes padding only on the flush edge', () => {
    const layout = layoutWithPadding(bbox, { flushEdge: 'bottom' });
    expect(layout.padBottom).toBe(0);
    expect(layout.padTop).toBe(4);
    expect(layout.padLeft).toBe(4);
    expect(layout.padRight).toBe(4);
    expect(layout.outHeight).toBe(104);
  });
});
