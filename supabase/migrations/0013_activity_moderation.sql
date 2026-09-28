-- Activity moderation (PR E, "Moderation"): approve/reject an author's
-- submitted revision, and the report -> auto-hide pipeline for an already
-- LIVE activity.
--
-- Run this in the Supabase SQL Editor (or via the Supabase CLI) AFTER
-- 0012_activity_views.sql.
--
-- It adds:
--
--   `public.approve_activity_revision(p_revision, p_reviewer, p_blocks,
--   p_block_types, p_block_count)` -- the ONE atomic write for a moderator's
--   approval. The server (`aprobar.ts`) has ALREADY strictly re-validated the
--   revision's blocks and rewritten every image path from the private
--   `activity-uploads/<author>/<uuid>.webp` to the public
--   `activity-images/<activityId>/<uuid>.webp` copy it just made (storage
--   has no transaction of its own, so that copy happens BEFORE this call —
--   see `aprobar.ts`'s own header) — this function only persists the result:
--   the revision becomes `approved` with those rewritten blocks, whatever
--   revision was previously `approved` for the same activity becomes
--   `superseded`, and the activity itself flips to `live`, pointing at the
--   freshly approved revision.
--
--   `public.reject_activity_revision(p_revision, p_reviewer, p_note)` -- the
--   matching decline. The revision becomes `rejected` with the moderator's
--   note. The ACTIVITY only follows it into `rejected` when it is not
--   currently `live` — a live activity keeps serving its already-published
--   revision untouched (0011 migration's own lifecycle rule: an edit under
--   review never hides the last-approved content).
--
--   `public.activity_reports` -- one row per (activity, reporter): a
--   signed-in visitor's report of a LIVE activity, with a closed reason
--   taxonomy plus optional free-text details.
--
--   `public.activity_moderation_config` -- a single tunable row (the report
--   count that auto-hides a live activity), same shape as
--   `exercise_moderation_config` (0009): changing it is a SQL UPDATE, never
--   a deploy.
--
--   `public.record_activity_report(p_activity, p_reporter, p_reason,
--   p_details)` -- the one atomic write for a report: inserts it
--   (idempotent — a second report from the same reporter changes nothing,
--   `on conflict do nothing`), then counts reports made SINCE the
--   activity's last approval and, once that count reaches the threshold,
--   moves a LIVE activity back to `pending_review` — which is what hides it
--   (`visible` is generated from `status = 'live'`, 0011 migration) — while
--   KEEPING `published_revision_id` untouched, so a later restore needs no
--   re-approval. Returns whether this call is what hid it.
--
--   "Since the activity's last approval" reads `activities.reviewed_at`:
--   both `approve_activity_revision` above and the restore endpoint
--   (`restaurar.ts`, application code — no SQL function needed, a plain
--   `update … set status = 'live', reviewed_at = now()`) stamp it on every
--   transition INTO `live`, so it is exactly "the last time a moderator put
--   this activity in front of the public" — the correct reset point for the
--   report window. `reviewed_at` also gets stamped by a REJECTION, but only
--   when the activity is not live (see `reject_activity_revision` above),
--   so it never gives a live activity a false reset from an unrelated
--   rejected edit.
--
-- Same RLS posture as every table since `exercise_likes` (the 0002 lesson):
-- RLS on, ZERO policies, `service_role` only, with explicit table GRANTs
-- (BYPASSRLS does not imply them) — and the SAME function-EXECUTE lesson
-- `0012_activity_views.sql` first documented here: Supabase grants EXECUTE
-- on a freshly created function to `anon`/`authenticated` by default, and
-- `revoke … from public` alone does NOT remove that — every function below
-- explicitly revokes from `public, anon, authenticated` before granting
-- `service_role` its own EXECUTE.

begin;

-- ---------------------------------------------------------------------------
-- 1. approve_activity_revision — the moderator's ONE atomic "yes"
-- ---------------------------------------------------------------------------
--
-- `for update` locks the revision row for the duration of this transaction:
-- two concurrent approvals (or an approval racing a reject) of the SAME
-- revision serialize instead of both succeeding. `status <> 'pending_review'`
-- raises rather than silently no-op-ing — the caller (`aprobar.ts`) turns
-- that into a 409/422, never a fake 200 for a click that arrived too late.
create or replace function public.approve_activity_revision(
  p_revision uuid,
  p_reviewer uuid,
  p_blocks jsonb,
  p_block_types text[],
  p_block_count int
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_activity_id uuid;
  v_status      text;
begin
  select activity_id, status
    into v_activity_id, v_status
  from public.activity_revisions
  where id = p_revision
  for update;

  if not found then
    raise exception 'activity revision % not found', p_revision;
  end if;
  if v_status <> 'pending_review' then
    raise exception 'activity revision % is not pending_review (status=%)', p_revision, v_status;
  end if;

  update public.activity_revisions
     set blocks      = p_blocks,
         status      = 'approved',
         reviewed_by = p_reviewer,
         reviewed_at = now()
   where id = p_revision;

  -- Whatever revision was `approved` before this one, for the SAME activity,
  -- is now superseded. Excludes `p_revision` itself — already flipped to
  -- `approved` above — so this can never immediately re-supersede its own
  -- write.
  update public.activity_revisions
     set status = 'superseded'
   where activity_id = v_activity_id
     and status = 'approved'
     and id <> p_revision;

  update public.activities
     set published_revision_id = p_revision,
         status                = 'live',
         published_at          = coalesce(published_at, now()),
         block_types           = p_block_types,
         block_count           = p_block_count,
         reviewed_by           = p_reviewer,
         reviewed_at           = now(),
         review_note           = null,
         updated_at            = now()
   where id = v_activity_id;
end;
$$;

revoke all on function public.approve_activity_revision(uuid, uuid, jsonb, text[], int) from public;
revoke all on function public.approve_activity_revision(uuid, uuid, jsonb, text[], int) from anon, authenticated;
grant execute on function public.approve_activity_revision(uuid, uuid, jsonb, text[], int) to service_role;

-- ---------------------------------------------------------------------------
-- 2. reject_activity_revision — the moderator's ONE atomic "no"
-- ---------------------------------------------------------------------------
--
-- Same locking/status-guard posture as approval above. The note is REQUIRED
-- (1-500 chars, trimmed) — enforced here too, not only in the endpoint, so a
-- hand-run call cannot bypass it either (same "the database is the
-- authoritative check" posture as every constraint in this codebase).
create or replace function public.reject_activity_revision(
  p_revision uuid,
  p_reviewer uuid,
  p_note text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_activity_id     uuid;
  v_status          text;
  v_activity_status text;
  v_note            text;
begin
  v_note := trim(coalesce(p_note, ''));
  if char_length(v_note) < 1 or char_length(v_note) > 500 then
    raise exception 'a rejection note between 1 and 500 characters is required';
  end if;

  select activity_id, status
    into v_activity_id, v_status
  from public.activity_revisions
  where id = p_revision
  for update;

  if not found then
    raise exception 'activity revision % not found', p_revision;
  end if;
  if v_status <> 'pending_review' then
    raise exception 'activity revision % is not pending_review (status=%)', p_revision, v_status;
  end if;

  update public.activity_revisions
     set status      = 'rejected',
         reviewed_by = p_reviewer,
         reviewed_at = now(),
         review_note = v_note
   where id = p_revision;

  select status into v_activity_status
  from public.activities
  where id = v_activity_id
  for update;

  -- A LIVE activity stays live — its published revision keeps serving; only
  -- the rejected edit itself records the note (already done above).
  if v_activity_status <> 'live' then
    update public.activities
       set status      = 'rejected',
           review_note = v_note,
           reviewed_by = p_reviewer,
           reviewed_at = now(),
           updated_at  = now()
     where id = v_activity_id;
  end if;
end;
$$;

revoke all on function public.reject_activity_revision(uuid, uuid, text) from public;
revoke all on function public.reject_activity_revision(uuid, uuid, text) from anon, authenticated;
grant execute on function public.reject_activity_revision(uuid, uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 3. activity_reports + activity_moderation_config
-- ---------------------------------------------------------------------------
create table public.activity_reports (
  id          uuid        primary key default gen_random_uuid(),
  activity_id uuid        not null references public.activities(id) on delete cascade,
  reporter_id uuid        not null references auth.users(id) on delete cascade,
  reason      text        not null check (reason in ('inappropriate','off_topic','copyright','wrong_answers','other')),
  details     text        check (details is null or char_length(details) <= 500),
  created_at  timestamptz not null default now(),
  unique (activity_id, reporter_id)
);

-- The moderator "Reportadas" tab reads every report for one activity,
-- oldest first; `record_activity_report` counts them since a timestamp. Both
-- access patterns are covered by one (activity_id, created_at) index.
create index activity_reports_activity_created_idx
  on public.activity_reports (activity_id, created_at);

-- Single-row tunable threshold — same "id boolean primary key check (id)"
-- idiom as `exercise_moderation_config` (0009): a second INSERT can only
-- ever collide with `id = true`, so "exactly one row" is a database
-- guarantee, not a convention.
create table public.activity_moderation_config (
  id               boolean     primary key default true check (id),
  report_threshold int         not null default 3 check (report_threshold > 0),
  updated_at       timestamptz not null default now()
);
insert into public.activity_moderation_config (id) values (true) on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 4. record_activity_report — insert + threshold check, one round trip
-- ---------------------------------------------------------------------------
--
-- `for update` on the activities row serializes concurrent reports of the
-- same activity, so a burst arriving at once cannot all read a below-
-- threshold count and all skip hiding it. Returns `true` only when THIS call
-- is the one that moved the activity out of `live` — a report on an
-- already-hidden (or never-live) activity always returns `false`, never
-- re-fires the transition.
create or replace function public.record_activity_report(
  p_activity uuid,
  p_reporter uuid,
  p_reason text,
  p_details text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author_id   uuid;
  v_status      text;
  v_reviewed_at timestamptz;
  v_threshold   int;
  v_count       bigint;
  v_hidden      boolean := false;
begin
  select author_id, status, reviewed_at
    into v_author_id, v_status, v_reviewed_at
  from public.activities
  where id = p_activity
  for update;

  if not found then
    raise exception 'activity % not found', p_activity;
  end if;
  -- Defense in depth: the endpoint already refuses a self-report before
  -- ever calling this function (T-security: "author can't report own
  -- activity") — this guard covers a hand-run/forged call directly against
  -- the RPC.
  if v_author_id = p_reporter then
    raise exception 'an activity author cannot report their own activity';
  end if;

  insert into public.activity_reports (activity_id, reporter_id, reason, details)
  values (p_activity, p_reporter, p_reason, p_details)
  on conflict (activity_id, reporter_id) do nothing;

  select count(*) into v_count
  from public.activity_reports
  where activity_id = p_activity
    and (v_reviewed_at is null or created_at > v_reviewed_at);

  select report_threshold into v_threshold from public.activity_moderation_config;

  if v_status = 'live' and v_count >= v_threshold then
    update public.activities
       set status = 'pending_review'
     where id = p_activity
       and status = 'live';
    v_hidden := true;
  end if;

  return v_hidden;
end;
$$;

revoke all on function public.record_activity_report(uuid, uuid, text, text) from public;
revoke all on function public.record_activity_report(uuid, uuid, text, text) from anon, authenticated;
grant execute on function public.record_activity_report(uuid, uuid, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 5. RLS + grants (the 0002 lesson, repeated at every table since)
-- ---------------------------------------------------------------------------
alter table public.activity_reports          enable row level security;
alter table public.activity_moderation_config enable row level security;

grant select on table public.activity_reports to service_role;
grant insert, update, delete on table public.activity_reports to service_role;

grant select on table public.activity_moderation_config to service_role;
grant insert, update, delete on table public.activity_moderation_config to service_role;

commit;
