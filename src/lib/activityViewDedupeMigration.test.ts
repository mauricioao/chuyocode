import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Text guard for `supabase/migrations/0018_activity_view_dedupe.sql` — see
 * `activityDiscoveryMigration.test.ts` for why this pattern exists (no live
 * Postgres here; mirrors `src/astroConfig.test.ts`).
 */
const migrationPath = fileURLToPath(
  new URL('../../supabase/migrations/0018_activity_view_dedupe.sql', import.meta.url),
);
const sql = readFileSync(migrationPath, 'utf8');

describe('0018_activity_view_dedupe.sql', () => {
  it('wraps the migration in a single transaction', () => {
    expect(sql).toMatch(/^begin;/m);
    expect(sql).toMatch(/^commit;/m);
  });

  it('must run after 0017_courses.sql', () => {
    expect(sql).toMatch(/AFTER\s*\n--\s*0017_courses\.sql/);
  });

  describe('record_activity_view() re-applied', () => {
    it('keeps the same signature, SECURITY DEFINER, and pinned search_path', () => {
      expect(sql).toMatch(
        /create or replace function public\.record_activity_view\(p_user uuid, p_activity uuid\)\s*returns int/,
      );
      expect(sql).toMatch(/security definer/);
      expect(sql).toMatch(/set search_path = public/);
    });

    it("locks the caller's own (user, activity) row and reads its previous last_viewed_at before the upsert", () => {
      expect(sql).toMatch(
        /select last_viewed_at into v_previous_last_viewed\s*from public\.activity_views\s*where user_id = p_user and activity_id = p_activity\s*for update;/,
      );

      const lockIdx = sql.indexOf('for update;');
      const insertIdx = sql.indexOf('insert into public.activity_views');
      expect(lockIdx).toBeGreaterThan(-1);
      expect(insertIdx).toBeGreaterThan(-1);
      expect(lockIdx).toBeLessThan(insertIdx);
    });

    it('keeps the per-user upsert unchanged: bumps view_count and last_viewed_at on every call', () => {
      expect(sql).toMatch(
        /insert into public\.activity_views \(user_id, activity_id, view_count, first_viewed_at, last_viewed_at\)\s*values \(p_user, p_activity, 1, now\(\), now\(\)\)\s*on conflict \(user_id, activity_id\) do update\s*set view_count = public\.activity_views\.view_count \+ 1,\s*last_viewed_at = now\(\)\s*returning view_count into new_count;/,
      );
    });

    it('increments the public view_total only when there was no previous row, or the previous view is 30+ minutes old', () => {
      expect(sql).toMatch(
        /if not v_had_previous or v_previous_last_viewed < now\(\) - interval '30 minutes' then\s*update public\.activities set view_total = view_total \+ 1 where id = p_activity;\s*end if;/,
      );
    });

    it('returns the per-user view_count (new_count), never the public view_total', () => {
      expect(sql).toMatch(/return new_count;/);
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

    it('never grants anything to anon or authenticated', () => {
      expect(sql).not.toMatch(/grant.*record_activity_view.*to anon/i);
      expect(sql).not.toMatch(/grant.*record_activity_view.*to authenticated/i);
    });
  });

  describe('RLS + grants', () => {
    it('creates no policy at all', () => {
      expect(sql).not.toMatch(/create policy/i);
    });
  });
});
