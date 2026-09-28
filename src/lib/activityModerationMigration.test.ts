import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Text guard for `supabase/migrations/0013_activity_moderation.sql` — see
 * `activityViewsMigration.test.ts` for why this pattern exists (no live
 * Postgres here; mirrors `src/astroConfig.test.ts`).
 */
const migrationPath = fileURLToPath(
  new URL('../../supabase/migrations/0013_activity_moderation.sql', import.meta.url),
);
const sql = readFileSync(migrationPath, 'utf8');

describe('0013_activity_moderation.sql', () => {
  it('wraps the migration in a single transaction', () => {
    expect(sql).toMatch(/^begin;/m);
    expect(sql).toMatch(/^commit;/m);
  });

  describe('approve_activity_revision()', () => {
    it('is SECURITY DEFINER with a pinned search_path', () => {
      expect(sql).toMatch(
        /create or replace function public\.approve_activity_revision\(\s*p_revision uuid,\s*p_reviewer uuid,\s*p_blocks jsonb,\s*p_block_types text\[\],\s*p_block_count int\s*\)\s*returns void/,
      );
      expect(sql).toMatch(/security definer/);
      expect(sql).toMatch(/set search_path = public/);
    });

    it('locks the revision row and requires pending_review', () => {
      expect(sql).toMatch(/where id = p_revision\s*for update;/);
      expect(sql).toMatch(/if v_status <> 'pending_review' then/);
      expect(sql).toMatch(/raise exception 'activity revision % is not pending_review/);
    });

    it('writes the rewritten blocks and flips the revision to approved', () => {
      expect(sql).toMatch(
        /set blocks\s*=\s*p_blocks,\s*status\s*=\s*'approved',\s*reviewed_by\s*=\s*p_reviewer,\s*reviewed_at\s*=\s*now\(\)\s*where id = p_revision;/,
      );
    });

    it('supersedes the previously approved revision for the same activity, excluding itself', () => {
      expect(sql).toMatch(
        /set status = 'superseded'\s*where activity_id = v_activity_id\s*and status = 'approved'\s*and id <> p_revision;/,
      );
    });

    it('publishes the activity: live status, published_revision_id, coalesced published_at, cleared review_note', () => {
      expect(sql).toMatch(/published_revision_id = p_revision,/);
      expect(sql).toMatch(/status\s*=\s*'live',/);
      expect(sql).toMatch(/published_at\s*=\s*coalesce\(published_at, now\(\)\),/);
      expect(sql).toMatch(/block_types\s*=\s*p_block_types,/);
      expect(sql).toMatch(/block_count\s*=\s*p_block_count,/);
      expect(sql).toMatch(/review_note\s*=\s*null,/);
    });

    it('revokes the default PUBLIC/anon/authenticated execute grants before granting service_role', () => {
      const revokeIdx = sql.indexOf(
        'revoke all on function public.approve_activity_revision(uuid, uuid, jsonb, text[], int) from public;',
      );
      const revokeAnonIdx = sql.indexOf(
        'revoke all on function public.approve_activity_revision(uuid, uuid, jsonb, text[], int) from anon, authenticated;',
      );
      const grantIdx = sql.indexOf(
        'grant execute on function public.approve_activity_revision(uuid, uuid, jsonb, text[], int) to service_role;',
      );
      expect(revokeIdx).toBeGreaterThan(-1);
      expect(revokeAnonIdx).toBeGreaterThan(-1);
      expect(grantIdx).toBeGreaterThan(-1);
      expect(revokeIdx).toBeLessThan(grantIdx);
      expect(revokeAnonIdx).toBeLessThan(grantIdx);
    });
  });

  describe('reject_activity_revision()', () => {
    it('is SECURITY DEFINER with a pinned search_path, returning void', () => {
      expect(sql).toMatch(
        /create or replace function public\.reject_activity_revision\(\s*p_revision uuid,\s*p_reviewer uuid,\s*p_note text\s*\)\s*returns void/,
      );
    });

    it('requires a 1-500 char trimmed note', () => {
      expect(sql).toMatch(
        /if char_length\(v_note\) < 1 or char_length\(v_note\) > 500 then/,
      );
      expect(sql).toMatch(/raise exception 'a rejection note between 1 and 500 characters is required';/);
    });

    it('locks the revision row and requires pending_review', () => {
      expect(sql).toMatch(
        /select activity_id, status\s*into v_activity_id, v_status\s*from public\.activity_revisions\s*where id = p_revision\s*for update;/,
      );
      expect(sql).toMatch(/if v_status <> 'pending_review' then/);
    });

    it('marks the revision rejected with the note', () => {
      expect(sql).toMatch(
        /set status\s*=\s*'rejected',\s*reviewed_by\s*=\s*p_reviewer,\s*reviewed_at\s*=\s*now\(\),\s*review_note\s*=\s*v_note\s*where id = p_revision;/,
      );
    });

    it('only rejects the activity itself when it is not live', () => {
      expect(sql).toMatch(/if v_activity_status <> 'live' then/);
    });

    it('revokes the default PUBLIC/anon/authenticated execute grants before granting service_role', () => {
      const revokeIdx = sql.indexOf(
        'revoke all on function public.reject_activity_revision(uuid, uuid, text) from public;',
      );
      const grantIdx = sql.indexOf(
        'grant execute on function public.reject_activity_revision(uuid, uuid, text) to service_role;',
      );
      expect(revokeIdx).toBeGreaterThan(-1);
      expect(grantIdx).toBeGreaterThan(-1);
      expect(revokeIdx).toBeLessThan(grantIdx);
    });
  });

  describe('public.activity_reports', () => {
    it('constrains reason to the closed taxonomy', () => {
      expect(sql).toMatch(
        /reason\s+text\s+not null check \(reason in \('inappropriate','off_topic','copyright','wrong_answers','other'\)\)/,
      );
    });

    it('caps details at 500 chars', () => {
      expect(sql).toMatch(/details\s+text\s+check \(details is null or char_length\(details\) <= 500\)/);
    });

    it('is unique per (activity_id, reporter_id)', () => {
      expect(sql).toMatch(/unique \(activity_id, reporter_id\)/);
    });

    it('cascades on the referenced activity and reporter', () => {
      expect(sql).toMatch(/activity_id uuid\s+not null references public\.activities\(id\) on delete cascade/);
      expect(sql).toMatch(/reporter_id uuid\s+not null references auth\.users\(id\) on delete cascade/);
    });
  });

  describe('public.activity_moderation_config', () => {
    it('admits exactly one row', () => {
      expect(sql).toMatch(/id\s+boolean\s+primary key default true check \(id\)/);
      expect(sql).toMatch(
        /insert into public\.activity_moderation_config \(id\) values \(true\) on conflict do nothing;/,
      );
    });

    it('defaults the report threshold to 3, positive only', () => {
      expect(sql).toMatch(/report_threshold\s+int\s+not null default 3 check \(report_threshold > 0\)/);
    });
  });

  describe('record_activity_report()', () => {
    it('is SECURITY DEFINER with a pinned search_path, returning boolean', () => {
      expect(sql).toMatch(
        /create or replace function public\.record_activity_report\(\s*p_activity uuid,\s*p_reporter uuid,\s*p_reason text,\s*p_details text\s*\)\s*returns boolean/,
      );
      expect(sql).toMatch(/security definer/);
      expect(sql).toMatch(/set search_path = public/);
    });

    it('locks the activity row before inserting the report', () => {
      expect(sql).toMatch(
        /select author_id, status, reviewed_at\s*into v_author_id, v_status, v_reviewed_at\s*from public\.activities\s*where id = p_activity\s*for update;/,
      );
    });

    it('refuses a self-report as defense in depth', () => {
      expect(sql).toMatch(/if v_author_id = p_reporter then/);
      expect(sql).toMatch(/raise exception 'an activity author cannot report their own activity';/);
    });

    it('inserts the report idempotently on (activity_id, reporter_id)', () => {
      expect(sql).toMatch(/on conflict \(activity_id, reporter_id\) do nothing;/);
    });

    it('counts reports since the last reviewed_at, not all-time', () => {
      expect(sql).toMatch(
        /where activity_id = p_activity\s*and \(v_reviewed_at is null or created_at > v_reviewed_at\);/,
      );
    });

    it('reads the threshold from the config table, not hardcoded', () => {
      expect(sql).toMatch(/select report_threshold into v_threshold from public\.activity_moderation_config;/);
    });

    it('only hides a currently-live activity, never a draft/pending/removed one', () => {
      expect(sql).toMatch(
        /if v_status = 'live' and v_count >= v_threshold then\s*update public\.activities\s*set status = 'pending_review'\s*where id = p_activity\s*and status = 'live';/,
      );
    });

    it('keeps published_revision_id untouched when hiding (no column named in that UPDATE)', () => {
      const hideMatch = sql.match(
        /if v_status = 'live' and v_count >= v_threshold then([\s\S]*?)end if;/,
      );
      expect(hideMatch).not.toBeNull();
      expect(hideMatch![1]).not.toMatch(/published_revision_id/);
    });

    it('revokes the default PUBLIC/anon/authenticated execute grants before granting service_role', () => {
      const revokeIdx = sql.indexOf(
        'revoke all on function public.record_activity_report(uuid, uuid, text, text) from public;',
      );
      const grantIdx = sql.indexOf(
        'grant execute on function public.record_activity_report(uuid, uuid, text, text) to service_role;',
      );
      expect(revokeIdx).toBeGreaterThan(-1);
      expect(grantIdx).toBeGreaterThan(-1);
      expect(revokeIdx).toBeLessThan(grantIdx);
    });
  });

  describe('RLS + grants', () => {
    it('enables row level security on both new tables', () => {
      expect(sql).toMatch(/alter table public\.activity_reports\s+enable row level security;/);
      expect(sql).toMatch(/alter table public\.activity_moderation_config enable row level security;/);
    });

    it('creates no policy at all — service_role only, via BYPASSRLS', () => {
      expect(sql).not.toMatch(/create policy/i);
    });

    it('grants the service_role explicit table access on both tables (the 0002 lesson)', () => {
      expect(sql).toMatch(/grant select on table public\.activity_reports to service_role;/);
      expect(sql).toMatch(/grant insert, update, delete on table public\.activity_reports to service_role;/);
      expect(sql).toMatch(/grant select on table public\.activity_moderation_config to service_role;/);
      expect(sql).toMatch(
        /grant insert, update, delete on table public\.activity_moderation_config to service_role;/,
      );
    });

    it('never grants anything to anon or authenticated', () => {
      expect(sql).not.toMatch(/grant.*to anon/i);
      expect(sql).not.toMatch(/grant.*to authenticated/i);
    });
  });
});
