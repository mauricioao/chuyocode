import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Text guard for `supabase/migrations/0010_user_subscriptions.sql` — see
 * `userRolesMigration.test.ts` for why this pattern exists (no live Postgres
 * here; mirrors `src/astroConfig.test.ts`).
 *
 * Same security posture as every table since `exercise_likes` (the 0002
 * lesson): RLS must be ON, with NO anon-facing policy, and the `service_role`
 * GRANTs must exist explicitly — BYPASSRLS does not imply a table-level GRANT.
 */
const migrationPath = fileURLToPath(
  new URL('../../supabase/migrations/0010_user_subscriptions.sql', import.meta.url),
);
const sql = readFileSync(migrationPath, 'utf8');

describe('0010_user_subscriptions.sql', () => {
  it('wraps the migration in a single transaction', () => {
    expect(sql).toMatch(/^begin;/m);
    expect(sql).toMatch(/^commit;/m);
  });

  it('enables row level security on user_subscriptions', () => {
    expect(sql).toMatch(
      /alter table public\.user_subscriptions enable row level security;/,
    );
  });

  it('creates no policy at all — service_role only, via BYPASSRLS', () => {
    expect(sql).not.toMatch(/create policy/i);
  });

  it('grants the service_role explicit table access (the 0002 lesson)', () => {
    expect(sql).toMatch(/grant select on table public\.user_subscriptions to service_role;/);
    expect(sql).toMatch(
      /grant insert, update, delete on table public\.user_subscriptions to service_role;/,
    );
  });

  it('never grants anything to anon or authenticated', () => {
    expect(sql).not.toMatch(/to anon/i);
    expect(sql).not.toMatch(/to authenticated/i);
  });

  it('constrains plan to exactly the premium vocabulary', () => {
    expect(sql).toMatch(/check \(plan in \('premium'\)\)/);
  });

  it('constrains status to the active/canceled/past_due vocabulary', () => {
    expect(sql).toMatch(/check \(status in \('active','canceled','past_due'\)\)/);
  });

  it('keys the table on user_id alone (one subscription row per user)', () => {
    expect(sql).toMatch(/user_id\s+uuid\s+primary key/);
  });

  it('cascades on the referenced user, mirroring auth.users deletion', () => {
    expect(sql).toMatch(/references auth\.users\(id\) on delete cascade/);
  });

  it('leaves current_period_end nullable — no end date means a manual/test grant', () => {
    expect(sql).not.toMatch(/current_period_end\s+timestamptz\s+not null/);
  });

  it('defaults created_at and updated_at to now(), not null', () => {
    expect(sql).toMatch(/created_at\s+timestamptz\s+not null default now\(\)/);
    expect(sql).toMatch(/updated_at\s+timestamptz\s+not null default now\(\)/);
  });
});
