import { describe, it, expect } from 'vitest';
import {
  cameraForZone,
  cameraForPage,
  zoneCameraZoom,
  zoneExceedsMaxZoom,
  MAX_ZONE_CAMERA_ZOOM,
  LEGIBILITY_REFERENCE_VIEWPORT,
  MIN_LEGIBLE_ZONE_HEIGHT_PX,
  pageFitScale,
  zoneHeightAtMaxZoomPx,
  isZoneTooSmallToProject,
  minLegibleZoneHeightFraction,
  ensureLegibleZoneHeight,
  growSmallZonesToLegibleHeight,
  type Size,
} from './presentationCamera';
import type { Zone } from './blocks';

function zone(partial: Partial<Zone>): Zone {
  return { id: 'z1', x: 0, y: 0, w: 0.1, h: 0.1, kind: 'text', answers: ['x'], ...partial };
}

describe('cameraForZone — centering', () => {
  it('centers a zone exactly when its own padded frame matches the stage (comfortable fit, no clamp)', () => {
    // 1000x1000 page, a 20%x20% zone (200x200px, center at 500,500). Padding
    // is the PROPORTIONAL 60% here (120px > the 4%-of-page floor, 40px), so
    // the padded frame is exactly 440x440 — matched to an identical stage so
    // the fit scale comes out to a clean 1.
    const page: Size = { width: 1000, height: 1000 };
    const stage: Size = { width: 440, height: 440 };
    const z = zone({ x: 0.4, y: 0.4, w: 0.2, h: 0.2 });

    const camera = cameraForZone(z, page, stage);
    expect(camera.scale).toBeCloseTo(1);
    expect(camera.x).toBeCloseTo(-280);
    expect(camera.y).toBeCloseTo(-280);

    // The zone's own center (500, 500) must land exactly on the stage's own
    // center (220, 220) once the camera is applied.
    const screenX = z.x * page.width + (z.w * page.width) / 2;
    const screenY = z.y * page.height + (z.h * page.height) / 2;
    expect(screenX * camera.scale + camera.x).toBeCloseTo(stage.width / 2);
    expect(screenY * camera.scale + camera.y).toBeCloseTo(stage.height / 2);
  });

  it('pads proportionally to the zone size when that is larger than the page-relative floor', () => {
    const page: Size = { width: 1000, height: 1000 };
    // A big-ish zone: 60% proportional padding (180px) dwarfs the 4%-page floor (40px).
    const bigZone = zone({ x: 0.3, y: 0.3, w: 0.3, h: 0.3 });
    // Frame = 300 + 2*180 = 660 on each axis.
    const stage: Size = { width: 660, height: 660 };
    expect(zoneCameraZoom(bigZone, page, stage)).toBeCloseTo(1);
  });
});

describe('cameraForZone — padding floor for a tiny zone', () => {
  it('floors padding to a fraction of the PAGE, not the (imperceptible) zone size', () => {
    const page: Size = { width: 1000, height: 1000 };
    // A tiny 1%x1% zone (10x10px): proportional padding would be only 6px
    // (60% of 10px), dwarfed by the 4%-of-page floor (40px) — the floor
    // must win, giving a 90x90 frame (10 + 2*40), not a 22x22 one.
    const tiny = zone({ x: 0.5, y: 0.5, w: 0.01, h: 0.01 });
    const stage: Size = { width: 90, height: 90 };
    expect(zoneCameraZoom(tiny, page, stage)).toBeCloseTo(1);
  });
});

