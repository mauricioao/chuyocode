import { describe, expect, it } from 'vitest';
import {
  computeContentBBox,
  computeExteriorMask,
  despill,
  hueDistance,
  keyAlpha,
  layoutWithPadding,
  removeLineDebrisComponents,
  rgbToHsv,
  sampleBackground,
  stripSupportLines,
  trimFlushResidue,
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

describe('computeExteriorMask', () => {
  it('marks background connected to the canvas border as exterior', () => {
    const width = 10;
    const height = 10;
    const alpha = new Uint8ClampedArray(width * height); // all background
    const mask = computeExteriorMask(alpha, width, height);
    expect(Array.from(mask)).toEqual(Array.from({ length: width * height }, () => 1));
  });

  it('does not mark a background-colored pocket fully enclosed by opaque ink as exterior', () => {
    // A 10x10 opaque ring with one transparent pixel sealed in the middle —
    // like a gap between curl loops in dense hair: it keys out the same as
    // real background, but ink surrounds it on every side.
    const width = 10;
    const height = 10;
    const alpha = new Uint8ClampedArray(width * height).fill(255); // opaque everywhere
    alpha[5 * width + 5] = 0; // one sealed background-colored pocket
    const mask = computeExteriorMask(alpha, width, height);
    expect(mask[5 * width + 5]).toBe(0);
  });
});

describe('stripSupportLines', () => {
  // Small, fast settings for test grids: a run only needs to reach
  // minRunLength to be considered, scanSide only needs a couple of steps to
  // read a clear verdict, and 2 open-background pixels are enough to confirm
  // a run as a genuine floating prop line.
  const opts = { minRunLength: 10, scanDistance: 6, fillRun: 2, minFloatingPixels: 3 };

  function buildGrids(width: number, height: number, fill: (x: number, y: number) => { a: number; d?: boolean }) {
    const alpha = new Uint8ClampedArray(width * height);
    const dark = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const { a, d } = fill(x, y);
        alpha[y * width + x] = a;
        dark[y * width + x] = d ? 1 : 0;
      }
    }
    const exterior = computeExteriorMask(alpha, width, height);
    return { alpha, dark, exterior };
  }

  it('removes a long horizontal ink run floating free in background on both sides', () => {
    const width = 100;
    const height = 40;
    const lineY = 20;
    const { alpha, dark, exterior } = buildGrids(width, height, (_x, y) => (y === lineY ? { a: 255, d: true } : { a: 0 }));
    const result = stripSupportLines(alpha, dark, exterior, width, height, opts);
    for (let x = 0; x < width; x++) expect(result[lineY * width + x]).toBe(0);
  });

  it('removes a long vertical ink run floating free in background on both sides', () => {
    const width = 40;
    const height = 100;
    const lineX = 20;
    const { alpha, dark, exterior } = buildGrids(width, height, (x, _y) => (x === lineX ? { a: 255, d: true } : { a: 0 }));
    const result = stripSupportLines(alpha, dark, exterior, width, height, opts);
    for (let y = 0; y < height; y++) expect(result[y * width + lineX]).toBe(0);
  });

  it('removes the whole confirmed line, including the stretch that merely touches a body mass on one side', () => {
    const width = 100;
    const height = 40;
    const lineY = 20;
    // Body fill sits directly above the line for x in [40,60) (e.g. a chin
    // resting on the ledge) — floating stretches on both sides confirm the
    // run as a real prop line, so even the body-adjacent stretch is cut:
    // the body's own edge is simply the trimmed image boundary there.
    const { alpha, dark, exterior } = buildGrids(width, height, (x, y) => {
      if (y === lineY) return { a: 255, d: true }; // the full-width ink run
      if (x >= 40 && x < 60 && y < lineY) return { a: 255 }; // body fill above, not ink
      return { a: 0 };
    });
    const result = stripSupportLines(alpha, dark, exterior, width, height, opts);
    for (let x = 0; x < width; x++) expect(result[lineY * width + x]).toBe(0);
  });

  it('keeps a stretch of a confirmed line that is genuinely enclosed by body fill on both sides', () => {
    const width = 100;
    const height = 40;
    const lineY = 20;
    const { alpha, dark, exterior } = buildGrids(width, height, (x, y) => {
      if (y === lineY) return { a: 255, d: true }; // the full-width ink run
      // Fill sandwiches the run on both sides only for x in [40,60).
      if (x >= 40 && x < 60 && (y < lineY ? lineY - y <= 5 : y - lineY <= 5)) return { a: 255 };
      return { a: 0 };
    });
    const result = stripSupportLines(alpha, dark, exterior, width, height, opts);
    for (let x = 40; x < 60; x++) expect(result[lineY * width + x]).toBe(255);
    expect(result[lineY * width + 5]).toBe(0);
    expect(result[lineY * width + 90]).toBe(0);
  });

  it('never flags a run shorter than the minimum run length', () => {
    const width = 100;
    const height = 40;
    const lineY = 20;
    const { alpha, dark, exterior } = buildGrids(width, height, (x, y) =>
      y === lineY && x >= 30 && x < 35 ? { a: 255, d: true } : { a: 0 },
    );
    const result = stripSupportLines(alpha, dark, exterior, width, height, opts);
    for (let x = 30; x < 35; x++) expect(result[lineY * width + x]).toBe(255);
  });

  it('preserves a long straight body contour that always has fill on one side (never floats on both)', () => {
    // A pant-leg-like edge: a dead-straight ink run with solid fabric fill
    // immediately on its inner side for its entire length, and open
    // background on its outer side. It never floats free on both sides, so
    // despite being long, straight, and background-adjacent, it must never
    // be mistaken for a prop line.
    const width = 60;
    const height = 50;
    const lineX = 20;
    const { alpha, dark, exterior } = buildGrids(width, height, (x, y) => {
      const inContour = y >= 5 && y < 45;
      if (x === lineX && inContour) return { a: 255, d: true };
      if (x > lineX && x <= lineX + 5 && inContour) return { a: 255 }; // fabric fill, inner side
      return { a: 0 }; // open background, outer side
    });
    const result = stripSupportLines(alpha, dark, exterior, width, height, opts);
    expect(Array.from(result)).toEqual(Array.from(alpha));
  });

  it('preserves every edge of a filled, dark-outlined shape (closed contour, never floats on both sides)', () => {
    const width = 60;
    const height = 50;
    const rect = { left: 10, top: 10, right: 50, bottom: 40 };
    const { alpha, dark, exterior } = buildGrids(width, height, (x, y) => {
      const onBorder = (x === rect.left || x === rect.right - 1) && y >= rect.top && y < rect.bottom
        ? true
        : (y === rect.top || y === rect.bottom - 1) && x >= rect.left && x < rect.right;
      if (onBorder) return { a: 255, d: true };
      const inside = x > rect.left && x < rect.right - 1 && y > rect.top && y < rect.bottom - 1;
      if (inside) return { a: 255 }; // white fill interior
      return { a: 0 };
    });
    const result = stripSupportLines(alpha, dark, exterior, width, height, opts);
    expect(Array.from(result)).toEqual(Array.from(alpha));
  });

  it('does not touch opaque content that was never classified as ink (dark=false)', () => {
    const width = 50;
    const height = 50;
    const { alpha, dark, exterior } = buildGrids(width, height, (x, y) => (x > 10 && x < 40 && y > 10 && y < 40 ? { a: 255 } : { a: 0 }));
    const result = stripSupportLines(alpha, dark, exterior, width, height, opts);
    expect(Array.from(result)).toEqual(Array.from(alpha));
  });

  it('does not mistake a dense-hair-like texture (ink riddled with small sealed gaps) for a prop line', () => {
    // Simulates curly hair: a big dark mass with many small background-
    // colored pockets (the gaps between curl loops) that are NOT connected
    // to the real exterior background. A long straight dark run threading
    // between those pockets must survive, because every "background" pixel
    // it finds nearby is a sealed pocket, never the real exterior.
    const width = 80;
    const height = 80;
    const { alpha, dark, exterior } = buildGrids(width, height, (x, y) => {
      const inHair = x >= 5 && x < 75 && y >= 5 && y < 75;
      if (!inHair) return { a: 0 }; // real exterior background around the hair mass
      const pocket = x % 6 === 2 && y % 6 === 2; // small sealed pockets every 6px
      if (pocket) return { a: 0 };
      return { a: 255, d: true }; // dense ink
    });
    const result = stripSupportLines(alpha, dark, exterior, width, height, opts);
    // The long straight probe row/column through the hair mass is untouched.
    for (let x = 30; x < 50; x++) expect(result[40 * width + x]).toBe(255);
    for (let y = 30; y < 50; y++) expect(result[y * width + 40]).toBe(255);
  });

  it('keeps a solid hair block fully opaque when a 2px support line runs straight through it', () => {
    // A solid block (hair) 40px tall, 60px wide — far thicker than any real
    // ink stroke — crossed by a 2px-thick line that extends well past the
    // block into open background on both ends. The block must survive
    // untouched (it is never even a *candidate*, being far too thick); only
    // the thin stretches of the line outside the block must go.
    const width = 100;
    const height = 60;
    const block = { left: 20, right: 80, top: 10, bottom: 50 };
    const lineRows = [29, 30];
    const { alpha, dark, exterior } = buildGrids(width, height, (x, y) => {
      const inBlock = x >= block.left && x < block.right && y >= block.top && y < block.bottom;
      const onLine = lineRows.includes(y);
      if (inBlock || onLine) return { a: 255, d: true };
      return { a: 0 };
    });
    const result = stripSupportLines(alpha, dark, exterior, width, height, opts);
    // The block is fully opaque, including the rows the line passes through.
    for (let y = block.top; y < block.bottom; y++) {
      for (let x = block.left; x < block.right; x++) {
        expect(result[y * width + x]).toBe(255);
      }
    }
    // The line is gone everywhere outside the block.
    for (const y of lineRows) {
      for (let x = 0; x < block.left; x++) expect(result[y * width + x]).toBe(0);
      for (let x = block.right; x < width; x++) expect(result[y * width + x]).toBe(0);
    }
  });
});

