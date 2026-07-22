import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

// PR 2 (visual-identity) — design decision #2 (additive tokens) + #1 (display
// font). The Tailwind config is CommonJS, so require() it and assert the theme
// contract as pure logic. This guards against accidental renames of the
// existing `accent` scale (which has 20+ call sites) and confirms the new
// Andean tokens + display font family are present.
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
  it('preserves the existing accent scale unchanged (no renames)', () => {
    expect(colors.accent).toMatchObject({
      DEFAULT: '#ea580c',
      hover: '#c2410c',
      soft: '#fb923c',
      terracotta: '#b45309',
    });
  });

  it('preserves the base surface scale', () => {
    expect(colors.base).toMatchObject({
      DEFAULT: '#09090b',
      soft: '#18181b',
      muted: '#27272a',
    });
  });

  it.each(['terracotta', 'ocre', 'amaranto'])(
    'adds the %s Andean token with DEFAULT/soft/hover',
    (token) => {
      expect(colors[token]).toBeDefined();
      expect(colors[token]).toHaveProperty('DEFAULT');
      expect(colors[token]).toHaveProperty('soft');
      expect(colors[token]).toHaveProperty('hover');
    },
  );

  it('does not collide top-level terracotta with accent.terracotta', () => {
    // accent.terracotta is a shade string; top-level terracotta is a scale.
    expect(typeof colors.accent.terracotta).toBe('string');
    expect(typeof colors.terracotta).toBe('object');
  });

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