describe('cameraForZone — max zoom clamp', () => {
  const page: Size = { width: 1000, height: 1000 };
  const tiny = zone({ x: 0.5, y: 0.5, w: 0.01, h: 0.01 }); // frame 90x90, per the floor test above.

  it('reports the UNCLAMPED zoom a tiny zone would otherwise need', () => {
    const stage: Size = { width: 1000, height: 1000 };
    expect(zoneCameraZoom(tiny, page, stage)).toBeCloseTo(1000 / 90);
    expect(zoneExceedsMaxZoom(tiny, page, stage)).toBe(true);
  });

  it('clamps the actual camera scale to MAX_ZONE_CAMERA_ZOOM instead of blowing up', () => {
    const stage: Size = { width: 1000, height: 1000 };
    const camera = cameraForZone(tiny, page, stage);
    expect(camera.scale).toBeCloseTo(MAX_ZONE_CAMERA_ZOOM);
  });

  it('is NOT flagged as exceeding when the required zoom lands exactly on the ceiling', () => {
    // Reuse the 440x440 frame from the centering test above, scaled by
    // exactly MAX_ZONE_CAMERA_ZOOM.
    const z = zone({ x: 0.4, y: 0.4, w: 0.2, h: 0.2 });
    const stage: Size = { width: 440 * MAX_ZONE_CAMERA_ZOOM, height: 440 * MAX_ZONE_CAMERA_ZOOM };
    expect(zoneCameraZoom(z, page, stage)).toBeCloseTo(MAX_ZONE_CAMERA_ZOOM);
    expect(zoneExceedsMaxZoom(z, page, stage)).toBe(false);
    expect(cameraForZone(z, page, stage).scale).toBeCloseTo(MAX_ZONE_CAMERA_ZOOM);
  });
});

describe('cameraForZone — edge zones (no empty space past the page edge)', () => {
  it('pins the page to the stage edge instead of centering a corner zone with blank space beyond it', () => {
    const page: Size = { width: 1000, height: 1000 };
    // Top-left corner zone: its own padded frame (220x220, centered at
    // (50, 50)) extends 60px past the page's own (0, 0) edge on both axes.
    const corner = zone({ x: 0, y: 0, w: 0.1, h: 0.1 });
    const stage: Size = { width: 220, height: 220 };

    const camera = cameraForZone(corner, page, stage);
    // A naive, un-clamped center would place the page's own top-left corner
    // at screen (60, 60) — a blank band. Clamped, it must sit at exactly
    // (0, 0): the page's corner flush with the stage's own corner, zero
    // empty space, even though the zone itself is no longer centered.
    expect(camera.x).toBeCloseTo(0);
    expect(camera.y).toBeCloseTo(0);
    expect(camera.scale).toBeCloseTo(1);
  });

  it('still never shows empty space for a zone on the opposite (bottom-right) edge', () => {
    const page: Size = { width: 1000, height: 1000 };
    const corner = zone({ x: 0.9, y: 0.9, w: 0.1, h: 0.1 });
    const stage: Size = { width: 220, height: 220 };

    const camera = cameraForZone(corner, page, stage);
    // The page's bottom-right corner (1000, 1000) must land exactly on the
    // stage's own bottom-right corner (220, 220) — no overshoot beyond it.
    expect(1000 * camera.scale + camera.x).toBeCloseTo(220);
    expect(1000 * camera.scale + camera.y).toBeCloseTo(220);
  });
});

describe('cameraForZone / cameraForPage — defensive sizing', () => {
  it.each([
    [{ width: 0, height: 100 }, { width: 100, height: 100 }],
    [{ width: 100, height: 100 }, { width: 100, height: 0 }],
    [{ width: -10, height: 100 }, { width: 100, height: 100 }],
  ])('falls back to the identity camera for a non-positive page/stage size', (page, stage) => {
    const z = zone({ x: 0.4, y: 0.4, w: 0.2, h: 0.2 });
    expect(cameraForZone(z, page, stage)).toEqual({ scale: 1, x: 0, y: 0 });
    expect(cameraForPage(page, stage)).toEqual({ scale: 1, x: 0, y: 0 });
    expect(zoneCameraZoom(z, page, stage)).toBe(1);
    expect(zoneExceedsMaxZoom(z, page, stage)).toBe(false);
  });
});

describe('cameraForPage — the worksheet overview slide', () => {
  it('fits the whole page inside the stage, letterboxed and centered, unclamped by any 25%-400% floor', () => {
    const page: Size = { width: 2000, height: 1000 };
    const stage: Size = { width: 1000, height: 1000 };
    // Width-limited: scale = 1000/2000 = 0.5 (well under the editor
    // camera's own 25% floor — proof this never reuses that clamp).
    expect(cameraForPage(page, stage)).toEqual({ scale: 0.5, x: 0, y: 250 });
  });

  it('centers with no bands when the page already matches the stage aspect ratio', () => {
    const page: Size = { width: 1600, height: 900 };
    const stage: Size = { width: 800, height: 450 };
    expect(cameraForPage(page, stage)).toEqual({ scale: 0.5, x: 0, y: 0 });
  });
});

