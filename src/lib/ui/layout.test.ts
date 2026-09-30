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

  it('activity editor card header, body and preview rows all use it (never an ad-hoc p-3/px-2)', () => {
    const src = sourceOf('components/islands/activities/ActivityEditorIsland.tsx');
    expect(src).toContain("import { ROW_PADDING_X } from '@/lib/ui/layout'");
    // The card header row — unprefixed, so the shared token itself.
    expect(src).toContain('${ROW_PADDING_X} py-3 lg:min-h-14');
    // The body/preview wrappers only ever apply this at `lg:` — Tailwind
    // needs the literal `lg:px-3` token (see ROW_PADDING_X's own header),
    // so these are hand-written at the same value, twice.
    expect(src.match(/lg:px-3 lg:py-3/g)?.length).toBe(2);
    expect(src).not.toContain('border-border p-3 lg:min-h-14');
  });

  it('the activity block header and its expanded editor body share the same inset', () => {
    const src = sourceOf('components/islands/activities/BlockList.tsx');
    expect(src).toContain("import { ROW_PADDING_X } from '@/lib/ui/layout'");
    // Header row + the worksheet expanded body + the quiz expanded body.
    expect(src.match(/ROW_PADDING_X/g)?.length).toBeGreaterThanOrEqual(4);
    expect(src).not.toContain('items-center gap-2 py-1"');
    expect(src).not.toContain('px-2 pb-2 pt-1');
  });

  it('the practice player tab row and footer share the header row\'s own inset', () => {
    const src = sourceOf('components/islands/activities/ActivityPracticeIsland.tsx');
    expect(src).toContain("import { ROW_PADDING_X } from '@/lib/ui/layout'");
    expect(src.match(/ROW_PADDING_X/g)?.length).toBeGreaterThanOrEqual(3);
    expect(src).not.toContain('px-2 py-1"');
  });

  it('the practice page\'s own static header row uses the same token', () => {
    const src = sourceOf('pages/[lang]/ingles/actividades/[id].astro');
    expect(src).toContain("import { ROW_PADDING_X } from '@lib/ui/layout'");
    expect(src).toContain('${ROW_PADDING_X} py-3');
    expect(src).not.toContain('border-border p-3 lg:rounded-none');
  });
});
