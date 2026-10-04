-- Account deletion (owner decision, 2026-10-04): a signed-in user may delete
-- their account. Their PUBLISHED community content must not be lost — it
-- stays available, now owned by "ChuyoCode" (the platform) — while content
-- nobody ever saw, and every row that is identity-bound personal data,
-- disappears with the account.
--
-- Run this in the Supabase SQL Editor (or via the Supabase CLI) AFTER
-- 0019_billing_foundation.sql.
--
-- FK AUDIT — every foreign key to `auth.users(id)` found across 0003-0019,
-- and what this migration does about each one:
--
--   table.column                      | today's ON DELETE | this migration
--   -----------------------------------+--------------------+------------------
--   exercises.updated_by               | set null (0007)    | unchanged
--   exercises.hidden_by                | set null (0007)    | unchanged
--   exercises.author_id                | set null (0007)    | unchanged FK;
--                                       | (already nullable) | adds the two
--                                       |                    | provenance columns (#2 below)
--   user_roles.user_id (PK)            | cascade (0008)     | unchanged — a role
--                                       |                    | GRANT is not content
--   exercise_reactions.user_id         | cascade (0009)     | unchanged — see #4
--   user_subscriptions.user_id (PK)    | cascade (0010)     | unchanged — see #5
--   activities.author_id               | cascade (0011),    | CHANGED to nullable +
--                                       | not null           | set null (#1 below)
--   activities.reviewed_by             | set null (0011)    | unchanged
--   activity_revisions.created_by      | cascade (0011),    | CHANGED to nullable +
--                                       | not null           | set null — see #3, a
--                                       |                    | correctness bug this
--                                       |                    | migration found, not
--                                       |                    | just a style match
--   activity_revisions.reviewed_by     | set null (0011)    | unchanged
--   activity_views.user_id (PK)        | cascade (0012)     | unchanged FK; RPC
--                                       |                    | deletes the rows itself
--   activity_reports.reporter_id       | cascade (0013),    | CHANGED to nullable +
--                                       | not null           | set null (#4 below)
--   courses.created_by                 | set null (0017)    | unchanged
--   course_purchases.user_id           | cascade (0017),    | unchanged — see #5
--                                       | not null           |
--   course_purchases.granted_by        | set null (0017)    | unchanged
--   billing_events                     | no user FK at all  | n/a
--
-- -----------------------------------------------------------------------------
-- 1. activities.author_id: CASCADE -> SET NULL, and NOT NULL -> nullable
-- -----------------------------------------------------------------------------
-- Today, deleting a user who has ever created an activity is impossible
-- without first destroying every activity they ever published — Postgres
-- refuses the `auth.users` delete outright (the exact failure mode
-- `0007_exercise_authorship.sql` already fixed for `exercises.updated_by`).
-- Worse, if it DID cascade, it would delete the row the public is currently
-- reading. NULL now means "owned by ChuyoCode": nobody displays creators
-- today (owner decision), so a null `author_id` renders exactly like any
-- other activity until a future "community / creator profiles" feature
-- gives it a face — at which point it shows as "ChuyoCode".
--
-- -----------------------------------------------------------------------------
-- 2. original_author_id / transferred_at — on activities AND on curated
--    exercises (both record an author; see `0007_exercise_authorship.sql`'s
--    `author_id`, same "user-authored-exercises" feature)
-- -----------------------------------------------------------------------------
-- `original_author_id` carries NO FOREIGN KEY on purpose: the whole point is
-- to remember who created a transferred row AFTER their `auth.users` row is
-- gone, which an FK to that same table would make impossible (or would
-- itself null out the moment the row disappears — defeating the column).
-- Privacy: this stores the uuid ONLY, never an email or name — the one
-- identifier `auth.users` guarantees stays meaningless noise without a
-- lookup nothing in this codebase performs today.
--
-- Paired, all-or-nothing, same idiom as `exercises_hidden_pair` (0007): a row
-- is either untransferred (both null) or transferred (both set). No index on
-- `original_author_id` — nothing queries by it today (creators are not
-- displayed anywhere; see file header), and an index over a predicate no
-- query uses is write cost for nothing (the standing house rule since
-- `0005_exercise_likes.sql`).
--
-- -----------------------------------------------------------------------------
-- 3. activity_revisions.created_by: CASCADE -> SET NULL, and NOT NULL ->
--    nullable — a correctness bug this audit found, not a style match
-- -----------------------------------------------------------------------------
-- `activities.published_revision_id` points at the ONE revision the public
-- reads (0011 migration header). Leaving `activity_revisions.created_by` on
-- CASCADE would delete that exact row the instant its author's `auth.users`
-- row disappears — including for an activity THIS migration just transferred
-- to ChuyoCode a moment earlier in the SAME function. Two failures follow:
-- the public-facing content silently vanishes (the one outcome this whole
-- feature exists to prevent), and `activities_live_has_revision` (0011) then
-- refuses a `live` row with no `published_revision_id`, so a live activity's
-- author being deleted would abort the ENTIRE `auth.admin.deleteUser` call
-- with a constraint violation. SET NULL fixes both: the approved revision
-- survives, `created_by` on it reads as "ChuyoCode" exactly like the
-- activity's own `author_id`.
--
-- One more consequence of SET NULL, handled below in `transfer_and_purge_user`
-- itself rather than in a later migration: a revision that is still
-- `draft`/`pending_review`/`rejected` for THIS activity (an in-flight edit
-- nobody will ever finish once its author is gone) would otherwise linger
-- with a null `created_by` — invisible to `src/lib/activities/moderation.ts`'s
-- review queue, which filters any row that is not a string (the moderation
-- queue was out of scope for this change; working around its read-side
-- assumption by never leaving such a row behind was not). The function
-- deletes exactly those, never the row `published_revision_id` points at —
-- by construction only `approve_activity_revision` (0013) ever sets that
-- link, and only onto a revision it ALSO flips to `approved` in the same
-- transaction, so the status filter below can never match it.
--
-- -----------------------------------------------------------------------------
-- 4. activity_reports.reporter_id: CASCADE -> SET NULL, and NOT NULL ->
--    nullable — moderation history stays intact
-- -----------------------------------------------------------------------------
-- A report is evidence in an activity's moderation history (why it was
-- auto-hidden, what a moderator saw) that has nothing to do with whether the
-- REPORTER still has an account. Cascading it away would quietly rewrite
-- that history — a live activity that was hidden for 3 reports could end up
-- showing only 2 once a reporter deletes their account, with no record such
-- a report ever existed. SET NULL keeps the row (reason, details,
-- timestamp), sacrificing only the identity of who filed it — the FK allows
-- it (unlike, say, a primary-key column), so this is the preferred choice
-- the task names. `unique (activity_id, reporter_id)` (0013) is unaffected:
-- SQL NULLs are never equal to each other, so any number of anonymized
-- reports on the same activity coexist without colliding.
--
-- Known, accepted gap (documented, not fixed here — see this change's own
-- report): `src/lib/activities/moderation.ts#loadReportedActivities` filters
-- out any report row whose `reporter_id` is not a string, so an anonymized
-- report becomes invisible in the admin UI's aggregated view even though the
-- row persists in the database for a direct query. Narrower and lower-stakes
-- than #3 above (nothing breaks; one report is temporarily missing from one
-- aggregated read), and outside this change's endpoint/UI/migration scope.
--
-- -----------------------------------------------------------------------------
-- 5. Left to their EXISTING FK behavior, deliberately unchanged
-- -----------------------------------------------------------------------------
-- `user_subscriptions.user_id` and `course_purchases.user_id` both CASCADE:
-- deleting the account deletes the premium-plan entitlement row and every
-- lifetime course-purchase/entitlement row with it. This also deletes the
-- payment metadata those rows carry (`amount_cents`, `provider`,
-- `provider_ref`) — acceptable for this change (an entitlement is not
-- "community content"), but worth the owner's attention for the privacy
-- policy text and for any future bookkeeping/tax retention requirement,
-- which would need its OWN deliberate design (e.g. a redacted billing
-- archive row) rather than inheriting this cascade by accident. Not changed
-- here. `exercise_reactions.user_id` also CASCADEs (0009): a reaction is the
-- exercises' own "heart" (identity-backed opinion), so this already matches
-- #6's "a heart disappears with the identity" reasoning below, and its own
-- counter trigger (`sync_exercise_reaction_counts`) already fires correctly
-- on a cascaded DELETE exactly as it would on an explicit one — no RPC
-- action needed for it, unlike activity_hearts (see #6).

begin;

-- ---------------------------------------------------------------------------
-- Schema changes
-- ---------------------------------------------------------------------------

alter table public.activities alter column author_id drop not null;
alter table public.activities drop constraint activities_author_id_fkey;
alter table public.activities add constraint activities_author_id_fkey
  foreign key (author_id) references auth.users(id) on delete set null;

alter table public.activity_revisions alter column created_by drop not null;
alter table public.activity_revisions drop constraint activity_revisions_created_by_fkey;
alter table public.activity_revisions add constraint activity_revisions_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;

alter table public.activity_reports alter column reporter_id drop not null;
alter table public.activity_reports drop constraint activity_reports_reporter_id_fkey;
alter table public.activity_reports add constraint activity_reports_reporter_id_fkey
  foreign key (reporter_id) references auth.users(id) on delete set null;

-- No FK/nullability change needed on `exercises.author_id` — 0007 already
-- made it nullable with `on delete set null`. Only the provenance pair is
-- new here.
alter table public.activities
  add column original_author_id uuid,
  add column transferred_at     timestamptz;

alter table public.activities add constraint activities_transfer_pair
  check (
    (original_author_id is null and transferred_at is null)
    or (original_author_id is not null and transferred_at is not null)
  );

alter table public.exercises
  add column original_author_id uuid,
  add column transferred_at     timestamptz;

alter table public.exercises add constraint exercises_transfer_pair
  check (
    (original_author_id is null and transferred_at is null)
    or (original_author_id is not null and transferred_at is not null)
  );

-- ---------------------------------------------------------------------------
-- transfer_and_purge_user — the ONE atomic write for account deletion's
-- whole data-layer side. Called by `POST /api/cuenta/eliminar`
-- (`src/lib/accountDeletion.ts`) BEFORE `auth.admin.deleteUser` ever runs —
-- see that module's own header for why the ordering and the split across
-- two separate calls (this RPC is one Postgres transaction; the Auth Admin
-- API delete is a second, independent call that cannot share it) is
-- deliberate, not an oversight.
--
-- IDEMPOTENT / SAFE TO RE-RUN: every statement is a plain `WHERE author_id =
-- p_user` (or the equivalent). A second call after the first already
-- transferred everything matches zero rows and changes nothing — the
-- endpoint's own retry-after-a-later-failure story relies on exactly this.
--
-- Storage cleanup (the private `activity-uploads/<userId>/…` folder) is
-- DELIBERATELY NOT this function's job and nothing here returns storage
-- paths: that folder's location is already a pure, deterministic function of
-- `userId` alone (`src/lib/activities/paths.ts#uploadPath`), Postgres has no
-- authoritative view of Supabase Storage worth round-tripping for, and every
-- object under it is private to this one user regardless of which specific
-- activity/exercise it happens to belong to — once nothing may approve a
-- NEW draft referencing it, the whole folder is dead weight. See
-- `src/lib/activities/storage.ts#removeAllUserUploads`, which the endpoint
-- calls directly from the userId it already has.
create or replace function public.transfer_and_purge_user(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Activities: published content is preserved, transferred to ChuyoCode.
  -- `published_at` (0007/0011 pattern: stamped once, on first approval, and
  -- never cleared by a later reject/report-hide/removal) is "was this ever
  -- shown to the public" — not merely "is it live THIS SECOND" — so a
  -- temporarily report-hidden activity (`status = 'pending_review'` with
  -- `published_revision_id` still set, 0013's own posture) is correctly kept,
  -- not swept into the drafts branch below.
  update public.activities
     set author_id          = null,
         original_author_id = author_id,
         transferred_at     = now()
   where author_id = p_user
     and published_at is not null;

  -- Activities nobody ever saw: gone with the account. Cascades to this
  -- activity's own revisions/hearts/views (all `activity_id on delete
  -- cascade`, 0011/0012/0014) — nothing else references a row that was
  -- never public.
  delete from public.activities
   where author_id = p_user
     and published_at is null;

  -- An in-flight edit of an activity that WAS kept above can never be
  -- finished or meaningfully reviewed once its author is gone (see migration
  -- header, point 3). Never matches the revision `published_revision_id`
  -- points at: that one is always `approved`, by construction.
  delete from public.activity_revisions
   where created_by = p_user
     and status in ('draft', 'pending_review', 'rejected');

  -- Curated exercises: the same published/never-published split as
  -- activities (`0007_exercise_authorship.sql`'s own `published_at`).
  update public.exercises
     set author_id          = null,
         original_author_id = author_id,
         transferred_at     = now()
   where author_id = p_user
     and published_at is not null;

  delete from public.exercises
   where author_id = p_user
     and published_at is null;

  -- A heart is a personal endorsement tied to an identity, not historical
  -- fact — it must disappear WITH that identity, unlike a view (below). The
  -- existing delta trigger (`sync_activity_heart_count`, 0014) fires on this
  -- DELETE exactly as it would on any other and keeps `heart_count` correct.
  delete from public.activity_hearts where user_id = p_user;

  -- The per-user view record (`activity_views`) is personal viewing history
  -- and is deleted with the account. The PUBLIC `view_total` aggregate on
  -- `activities` is DELIBERATELY left untouched: it has no matching
  -- decrement trigger (it is written once, directly, inside
  -- `record_activity_view`'s own upsert — 0014/0018), and unlike a heart —
  -- a live endorsement that should stop counting the moment its author is
  -- gone — a view already happened; it is a historical impression count, not
  -- a current opinion, and does not need to be retroactively undone.
  delete from public.activity_views where user_id = p_user;
end;
$$;

revoke all on function public.transfer_and_purge_user(uuid) from public;
revoke all on function public.transfer_and_purge_user(uuid) from anon, authenticated;
grant execute on function public.transfer_and_purge_user(uuid) to service_role;

commit;
