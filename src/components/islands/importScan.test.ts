import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

/**
 * Islands receive auth state as a PROP, never a Supabase call (design.md §2,
 * "Auth-dependent rendering", task 9.5).
 *
 * `Astro.locals.user` is resolved once per request by `src/middleware.ts` and
 * handed to an island as `authed={user !== null}` (see `ReactionControl.tsx`).
 * An island that imported the Supabase client directly could query identity
 * itself from the browser bundle, which would ship the anon key's reach
 * (or worse, tempt a service-role import) to every visitor. This walks every
 * source file under `src/components/islands/**` and fails if any of them
 * imports `@supabase/*` or `@lib/supabase*`.
 */
const islandsDir = fileURLToPath(new URL('.', import.meta.url));

function collectSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(full);
    if (!/\.(ts|tsx)$/.test(entry.name)) return [];
    // Test files are allowed to import test helpers that touch Supabase
    // mocks; this guard is about the SHIPPED island source only.
    if (/\.test\.tsx?$/.test(entry.name)) return [];
    return [full];
  });
}

const FORBIDDEN_IMPORT = /from\s+['"](@supabase\/|@lib\/supabase)/;

describe('src/components/islands/** — no direct Supabase access', () => {
  const files = collectSourceFiles(islandsDir);

  it('finds at least one island source file (so this guard cannot vacuously pass)', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s does not import @supabase/* or @lib/supabase*', (file) => {
    const source = readFileSync(file, 'utf8');
    expect(source).not.toMatch(FORBIDDEN_IMPORT);
  });
});
