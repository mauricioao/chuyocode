import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Text guard for `supabase/migrations/0014_activity_discovery.sql` — see
 * `activityViewsMigration.test.ts` for why this pattern exists (no live
 * Postgres here; mirrors `src/astroConfig.test.ts`).
 */
const migrationPath = fileURLToPath(
  new URL('../../supabase/migrations/0014_activity_discovery.sql', import.meta.url),
);
const sql = readFileSync(migrationPath, 'utf8');

describe('0014_activity_discovery.sql', () => {
  it('wraps the migration in a single transaction', () => {
    expect(sql).toMatch(/^begin;/m);
    expect(sql).toMatch(/^commit;/m);
  });

  describe('public.activity_hearts', () => {
    it('keys the table on (user_id, activity_id), cascading on both', () => {
      expect(sql).toMatch(/user_id\s+uuid\s+not null references auth\.users\(id\) on delete cascade/);
      expect(sql).toMatch(
        /activity_id\s+uuid\s+not null references public\.activities\(id\) on delete cascade/,
      );
      expect(sql).toMatch(/primary key \(user_id, activity_id\)/);
    });

    it('enables row level security with no policy', () => {
      expect(sql).toMatch(/alter table public\.activity_hearts enable row level security;/);
    });

    it('grants the service_role explicit table access (the 0002 lesson)', () => {
      expect(sql).toMatch(/grant select on table public\.activity_hearts to service_role;/);
      expect(sql).toMatch(/grant insert, update, delete on table public\.activity_hearts to service_role;/);
    });

    it('never grants anything to anon or authenticated', () => {
      expect(sql).not.toMatch(/grant.*activity_hearts.*to anon/i);
      expect(sql).not.toMatch(/grant.*activity_hearts.*to authenticated/i);
    });
  });

  describe('denormalized counters on activities', () => {
    it('adds heart_count and view_total, both defaulted to 0', () => {
      expect(sql).toMatch(/add column heart_count int not null default 0,/);
      expect(sql).toMatch(/add column view_total {2}int not null default 0;/);
    });

    it('floors heart_count at zero with a table constraint', () => {
      expect(sql).toMatch(
        /add constraint activities_heart_count_non_negative check \(heart_count >= 0\);/,
      );
    });

    it('backfills view_total from the sum of activity_views.view_count', () => {
      expect(sql).toMatch(
        /set view_total = coalesce\(\s*\(select sum\(v\.view_count\) from public\.activity_views v where v\.activity_id = a\.id\),\s*0\s*\);/,
      );
    });
  });

  describe('sync_activity_heart_count()', () => {
    it('is SECURITY DEFINER with a pinned search_path', () => {
      expect(sql).toMatch(/create or replace function public\.sync_activity_heart_count\(\)\s*returns trigger/);
      expect(sql).toMatch(/security definer/);
      expect(sql).toMatch(/set search_path = public/);
    });

    it('increments on insert and decrements floored at zero on delete', () => {
      expect(sql).toMatch(
        /update public\.activities set heart_count = heart_count \+ 1 where id = new\.activity_id;/,
      );
      expect(sql).toMatch(
        /update public\.activities set heart_count = greatest\(heart_count - 1, 0\) where id = old\.activity_id;/,
      );
    });

    it('is wired as an after insert or delete row trigger on activity_hearts', () => {
      expect(sql).toMatch(
        /create trigger activity_hearts_sync_count\s*after insert or delete on public\.activity_hearts\s*for each row execute function public\.sync_activity_heart_count\(\);/,
      );
    });

    it('revokes the default PUBLIC/anon/authenticated execute grants before granting service_role', () => {
      const revokeIdx = sql.indexOf('revoke all on function public.sync_activity_heart_count() from public;');
      const revokeAnonIdx = sql.indexOf(
        'revoke all on function public.sync_activity_heart_count() from anon, authenticated;',
      );
      const grantIdx = sql.indexOf(
        'grant execute on function public.sync_activity_heart_count() to service_role;',
      );
      expect(revokeIdx).toBeGreaterThan(-1);
      expect(revokeAnonIdx).toBeGreaterThan(-1);
      expect(grantIdx).toBeGreaterThan(-1);
      expect(revokeIdx).toBeLessThan(grantIdx);
      expect(revokeAnonIdx).toBeLessThan(grantIdx);
    });
  });

  describe('record_activity_view() re-applied', () => {
    it('keeps the same signature', () => {
      expect(sql).toMatch(
        /create or replace function public\.record_activity_view\(p_user uuid, p_activity uuid\)\s*returns int/,
      );
    });

    it('increments view_total inside the same transaction as the per-user upsert', () => {
      expect(sql).toMatch(/update public\.activities set view_total = view_total \+ 1 where id = p_activity;/);
    });

    it('re-applies the revokes and grant', () => {
      const revokeIdx = sql.lastIndexOf(
        'revoke all on function public.record_activity_view(uuid, uuid) from public;',
      );
      const revokeAnonIdx = sql.lastIndexOf(
        'revoke all on function public.record_activity_view(uuid, uuid) from anon, authenticated;',
      );
      const grantIdx = sql.lastIndexOf(
        'grant execute on function public.record_activity_view(uuid, uuid) to service_role;',
      );
      expect(revokeIdx).toBeGreaterThan(-1);
      expect(revokeAnonIdx).toBeGreaterThan(-1);
      expect(grantIdx).toBeGreaterThan(-1);
      expect(revokeIdx).toBeLessThan(grantIdx);
      expect(revokeAnonIdx).toBeLessThan(grantIdx);
    });
  });

  describe('toggle_activity_heart()', () => {
    it('is SECURITY DEFINER with a pinned search_path, returning table(hearted boolean, heart_count int)', () => {
      expect(sql).toMatch(
        /create or replace function public\.toggle_activity_heart\(p_user uuid, p_activity uuid\)\s*returns table\(hearted boolean, heart_count int\)/,
      );
      expect(sql).toMatch(/security definer/);
      expect(sql).toMatch(/set search_path = public/);
    });

    it('locks the activity row and refuses a non-live activity', () => {
      expect(sql).toMatch(
        /select author_id, visible into v_author_id, v_visible\s*from public\.activities\s*where id = p_activity\s*for update;/,
      );
      expect(sql).toMatch(/if not found or not v_visible then/);
      expect(sql).toMatch(/raise exception 'activity % is not live', p_activity;/);
    });

    it("refuses the activity's own author", () => {
      expect(sql).toMatch(/if v_author_id = p_user then/);
      expect(sql).toMatch(/raise exception 'an activity author cannot heart their own activity';/);
    });

    it('inserts when absent and deletes when present', () => {
      expect(sql).toMatch(
        /insert into public\.activity_hearts \(user_id, activity_id\) values \(p_user, p_activity\);/,
      );
      expect(sql).toMatch(
        /delete from public\.activity_hearts\s*where user_id = p_user and activity_id = p_activity;/,
      );
    });

    it('returns the new state read back from the row the trigger just wrote', () => {
      expect(sql).toMatch(
        /return query\s*select not v_existing, a\.heart_count\s*from public\.activities a\s*where a\.id = p_activity;/,
      );
    });

    it('revokes the default PUBLIC/anon/authenticated execute grants before granting service_role', () => {
      const revokeIdx = sql.indexOf('revoke all on function public.toggle_activity_heart(uuid, uuid) from public;');
      const revokeAnonIdx = sql.indexOf(
        'revoke all on function public.toggle_activity_heart(uuid, uuid) from anon, authenticated;',
      );
      const grantIdx = sql.indexOf(
        'grant execute on function public.toggle_activity_heart(uuid, uuid) to service_role;',
      );
      expect(revokeIdx).toBeGreaterThan(-1);
      expect(revokeAnonIdx).toBeGreaterThan(-1);
      expect(grantIdx).toBeGreaterThan(-1);
      expect(revokeIdx).toBeLessThan(grantIdx);
      expect(revokeAnonIdx).toBeLessThan(grantIdx);
    });
  });

  describe('search + sort indexes', () => {
    it('creates pg_trgm in the extensions schema', () => {
      expect(sql).toMatch(/create extension if not exists pg_trgm with schema extensions;/);
    });

    it('creates a schema-qualified trigram GIN index on activities.title', () => {
      expect(sql).toMatch(/create index activities_title_trgm_idx\s*on public\.activities using gin \(title extensions\.gin_trgm_ops\);/);
    });

    it('creates a partial index for the gustadas sort, visible rows only', () => {
      expect(sql).toMatch(
        /create index activities_heart_count_published_idx\s*on public\.activities \(heart_count desc, published_at desc\) where visible;/,
      );
    });

    it('creates a partial index for the vistas sort, visible rows only', () => {
      expect(sql).toMatch(
        /create index activities_view_total_published_idx\s*on public\.activities \(view_total desc, published_at desc\) where visible;/,
      );
    });
  });

  describe('RLS + grants', () => {
    it('creates no policy at all — service_role only, via BYPASSRLS', () => {
      expect(sql).not.toMatch(/create policy/i);
    });
  });
});
