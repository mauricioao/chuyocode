import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Contrast guard for the light Inglés visual-theme scope
 * (`[data-theme="ingles"]`, `src/styles/global.css`) — modeled on
 * `tailwind-tokens.test.ts`'s own read-the-CSS-as-text approach, since these
 * tokens are plain custom properties, not something a component test can
 * observe.
 *
 * Asserts the WCAG contrast ratios the architecture was designed against
 * (owner-computed, see the feature's own notes), AND that the dark `:root`
 * values the rest of the site depends on (home, header/footer, Libros,
 * Noticias, auth, admin, Cursos, Aventura) are UNCHANGED — the other half of
 * "dark brand, light product": the brand must not move.
 */
const cssPath = fileURLToPath(new URL('./global.css', import.meta.url));
const css = readFileSync(cssPath, 'utf8');

/**
 * Pulls one top-level `selector { ... }` block's raw body out of the CSS
 * text, starting the search from `from`. `global.css` declares `:root`
 * TWICE (plain control-height custom properties first, the shadcn semantic
 * bridge second) — callers that need the second occurrence pass the first
 * occurrence's end as `from`.
 */
function block(selector: string, from = 0): string {
  const needle = `${selector} {`;
  const start = css.indexOf(needle, from);
  if (start === -1) throw new Error(`block not found: ${selector} (from ${from})`);
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

/** The shadcn semantic-token `:root` block — the SECOND `:root {}` in the file. */
function semanticRootBlock(): string {
  const firstEnd = css.indexOf('}', css.indexOf(':root {')) + 1;
  return block(':root', firstEnd);
}

/** Reads a single `--token: value;` declaration from a block's raw body. */
function tokenIn(body: string, name: string): string {
  const match = body.match(new RegExp(`${name}\\s*:\\s*([^;]+);`));
  if (!match) throw new Error(`token not found: ${name}`);
  return match[1].trim();
}

const ingles = block(`[data-theme='ingles']`);
const brand = block(`[data-theme='brand']`);

/** sRGB hex ("#rrggbb") -> WCAG relative luminance. */
function relativeLuminance(hex: string): number {
  const normalized = hex.replace('#', '');
  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;
  const linear = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** WCAG contrast ratio between two sRGB hex colors (order-independent). */
function contrast(hexA: string, hexB: string): number {
  const lA = relativeLuminance(hexA);
  const lB = relativeLuminance(hexB);
  const lighter = Math.max(lA, lB);
  const darker = Math.min(lA, lB);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('[data-theme="ingles"] — WCAG contrast (visual-theme pass)', () => {
  it('foreground on background clears 4.5:1', () => {
    expect(contrast(tokenIn(ingles, '--foreground'), tokenIn(ingles, '--background'))).toBeGreaterThanOrEqual(4.5);
  });

  it('muted-foreground on background and on card clears 4.5:1', () => {
    const mutedForeground = tokenIn(ingles, '--muted-foreground');
    expect(contrast(mutedForeground, tokenIn(ingles, '--background'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(mutedForeground, tokenIn(ingles, '--card'))).toBeGreaterThanOrEqual(4.5);
  });

  it('accent-ink on background and on card clears 4.5:1 (bare accent text fails this on light)', () => {
    const accentInk = tokenIn(ingles, '--color-accent-ink');
    expect(contrast(accentInk, tokenIn(ingles, '--background'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(accentInk, tokenIn(ingles, '--card'))).toBeGreaterThanOrEqual(4.5);
  });

  it('primary-foreground (ink on the yellow fill) clears 4.5:1 on primary', () => {
    expect(contrast(tokenIn(ingles, '--primary-foreground'), tokenIn(ingles, '--primary'))).toBeGreaterThanOrEqual(4.5);
  });

  it('input border clears 3:1 on background and on card', () => {
    const input = tokenIn(ingles, '--input');
    expect(contrast(input, tokenIn(ingles, '--background'))).toBeGreaterThanOrEqual(3);
    expect(contrast(input, tokenIn(ingles, '--card'))).toBeGreaterThanOrEqual(3);
  });

  it('the focus ring clears 3:1 on background', () => {
    expect(contrast(tokenIn(ingles, '--ring'), tokenIn(ingles, '--background'))).toBeGreaterThanOrEqual(3);
  });

  // Secondary checks, same table: destructive text on its own tint-free
  // surfaces, and white-on-destructive for a solid destructive fill.
  it('destructive text clears 4.5:1 on background, and white on the destructive fill clears 4.5:1', () => {
    const destructive = tokenIn(ingles, '--destructive');
    expect(contrast(destructive, tokenIn(ingles, '--background'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(tokenIn(ingles, '--destructive-foreground'), destructive)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('the dark brand must not move (guards "the home must not change")', () => {
  // The exact values `:root`/`.dark` have carried since before this feature —
  // a literal copy, not a re-derivation, so a future accidental edit to
  // either block fails this test instead of silently reaching production.
  const DARK_ROOT: Record<string, string> = {
    '--background': '#000000',
    '--foreground': '#f4f4f5',
    '--card': '#18181b',
    '--popover': '#18181b',
    '--primary': '#facc15',
    '--primary-foreground': '#000000',
    '--secondary': '#27272a',
    '--muted': '#27272a',
    '--muted-foreground': '#a1a1aa',
    '--accent': '#27272a',
    '--destructive': '#ef4444',
    '--success': '#34d399',
    '--border': '#27272a',
    '--input': '#27272a',
    '--ring': '#facc15',
  };

  it.each(Object.entries(DARK_ROOT))('%s is unchanged in :root', (name, expected) => {
    expect(tokenIn(semanticRootBlock(), name).toLowerCase()).toBe(expected);
  });

  it.each(Object.entries(DARK_ROOT))('%s is unchanged in .dark', (name, expected) => {
    expect(tokenIn(block('.dark'), name).toLowerCase()).toBe(expected);
  });

  // The brand-chrome scope (header/footer/nav bar/global scroll-to-top, even
  // nested inside a light `theme="ingles"` page) restates the SAME dark
  // defaults — if it ever drifted from :root/.dark, brand chrome would look
  // different depending on which page it rendered on.
  it.each(Object.entries(DARK_ROOT))('%s in [data-theme="brand"] matches the dark default', (name, expected) => {
    expect(tokenIn(brand, name).toLowerCase()).toBe(expected);
  });
});
