import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

/**
 * Dotted work-surface background (canvas polish): every canvas VIEWPORT —
 * the practice player's desktop worksheet camera, its mobile pinch/pan
 * camera, and the editor's own `WorksheetZoneEditor.tsx` canvas — must share
 * the ONE `.canvas-dots` utility (`src/styles/global.css`) rather than each
 * re-declaring its own inline gradient. A text guard, not a DOM/CSSOM test:
 * jsdom never actually paints `background-image`, so the only reliable check
 * is that the class name is present on each viewport's own `className`.
 */
const VIEWPORTS = [
  { file: 'WorksheetPracticePlayer.tsx', testId: 'practice-camera-viewport' },
  { file: 'WorksheetPracticePlayerMobile.tsx', testId: 'practice-mobile-viewport' },
  { file: 'WorksheetZoneEditor.tsx', testId: 'zone-viewport' },
] as const;

describe('canvas viewports share the dotted work-surface background', () => {
  it.each(VIEWPORTS)('$file ($testId) carries the canvas-dots class', ({ file, testId }) => {
    const path = fileURLToPath(new URL(`./${file}`, import.meta.url));
    const content = readFileSync(path, 'utf8');
    const testIdIndex = content.indexOf(`data-testid="${testId}"`);
    expect(testIdIndex, `expected to find data-testid="${testId}" in ${file}`).toBeGreaterThanOrEqual(0);

    // The class lives on the same JSX element as the testid — scan a window
    // around it (either attribute order, and past a long doc comment on the
    // element itself) rather than requiring an exact adjacent match.
    const windowStart = Math.max(0, testIdIndex - 1500);
    const windowEnd = Math.min(content.length, testIdIndex + 1500);
    const around = content.slice(windowStart, windowEnd);
    expect(around).toContain('canvas-dots');
  });
});