// A phone photo/scan of a Letter/A4 page — the representative worksheet
// page the owner's review worked its numbers against (see
// `isZoneTooSmallToProject`'s own header in presentationCamera.ts).
const TYPICAL_PAGE: Size = { width: 1700, height: 2200 };

describe('pageFitScale', () => {
  it('is the smaller of the two axis ratios (height-limited for a tall page)', () => {
    expect(pageFitScale(TYPICAL_PAGE, LEGIBILITY_REFERENCE_VIEWPORT)).toBeCloseTo(720 / 2200);
  });

  it('is the smaller of the two axis ratios (width-limited for a wide page)', () => {
    const widePage: Size = { width: 3000, height: 1000 };
    expect(pageFitScale(widePage, LEGIBILITY_REFERENCE_VIEWPORT)).toBeCloseTo(1280 / 3000);
  });

  it('falls back to 1 for a non-positive dimension', () => {
    expect(pageFitScale({ width: 0, height: 100 }, LEGIBILITY_REFERENCE_VIEWPORT)).toBe(1);
    expect(pageFitScale(TYPICAL_PAGE, { width: 0, height: 100 })).toBe(1);
  });
});

describe('zoneHeightAtMaxZoomPx (legibility — owner review worked example)', () => {
  it('MIN_LEGIBLE_ZONE_HEIGHT_PX is 28 — the calibrated legibility floor', () => {
    expect(MIN_LEGIBLE_ZONE_HEIGHT_PX).toBe(28);
  });

  it('matches the owner\'s own worked example: a 1700x2200 page, h=0.03, ~65px at the zoom ceiling', () => {
    expect(zoneHeightAtMaxZoomPx(0.03, TYPICAL_PAGE)).toBeCloseTo(64.8, 1);
    expect(zoneHeightAtMaxZoomPx(0.03, TYPICAL_PAGE)).toBeGreaterThan(MIN_LEGIBLE_ZONE_HEIGHT_PX);
  });

  it('the unzoomed figure in that same example is ~21.6px', () => {
    expect(0.03 * TYPICAL_PAGE.height * pageFitScale(TYPICAL_PAGE, LEGIBILITY_REFERENCE_VIEWPORT)).toBeCloseTo(
      21.6,
      1,
    );
  });

  it('grows with the zone\'s own height fraction', () => {
    const small = zoneHeightAtMaxZoomPx(0.01, TYPICAL_PAGE);
    const big = zoneHeightAtMaxZoomPx(0.05, TYPICAL_PAGE);
    expect(big).toBeGreaterThan(small);
  });
});

describe('isZoneTooSmallToProject (legibility calibration, owner review)', () => {
  it('does NOT flag an ordinary one-line fill-in-the-blank (h=0.03) — the owner\'s exact repro', () => {
    expect(isZoneTooSmallToProject(0.03, TYPICAL_PAGE)).toBe(false);
  });

  it('does not flag anywhere in the ordinary single-line blank range (0.025-0.04)', () => {
    for (const h of [0.025, 0.03, 0.035, 0.04]) {
      expect(isZoneTooSmallToProject(h, TYPICAL_PAGE)).toBe(false);
    }
  });

  it('flags a zone far smaller than an ordinary blank', () => {
    expect(isZoneTooSmallToProject(0.01, TYPICAL_PAGE)).toBe(true);
  });

  it('flags a zone at MIN_ZONE_SIZE (0.02) on a very wide (landscape) page where even that is illegible', () => {
    // Width-limited (landscape) page: the page's own fit-to-viewport scale
    // is driven by its WIDTH, not its height, so the same fraction that is
    // comfortably legible on an ordinary portrait page can still be
    // illegible here — aspect ratio, not absolute resolution, is what
    // moves this (see `minLegibleZoneHeightFraction`'s own aspect-ratio
    // test below).
    const widePage: Size = { width: 3000, height: 800 };
    expect(isZoneTooSmallToProject(0.02, widePage)).toBe(true);
  });

  it('is symmetric with the exact inverse (minLegibleZoneHeightFraction)', () => {
    const minH = minLegibleZoneHeightFraction(TYPICAL_PAGE);
    expect(isZoneTooSmallToProject(minH - 0.001, TYPICAL_PAGE)).toBe(true);
    expect(isZoneTooSmallToProject(minH + 0.001, TYPICAL_PAGE)).toBe(false);
  });
});

