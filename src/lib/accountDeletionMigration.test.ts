import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Text guard for `supabase/migrations/0020_account_deletion.sql` — see
 * `activityViewsMigration.test.ts` for why this pattern exists (no live
 * Postgres here; mirrors `src/astroConfig.test.ts`).
 */
const migrationPath = fileURLToPath(
  new URL('../../supabase/migrations/0020_account_deletion.sql', import.meta.url),
);
const sql = readFileSync(migrationPath, 'utf8');

describe('0020_account_deletion.sql', () => {
  it('ships the whole migration as one transaction', () => {
    const beginCount = (sql.match(/^begin;$/gm) ?? []).length;
    const commitCount = (sql.match(/^commit;$/gm) ?? []).length;
    expect(beginCount).toBe(1);
    expect(commitCount).toBe(1);
  });

  describe('activities.author_id — CASCADE -> SET NULL, NOT NULL -> nullable', () => {
    it('drops NOT NULL before swapping the FK action', () => {
      const dropNotNullIdx = sql.indexOf('alter table public.activities alter column author_id drop not null;');
      const dropFkIdx = sql.indexOf('alter table public.activities drop constraint activities_author_id_fkey;');
      expect(dropNotNullIdx).toBeGreaterThan(-1);
      expect(dropFkIdx).toBeGreaterThan(-1);
      expect(dropNotNullIdx).toBeLessThan(dropFkIdx);
    });

    it('re-adds the FK with ON DELETE SET NULL, under the same auto-generated name', () => {
      expect(sql).toMatch(
        /alter table public\.activities add constraint activities_author_id_fkey\s*\n\s*foreign key \(author_id\) references auth\.users\(id\) on delete set null;/,
      );
    });
  });

  describe('activity_revisions.created_by — CASCADE -> SET NULL, NOT NULL -> nullable', () => {
    it('drops NOT NULL before swapping the FK action', () => {
      const dropNotNullIdx = sql.indexOf(
        'alter table public.activity_revisions alter column created_by drop not null;',
      );
      const dropFkIdx = sql.indexOf(
        'alter table public.activity_revisions drop constraint activity_revisions_created_by_fkey;',
      );
      expect(dropNotNullIdx).toBeGreaterThan(-1);
      expect(dropFkIdx).toBeGreaterThan(-1);
      expect(dropNotNullIdx).toBeLessThan(dropFkIdx);
    });

    it('re-adds the FK with ON DELETE SET NULL', () => {
      expect(sql).toMatch(
        /alter table public\.activity_revisions add constraint activity_revisions_created_by_fkey\s*\n\s*foreign key \(created_by\) references auth\.users\(id\) on delete set null;/,
      );
    });
  });

  describe('activity_reports.reporter_id — CASCADE -> SET NULL, NOT NULL -> nullable', () => {
    it('drops NOT NULL before swapping the FK action', () => {
      const dropNotNullIdx = sql.indexOf(
        'alter table public.activity_reports alter column reporter_id drop not null;',
      );
      const dropFkIdx = sql.indexOf(
        'alter table public.activity_reports drop constraint activity_reports_reporter_id_fkey;',
      );
      expect(dropNotNullIdx).toBeGreaterThan(-1);
      expect(dropFkIdx).toBeGreaterThan(-1);
      expect(dropNotNullIdx).toBeLessThan(dropFkIdx);
    });

    it('re-adds the FK with ON DELETE SET NULL (moderation history survives)', () => {
      expect(sql).toMatch(
        /alter table public\.activity_reports add constraint activity_reports_reporter_id_fkey\s*\n\s*foreign key \(reporter_id\) references auth\.users\(id\) on delete set null;/,
      );
    });
  });

  describe('provenance columns — no FK, paired, on both activities and exercises', () => {
    it('adds original_author_id with NO foreign key reference', () => {
      // Regex boundary: the column declaration must not be followed by
      // `references` anywhere before its own statement ends (`,` or `;`).
      expect(sql).toMatch(/add column original_author_id uuid,\s*\n\s*add column\s+transferred_at\s+timestamptz;/);
      expect(sql).not.toMatch(/original_author_id uuid\s+references/);
    });

    it('adds the pair to activities', () => {
      expect(sql).toMatch(/alter table public\.activities\s*\n\s*add column original_author_id uuid,/);
    });

    it('adds the pair to exercises (curated exercises also record an author)', () => {
      expect(sql).toMatch(/alter table public\.exercises\s*\n\s*add column original_author_id uuid,/);
    });

    it('does NOT alter exercises.author_id itself — 0007 already made it nullable/SET NULL', () => {
      expect(sql).not.toMatch(/alter table public\.exercises alter column author_id/);
      expect(sql).not.toMatch(/alter table public\.exercises drop constraint exercises_author_id_fkey/);
    });

    it('constrains both pairs all-or-nothing, same idiom as exercises_hidden_pair (0007)', () => {
      expect(sql).toMatch(
        /constraint activities_transfer_pair\s*\n\s*check \(\s*\n\s*\(original_author_id is null and transferred_at is null\)\s*\n\s*or \(original_author_id is not null and transferred_at is not null\)\s*\n\s*\);/,
      );
      expect(sql).toMatch(
        /constraint exercises_transfer_pair\s*\n\s*check \(\s*\n\s*\(original_author_id is null and transferred_at is null\)\s*\n\s*or \(original_author_id is not null and transferred_at is not null\)\s*\n\s*\);/,
      );
    });
  });

  describe('transfer_and_purge_user()', () => {
    it('is SECURITY DEFINER with a pinned search_path, returning void', () => {
      expect(sql).toMatch(
        /create or replace function public\.transfer_and_purge_user\(p_user uuid\)\s*\nreturns void/,
      );
      expect(sql).toMatch(/security definer/);
      expect(sql).toMatch(/set search_path = public/);
    });

    it('transfers only PUBLISHED activities (published_at is not null), nulling the author and stamping provenance', () => {
      expect(sql).toMatch(
        /update public\.activities\s*\n\s*set author_id\s*=\s*null,\s*\n\s*original_author_id = author_id,\s*\n\s*transferred_at\s*=\s*now\(\)\s*\n\s*where author_id = p_user\s*\n\s*and published_at is not null;/,
      );
    });

    it('hard-deletes never-published activities (published_at is null)', () => {
      const deleteActivitiesMatch = sql.match(
        /delete from public\.activities\s*\n\s*where author_id = p_user\s*\n\s*and published_at is null;/,
      );
      expect(deleteActivitiesMatch).not.toBeNull();
    });

    it('transfers the activities UPDATE before the DELETE (so a re-run order never matters, but tested for the documented ordering)', () => {
      const updateIdx = sql.indexOf('set author_id          = null,');
      const deleteIdx = sql.indexOf('delete from public.activities');
      expect(updateIdx).toBeGreaterThan(-1);
      expect(deleteIdx).toBeGreaterThan(-1);
      expect(updateIdx).toBeLessThan(deleteIdx);
    });

    it('deletes only non-approved revisions this user created (never the published one, by construction)', () => {
      expect(sql).toMatch(
        /delete from public\.activity_revisions\s*\n\s*where created_by = p_user\s*\n\s*and status in \('draft', 'pending_review', 'rejected'\);/,
      );
    });

    it('applies the same published/never-published split to curated exercises', () => {
      expect(sql).toMatch(
        /update public\.exercises\s*\n\s*set author_id\s*=\s*null,\s*\n\s*original_author_id = author_id,\s*\n\s*transferred_at\s*=\s*now\(\)\s*\n\s*where author_id = p_user\s*\n\s*and published_at is not null;/,
      );
      expect(sql).toMatch(
        /delete from public\.exercises\s*\n\s*where author_id = p_user\s*\n\s*and published_at is null;/,
      );
    });

    it('deletes this user\'s hearts (identity-backed, must not survive the account)', () => {
      expect(sql).toMatch(/delete from public\.activity_hearts where user_id = p_user;/);
    });

    it('deletes this user\'s per-user view rows, without touching the public view_total aggregate', () => {
      expect(sql).toMatch(/delete from public\.activity_views where user_id = p_user;/);
      // The function body may EXPLAIN the omission in a comment (and does),
      // but must never actually assign `view_total` anywhere.
      const fnStart = sql.indexOf('create or replace function public.transfer_and_purge_user');
      const fnEnd = sql.indexOf('$$;', fnStart);
      const fnBody = sql.slice(fnStart, fnEnd);
      expect(fnBody).not.toMatch(/view_total\s*=/);
      expect(fnBody).not.toMatch(/set\s+view_total/);
    });

    it('never touches billing/purchase tables (left to their existing FK behavior)', () => {
      const fnStart = sql.indexOf('create or replace function public.transfer_and_purge_user');
      const fnEnd = sql.indexOf('$$;', fnStart);
      const fnBody = sql.slice(fnStart, fnEnd);
      expect(fnBody).not.toMatch(/user_subscriptions/);
      expect(fnBody).not.toMatch(/course_purchases/);
      expect(fnBody).not.toMatch(/billing_events/);
    });

    it('revokes the default PUBLIC/anon/authenticated execute grants before granting service_role', () => {
      const revokeIdx = sql.indexOf('revoke all on function public.transfer_and_purge_user(uuid) from public;');
      const revokeAnonIdx = sql.indexOf(
        'revoke all on function public.transfer_and_purge_user(uuid) from anon, authenticated;',
      );
      const grantIdx = sql.indexOf('grant execute on function public.transfer_and_purge_user(uuid) to service_role;');
      expect(revokeIdx).toBeGreaterThan(-1);
      expect(revokeAnonIdx).toBeGreaterThan(-1);
      expect(grantIdx).toBeGreaterThan(-1);
      expect(revokeIdx).toBeLessThan(grantIdx);
      expect(revokeAnonIdx).toBeLessThan(grantIdx);
    });
  });

  describe('no policy created — service_role only, via BYPASSRLS/SECURITY DEFINER', () => {
    it('creates no policy at all', () => {
      expect(sql).not.toMatch(/create policy/i);
    });

    it('never grants anything to anon or authenticated', () => {
      expect(sql).not.toMatch(/grant (select|insert|update|delete).*to anon/i);
      expect(sql).not.toMatch(/grant (select|insert|update|delete).*to authenticated/i);
    });
  });
});
