/**
 * pagesOverflow.test.ts — a static, structural guard against the mobile
 * layout pass' "no horizontal page overflow anywhere" requirement (target
 * viewports: phones, 360-430px wide).
 *
 * WHAT THIS DOES NOT DO: measure a real rendered layout. jsdom has no
 * layout engine at all (see `WorksheetZoneEditor.test.tsx`'s own header —
 * same project-wide limitation), and a true "does this page ever overflow
 * horizontally" check needs a real browser (Playwright, `tests/e2e/`).
 *
 * WHAT THIS DOES: scans every "key page" (`src/pages/**\/*.astro`) plus the
 * shared chrome it always renders through (`BaseLayout`, `Header`, `Footer`)
 * for a bare — i.e. NOT gated behind an `sm:`/`md:`/`lg:`/`xl:`/`2xl:`
 * breakpoint prefix — fixed/minimum-width utility or inline style wider
 * than {@link MAX_UNPREFIXED_WIDTH_PX}. `max-w-*` is deliberately NOT
 * checked: it only caps a WIDTH, it never forces one, so `max-w-6xl` alone
 * can never overflow a narrow viewport the way an unprefixed `w-[820px]` or
 * `min-w-[50rem]` can. This catches the actual common regression (someone
 * hardcoding a desktop-sized box with no responsive variant) as a fast,
 * deterministic unit test — a real device/Playwright check is still the
 * ground truth the brief's own "manual checks on a real phone" step names.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { glob } from 'node:fs/promises';

/**
 * The widest a BARE (no responsive prefix) fixed/minimum width may be
 * before it risks overflowing the narrowest target phone (360px) — a little
 * slack above 360px for borders/padding that do not themselves come from
 * this utility, but nowhere near desktop container sizes.
 */
const MAX_UNPREFIXED_WIDTH_PX = 400;

const BREAKPOINT_PREFIX = /(?:^|[\s"'`])(sm|md|lg|xl|2xl):[\w-]*$/;

/** One `w-[...]`/`min-w-[...]` Tailwind arbitrary-value match, with its own start index so the prefix check can look at what came right before it. */
interface WidthMatch {
  raw: string;
  px: number;
  index: number;
}

/** Converts a Tailwind arbitrary-value width token's unit into px (16px root assumed for rem, matching every other size in this codebase's own CSS). */
function toPx(value: number, unit: string): number {
  if (unit === 'px') return value;
  if (unit === 'rem') return value * 16;
  return Number.POSITIVE_INFINITY; // an unrecognized unit (vw, %, ch, …) is not a fixed pixel width at all — never flagged.
}

const ARBITRARY_WIDTH = /\b(?:w|min-w)-\[(\d+(?:\.\d+)?)(px|rem)\]/g;

function findUnprefixedWideWidths(source: string): WidthMatch[] {
  const matches: WidthMatch[] = [];
  for (const m of source.matchAll(ARBITRARY_WIDTH)) {
    const px = toPx(Number(m[1]), m[2]);
    if (px <= MAX_UNPREFIXED_WIDTH_PX) continue;
    const before = source.slice(Math.max(0, m.index - 6), m.index);
    if (BREAKPOINT_PREFIX.test(before)) continue; // gated behind sm:/md:/lg:/xl:/2xl: — desktop-only, not a mobile overflow risk.
    matches.push({ raw: m[0], px, index: m.index });
  }
  return matches;
}

/**
 * A bare inline `style="width: NNNpx"` (or `min-width`) — no Tailwind
 * breakpoint concept applies to these at all, so any one over the threshold
 * is always flagged. Deliberately excludes a `@media (min-width: …)`
 * FEATURE QUERY, which is the opposite of this check's concern (it GATES a
 * rule behind a wide viewport, exactly like an `lg:` prefix) — recognized by
 * the `(` immediately before it, since a media feature is always written
 * `(min-width: …)` while a real style declaration never opens with one.
 */
const INLINE_WIDTH = /(?:width|min-width)\s*:\s*(\d+(?:\.\d+)?)(px|rem)/g;

function findWideInlineStyles(source: string): WidthMatch[] {
  const matches: WidthMatch[] = [];
  for (const m of source.matchAll(INLINE_WIDTH)) {
    if (source[m.index - 1] === '(') continue; // `@media (min-width: …)` — a viewport gate, not a fixed box.
    const px = toPx(Number(m[1]), m[2]);
    if (px > MAX_UNPREFIXED_WIDTH_PX) matches.push({ raw: m[0], px, index: m.index });
  }
  return matches;
}

async function keyPageFiles(): Promise<string[]> {
  const files: string[] = [];
  for await (const entry of glob('src/pages/**/*.astro')) files.push(entry);
  files.push('src/layouts/BaseLayout.astro', 'src/components/layout/Header.astro');
  return files;
}

describe('key pages — no bare (mobile-width) fixed/minimum width over 400px', () => {
  it('every page under src/pages, plus the shared layout chrome, is free of them', async () => {
    const files = await keyPageFiles();
    expect(files.length).toBeGreaterThan(10); // sanity: the glob actually found real pages, not an empty/broken pattern.

    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf-8');
      for (const match of [...findUnprefixedWideWidths(source), ...findWideInlineStyles(source)]) {
        offenders.push(`${file}: "${match.raw}" (${match.px}px, unprefixed)`);
      }
    }

    expect(offenders).toEqual([]);
  });
});