describe('minLegibleZoneHeightFraction', () => {
  it('is tiny on a typical worksheet page — nowhere near the rejected flat 0.08 floor', () => {
    const minH = minLegibleZoneHeightFraction(TYPICAL_PAGE);
    expect(minH).toBeCloseTo(28 / 2160, 4);
    expect(minH).toBeLessThan(0.02);
  });

  it('is driven by aspect ratio, not absolute resolution: a very wide (landscape) page needs a bigger fraction than an ordinary portrait one', () => {
    const widePage: Size = { width: 3000, height: 800 };
    expect(minLegibleZoneHeightFraction(widePage)).toBeGreaterThan(minLegibleZoneHeightFraction(TYPICAL_PAGE));
  });

  it('is the SAME constant for any portrait-ish page, regardless of absolute resolution (height-limited fit cancels page height out)', () => {
    const bigPortrait: Size = { width: 1700, height: 2200 };
    const smallPortrait: Size = { width: 300, height: 400 }; // same ~0.77 aspect, far fewer native pixels
    expect(minLegibleZoneHeightFraction(bigPortrait)).toBeCloseTo(minLegibleZoneHeightFraction(smallPortrait));
  });

  it('is 0 for a non-positive page dimension, never NaN/Infinity', () => {
    expect(minLegibleZoneHeightFraction({ width: 0, height: 0 })).toBe(0);
  });
});

// On an ordinary portrait page the legibility floor (~0.013, see
// `minLegibleZoneHeightFraction`'s own tests) sits BELOW `zoneGeometry.ts`'s
// own tap-target floor (`MIN_ZONE_SIZE`, 0.02) — `clampRect` would raise a
// grown zone to 0.02 regardless, masking which floor actually won. The wide
// landscape page below has a legibility floor ABOVE `MIN_ZONE_SIZE`
// (~0.027), so these tests exercise the legibility floor itself rather than
// `clampRect`'s own unrelated tap-target one.
const WIDE_PAGE: Size = { width: 3000, height: 800 };

describe('ensureLegibleZoneHeight', () => {
  it('leaves an already-legible rect completely unchanged (same reference)', () => {
    const rect = { x: 0.1, y: 0.4, w: 0.2, h: 0.1 };
    expect(ensureLegibleZoneHeight(rect, WIDE_PAGE)).toBe(rect);
  });

  it('grows a too-short rect up to the legibility minimum, around its own vertical center', () => {
    const rect = { x: 0.1, y: 0.49, w: 0.3, h: 0.01 };
    const grown = ensureLegibleZoneHeight(rect, WIDE_PAGE);
    const minH = minLegibleZoneHeightFraction(WIDE_PAGE);
    expect(grown.h).toBeCloseTo(minH);
    expect(grown.x).toBe(rect.x); // width/x untouched — legibility is a height-only concern
    expect(grown.w).toBe(rect.w);
    expect(grown.y + grown.h / 2).toBeCloseTo(rect.y + rect.h / 2); // center preserved
  });

  it('clamps the grown rect back inside [0, 1] near an edge', () => {
    const rect = { x: 0.1, y: 0, w: 0.2, h: 0.001 };
    const grown = ensureLegibleZoneHeight(rect, WIDE_PAGE);
    expect(grown.y).toBeGreaterThanOrEqual(0);
    expect(grown.y + grown.h).toBeLessThanOrEqual(1.0001);
  });
});

describe('growSmallZonesToLegibleHeight', () => {
  it('grows only the zones below the floor, leaving the rest exactly as-is', () => {
    const tiny = { id: 'tiny', x: 0.5, y: 0.5, w: 0.1, h: 0.005, kind: 'text' as const, answers: ['x'] };
    const fine = { id: 'fine', x: 0.1, y: 0.1, w: 0.2, h: 0.1, kind: 'text' as const, answers: ['y'] };
    const result = growSmallZonesToLegibleHeight([tiny, fine], WIDE_PAGE);

    expect(result[1]).toBe(fine); // untouched, same reference
    expect(result[0].id).toBe('tiny');
    expect(result[0].h).toBeCloseTo(minLegibleZoneHeightFraction(WIDE_PAGE));
    expect(result[0].answers).toEqual(['x']); // non-geometry fields preserved
  });

  it('returns an empty array unchanged', () => {
    expect(growSmallZonesToLegibleHeight([], TYPICAL_PAGE)).toEqual([]);
  });
});
