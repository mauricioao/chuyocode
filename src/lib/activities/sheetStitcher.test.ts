import { describe, it, expect, vi } from 'vitest';
import {
  capStitchSources,
  computeStitchLayout,
  stepDownStitchWidth,
  stitchSourcesWithinSizeLimit,
  MAX_STITCH_SOURCES,
  STITCH_MIN_WIDTH,
  STITCH_MIN_QUALITY,
  STITCH_TARGET_WIDTH,
  STITCH_GAP_PX,
  type StitchDrawSource,
} from './sheetStitcher';

describe('capStitchSources', () => {
  it('keeps everything, untruncated, when at or under the cap', () => {
    const { sources, truncated } = capStitchSources([1, 2, 3]);
    expect(sources).toEqual([1, 2, 3]);
    expect(truncated).toBe(false);
  });

  it('caps at MAX_STITCH_SOURCES (5) by default, keeping the chosen order', () => {
    const { sources, truncated } = capStitchSources([1, 2, 3, 4, 5, 6, 7]);
    expect(sources).toEqual([1, 2, 3, 4, 5]);
    expect(truncated).toBe(true);
    expect(sources.length).toBe(MAX_STITCH_SOURCES);
  });

  it('honors a custom max', () => {
    const { sources, truncated } = capStitchSources(['a', 'b', 'c'], 2);
    expect(sources).toEqual(['a', 'b']);
    expect(truncated).toBe(true);
  });

  it('returns a fresh array, not a reference to the input', () => {
    const input = [1, 2];
    const { sources } = capStitchSources(input);
    sources.push(3);
    expect(input).toEqual([1, 2]);
  });
});

describe('computeStitchLayout', () => {
  it('is empty for zero sources', () => {
    expect(computeStitchLayout([])).toEqual({ placements: [], canvasWidth: 0, canvasHeight: 0 });
  });

  it('a single source is placed at the origin, at its own width when under the target', () => {
    const layout = computeStitchLayout([{ width: 800, height: 400 }]);
    expect(layout.canvasWidth).toBe(800);
    expect(layout.placements).toEqual([{ x: 0, y: 0, width: 800, height: 400 }]);
    expect(layout.canvasHeight).toBe(400);
  });

  it('never upscales past a source narrower than the target width', () => {
    // Narrowest source (600) wins over the 1600 default target.
    const layout = computeStitchLayout([
      { width: 1200, height: 600 },
      { width: 600, height: 300 },
    ]);
    expect(layout.canvasWidth).toBe(600);
  });

  it('caps the common width at targetWidth when every source is wider', () => {
    const layout = computeStitchLayout([{ width: 3000, height: 1500 }], 1600);
    expect(layout.canvasWidth).toBe(1600);
    // Aspect ratio preserved: 1500 * (1600/3000) = 800.
    expect(layout.placements[0].height).toBe(800);
  });

  it('stacks pages top to bottom, in order, separated by the gap — never before the first or after the last', () => {
    const layout = computeStitchLayout(
      [
        { width: 400, height: 200 },
        { width: 400, height: 100 },
        { width: 400, height: 300 },
      ],
      400,
      20,
    );
    expect(layout.placements.map((p) => p.y)).toEqual([0, 220, 340]);
    // Total height: 200 + 20 + 100 + 20 + 300 = 640 (no trailing gap).
    expect(layout.canvasHeight).toBe(640);
  });

  it('uses the default target width and gap when omitted', () => {
    const layout = computeStitchLayout([
      { width: 2000, height: 1000 },
      { width: 2000, height: 1000 },
    ]);
    expect(layout.canvasWidth).toBe(STITCH_TARGET_WIDTH);
    expect(layout.placements[1].y).toBe(800 + STITCH_GAP_PX);
  });

  it('keeps each page\'s own aspect ratio at the common width', () => {
    const layout = computeStitchLayout([
      { width: 400, height: 300 }, // 4:3
      { width: 800, height: 400 }, // 2:1
    ]);
    // Common width = min(1600, 400, 800) = 400.
    expect(layout.canvasWidth).toBe(400);
    expect(layout.placements[0].height).toBe(300); // unchanged — already at common width
    expect(layout.placements[1].height).toBe(200); // 400 * (400/800)
  });
});

