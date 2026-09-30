import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

/**
 * The paid Courses feature (`/[lang]/cursos/**`, `0017_courses.sql`) is
 * built base-first and stays HIDDEN — no nav/hub/menu entry anywhere,
 * reachable only by URL, nothing announced — until payments actually exist.
 *
 * `Header.astro` used to carry a "Cursos" nav link (removed alongside this
 * guard — see its own test, "never links to Cursos"); this scans every
 * layout/nav component AND the home page (where a future hub card is most
 * likely to appear) so a regression fails loudly wherever it happens, not
 * just in `Header.test.ts`.
 *
 * `/admin/cursos/**` (the moderator authoring surface) is deliberately
 * exempt: it is itself unlinked from anywhere but its own URL, and the
 * negative lookbehind below excludes it explicitly.
 */
const LAYOUT_DIR = fileURLToPath(new URL('./components/layout', import.meta.url));
const HOME_PAGE = fileURLToPath(new URL('./pages/[lang]/index.astro', import.meta.url));
const SRC_ROOT = fileURLToPath(new URL('.', import.meta.url));

const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;
const COURSES_ROUTE = /(?<!admin)\/cursos(?!\w)/;

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

const navFiles = [...listFiles(LAYOUT_DIR).filter((path) => !TEST_FILE.test(path)), HOME_PAGE];

describe('navigation never links to the hidden Courses catalog', () => {
  it.each(navFiles.map((file) => [relative(SRC_ROOT, file), file] as const))(
    '%s has no /cursos link',
    (_label, file) => {
      const content = readFileSync(file, 'utf8');
      expect(content).not.toMatch(COURSES_ROUTE);
    },
  );
});
