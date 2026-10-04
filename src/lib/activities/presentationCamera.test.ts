import { describe, it, expect } from 'vitest';
import {
  cameraForZone,
  cameraForPage,
  zoneCameraZoom,
  zoneExceedsMaxZoom,
  MAX_ZONE_CAMERA_ZOOM,
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
