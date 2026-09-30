import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Text guard for `supabase/migrations/0015_activity_search_unaccent.sql` —
 * see `activityViewsMigration.test.ts` for why this pattern exists (no live
 * Postgres here; mirrors `src/astroConfig.test.ts`).
 */
const migrationPath = fileURLToPath(
  new URL('../../supabase/migrations/0015_activity_search_unaccent.sql', import.meta.url),
);
const sql = readFileSync(migrationPath, 'utf8');

describe('0015_activity_search_unaccent.sql', () => {
  it('wraps the migration in a single transaction', () => {
    expect(sql).toMatch(/^begin;/m);
    expect(sql).toMatch(/^commit;/m);
  });

  describe('unaccent extension', () => {
    it('creates unaccent in the extensions schema', () => {
      expect(sql).toMatch(/create extension if not exists unaccent with schema extensions;/);
    });
  });

  describe('public.immutable_unaccent(text)', () => {
    it('is a strict, immutable, parallel-safe SQL wrapper with a pinned search_path', () => {
      expect(sql).toMatch(/create or replace function public\.immutable_unaccent\(text\)\s*returns text/);
      expect(sql).toMatch(/language sql/);
      expect(sql).toMatch(/immutable/);
      expect(sql).toMatch(/parallel safe/);
      expect(sql).toMatch(/strict/);
      expect(sql).toMatch(/set search_path = ''/);
    });

    it("calls unaccent() with the dictionary explicitly pinned, not the search_path's default", () => {
      expect(sql).toMatch(
        /select extensions\.unaccent\('extensions\.unaccent'::regdictionary, \$1\)/,
      );
    });

    it('revokes the default PUBLIC/anon/authenticated execute grants before granting service_role', () => {
      const revokeIdx = sql.indexOf('revoke all on function public.immutable_unaccent(text) from public;');
      const revokeAnonIdx = sql.indexOf(
        'revoke all on function public.immutable_unaccent(text) from anon, authenticated;',
      );
      const grantIdx = sql.indexOf(
        'grant execute on function public.immutable_unaccent(text) to service_role;',
      );
      expect(revokeIdx).toBeGreaterThan(-1);
      expect(revokeAnonIdx).toBeGreaterThan(-1);
      expect(grantIdx).toBeGreaterThan(-1);
      expect(revokeIdx).toBeLessThan(grantIdx);
      expect(revokeAnonIdx).toBeLessThan(grantIdx);
    });
  });

  describe('activities.title_search', () => {
    it('is a stored generated column, lowercased and unaccented', () => {
      expect(sql).toMatch(
        /add column title_search text generated always as \(lower\(public\.immutable_unaccent\(title\)\)\) stored;/,
      );
    });

    it('creates a schema-qualified trigram GIN index on title_search', () => {
      expect(sql).toMatch(
        /create index activities_title_search_trgm_idx\s*on public\.activities using gin \(title_search extensions\.gin_trgm_ops\);/,
      );
    });
  });

  describe('RLS + grants', () => {
    it('creates no policy at all', () => {
      expect(sql).not.toMatch(/create policy/i);
    });

    it('never grants immutable_unaccent execute to anon or authenticated', () => {
      expect(sql).not.toMatch(/grant.*immutable_unaccent.*to anon/i);
      expect(sql).not.toMatch(/grant.*immutable_unaccent.*to authenticated/i);
    });
  });
});
