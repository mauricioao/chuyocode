import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

// PR 2 (visual-identity) — design decision #2 (additive tokens) + #1 (display
// font), updated for the shademanga visual overhaul (yellow accent, warm
// sub-tokens removed). The Tailwind config is CommonJS, so require() it and
// assert the theme contract as pure logic. This guards against accidental
// renames of the existing `accent` scale (which has 20+ call sites) and
// confirms the display font family + elevation depth tokens are present.
const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const config = require('../../tailwind.config.cjs') as {
  theme: {
    extend: {
      colors: Record<string, Record<string, string>>;
      fontFamily: Record<string, string[]>;
      boxShadow: Record<string, string>;
    };
  };
};

const colors = config.theme.extend.colors;
const fontFamily = config.theme.extend.fontFamily;
const boxShadow = config.theme.extend.boxShadow;

describe('tailwind theme tokens', () => {
  it('preserves the accent scale shape with the yellow streaming values', () => {
    expect(colors.accent).toMatchObject({
      DEFAULT: '#FACC15',
      hover: '#EAB308',
      soft: '#FDE047',
    });
  });

  it('keeps the base surface scale', () => {
    expect(colors.base).toMatchObject({
      DEFAULT: '#09090b',
      soft: '#18181b',
      muted: '#27272a',
    });
  });

  it.each(['terracotta', 'ocre', 'amaranto'])(
    'does not define the removed %s warm token',
    (token) => {
      expect(colors[token]).toBeUndefined();
    },
  );

  it('exposes a Fraunces display font family with a serif fallback', () => {
    expect(fontFamily.display[0]).toBe('Fraunces Variable');
    expect(fontFamily.display).toContain('serif');
  });

  it('keeps a system-sans stack for body copy (web-font-free)', () => {
    expect(fontFamily.sans).toContain('system-ui');
    expect(fontFamily.sans).toContain('sans-serif');
  });

  // frontend-v3 design decision #9 — depth tokens replace flat borders.
  it.each(['elevation-1', 'elevation-2', 'elevation-3'])(
    'adds the %s boxShadow depth token',
    (token) => {
      expect(boxShadow[token]).toBeDefined();
      expect(typeof boxShadow[token]).toBe('string');
      expect(boxShadow[token]).not.toBe('');
    },
  );
});
