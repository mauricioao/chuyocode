import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Text guard for `supabase/migrations/0011_activities.sql` — see
 * `userSubscriptionsMigration.test.ts` for why this pattern exists (no live
 * Postgres here; mirrors `src/astroConfig.test.ts`).
 *
 * Same security posture as every table since `exercise_likes` (the 0002
 * lesson): RLS must be ON, with NO anon-facing policy, and the `service_role`
 * GRANTs must exist explicitly — BYPASSRLS does not imply a table-level
 * GRANT. Storage buckets follow the pre-moderation layout: uploads are
 * PRIVATE, approved copies are PUBLIC, both webp-only and 2 MB capped, and
 * neither has an `anon`/`authenticated` policy.
 *
 * Content is a REVISIONS model: `activities` never stores `blocks` itself,
 * only `published_revision_id` pointing at the one `activity_revisions` row
 * the public reads. See the migration's own header comment for the full
 * save -> submit -> approve/reject lifecycle this encodes.
 */
const migrationPath = fileURLToPath(
  new URL('../../supabase/migrations/0011_activities.sql', import.meta.url),
);
const sql = readFileSync(migrationPath, 'utf8');

/** Just the `create table public.activities (...)` statement, for checks that must not accidentally match `activity_revisions`' own `blocks` column. */
const activitiesTableBlock = sql.slice(
  sql.indexOf('create table public.activities'),
  sql.indexOf('create table public.activity_revisions'),
);

