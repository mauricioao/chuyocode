import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Regression guard for the drag-overlay invisibility bug (`gameFeel.tsx`'s
 * `GameDragOverlay`, see its own "LAYER" header): the overlay's portal host
 * used to carry NO z-index at all, so it silently painted BELOW every
 * positioned sibling with an explicit one — the real activity window chief
 * among them. The fix gives it `DRAG_LAYER_CLASS` (`z-[90]`), comfortably
 * above every other layer the app has today.
 *
 * A single explicit z-index fixes today's bug, but nothing stopped the NEXT
 * one: any future `z-[95]`/`zIndex: 200`/etc anywhere in `src/**` would
 * silently paint over the drag layer again, exactly like `.ingles-window`
 * did. So this reads the actual shipped source of every file under `src/`
 * (same pattern `shadow-utilities.test.ts`/`pair-row-columns.test.ts` use
 * for `global.css` alone, generalised to the whole tree) and fails if any
 * `z-[NN]` / `z-NN` / `zIndex: NN` / `z-index: NN` value is at or above the
 * drag layer WITHOUT an explicit, reasoned entry in {@link ALLOWLIST} below.
 *
 * This file is deliberately NOT allowed to exempt itself by exact line or
 * occurrence — the allowlist is keyed by (file, value), so a newly added
 * high z-index anywhere else always fails loudly until someone consciously
 * vets it here.
 */

const stylesDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(stylesDir, '../..');
const srcDir = resolve(projectRoot, 'src');
const THIS_FILE = fileURLToPath(import.meta.url);

/** Kept in sync with `gameFeel.tsx`'s own `DRAG_LAYER_CLASS` — the sync-check test below fails if the two ever drift apart. */
const DRAG_LAYER_VALUE = 90;

const SCANNED_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.astro', '.css']);
const SKIP_DIRS = new Set(['node_modules', 'dist']);

interface ZIndexMatch {
  /** The signed numeric value — e.g. `-10` for `-z-10`. */
  value: number;
  /** The matched text itself, for a readable failure message. */
  raw: string;
  /** Character offset into the source, used to compute a line number for a readable failure message. */
  index: number;
}

/**
 * Every `z-[NN]` / `-z-[NN]` (Tailwind arbitrary, incl. a variant prefix like
 * `lg:`/`desk:`), `z-NN` / `-z-NN` (Tailwind scale), `zIndex: NN` /
 * `zIndex={NN}` / `x.zIndex = NN` (JS/TS/JSX), and `z-index: NN` (CSS) in
 * `source`. A pure function over a string — no file I/O — so it is unit-
 * tested directly below with small literal fixtures, independent of
 * whatever the real tree currently contains.
 *
 * The `(?<![\w-])` lookbehind on the two Tailwind patterns keeps a match off
 * the tail of an unrelated identifier (`xyz-10` is not `z-10`) while still
 * allowing a variant prefix (`lg:z-30`, `desk:z-[5]` — a `:` is not `[\w-]`).
 * Deliberately a plain substring scan, not a comment-aware parser: a value
 * mentioned only in PROSE (a doc comment citing another file's own number)
 * matches the same as a real declaration, which is intentional — it is the
 * same conservative, fail-loud posture the allowlist below is built for.
 */
function findZIndexMatches(source: string): ZIndexMatch[] {
  const patterns = [
    /(?<![\w-])(-?)z-\[(\d+)\]/g, // z-[90], -z-[10], lg:z-[60]
    /(?<![\w-])(-?)z-(\d+)\b/g, // z-50, -z-10, desk:z-50
    /\bzIndex\b\s*[:=]\s*\{?\s*(-?)(\d+)/g, // zIndex: 90, zIndex={90}, x.zIndex = 90
    /\bz-index\s*:\s*(-?)(\d+)/g, // z-index: 90;
  ];
  const matches: ZIndexMatch[] = [];
  for (const pattern of patterns) {
    for (const m of source.matchAll(pattern)) {
      const sign = m[1] === '-' ? -1 : 1;
      matches.push({ value: sign * Number(m[2]), raw: m[0], index: m.index ?? 0 });
    }
  }
  return matches;
}

/** 1-based line number of `index` within `source` — for a readable failure message only. */
function lineAt(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i += 1) {
    if (source[i] === '\n') line += 1;
  }
  return line;
}

function safeReaddir(dir: string) {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

/** Every file under `dir` whose extension is in {@link SCANNED_EXTENSIONS}, recursively, skipping `node_modules`/`dist` and this test file itself. */
function listSourceFiles(dir: string): string[] {
  return safeReaddir(dir).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      return SKIP_DIRS.has(entry.name) ? [] : listSourceFiles(full);
    }
    if (full === THIS_FILE) return []; // never scan this guard's own allowlist data against itself
    const dot = entry.name.lastIndexOf('.');
    const ext = dot === -1 ? '' : entry.name.slice(dot);
    return SCANNED_EXTENSIONS.has(ext) ? [full] : [];
  });
}

/** POSIX-style, project-root-relative — matches how {@link ALLOWLIST} spells `file`. */
function posixRelative(absolutePath: string): string {
  return relative(projectRoot, absolutePath).split(sep).join('/');
}

