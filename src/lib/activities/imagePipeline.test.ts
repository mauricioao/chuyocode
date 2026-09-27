import { describe, it, expect } from 'vitest';
import {
  routeFileType,
  computeScaledSize,
  validatePageSelection,
  MAX_LONG_SIDE_PX,
  MAX_PDF_PAGES,
} from './imagePipeline';

/**
 * Only the PURE parts of the pipeline are unit-tested here: type routing,
 * the scale-target math, and page-selection validation. `convertImageToWebp`
 * and `convertPdfPagesToWebp` drive real `<canvas>`/`Image`/`pdfjs-dist`
 * decoding jsdom cannot meaningfully provide — see this file's header and
 * the module's own header comment. Manual check only (PR report).
 */

describe('routeFileType', () => {
  it.each([
    ['image/jpeg', 'image'],
    ['image/png', 'image'],
    ['image/webp', 'image'],
    ['application/pdf', 'pdf'],
  ] as const)('routes %s to %s', (type, expected) => {
    expect(routeFileType({ type })).toBe(expected);
  });

  it.each(['image/gif', 'image/bmp', 'application/msword', 'text/plain', ''])(
    'returns null for unsupported type %s',
    (type) => {
      expect(routeFileType({ type })).toBeNull();
    },
  );
});

describe('computeScaledSize', () => {
  it('never upscales — an image already under the max side is returned unchanged', () => {
    expect(computeScaledSize(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it('returns the input unchanged when the long side equals the max exactly', () => {
    expect(computeScaledSize(MAX_LONG_SIDE_PX, 900)).toEqual({ width: MAX_LONG_SIDE_PX, height: 900 });
  });

  it('scales a landscape image down so the width hits the max', () => {
    // 3200x1800 -> longest side (width) scaled to 1600, height halved.
    expect(computeScaledSize(3200, 1800)).toEqual({ width: 1600, height: 900 });
  });

  it('scales a portrait image down so the height hits the max', () => {
    expect(computeScaledSize(1800, 3200)).toEqual({ width: 900, height: 1600 });
  });

  it('scales a square image down to a square', () => {
    expect(computeScaledSize(4000, 4000)).toEqual({ width: 1600, height: 1600 });
  });

  it('honors a custom maxSide', () => {
    expect(computeScaledSize(2000, 1000, 500)).toEqual({ width: 500, height: 250 });
  });

  it('never produces a zero dimension for an extreme aspect ratio', () => {
    const result = computeScaledSize(100000, 1);
    expect(result.width).toBe(1600);
    expect(result.height).toBeGreaterThanOrEqual(1);
  });

  it.each([
    ['zero width', 0, 100],
    ['negative width', -10, 100],
    ['zero height', 100, 0],
    ['negative height', 100, -10],
    ['NaN width', NaN, 100],
    ['Infinity height', 100, Infinity],
  ])('throws for %s', (_label, width, height) => {
    expect(() => computeScaledSize(width, height)).toThrow(RangeError);
  });
});

describe('validatePageSelection', () => {
  it('accepts a single page', () => {
    expect(validatePageSelection([1])).toEqual([1]);
  });

  it('accepts multiple distinct pages, preserving caller order', () => {
    expect(validatePageSelection([3, 1, 2])).toEqual([3, 1, 2]);
  });

  it('accepts exactly MAX_PDF_PAGES pages', () => {
    const pages = Array.from({ length: MAX_PDF_PAGES }, (_, i) => i + 1);
    expect(validatePageSelection(pages)).toEqual(pages);
  });

  it('rejects more than MAX_PDF_PAGES pages', () => {
    const pages = Array.from({ length: MAX_PDF_PAGES + 1 }, (_, i) => i + 1);
    expect(validatePageSelection(pages)).toBeNull();
  });

  it('rejects an empty selection', () => {
    expect(validatePageSelection([])).toBeNull();
  });

  it('rejects a non-array', () => {
    expect(validatePageSelection(1)).toBeNull();
    expect(validatePageSelection(null)).toBeNull();
    expect(validatePageSelection(undefined)).toBeNull();
    expect(validatePageSelection('1,2')).toBeNull();
  });

  it('rejects page 0 (not 1-based)', () => {
    expect(validatePageSelection([0, 1])).toBeNull();
  });

  it('rejects a negative page', () => {
    expect(validatePageSelection([-1])).toBeNull();
  });

  it('rejects a non-integer page', () => {
    expect(validatePageSelection([1.5])).toBeNull();
  });

  it('rejects a non-numeric entry', () => {
    expect(validatePageSelection(['1'])).toBeNull();
  });

  it('rejects duplicate pages rather than silently deduping', () => {
    expect(validatePageSelection([1, 2, 1])).toBeNull();
  });

  it('honors a custom maxPages', () => {
    expect(validatePageSelection([1, 2, 3], 2)).toBeNull();
    expect(validatePageSelection([1, 2], 2)).toEqual([1, 2]);
  });
});
