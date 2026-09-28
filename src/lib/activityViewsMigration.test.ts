import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Text guard for `supabase/migrations/0012_activity_views.sql` — see
 * `activitiesMigration.test.ts` for why this pattern exists (no live
 * Postgres here; mirrors `src/astroConfig.test.ts`).
 *
 * Same RLS posture as every table since `exercise_likes` (the 0002 lesson):
 * RLS on, no policy, explicit `service_role` GRANTs. `record_activity_view`
 * is the one atomic write path for a view — SECURITY DEFINER, pinned
 * `search_path`, EXECUTE explicitly revoked from PUBLIC (Postgres' own
 * default for a freshly created function) before being granted to
 * `service_role` only.
 */
const migrationPath = fileURLToPath(
  new URL('../../supabase/migrations/0012_activity_views.sql', import.meta.url),
);
const sql = readFileSync(migrationPath, 'utf8');

describe('0012_activity_views.sql', () => {
  it('wraps the migration in a single transaction', () => {
    expect(sql).toMatch(/^begin;/m);
    expect(sql).toMatch(/^commit;/m);
  });

  describe('activity_revisions.rights_accepted_at', () => {
    it('adds a nullable rights_accepted_at column', () => {
      expect(sql).toMatch(
        /alter table public\.activity_revisions\s+add column rights_accepted_at timestamptz;/,
      );
      expect(sql).not.toMatch(/rights_accepted_at timestamptz not null/);
    });
  });

  describe('public.activity_views', () => {
    it('enables row level security', () => {
      expect(sql).toMatch(/alter table public\.activity_views enable row level security;/);
    });

    it('creates no policy at all — service_role only, via BYPASSRLS', () => {
      expect(sql).not.toMatch(/create policy/i);
    });

    it('grants the service_role explicit table access (the 0002 lesson)', () => {
      expect(sql).toMatch(/grant select on table public\.activity_views to service_role;/);
      expect(sql).toMatch(
        /grant insert, update, delete on table public\.activity_views to service_role;/,
      );
    });

    it('never grants anything to anon or authenticated', () => {
      expect(sql).not.toMatch(/to anon/i);
      expect(sql).not.toMatch(/to authenticated/i);
    });

    it('keys the table on (user_id, activity_id), cascading on both', () => {
      expect(sql).toMatch(
        /user_id\s+uuid\s+not null references auth\.users\(id\) on delete cascade/,
      );
      expect(sql).toMatch(
        /activity_id\s+uuid\s+not null references public\.activities\(id\) on delete cascade/,
      );
      expect(sql).toMatch(/primary key \(user_id, activity_id\)/);
    });

    it('defaults view_count to 1 and the timestamps to now()', () => {
      expect(sql).toMatch(/view_count\s+int\s+not null default 1/);
      expect(sql).toMatch(/first_viewed_at\s+timestamptz\s+not null default now\(\)/);
      expect(sql).toMatch(/last_viewed_at\s+timestamptz\s+not null default now\(\)/);
    });
  });

  describe('record_activity_view()', () => {
    it('is SECURITY DEFINER with a pinned search_path', () => {
      expect(sql).toMatch(
        /create or replace function public\.record_activity_view\(p_user uuid, p_activity uuid\)/,
      );
      expect(sql).toMatch(/security definer/);
      expect(sql).toMatch(/set search_path = public/);
    });

    it('returns an int', () => {
      expect(sql).toMatch(
        /create or replace function public\.record_activity_view\(p_user uuid, p_activity uuid\)\s+returns int/,
      );
    });

    it('upserts atomically on the (user_id, activity_id) key', () => {
      expect(sql).toMatch(/on conflict \(user_id, activity_id\) do update/);
      expect(sql).toMatch(/view_count = public\.activity_views\.view_count \+ 1/);
    });

    it('revokes the default PUBLIC execute grant before granting service_role', () => {
      const revokeIdx = sql.indexOf('revoke all on function public.record_activity_view');
      const grantIdx = sql.indexOf(
        'grant execute on function public.record_activity_view(uuid, uuid) to service_role;',
      );
      expect(revokeIdx).toBeGreaterThan(-1);
      expect(grantIdx).toBeGreaterThan(-1);
      expect(revokeIdx).toBeLessThan(grantIdx);
      expect(sql).toMatch(/revoke all on function public\.record_activity_view\(uuid, uuid\) from public;/);
    });

    it('never grants execute to anon or authenticated', () => {
      expect(sql).not.toMatch(/grant execute.*to anon/i);
      expect(sql).not.toMatch(/grant execute.*to authenticated/i);
    });
  });
});