describe('removeLineDebrisComponents', () => {
  function buildGrids(width: number, height: number, fill: (x: number, y: number) => { a: number; d?: boolean }) {
    const alpha = new Uint8ClampedArray(width * height);
    const dark = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const { a, d } = fill(x, y);
        alpha[y * width + x] = a;
        dark[y * width + x] = d ? 1 : 0;
      }
    }
    return { alpha, dark };
  }

  it('keeps two disconnected filled shapes (e.g. body + a gripping hand) and removes a thin fill-less stub', () => {
    const width = 100;
    const height = 60;
    const body = { left: 5, right: 50, top: 5, bottom: 55 }; // 45x50, white fill
    const hand = { left: 70, right: 80, top: 10, bottom: 20 }; // 10x10, disconnected, white fill
    const stubY = 55;
    const stub = { left: 85, right: 95 }; // 10px long, 1px thick, bare ink, disconnected
    const { alpha, dark } = buildGrids(width, height, (x, y) => {
      const inBody = x >= body.left && x < body.right && y >= body.top && y < body.bottom;
      const inHand = x >= hand.left && x < hand.right && y >= hand.top && y < hand.bottom;
      if (inBody || inHand) return { a: 255 }; // white fill, not ink
      if (y === stubY && x >= stub.left && x < stub.right) return { a: 255, d: true }; // bare ink stub
      return { a: 0 };
    });
    const { alpha: result, totalBefore, totalAfter } = removeLineDebrisComponents(alpha, dark, width, height);
    expect(result[10 * width + 10]).toBe(255); // body kept
    expect(result[15 * width + 75]).toBe(255); // hand kept, despite being the smaller, separate shape
    expect(result[stubY * width + 90]).toBe(0); // stub removed
    expect(totalAfter).toBeLessThan(totalBefore);
  });

  it('never drops a component that has white fill, no matter how small relative to the rest', () => {
    const width = 100;
    const height = 100;
    const big = { left: 5, right: 90, top: 5, bottom: 90 }; // dominates total opaque area
    const tiny = { left: 95, right: 98, top: 95, bottom: 98 }; // 3x3, disconnected, white fill
    const { alpha, dark } = buildGrids(width, height, (x, y) => {
      const inBig = x >= big.left && x < big.right && y >= big.top && y < big.bottom;
      const inTiny = x >= tiny.left && x < tiny.right && y >= tiny.top && y < tiny.bottom;
      return inBig || inTiny ? { a: 255 } : { a: 0 };
    });
    const { alpha: result } = removeLineDebrisComponents(alpha, dark, width, height);
    expect(result[96 * width + 96]).toBe(255);
  });

  it('drops a tiny fill-less speck of dust', () => {
    const width = 200;
    const height = 200;
    const body = { left: 10, right: 190, top: 10, bottom: 190 };
    const { alpha, dark } = buildGrids(width, height, (x, y) => {
      if (x >= body.left && x < body.right && y >= body.top && y < body.bottom) return { a: 255 };
      if (x === 5 && y === 5) return { a: 255, d: true }; // isolated 1px ink speck
      return { a: 0 };
    });
    const { alpha: result } = removeLineDebrisComponents(alpha, dark, width, height);
    expect(result[5 * width + 5]).toBe(0);
    expect(result[100 * width + 100]).toBe(255);
  });

  it('leaves a fully transparent image untouched', () => {
    const width = 10;
    const height = 10;
    const alpha = new Uint8ClampedArray(width * height);
    const dark = new Uint8Array(width * height);
    const { alpha: result, totalBefore, totalAfter } = removeLineDebrisComponents(alpha, dark, width, height);
    expect(Array.from(result)).toEqual(Array.from(alpha));
    expect(totalBefore).toBe(0);
    expect(totalAfter).toBe(0);
  });
});