describe('0011_activities.sql', () => {
  it('wraps the migration in a single transaction', () => {
    expect(sql).toMatch(/^begin;/m);
    expect(sql).toMatch(/^commit;/m);
  });

  describe('public.activities', () => {
    it('enables row level security', () => {
      expect(sql).toMatch(/alter table public\.activities enable row level security;/);
    });

    it('creates no policy at all — service_role only, via BYPASSRLS', () => {
      expect(sql).not.toMatch(/create policy/i);
    });

    it('grants the service_role explicit table access (the 0002 lesson)', () => {
      expect(sql).toMatch(/grant select on table public\.activities to service_role;/);
      expect(sql).toMatch(
        /grant insert, update, delete on table public\.activities to service_role;/,
      );
    });

    it('never grants anything to anon or authenticated', () => {
      expect(sql).not.toMatch(/to anon/i);
      expect(sql).not.toMatch(/to authenticated/i);
    });

    it('defaults id to a generated uuid primary key', () => {
      expect(sql).toMatch(/id\s+uuid\s+primary key default gen_random_uuid\(\)/);
    });

    it('requires author_id and cascades on the referenced user', () => {
      expect(sql).toMatch(
        /author_id\s+uuid\s+not null references auth\.users\(id\) on delete cascade/,
      );
    });

    it('constrains title length between 1 and 120', () => {
      expect(sql).toMatch(/check \(char_length\(title\) between 1 and 120\)/);
    });

    it('constrains level to the CEFR vocabulary and leaves it nullable', () => {
      expect(sql).toMatch(/check \(level in \('A1','A2','B1','B2','C1','C2'\)\)/);
      expect(sql).not.toMatch(/level\s+text\s+not null/);
    });

    it('constrains status to the activity lifecycle vocabulary, defaulting to draft', () => {
      expect(sql).toMatch(
        /check \(status in \('draft','pending_review','live','rejected','removed'\)\)/,
      );
      expect(sql).toMatch(/status\s+text\s+not null default 'draft'/);
    });

    it('never stores blocks/pending_blocks directly — content lives in activity_revisions', () => {
      expect(activitiesTableBlock).not.toMatch(/^\s*blocks\s+jsonb/m);
      expect(sql).not.toMatch(/pending_blocks/);
    });

    it('leaves published_revision_id nullable — never approved yet', () => {
      expect(sql).not.toMatch(/published_revision_id\s+uuid\s+not null/);
    });

    it('never lets a live activity exist without a published revision', () => {
      expect(sql).toMatch(
        /check \(status <> 'live' or published_revision_id is not null\)/,
      );
    });

    it('points published_revision_id at activity_revisions, set null on delete', () => {
      expect(sql).toMatch(
        /foreign key \(published_revision_id\) references public\.activity_revisions\(id\) on delete set null/,
      );
    });

    it('defaults the derived block_types/block_count search columns', () => {
      expect(sql).toMatch(/block_types\s+text\[\]\s+not null default '\{\}'/);
      expect(sql).toMatch(/block_count\s+int\s+not null default 0/);
    });

    it('indexes block_types with a GIN index', () => {
      expect(sql).toMatch(
        /create index activities_block_types_idx\s+on public\.activities using gin \(block_types\);/,
      );
    });

    it('sets reviewed_by to null on deleting the reviewing user, never cascading the activity', () => {
      expect(sql).toMatch(
        /reviewed_by\s+uuid\s+references auth\.users\(id\) on delete set null/,
      );
    });

    it('derives visible as a generated STORED column from status alone', () => {
      expect(sql).toMatch(
        /visible\s+boolean\s+generated always as \(status = 'live'\) stored/,
      );
    });

    it('defaults created_at and updated_at to now(), not null', () => {
      expect(sql).toMatch(/created_at\s+timestamptz\s+not null default now\(\)/);
      expect(sql).toMatch(/updated_at\s+timestamptz\s+not null default now\(\)/);
    });

    it('indexes the author workspace by (author_id, updated_at desc)', () => {
      expect(sql).toMatch(
        /create index activities_author_updated_idx\s+on public\.activities \(author_id, updated_at desc\);/,
      );
    });

    it('partially indexes the public feed on visible', () => {
      expect(sql).toMatch(
        /create index activities_published_idx\s+on public\.activities \(published_at desc\) where visible;/,
      );
    });

    it('partially indexes the moderation review queue on pending_review', () => {
      expect(sql).toMatch(
        /create index activities_pending_review_idx\s+on public\.activities \(created_at\) where status = 'pending_review';/,
      );
    });
  });

  describe('public.activity_revisions', () => {
    it('enables row level security', () => {
      expect(sql).toMatch(
        /alter table public\.activity_revisions enable row level security;/,
      );
    });

    it('grants the service_role explicit table access', () => {
      expect(sql).toMatch(
        /grant select on table public\.activity_revisions to service_role;/,
      );
      expect(sql).toMatch(
        /grant insert, update, delete on table public\.activity_revisions to service_role;/,
      );
    });

    it('defaults id to a generated uuid primary key', () => {
      expect(sql).toMatch(/id\s+uuid\s+primary key default gen_random_uuid\(\)/);
    });

    it('requires activity_id and cascades on the parent activity', () => {
      expect(sql).toMatch(
        /activity_id\s+uuid\s+not null references public\.activities\(id\) on delete cascade/,
      );
    });

    it('requires blocks, not null (each revision must actually carry content)', () => {
      expect(sql).toMatch(/blocks\s+jsonb\s+not null/);
    });

    it('constrains status to the revision lifecycle vocabulary, defaulting to draft', () => {
      expect(sql).toMatch(
        /check \(status in \('draft','pending_review','approved','rejected','superseded'\)\)/,
      );
      expect(sql).toMatch(/status\s+text\s+not null default 'draft'/);
    });

    it('requires created_by and cascades on the authoring user', () => {
      expect(sql).toMatch(
        /created_by\s+uuid\s+not null references auth\.users\(id\) on delete cascade/,
      );
    });

    it('indexes (activity_id, created_at desc)', () => {
      expect(sql).toMatch(
        /create index activity_revisions_activity_created_idx\s+on public\.activity_revisions \(activity_id, created_at desc\);/,
      );
    });

    it('partially indexes the moderation review queue on pending_review', () => {
      expect(sql).toMatch(
        /create index activity_revisions_pending_review_idx\s+on public\.activity_revisions \(created_at\) where status = 'pending_review';/,
      );
    });
  });

  describe('storage buckets', () => {
    it('creates the uploads bucket as PRIVATE', () => {
      expect(sql).toMatch(
        /values \('activity-uploads', 'activity-uploads', false, 2097152, array\['image\/webp'\]\)/,
      );
    });

    it('creates the images bucket as PUBLIC', () => {
      expect(sql).toMatch(
        /values \('activity-images', 'activity-images', true, 2097152, array\['image\/webp'\]\)/,
      );
    });

    it('caps both buckets at 2 MB and webp-only', () => {
      const bucketLines = sql.match(/values \('activity-[a-z-]+',.*\)$/gm) ?? [];
      expect(bucketLines).toHaveLength(2);
      for (const line of bucketLines) {
        expect(line).toContain('2097152');
        expect(line).toContain("array['image/webp']");
      }
    });

    it('is idempotent (re-runnable) via ON CONFLICT DO NOTHING', () => {
      const conflictLines = sql.match(/on conflict \(id\) do nothing;/g) ?? [];
      expect(conflictLines).toHaveLength(2);
    });

    it('creates no storage.objects policy for anon or authenticated', () => {
      expect(sql).not.toMatch(/create policy.*storage\.objects/is);
    });
  });
});
