import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

/**
 * Vite's dev dependency scanner reads `.astro` files as plain HTML: it drops
 * `<!-- -->` comments, pairs every script opening tag it finds with the next
 * `</script>`, and parses whatever sits between as JavaScript. A literal
 * script tag written in a JSX or frontmatter comment is NOT skipped, so it
 * once made the scanner parse English prose: the scan failed, dev skipped
 * dependency pre-bundling, and islands failed to hydrate on a cold start
 * (flaking the e2e suite). In prose, write "script element" instead.
 */
const SRC_DIR = fileURLToPath(new URL('.', import.meta.url));
const HTML_COMMENT = /<!--.*?-->/gs;
// Same opening-tag shape Vite's scanner matches (a self-closing tag is not one).
const OPENING =
  /<script(?:\s+[a-z_:][-\w:]*(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^"'<>=\s]+))?)*\s*>/gi;
const CLOSING = /<\/script>/gi;

function listAstroFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listAstroFiles(path);
    return path.endsWith('.astro') ? [path] : [];
  });
}

function count(source: string, pattern: RegExp): number {
  return source.match(pattern)?.length ?? 0;
}

describe('.astro script tags', () => {
  it('closes every script opening tag the dev dependency scanner sees', () => {
    const unbalanced = listAstroFiles(SRC_DIR)
      .filter((path) => {
        const source = readFileSync(path, 'utf8').replace(HTML_COMMENT, '');
        return count(source, OPENING) !== count(source, CLOSING);
      })
      .map((path) => relative(SRC_DIR, path));

    expect(unbalanced).toEqual([]);
  });

  // A balanced pair is not enough: a script element inside a frontmatter
  // string (an HTML response built in a template literal) still gets parsed,
  // and its `${...}` placeholders are not valid JavaScript to the scanner.
  // Build such HTML in a `.ts` module, which the scanner never reads as HTML.
  it('keeps script tags out of the frontmatter', () => {
    const offenders = listAstroFiles(SRC_DIR)
      .filter((path) => {
        const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(path, 'utf8'))?.[1] ?? '';
        return count(frontmatter, OPENING) > 0;
      })
      .map((path) => relative(SRC_DIR, path));

    expect(offenders).toEqual([]);
  });
});
