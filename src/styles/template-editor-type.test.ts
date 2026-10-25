import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * `.template-field` responsive type (T3 toolbar-dock pass — "reduce the font
 * by 1 or 2 points", desktop only: phones keep 17px because iOS zooms into
 * any input under 16px).
 *
 * jsdom never runs the real CSS cascade from an external stylesheet (no
 * layout engine), so this reads the actual shipped `global.css` and asserts
 * on its source — same pattern `pair-row-columns.test.ts` uses for a CSS
 * rule jsdom cannot otherwise observe.
 */
const stylesDir = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(stylesDir, 'global.css'), 'utf8');

describe('.template-field responsive type', () => {
  it('keeps the base (phone) size at 17px', () => {
    // The FIRST `.template-field { ... }` block in the file is the base
    // rule — the desktop override below lives in a later `@media` block.
    const baseRule = source.match(/\.template-field\s*\{([^}]*)\}/);
    expect(baseRule).not.toBeNull();
    expect(baseRule![1]).toContain('font-size: 17px;');
  });

  it('shrinks to 15px at desktop, pointer-fine widths only', () => {
    const match = source.match(
      /@media \(min-width: 1024px\) and \(pointer: fine\) \{\s*\.template-field \{\s*font-size: 15px;/,
    );
    expect(match).not.toBeNull();
  });
});
