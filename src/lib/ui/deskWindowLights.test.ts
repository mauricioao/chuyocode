import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DESK_WINDOW_LIGHT_CLASS } from './deskWindowLights';

/**
 * Guards the ONE-source-of-truth claim in `deskWindowLights.ts`'s own
 * header: both render paths that draw a desk window's traffic lights — the
 * genuine title bar (`DeskWindow.astro`) and the host's chrome-less
 * fallback bar (`deskWindowManager.ts`) — must consume this module instead
 * of their own literal class strings, so a future palette edit can never
 * leave one path behind. Reads the two source files as text (same
 * string-based approach `tailwind-tokens.test.ts`/
 * `ingles-theme-contrast.test.ts` already use for `global.css`), since a
 * render-level assertion would need the Astro component harness just to
 * prove a string literal.
 */
describe('deskWindowLights — shared traffic-light constant', () => {
  it('exposes exactly close/minimize/fullscreen, each its own dedicated traffic-* class', () => {
    expect(DESK_WINDOW_LIGHT_CLASS).toEqual({
      close: 'bg-traffic-red',
      minimize: 'bg-traffic-yellow',
      fullscreen: 'bg-traffic-green',
    });
  });

  it('DeskWindow.astro (the genuine title bar) imports and uses the shared constant, never a literal bg-pop-*/bg-traffic-* light class', () => {
    const path = fileURLToPath(new URL('../../components/ingles/DeskWindow.astro', import.meta.url));
    const source = readFileSync(path, 'utf8');
    expect(source).toContain("import { DESK_WINDOW_LIGHT_CLASS } from '@lib/ui/deskWindowLights'");
    expect(source).toContain('DESK_WINDOW_LIGHT_CLASS.close');
    expect(source).toContain('DESK_WINDOW_LIGHT_CLASS.minimize');
    expect(source).toContain('DESK_WINDOW_LIGHT_CLASS.fullscreen');
    expect(source).not.toMatch(/class="[^"]*\bbg-(pop|traffic)-(red|yellow|green)\b/);
  });

  it('deskWindowManager.ts (the chrome-less fallback bar) imports and uses the shared constant, never a literal bg-pop-*/bg-traffic-* light class', () => {
    const path = fileURLToPath(new URL('./deskWindowManager.ts', import.meta.url));
    const source = readFileSync(path, 'utf8');
    expect(source).toContain("import { DESK_WINDOW_LIGHT_CLASS } from './deskWindowLights'");
    expect(source).toContain('DESK_WINDOW_LIGHT_CLASS.close');
    expect(source).toContain('DESK_WINDOW_LIGHT_CLASS.minimize');
    expect(source).toContain('DESK_WINDOW_LIGHT_CLASS.fullscreen');
    expect(source).not.toMatch(/buildFallbackLight\(doc, '(bg-pop|bg-traffic)-(red|yellow|green)'/);
  });
});
