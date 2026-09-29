import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Text guard for `supabase/migrations/0016_activity_provenance.sql` — see
 * `activityViewsMigration.test.ts` for why this pattern exists (no live
 * Postgres here; mirrors `src/astroConfig.test.ts`).
 */
const migrationPath = fileURLToPath(
  new URL('../../supabase/migrations/0016_activity_provenance.sql', import.meta.url),
);
const sql = readFileSync(migrationPath, 'utf8');

describe('0016_activity_provenance.sql', () => {
  it('wraps the migration in a single transaction', () => {
    expect(sql).toMatch(/^begin;/m);
    expect(sql).toMatch(/^commit;/m);
  });

  describe('activities.source_activity_id', () => {
    it('is a nullable self-reference that sets null on delete', () => {
      expect(sql).toMatch(
        /add column source_activity_id uuid references public\.activities\(id\) on delete set null;/,
      );
    });

    it('never marks the column not null', () => {
      expect(sql).not.toMatch(/source_activity_id uuid not null/);
    });
  });

  describe('activities_duplicates_by_author_idx', () => {
    it('is a partial index on (author_id, created_at) where source_activity_id is not null', () => {
      expect(sql).toMatch(
        /create index activities_duplicates_by_author_idx\s*on public\.activities \(author_id, created_at\)\s*where source_activity_id is not null;/,
      );
    });
  });

  describe('RLS + grants', () => {
    it('creates no policy at all', () => {
      expect(sql).not.toMatch(/create policy/i);
    });

    it('grants nothing new to anon or authenticated', () => {
      expect(sql).not.toMatch(/grant.*to anon/i);
      expect(sql).not.toMatch(/grant.*to authenticated/i);
    });
  });
});
