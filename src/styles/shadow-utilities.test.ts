import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from 'tailwindcss';

/**
 * Shadow utilities must follow the theme at runtime (DIRECCION-VISUAL §3.2:
 * Inglés kit shadows are ink-tinted, never pure black).
 *
 * Tailwind 4 parses a `--shadow-*` theme value to splice `--tw-shadow-color`
 * into it, so `shadow-elevation-2` used to carry the brand's literal
 * `rgb(0 0 0 / 0.5)` and the `[data-theme='ingles']` override never reached
 * it. This compiles the REAL `global.css` with Tailwind and checks the
 * generated utility CSS — the observable result the browser receives.
 */
const stylesDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(stylesDir, '../..');
const packageCss: Record<string, string> = {
  tailwindcss: 'node_modules/tailwindcss/index.css',
  'tw-animate-css': 'node_modules/tw-animate-css/dist/tw-animate.css',
};

const LEVELS = ['elevation-1', 'elevation-2', 'elevation-3', 'floating'] as const;

let output = '';

beforeAll(async () => {
  const source = readFileSync(resolve(stylesDir, 'global.css'), 'utf8');
  const compiler = await compile(source, {
    base: stylesDir,
    loadStylesheet: async (id, base) => {
      const path = packageCss[id] ? resolve(projectRoot, packageCss[id]) : resolve(base, id);
      return { path, base: dirname(path), content: readFileSync(path, 'utf8') };
    },
  });
  output = compiler.build([...LEVELS.map((level) => `shadow-${level}`), 'hover:shadow-elevation-2']);
});

/** Body of the first rule whose selector is exactly `selector`. */
function rule(selector: string): string {
  const start = output.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`rule not generated: ${selector}`);
  return output.slice(start, output.indexOf('}', start));
}

/** Body of the first top-level block opened by `selector` in the output. */
function declarationsOf(selector: string): string {
  const start = output.indexOf(`${selector} {`);
  return start === -1 ? '' : output.slice(start, output.indexOf('}', start));
}

describe('shadow-elevation-* / shadow-floating utilities', () => {
  it.each(LEVELS)('shadow-%s reads its token at runtime instead of a baked-in colour', (level) => {
    const body = rule(`.shadow-${level}`);
    expect(body).toContain(`--tw-shadow: var(--shadow-${level});`);
    expect(body).not.toMatch(/rgb\(0 0 0/);
    // Still composes with ring-* like every other Tailwind shadow utility.
    expect(body).toContain('box-shadow: var(--tw-inset-shadow), var(--tw-inset-ring-shadow), var(--tw-ring-offset-shadow), var(--tw-ring-shadow), var(--tw-shadow);');
  });

  it('keeps variants working (hover:shadow-elevation-2)', () => {
    expect(rule('.hover\\:shadow-elevation-2:hover')).toContain('--tw-shadow: var(--shadow-elevation-2);');
  });

  it('never emits a self-referencing (cyclic, hence invalid) token declaration', () => {
    for (const level of LEVELS) {
      expect(output).not.toContain(`--shadow-${level}: var(--shadow-${level})`);
    }
  });

  it('keeps the brand defaults exactly and the Inglés ink-tinted overrides', () => {
    expect(output).toContain('--shadow-elevation-1: 0 1px 2px 0 rgb(0 0 0 / 0.4);');
    expect(output).toContain('--shadow-elevation-2: 0 4px 12px -2px rgb(0 0 0 / 0.5);');
    expect(output).toContain('--shadow-elevation-3: 0 12px 32px -4px rgb(0 0 0 / 0.6);');
    expect(output).toContain('--shadow-floating: 0 8px 24px -6px rgb(0 0 0 / 0.5), 0 2px 8px -2px rgb(0 0 0 / 0.4);');

    const ingles = declarationsOf("[data-theme='ingles']");
    expect(ingles).toContain('--shadow-elevation-1: 0 2px 8px rgb(17 18 21 / 0.06);');
    expect(ingles).toContain('--shadow-elevation-2: 0 6px 20px rgb(17 18 21 / 0.1);');
    expect(ingles).toContain('--shadow-elevation-3: 0 12px 40px rgb(17 18 21 / 0.14);');
  });
});