describe('trimFlushResidue', () => {
  function buildGrids(width: number, height: number, fill: (x: number, y: number) => { a: number; d?: boolean }) {
    const alpha = new Uint8ClampedArray(width * height);
    const dark = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const { a, d } = fill(x, y);
        alpha[y * width + x] = a;
        dark[y * width + x] = d ? 1 : 0;
      }
    }
    return { alpha, dark };
  }

  it('removes fill-less columns right at a left flush edge, stopping at the first column with fill', () => {
    const width = 50;
    const height = 30;
    const { alpha, dark } = buildGrids(width, height, (x, y) => {
      if (x < 3) return { a: 255, d: true }; // debris stub spanning the full height, no fill
      if (x < 10 && y >= 5 && y < 25) return { a: 255 }; // real content starts at x=3
      return { a: 0 };
    });
    const result = trimFlushResidue(alpha, dark, width, height, 'left');
    for (let x = 0; x < 3; x++) {
      for (let y = 0; y < height; y++) expect(result[y * width + x]).toBe(0);
    }
    expect(result[10 * width + 5]).toBe(255); // real content untouched
  });

  it('does nothing when fill starts immediately at the flush edge', () => {
    const width = 30;
    const height = 30;
    const { alpha, dark } = buildGrids(width, height, (x) => (x < 10 ? { a: 255 } : { a: 0 }));
    const result = trimFlushResidue(alpha, dark, width, height, 'left');
    expect(Array.from(result)).toEqual(Array.from(alpha));
  });

  it('is a no-op when there is no flush edge', () => {
    const width = 10;
    const height = 10;
    const alpha = new Uint8ClampedArray(width * height).fill(255);
    const dark = new Uint8Array(width * height).fill(1);
    const result = trimFlushResidue(alpha, dark, width, height, null);
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
