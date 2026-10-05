import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Visual-identity token contract (design decision #2 additive tokens + #1
// display font), now on Tailwind 4. The theme moved from tailwind.config.cjs
// to the CSS-first `@theme` block in global.css, so this guard reads that CSS
// and asserts the token contract as text. It protects the `accent` scale
// (20+ call sites), the base surface scale, the Raleway display font, and the
// elevation depth tokens against accidental renames/removals.
const cssPath = fileURLToPath(new URL('./global.css', import.meta.url));
const css = readFileSync(cssPath, 'utf8');

/** Read a single `--token: value;` declaration from the @theme block. */
function token(name: string): string | undefined {
  const match = css.match(new RegExp(`${name}\\s*:\\s*([^;]+);`));
  return match ? match[1].trim() : undefined;
}

describe('tailwind theme tokens (CSS-first @theme)', () => {
  it('imports Tailwind 4 and opts into class-based dark mode', () => {
    expect(css).toContain("@import 'tailwindcss'");
    expect(css).toContain('@custom-variant dark');
  });

  it('never names a color after a font-size step (text-* would become a color)', () => {
    // Tailwind 4 resolves `text-<name>` to a color when `--color-<name>` exists,
    // so a `--color-base` turned every `text-base` (font size) into black text.
    const fontSizeSteps = new Set([
      'xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl', '7xl', '8xl', '9xl',
    ]);
    const colorNames = [...css.matchAll(/--color-([a-z0-9-]+)\s*:/g)].map((m) => m[1]);

    expect(colorNames.length).toBeGreaterThan(0);
    expect(colorNames.filter((name) => fontSizeSteps.has(name))).toEqual([]);
  });

  it('preserves the accent scale with the yellow streaming values', () => {
    expect(token('--color-accent')?.toLowerCase()).toBe('#facc15');
    expect(token('--color-accent-hover')?.toLowerCase()).toBe('#eab308');
    expect(token('--color-accent-soft')?.toLowerCase()).toBe('#fde047');
  });

  it('keeps the base surface scale', () => {
    expect(token('--color-surface')?.toLowerCase()).toBe('#000000');
    expect(token('--color-surface-soft')?.toLowerCase()).toBe('#18181b');
    expect(token('--color-surface-muted')?.toLowerCase()).toBe('#27272a');
  });

  it.each(['terracotta', 'ocre', 'amaranto'])(
    'does not define the removed %s warm token',
    (name) => {
      expect(token(`--color-${name}`)).toBeUndefined();
    },
  );

  it('exposes a Raleway display font family with a sans fallback', () => {
    const display = token('--font-display');
    expect(display).toContain('Raleway Variable');
    expect(display).toContain('sans-serif');
  });

  it('keeps a system-sans stack for body copy (web-font-free)', () => {
    const sans = token('--font-sans');
    expect(sans).toContain('system-ui');
    expect(sans).toContain('sans-serif');
  });

  // Design decision #9 — depth tokens replace flat borders.
  it.each(['elevation-1', 'elevation-2', 'elevation-3'])(
    'adds the %s shadow depth token',
    (name) => {
      const value = token(`--shadow-${name}`);
      expect(value).toBeDefined();
      expect(value).not.toBe('');
    },
  );
});

// Regression guard for a real production bug: an input/select/textarea
// rendering dark text on this theme's dark surfaces (looked empty/invisible).
// The fix is site-wide, in the base layer, so no component has to remember
// its own `text-foreground` class — see `global.css`'s own comment for why.
describe('form control legibility (no dark text on a dark surface)', () => {
  it('declares a dark color-scheme so native form-control chrome matches the theme', () => {
    expect(css).toMatch(/:root\s*{[^}]*color-scheme:\s*dark;/);
  });

  it('gives every input/select/textarea an explicit theme foreground color', () => {
    expect(css).toMatch(/input,\s*select,\s*textarea\s*{\s*color:\s*var\(--foreground\);/);
  });

  it('gives placeholders a readable, non-transparent muted color', () => {
    expect(css).toMatch(/::placeholder\s*{\s*color:\s*var\(--muted-foreground\);\s*opacity:\s*1;/);
  });
});

// Tailwind 4's preflight dropped v3's `cursor: pointer` on `button`; restored
// site-wide here rather than per component (bug: buttons/links showed the
// plain arrow cursor instead of a hand).
describe('site-wide pointer cursor', () => {
  it('sets a pointer cursor on clickable elements', () => {
    expect(css).toMatch(/button:not\(:disabled\),/);
    expect(css).toContain("[role='button']:not([aria-disabled='true']),");
    expect(css).toContain("a[href],");
    expect(css).toMatch(/cursor:\s*pointer;/);
  });

  it('sets a not-allowed cursor on disabled buttons', () => {
    expect(css).toMatch(/button:disabled,[\s\S]*?cursor:\s*not-allowed;/);
  });
});

// Theme-debt guard (theme-remap-cleanup): a theme scope used to re-declare a
// few raw Tailwind default-palette steps (`--color-zinc-100`, `--color-
// emerald-500`, …) so existing `text-zinc-*`/`text-emerald-*`/`text-amber-*`
// call sites would silently resolve to a DIFFERENT colour depending on which
// scope they rendered under — "zinc-300" secretly meaning "muted ink" inside
// Inglés. Call sites now use a semantic token (`text-muted-foreground`,
// `text-success`, `text-hint`, …) instead, so this asserts the remap never
// comes back: a literal Tailwind palette utility must mean the same, single
// colour everywhere, in every scope.
describe('no raw Tailwind palette color is re-declared inside a theme scope (theme-debt guard)', () => {
  // Tailwind's default color families (the ones a bare `--color-<family>-<n>`
  // step could belong to) — same list the feature's own task spec guards.
  const DEFAULT_PALETTE_FAMILIES = [
    'slate', 'gray', 'zinc', 'neutral', 'stone', 'red', 'orange', 'amber', 'yellow',
    'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet',
    'purple', 'fuchsia', 'pink', 'rose',
  ];
  const PALETTE_VAR = new RegExp(`--color-(?:${DEFAULT_PALETTE_FAMILIES.join('|')})-\\d+\\s*:`);

  /** Pulls one top-level `selector { ... }` block's raw body out of the CSS
   * text (same brace-depth approach `ingles-theme-contrast.test.ts` uses). */
  function themeScopeBlock(selector: string): string {
    const needle = `${selector} {`;
    const start = css.indexOf(needle);
    if (start === -1) throw new Error(`block not found: ${selector}`);
    let depth = 0;
    let i = start + needle.length - 1; // position of the opening '{'
    for (; i < css.length; i++) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}') {
        depth--;
        if (depth === 0) break;
      }
    }
    return css.slice(start + needle.length, i);
  }

  it.each([`[data-theme='brand']`, `[data-theme='ingles']`])(
    'never re-declares a raw Tailwind default-palette variable inside %s',
    (selector) => {
      expect(themeScopeBlock(selector)).not.toMatch(PALETTE_VAR);
    },
  );
});

