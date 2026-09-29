import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

/**
 * Astro serializes a hydrated island's props to JSON-like data. A FUNCTION
 * passed from `.astro` frontmatter does not survive that trip: the island
 * receives nothing and crashes the first time it calls it (this once blanked
 * the whole practice page in production with "p is not a function").
 * Component tests mount islands directly, so they cannot catch it; this
 * guard reads every `.astro` file and rejects any function declared in its
 * frontmatter being passed as a prop to a `client:*` component.
 */
const SRC_DIR = fileURLToPath(new URL('.', import.meta.url));

function listAstroFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listAstroFiles(path);
    return entry.name.endsWith('.astro') ? [path] : [];
  });
}

/** Names of functions declared in the frontmatter (`function x(` or `const x = (…) =>`). */
function frontmatterFunctions(source: string): Set<string> {
  const frontmatter = source.match(/^---\n([\s\S]*?)\n---/m)?.[1] ?? '';
  const names = new Set<string>();
  for (const m of frontmatter.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)) names.add(m[1]);
  for (const m of frontmatter.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g)) {
    names.add(m[1]);
  }
  return names;
}

/** Opening tags that hydrate a component (`client:load`, `client:idle`, …). */
function islandTags(source: string): string[] {
  return [...source.matchAll(/<[A-Z][\w.]*\b[^>]*\bclient:[a-z]+[^>]*>/g)].map((m) => m[0]);
}

describe('Astro island props', () => {
  it('never passes a frontmatter function to a hydrated island', () => {
    const offenders: string[] = [];

    for (const file of listAstroFiles(SRC_DIR)) {
      const source = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
      const functions = frontmatterFunctions(source);
      if (functions.size === 0) continue;

      for (const tag of islandTags(source)) {
        for (const m of tag.matchAll(/\b([\w-]+)=\{\s*([A-Za-z_$][\w$]*)\s*\}/g)) {
          if (functions.has(m[2])) offenders.push(`${relative(SRC_DIR, file)}: ${m[1]}={${m[2]}}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
