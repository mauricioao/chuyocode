/**
 * Classifies every unit test file into the Vitest project that should run
 * it, so `getViteConfig()` (Astro's Vite plugin: Tailwind, React
 * integration, i18n, adapter resolution) is only paid for by the tests that
 * actually need it — those that render a `.astro` file through the
 * Container API (`src/testSupport/astroContainer.ts`, or a direct
 * `astro/container` / `astro:container` import).
 *
 * This is the single source of truth for the split: `vitest.astro.config.ts`,
 * `vitest.jsdom.config.ts` and `vitest.node.config.ts` all derive their
 * `include` from this module, so there is no hand-maintained file list to
 * fall out of sync. `vitestProjectSplit.test.ts` guards the classifier
 * itself (every discovered test file lands in exactly one project).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOTS = ['src', 'tests/unit'];
const TEST_FILE = /\.(test|spec)\.[tj]sx?$/;
const SKIP_DIRS = new Set(['node_modules', 'dist']);

// Matches the two ways a test renders a `.astro` file: importing Astro's
// Container API directly, or through the shared `astroContainer` helper.
const ASTRO_CONTENT = /from\s+['"](?:astro\/container|astro:container|[^'"]*astroContainer)['"]/;
const JSDOM_PRAGMA = /@vitest-environment\s+jsdom/;

export interface ProjectSplit {
  astro: string[];
  jsdom: string[];
  node: string[];
}

function safeReaddir(dir: string) {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function listTestFiles(root: string): string[] {
  return safeReaddir(root).flatMap((entry) => {
    const full = join(root, entry.name);
    if (entry.isDirectory()) {
      return SKIP_DIRS.has(entry.name) ? [] : listTestFiles(full);
    }
    return TEST_FILE.test(entry.name) ? [full] : [];
  });
}

/** Classifies every unit test file under `src/` and `tests/unit/` by content. */
export function splitTestFiles(cwd: string): ProjectSplit {
  const files = ROOTS.flatMap((root) => listTestFiles(join(cwd, root)));
  const split: ProjectSplit = { astro: [], jsdom: [], node: [] };

  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const posixPath = relative(cwd, file).split(sep).join('/');

    if (ASTRO_CONTENT.test(source)) {
      split.astro.push(posixPath);
    } else if (JSDOM_PRAGMA.test(source)) {
      split.jsdom.push(posixPath);
    } else {
      split.node.push(posixPath);
    }
  }

  return split;
}
