-- Activities foundation (Wordwall/Liveworksheets-style creator content), PR A.
--
-- Run this in the Supabase SQL Editor (or via the Supabase CLI) AFTER
-- 0010_user_subscriptions.sql.
--
-- An activity is an ordered list of typed BLOCKS (worksheet/quiz — the module
-- contract lives in `src/lib/activities/blocks.ts`, never re-derived here).
-- This table stores that list as opaque `jsonb`; the migration's only job is
-- the lifecycle envelope around it, not the block shape.
--
-- LIFECYCLE, five states (mirrors 0007's `status` axis, not `exercises`'
-- five-state one — activities have no `auditing`/`needs_work`, since
-- moderation here is pre-publish review, not post-publish audit):
--   draft           -- author is still working; nothing public.
--   pending_review  -- author submitted; awaiting a moderator (PR E).
--   live            -- approved and public. `blocks` is what the player reads.
--   rejected        -- moderator declined; author may revise back to draft.
--   removed         -- terminal, same posture as `exercises.status = 'removed'`.
--
-- `blocks` ALWAYS holds the last-approved (or, pre-approval, last-saved draft)
-- content — it is what a `live` activity's player renders and it never goes
-- blank while an edit is pending review. `pending_blocks` holds a proposed
-- edit to an ALREADY-LIVE activity awaiting re-review: the live `blocks` stay
-- public and unchanged until that edit is approved, at which point PR E's
-- approval flow copies `pending_blocks` into `blocks` and clears it. A brand
-- new (not-yet-live) activity never needs `pending_blocks`: its only copy of
-- the content is `blocks` itself, gated by `status` instead.
--
-- `visible`, GENERATED STORED, same pattern and same reason as
-- `0007_exercise_authorship.sql`'s column of the same name: every read site
-- filters on ONE boolean instead of re-deriving "is this live" from `status`
-- at every call site. `STORED` must be spelled explicitly (see 0007's step 8
-- comment for the Postgres-version note); verified by this migration's own
-- text-guard test.
--
-- RLS ON, ZERO POLICIES — same posture as every table since `exercise_likes`
-- (the 0002 lesson). Stage 1 has no creator UI yet (PR A ships schema only;
-- PR B is the creator, PR D the player, PR E moderation), so every access
-- path is server-side and goes through the service-role key.
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
  id             uuid        primary key default gen_random_uuid(),
  author_id      uuid        not null references auth.users(id) on delete cascade,
  title          text        not null check (char_length(title) between 1 and 120),
  level          text        check (level in ('A1','A2','B1','B2','C1','C2')),
  status         text        not null default 'draft'
                              check (status in ('draft','pending_review','live','rejected','removed')),
  blocks         jsonb       not null default '[]',
  pending_blocks jsonb,
  review_note    text,
  reviewed_by    uuid        references auth.users(id) on delete set null,
  reviewed_at    timestamptz,
  published_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- Same generated-STORED pattern as `0007_exercise_authorship.sql`, step 8:
  -- exactly one place computes "is this activity reachable", so every reader
  -- filters on this column and never re-derives it from `status`.
  visible        boolean     generated always as (status = 'live') stored
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