interface Allowance {
  /** Project-root-relative, POSIX-style path. */
  file: string;
  /** Every distinct value this file is allowed to declare at or above the drag layer. */
  values: number[];
  /** Why this file is allowed to sit at or above the drag layer, and why that never visually competes with a mid-drag chip. */
  reason: string;
}

const ALLOWLIST: Allowance[] = [
  {
    file: 'src/components/islands/mechanics/gameFeel.tsx',
    values: [DRAG_LAYER_VALUE],
    reason: "DRAG_LAYER_CLASS and the inner DragOverlay's own zIndex prop — this IS the drag layer this budget protects, not something competing with it.",
  },
  {
    file: 'src/components/islands/UserMenu.tsx',
    values: [999999],
    reason:
      "The account dropdown must stay reachable above any realistic desk-window stack (deskWindowManager.ts's own `1000 + entry.z` wrapper z-index), a convention that predates this budget. Never actually competes with the drag layer: the desk HOST page and the activity page it opens as a same-origin iframe are separate documents, and z-index never crosses that boundary.",
  },
  {
    file: 'src/styles/global.css',
    values: [100],
    reason:
      "`.skip-link`, the keyboard-only accessibility skip-to-content link — positioned off-screen (`left: -9999px`) until it receives focus, so it never visually occupies any on-screen position, including mid-drag.",
  },
];

function isAllowed(file: string, value: number): boolean {
  return ALLOWLIST.some((entry) => entry.file === file && entry.values.includes(value));
}

describe('findZIndexMatches (the scanner itself)', () => {
  it('reads a Tailwind arbitrary value, with or without a variant prefix', () => {
    const withAttr = 'className="fixed z-[60]"';
    expect(findZIndexMatches(withAttr)).toEqual([{ value: 60, raw: 'z-[60]', index: withAttr.indexOf('z-[60]') }]);
    const withVariant = 'desk:z-[5]';
    expect(findZIndexMatches(withVariant)).toEqual([{ value: 5, raw: 'z-[5]', index: withVariant.indexOf('z-[5]') }]);
  });

  it('reads a Tailwind scale value, including the negative-utility dash', () => {
    const matches = findZIndexMatches('absolute inset-0 -z-10 z-50');
    expect(matches.map((m) => m.value)).toEqual([-10, 50]);
  });

  it('reads a JS/JSX zIndex, as an object property, a JSX prop, or a plain assignment', () => {
    expect(findZIndexMatches('{ zIndex: 90 }')[0]?.value).toBe(90);
    expect(findZIndexMatches('<DragOverlay zIndex={90}>')[0]?.value).toBe(90);
    expect(findZIndexMatches('el.style.zIndex = 90;')[0]?.value).toBe(90);
  });

  it('reads a CSS z-index declaration', () => {
    expect(findZIndexMatches('  z-index: 100;\n')[0]?.value).toBe(100);
  });

  it('never matches z-index/zIndex as a false positive off the tail of an unrelated identifier', () => {
    expect(findZIndexMatches('xyz-10')).toEqual([]); // "z-10" is not preceded by a boundary — part of "xyz"
    expect(findZIndexMatches('const zIndexValue = 5;')).toEqual([]); // "zIndex" has no boundary before "Value"
  });

  it('never double-counts a CSS/JS zIndex as a Tailwind scale match (both start with "z-"/"zIndex", never both)', () => {
    expect(findZIndexMatches('z-index: 100;')).toHaveLength(1);
    expect(findZIndexMatches('zIndex: 100')).toHaveLength(1);
  });
});

describe('z-index layer budget — nothing in src/** is allowed to sit at or above the drag layer unreviewed', () => {
  const files = listSourceFiles(srcDir);

  it('found a non-trivial number of source files to scan (the walker itself is not silently returning nothing)', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('keeps DRAG_LAYER_VALUE in sync with gameFeel.tsx\'s own DRAG_LAYER_CLASS', () => {
    const source = readFileSync(resolve(projectRoot, 'src/components/islands/mechanics/gameFeel.tsx'), 'utf8');
    expect(source).toContain(`DRAG_LAYER_CLASS = 'z-[${DRAG_LAYER_VALUE}]'`);
  });

  it('every value at or above the drag layer, anywhere in src/**, is covered by an explicit, reasoned allowlist entry', () => {
    const violations: string[] = [];

    for (const absolutePath of files) {
      const file = posixRelative(absolutePath);
      const source = readFileSync(absolutePath, 'utf8');
      for (const match of findZIndexMatches(source)) {
        if (match.value >= DRAG_LAYER_VALUE && !isAllowed(file, match.value)) {
          violations.push(
            `${file}:${lineAt(source, match.index)}: \`${match.raw}\` (value ${match.value}) is at/above the drag layer (${DRAG_LAYER_VALUE}) and is not allowlisted.`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('keeps the allowlist itself honest — every entry still matches something real in its own file (no stale exemptions)', () => {
    const stale: string[] = [];

    for (const entry of ALLOWLIST) {
      const absolutePath = resolve(projectRoot, entry.file);
      const source = readFileSync(absolutePath, 'utf8');
      const found = findZIndexMatches(source).map((m) => m.value);
      for (const value of entry.values) {
        if (!found.includes(value)) {
          stale.push(`${entry.file}: allowlisted value ${value} was not found in the file any more.`);
        }
      }
    }

    expect(stale).toEqual([]);
  });
});