describe('stepDownStitchWidth', () => {
  it('shrinks by ~15%', () => {
    expect(stepDownStitchWidth(1600)).toBe(1360);
  });

  it('returns null once the next step would drop below the floor', () => {
    // round(560 * 0.85) = 476, below STITCH_MIN_WIDTH (480).
    expect(stepDownStitchWidth(560)).toBeNull();
  });

  it('never returns a value below the floor', () => {
    let width: number | null = 2000;
    const seen: number[] = [];
    while (width !== null) {
      seen.push(width);
      width = stepDownStitchWidth(width);
    }
    for (const w of seen) expect(w).toBeGreaterThanOrEqual(STITCH_MIN_WIDTH);
  });
});

function fakeSource(width = 800, height = 600): StitchDrawSource {
  return { image: {} as CanvasImageSource, size: { width, height } };
}

describe('stitchSourcesWithinSizeLimit — retry sequencing (fake encoder, no real canvas)', () => {
  it('returns the first encode that already fits, without any retry', async () => {
    const encode = vi.fn().mockResolvedValue(new Blob([new Uint8Array(100)]));
    const blob = await stitchSourcesWithinSizeLimit([fakeSource()], 1000, { encode });
    expect(blob).not.toBeNull();
    expect(encode).toHaveBeenCalledTimes(1);
    expect(encode).toHaveBeenCalledWith([fakeSource()], STITCH_TARGET_WIDTH, STITCH_GAP_PX, expect.any(Number));
  });

  it('shrinks the width step by step until the encode fits', async () => {
    const sizes = [5000, 3000, 900]; // bytes, one per call
    let call = 0;
    const encode = vi.fn().mockImplementation(async () => new Blob([new Uint8Array(sizes[call++])]));
    const blob = await stitchSourcesWithinSizeLimit([fakeSource()], 1000, { encode });
    expect(blob).not.toBeNull();
    expect(encode).toHaveBeenCalledTimes(3);
    // Each call used a smaller width than the last.
    const widths = encode.mock.calls.map((c) => c[1] as number);
    expect(widths[0]).toBe(STITCH_TARGET_WIDTH);
    expect(widths[1]).toBeLessThan(widths[0]);
    expect(widths[2]).toBeLessThan(widths[1]);
  });

  it('falls through to shrinking quality once the width floor still does not fit', async () => {
    const encode = vi.fn().mockResolvedValue(new Blob([new Uint8Array(999999)])); // never fits by width alone
    // Make it fit only once quality has been reduced a couple of steps —
    // simulate by changing the mock mid-run based on call count.
    let call = 0;
    encode.mockImplementation(async (_sources, _width, _gap, quality: number) => {
      call++;
      // Fits once quality has dropped to 0.6 or below.
      return new Blob([new Uint8Array(quality <= 0.6 ? 500 : 999999)]);
    });
    const blob = await stitchSourcesWithinSizeLimit([fakeSource()], 1000, { encode, quality: 0.8 });
    expect(blob).not.toBeNull();
    expect(call).toBeGreaterThan(1);
    // The fitting call used the width FLOOR, not the starting target width.
    const fittingCallArgs = encode.mock.calls.at(-1)!;
    expect(fittingCallArgs[1]).toBe(STITCH_MIN_WIDTH);
    expect(fittingCallArgs[3]).toBeLessThanOrEqual(0.6);
  });

  it('gives up (returns null) once both width and quality are exhausted', async () => {
    const encode = vi.fn().mockResolvedValue(new Blob([new Uint8Array(999999)])); // never fits
    const blob = await stitchSourcesWithinSizeLimit([fakeSource()], 1000, { encode });
    expect(blob).toBeNull();
    // Every quality step tried was >= the floor.
    const qualities = encode.mock.calls.map((c) => c[3] as number);
    for (const q of qualities) expect(q).toBeGreaterThanOrEqual(STITCH_MIN_QUALITY);
  });
});