// Creator polish round 3: a scrollbar appearing/disappearing (e.g. the
// activity editor's block list) used to steal ~15px and reflow the canvas
// and properties panel sideways. Fixed with a reserved scrollbar gutter at
// the page level PLUS a thin, always-visible (never auto-hidden) scrollbar —
// an auto-hidden one would still cause the same jump on hover/scroll.
describe('scrollbar (creator polish round 3 — no layout jump)', () => {
  it('reserves the scrollbar gutter at the page level', () => {
    expect(css).toMatch(/:root\s*{[^}]*scrollbar-gutter:\s*stable;/);
  });

  it('declares a thin, dark-theme scrollbar for Firefox (scrollbar-width/scrollbar-color)', () => {
    expect(css).toMatch(/scrollbar-width:\s*thin;/);
    expect(css).toMatch(/scrollbar-color:\s*var\(--muted\)\s+transparent;/);
  });

  it('declares a matching WebKit fallback with a rounded thumb that lightens on hover', () => {
    expect(css).toContain('::-webkit-scrollbar {');
    expect(css).toMatch(/::-webkit-scrollbar\s*{[^}]*width:\s*8px;/);
    expect(css).toMatch(/::-webkit-scrollbar-thumb\s*{[^}]*border-radius:\s*9999px;/);
    expect(css).toMatch(/::-webkit-scrollbar-thumb:hover\s*{\s*background-color:\s*var\(--muted-foreground\);/);
  });
});
