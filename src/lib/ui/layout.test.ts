import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROW_PADDING_X } from './layout';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * layout.test.ts — structural guard for the editor/practice-player row
 * alignment pass (owner complaint: "margins feel uneven and elements don't
 * share a horizontal line"). These are source-text checks, not rendered
 * snapshots: the point is that the card header, block header, practice tab
 * row and practice footer all resolve their horizontal padding from the SAME
 * `ROW_PADDING_X` token (or, where Tailwind's build-time scanner forces a
 * literal `lg:px-3` — see that token's own header — the exact same value
 * written by hand), rather than each row inventing its own `px-*` number.
 */
function sourceOf(relativePath: string): string {
  return readFileSync(resolve(HERE, '../../', relativePath), 'utf-8');
}

describe('ROW_PADDING_X', () => {
  it('is the single px-3 horizontal inset every aligned row shares', () => {
    expect(ROW_PADDING_X).toBe('px-3');
  });

  // PART 6b polish ("double framing" fix, owner report: "se ve el marco de
  // la ventana y encima el marco de la tarjeta"): the card's own old header
  // row (title/level/badge, `border-border ... ${ROW_PADDING_X} py-3
  // lg:min-h-14`) is GONE — that content moved into `DeskWindow`'s own title
  // bar (still covered by the "title bar uses the same token" case below,
  // unchanged). The ~16px inset `ActivityEditorIsland.tsx`'s own body/
  // preview wrappers used to apply via a hand-written `lg:px-3` now lives
  // ONCE, on `[id].astro`'s own section (the window's real body/frame) —
  // so THAT file is the one carrying the token now; the island itself needs
  // no horizontal inset of its own any more (it would only double it).
  it('activity editor window body ([id].astro) carries the shared horizontal inset, not the island', () => {
    const island = sourceOf('components/islands/activities/ActivityEditorIsland.tsx');
    expect(island).not.toContain('ROW_PADDING_X');
    expect(island).not.toContain('border-border p-3 lg:min-h-14');
    expect(island).not.toContain('lg:px-3');

    const page = sourceOf("pages/[lang]/crear/[id].astro");
    expect(page).toContain("import { ROW_PADDING_X } from '@lib/ui/layout'");
    expect(page).toContain('${ROW_PADDING_X} py-4');
  });

  // Owner decision 2026-10-07 ("Barra fina debajo") replaced the accordion
  // (a header per block, each sharing this inset with its own expanded
  // body) with ONE thin active-sheet bar plus a full-bleed body: the bar
  // still shares the window title bar's own horizontal inset (it sits
  // directly under it), but the body is now explicitly EDGE TO EDGE — the
  // owner's own "sin márgenes" — so it no longer carries this token at all.
  it('the active sheet bar shares the window title bar\'s inset; the canvas body is edge-to-edge, not inset', () => {
    const src = sourceOf('components/islands/activities/BlockList.tsx');
    expect(src).toContain("import { ROW_PADDING_X } from '@/lib/ui/layout'");
    // The import plus the bar's own className (comments may mention it too).
    expect(src.match(/ROW_PADDING_X/g)?.length).toBeGreaterThanOrEqual(2);
    // The body wrapper never carries the literal inset value — edge to edge.
    expect(src).not.toMatch(/data-testid=\{`block-\$\{activeBlock\.id\}`\}[^>]*px-3/);
  });

  it('the practice player tab row and footer share the header row\'s own inset', () => {
    const src = sourceOf('components/islands/activities/ActivityPracticeIsland.tsx');
    expect(src).toContain("import { ROW_PADDING_X } from '@/lib/ui/layout'");
    expect(src.match(/ROW_PADDING_X/g)?.length).toBeGreaterThanOrEqual(3);
    expect(src).not.toContain('px-2 py-1"');
  });

  // "Desktop" redesign PART 6a (owner spec 2026-10-06): the practice page's
  // own static header row moved into the shared window shell's title bar
  // (`DeskWindow.astro`, every practice-window-opening page's own titlebar,
  // not just this one page) — the token moved with it.
  it("the practice window's title bar uses the same token", () => {
    const src = sourceOf('components/ingles/DeskWindow.astro');
    expect(src).toContain("import { ROW_PADDING_X } from '@lib/ui/layout'");
    expect(src).toContain('${ROW_PADDING_X} py-3');
    expect(src).not.toContain('border-border p-3 lg:rounded-none');
  });
});
