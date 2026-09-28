-- Activities foundation (Wordwall/Liveworksheets-style creator content), PR A.
--
-- Run this in the Supabase SQL Editor (or via the Supabase CLI) AFTER
-- 0010_user_subscriptions.sql.
--
-- An activity is an ordered list of typed BLOCKS (worksheet/quiz — the module
-- contract lives in `src/lib/activities/blocks.ts`, never re-derived here).
-- This migration stores that list through a REVISIONS model, not a single
-- `blocks` column on `activities` itself:
--
--   `public.activity_revisions` -- one row per SAVED version of an
--   activity's `blocks`. Every author save creates or updates the author's
--   latest `draft` revision for that activity. Submitting for review marks
--   that revision `pending_review`. A moderator's approval (PR E, no code
--   here) marks it `approved`, marks whatever revision was previously
--   `approved` for the same activity `superseded`, and points
--   `activities.published_revision_id` at the newly approved one.
--   `rejected` is a moderator decline that leaves the activity's published
--   revision (if any) untouched.
--
--   `public.activities.published_revision_id` -- the ONE revision the public
--   ever reads. This is the whole reason revisions exist as a separate
--   table: an author editing a LIVE activity produces a new `draft`/
--   `pending_review` revision that never touches the already-`approved` one,
--   so the live activity keeps rendering its last-approved content
--   throughout the edit and review — it is never hidden, and a moderator
--   approves EXACTLY the bytes they reviewed, not whatever the author has
--   since kept typing.
--
-- `block_types`/`block_count` are DERIVED search columns on `activities`,
-- kept in sync by the server whenever a revision is published (no trigger —
-- same posture as `exercises`' derived columns: application code writes them
-- alongside the revision it just approved, in the same transaction). They
-- exist so a feed/search query can filter "activities containing a
-- worksheet block" without deserializing every candidate's `blocks` jsonb.
--
-- LIFECYCLE on `activities.status`, five states (mirrors 0007's `status`
-- axis, not `exercises`' five-state one — activities have no `auditing`/
-- `needs_work`, since moderation here is pre-publish review, not post-
-- publish audit):
--   draft           -- author is still working; nothing public.
--   pending_review  -- author submitted; awaiting a moderator (PR E).
--   live            -- approved at least once and public. Reads
--                      `published_revision_id`'s `blocks`.
--   rejected        -- moderator declined; author may revise back to draft.
--   removed         -- terminal, same posture as `exercises.status = 'removed'`.
--
-- `visible`, GENERATED STORED, same pattern and same reason as
-- `0007_exercise_authorship.sql`'s column of the same name: every read site
-- filters on ONE boolean instead of re-deriving "is this live" from `status`
-- at every call site. `STORED` must be spelled explicitly (see 0007's step 8
-- comment for the Postgres-version note); verified by this migration's own
-- text-guard test.
--
-- RLS ON, ZERO POLICIES on BOTH tables — same posture as every table since
-- `exercise_likes` (the 0002 lesson). Stage 1 has no creator UI yet (PR A
-- ships schema only; PR B is the creator, PR D the player, PR E moderation),
-- so every access path is server-side and goes through the service-role key.
--
-- STORAGE LAYOUT (pre-moderation for public uploads, design.md "Stage 1 is
-- public"): every uploaded image lands in the PRIVATE `activity-uploads`
-- bucket first. Only a moderator-approved copy is written to the PUBLIC
-- `activity-images` bucket (PR E's approval flow does that copy — not this
-- migration). Both buckets are webp-only and capped at 2 MB; path rules and
-- signed-URL helpers live in `src/lib/activities/storage.ts`. No
-- `storage.objects` policy exists for `anon`/`authenticated` on either
-- bucket: every read and write goes through the server's service-role key,
-- via short-lived signed URLs (`src/pages/api/actividades/imagen.ts`).

begin;

create table public.activities (
  id                   uuid        primary key default gen_random_uuid(),
  author_id            uuid        not null references auth.users(id) on delete cascade,
  title                text        not null check (char_length(title) between 1 and 120),
  level                text        check (level in ('A1','A2','B1','B2','C1','C2')),
  status               text        not null default 'draft'
                                    check (status in ('draft','pending_review','live','rejected','removed')),
  -- Nullable, and with NO foreign key yet: `activity_revisions` (below)
  -- references `activities`, so this column's FK is added only once that
  -- table exists (see the `alter table` after it). Null means "never
  -- approved" — a brand new activity, or one rejected before its first
  -- approval — and the activity is not `visible` in that state regardless.
  published_revision_id uuid,
  -- Derived search columns (see file header): written by the server
  -- alongside the revision it just approved, never by application reads.
  block_types          text[]      not null default '{}',
  block_count          int         not null default 0,
  review_note          text,
  reviewed_by          uuid        references auth.users(id) on delete set null,
  reviewed_at          timestamptz,
  published_at         timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  -- Same generated-STORED pattern as `0007_exercise_authorship.sql`, step 8:
  -- exactly one place computes "is this activity reachable", so every reader
  -- filters on this column and never re-derives it from `status`.
  visible              boolean     generated always as (status = 'live') stored
);

-- An author's own workspace: "my activities, most recently updated first".
create index activities_author_updated_idx
  on public.activities (author_id, updated_at desc);

-- The public feed: "live activities, newest published first". Partial on
-- `visible`, mirroring `exercises_level_focus_visible_idx` (0007) — the same
-- reasoning: an index over rows that will never be selected by this query
-- shape is write cost for nothing.
create index activities_published_idx
  on public.activities (published_at desc) where visible;

-- The moderation review queue (PR E): "activities waiting on a moderator".
-- Partial on the one status value that queue ever reads.
create index activities_pending_review_idx
  on public.activities (created_at) where status = 'pending_review';

-- Search/filter by block composition ("show me activities with a worksheet
-- block") without deserializing `activity_revisions.blocks` at query time.
create index activities_block_types_idx
  on public.activities using gin (block_types);

-- RLS on with no policies: only the service-role key (BYPASSRLS) reads or
-- writes this. The anon key gets nothing — Stage 1 has no creator or player
-- UI yet, so every access path is server-side already.
alter table public.activities enable row level security;

-- BYPASSRLS does NOT bypass table-level GRANTs (the 0002 lesson, repeated at
-- every new table since): the server role needs them explicitly or every
-- query fails with 42501 while a SECURITY DEFINER write would still have
-- succeeded, which is a check that fails OPEN.
grant select on table public.activities to service_role;
grant insert, update, delete on table public.activities to service_role;

-- ---------------------------------------------------------------------------
-- Revisions: the actual, versioned `blocks` content. See file header for the
-- full save -> submit -> approve/reject lifecycle this table encodes.
-- ---------------------------------------------------------------------------
create table public.activity_revisions (
  id            uuid        primary key default gen_random_uuid(),
  activity_id   uuid        not null references public.activities(id) on delete cascade,
  blocks        jsonb       not null,
  status        text        not null default 'draft'
                             check (status in ('draft','pending_review','approved','rejected','superseded')),
  created_by    uuid        not null references auth.users(id) on delete cascade,
  created_at    timestamptz not null default now(),
  reviewed_by   uuid        references auth.users(id) on delete set null,
  reviewed_at   timestamptz,
  review_note   text
);

-- An activity's revision history, most recent first — the shape both the
-- author's editor (latest draft) and an audit trail read.
create index activity_revisions_activity_created_idx
  on public.activity_revisions (activity_id, created_at desc);

-- The moderation review queue (PR E), mirrored from `activities` above:
-- "revisions waiting on a moderator".
create index activity_revisions_pending_review_idx
  on public.activity_revisions (created_at) where status = 'pending_review';

-- Same RLS posture as every table on this page: on, zero policies,
-- service_role only.
alter table public.activity_revisions enable row level security;

grant select on table public.activity_revisions to service_role;
grant insert, update, delete on table public.activity_revisions to service_role;

-- Now that `activity_revisions` exists, `activities.published_revision_id`
-- can carry its FK. `on delete set null`, never cascade: an activity must
-- survive its own published revision disappearing (it cannot in practice,
-- since revisions only ever get superseded, not deleted — but the FK action
-- matches every other "reference to a thing that might go away" column on
-- this table, `reviewed_by` included, rather than assuming that invariant).
alter table public.activities
  add constraint activities_published_revision_id_fkey
  foreign key (published_revision_id) references public.activity_revisions(id) on delete set null;

-- A live activity must point at the revision the public reads; otherwise it
-- would be visible with no content. This also makes deleting a published
-- revision fail (the FK's `set null` would break the check) instead of
-- silently emptying a live activity.
alter table public.activities
  add constraint activities_live_has_revision
  check (status <> 'live' or published_revision_id is not null);

-- ---------------------------------------------------------------------------
-- Storage buckets. Both webp-only, both capped at 2 MB (client pipeline
-- re-encodes everything to webp before upload — `src/lib/activities/
-- imagePipeline.ts` — so nothing else ever needs to land in either bucket).
-- `on conflict (id) do nothing` makes this migration re-runnable against an
-- environment where the buckets already exist (same idiom as any other
-- idempotent seed statement in this repo).
-- ---------------------------------------------------------------------------

-- PRIVATE: every fresh upload lands here first (pre-moderation, design.md
-- "Stage 1 is public"). Never public — a rejected or not-yet-reviewed image
-- must not be reachable by guessing its path.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('activity-uploads', 'activity-uploads', false, 2097152, array['image/webp'])
on conflict (id) do nothing;

-- PUBLIC: only a moderator-approved copy is written here (PR E's approval
-- flow, not this migration). Readable by anyone once a path is known, which
-- is fine — everything in it already passed review.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('activity-images', 'activity-images', true, 2097152, array['image/webp'])
on conflict (id) do nothing;

-- No `storage.objects` policy for `anon`/`authenticated` on either bucket:
-- every read and write goes through the server's service-role key via
-- short-lived signed URLs (`src/lib/activities/storage.ts`), never a direct
-- client-to-Supabase-Storage call.

commit;
