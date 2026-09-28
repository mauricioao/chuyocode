import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Text guard for `supabase/migrations/0008_user_roles.sql` — see
 * `exerciseAuthorshipMigration.test.ts` for why this pattern exists (no live
 * Postgres here; mirrors `src/astroConfig.test.ts`).
 *
 * The critical invariant for a brand-new table is the `0002` lesson, repeated
 * at every table since `exercise_likes`: RLS must be ON, with NO anon-facing
 * policy, and the `service_role` GRANTs must exist explicitly — BYPASSRLS
 * does not imply a table-level GRANT.
 */
const migrationPath = fileURLToPath(
  new URL('../../supabase/migrations/0008_user_roles.sql', import.meta.url),
);
const sql = readFileSync(migrationPath, 'utf8');

describe('0008_user_roles.sql', () => {
  it('enables row level security on user_roles', () => {
    expect(sql).toMatch(/alter table public\.user_roles enable row level security;/);
  });

  it('creates no policy at all — service_role only, via BYPASSRLS', () => {
    expect(sql).not.toMatch(/create policy/i);
  });

  it('grants the service_role explicit table access (the 0002 lesson)', () => {
    expect(sql).toMatch(/grant select on table public\.user_roles to service_role;/);
    expect(sql).toMatch(/grant insert, update, delete on table public\.user_roles to service_role;/);
  });

  it('never grants anything to anon or authenticated', () => {
    expect(sql).not.toMatch(/to anon/i);
    expect(sql).not.toMatch(/to authenticated/i);
  });

  it('constrains role to exactly the moderator vocabulary', () => {
    expect(sql).toMatch(/check \(role in \('moderator'\)\)/);
  });

  it('keys the table on (user_id, role) with no secondary index', () => {
    expect(sql).toMatch(/primary key \(user_id, role\)/);
    expect(sql).not.toMatch(/create index/i);
  });

  it('cascades on the referenced user, mirroring auth.users deletion', () => {
    expect(sql).toMatch(/references auth\.users\(id\) on delete cascade/);
  });
});
