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

  it('preserves the accent scale with the yellow streaming values', () => {
    expect(token('--color-accent')?.toLowerCase()).toBe('#facc15');
    expect(token('--color-accent-hover')?.toLowerCase()).toBe('#eab308');
    expect(token('--color-accent-soft')?.toLowerCase()).toBe('#fde047');
  });

  it('keeps the base surface scale', () => {
    expect(token('--color-base')?.toLowerCase()).toBe('#000000');
    expect(token('--color-base-soft')?.toLowerCase()).toBe('#18181b');
    expect(token('--color-base-muted')?.toLowerCase()).toBe('#27272a');
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
