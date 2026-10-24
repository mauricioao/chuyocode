import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * `.pair-row` hairline (`QuizMatching.tsx`'s 2-column match boards, build
 * item "extra hairline in 2-column match boards"): the base rule draws a
 * hairline above every `.pair-row` that follows another one — correct for a
 * single column, but row 2 is the TOP of the right column once the board
 * switches to 2 columns, so it must not inherit that hairline there.
 *
 * jsdom never runs the real CSS cascade from an external stylesheet (no
 * layout engine), so this reads the actual shipped `global.css` and asserts
 * on its source — same pattern `shadow-utilities.test.ts` uses for a CSS
 * rule jsdom cannot otherwise observe.
 */
const stylesDir = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(stylesDir, 'global.css'), 'utf8');

describe('.pair-row hairline', () => {
  it('still draws a hairline above every row but the first, for a single-column board', () => {
    expect(source).toContain('.pair-row + .pair-row::before {');
  });

  it('cancels that hairline on row 2 once the board is actually laid out in 2 columns', () => {
    const match = source.match(
      /@container \(min-width: 32rem\) \{\s*\.activity-sheet--wide \.pair-row:nth-child\(2\)::before \{\s*content: none;/,
    );
    expect(match).not.toBeNull();
  });

  it('keeps the 2-column suppression scoped to the many-pairs grid, never the plain 1-column one', () => {
    // `.activity-sheet--wide` only exists on the many-pairs board
    // (`QuizMatching.tsx`'s own `manyPairs`) — a short, 1-column board never
    // carries it, so row 2 keeps its hairline there regardless of width.
    const rule = source.slice(source.indexOf('@container (min-width: 32rem)'));
    expect(rule.indexOf('.activity-sheet--wide')).toBeGreaterThan(-1);
    expect(rule.indexOf('.activity-sheet--wide')).toBeLessThan(rule.indexOf('pair-row'));
  });
});
