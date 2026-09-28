-- Activity discovery: hearts, denormalized counters, and search ("Descubrir").
--
-- Run this in the Supabase SQL Editor (or via the Supabase CLI) AFTER
-- 0013_activity_moderation.sql.
--
-- It adds:
--
--   `public.activity_hearts` -- one row per (user, activity): a signed-in
--   visitor's "like" of a LIVE activity. Identity-backed, the same shape as
--   `exercise_reactions` (0009), but its OWN table: curated exercises'
--   reactions are a like/dislike taxonomy with an audit threshold, while an
--   activity heart is a plain toggle with no dislike axis and no audit
--   posture at all — reusing 0009's table or trigger would smuggle two
--   unrelated concepts into one shape. NEVER reuse or change 0009's tables
--   from here.
--
--   Denormalized counters on `activities`:
--     `heart_count` -- kept in sync by a delta-based trigger on
--     `activity_hearts`, the same "evaluate the delta inside the UPDATE's
--     SET expression" posture as 0009's `sync_exercise_reaction_counts` and
--     0006's `decrement_exercise_like` (never below zero, and race-free
--     under concurrent hearts of the SAME activity).
--     `view_total` -- kept in sync INSIDE `record_activity_view` itself
--     (below): a view is already the one place that per-user counter is
--     written, so no separate trigger is needed. Backfilled here from the
--     sum of every already-recorded `activity_views.view_count`.
--
--   `public.toggle_activity_heart(p_user, p_activity)` -- the one atomic
--   write for a heart: refuses (raises) an activity that is not live, or
--   whose author IS `p_user` (an author cannot heart their own activity —
--   defense in depth, the same posture as `record_activity_report`'s own
--   self-report guard, 0013; the endpoint pre-checks both cases too, same
--   shape as `recordReport`'s own TS wrapper). Inserts when absent, deletes
--   when present, and returns the NEW state in the SAME round trip —
--   `hearted`/`heart_count` are read back from the row the trigger just
--   wrote, never computed twice.
--
--   Search: `pg_trgm` — Supabase's convention keeps extensions OUT of
--   `public`, in the `extensions` schema — plus a trigram GIN index on
--   `activities.title`, so `ilike '%…%'` search does not fall back to a
--   sequential scan. Two more partial indexes back the community list's
--   "gustadas"/"vistas" sort orders, mirroring `activities_published_idx`'s
--   own partial-on-`visible` shape (0011): an index over rows that query
--   shape will never select is write cost for nothing.
--
-- Same RLS posture as every table since `exercise_likes` (the 0002 lesson):
-- RLS on, ZERO policies, `service_role` only, with explicit table GRANTs
-- (BYPASSRLS does not imply them) — and the function-EXECUTE lesson every
-- migration since `0012_activity_views.sql` documents: `revoke … from
-- public, anon, authenticated` before granting `service_role` its own
-- EXECUTE, because Supabase grants EXECUTE on a freshly created function to
-- anon/authenticated by default.

begin;

-- ---------------------------------------------------------------------------
-- 1. activity_hearts — one row per (user, activity)
-- ---------------------------------------------------------------------------
create table public.activity_hearts (
  user_id     uuid        not null references auth.users(id) on delete cascade,
  activity_id uuid        not null references public.activities(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, activity_id)
);

alter table public.activity_hearts enable row level security;

grant select on table public.activity_hearts to service_role;
grant insert, update, delete on table public.activity_hearts to service_role;

-- ---------------------------------------------------------------------------
-- 2. Denormalized counters on activities
-- ---------------------------------------------------------------------------
alter table public.activities
  add column heart_count int not null default 0,
  add column view_total  int not null default 0;

-- THE FLOOR BELONGS IN THE DATABASE, NOT ONLY IN THE TRIGGER (0006's rule,
-- repeated at every counter since). The trigger below already clamps at
-- zero, which is exactly why this should never fire.
alter table public.activities
  add constraint activities_heart_count_non_negative check (heart_count >= 0);

-- Backfill view_total from the sum of every already-recorded view. A brand
-- new activity (no `activity_views` rows yet) keeps its default of 0 via
-- `coalesce`.
update public.activities a
   set view_total = coalesce(
     (select sum(v.view_count) from public.activity_views v where v.activity_id = a.id),
     0
   );

-- ---------------------------------------------------------------------------
-- 3. heart_count trigger — delta-based, never below zero
-- ---------------------------------------------------------------------------
--
-- 🔴 NEW and OLD MUST BE BRANCHED ON, NEVER COALESCED (0009's own rule,
-- repeated here): `NEW` is unassigned during DELETE and `OLD` during INSERT.
-- `activity_hearts` has no UPDATE path (a heart is inserted or deleted, never
-- changed in place), so this trigger only needs the two branches below.
create or replace function public.sync_activity_heart_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.activities set heart_count = heart_count + 1 where id = new.activity_id;
  elsif tg_op = 'DELETE' then
    update public.activities set heart_count = greatest(heart_count - 1, 0) where id = old.activity_id;
  end if;
  return null;
end;
$$;

create trigger activity_hearts_sync_count
  after insert or delete on public.activity_hearts
  for each row execute function public.sync_activity_heart_count();

revoke all on function public.sync_activity_heart_count() from public;
revoke all on function public.sync_activity_heart_count() from anon, authenticated;
grant execute on function public.sync_activity_heart_count() to service_role;

-- ---------------------------------------------------------------------------
-- 4. record_activity_view — re-applied to also increment view_total
-- ---------------------------------------------------------------------------
--
-- SAME SIGNATURE as `0012_activity_views.sql`'s original: `create or
-- replace` swaps the body in place, so every existing caller
-- (`recordActivityView`, `@lib/activities/views`) keeps working unchanged.
-- The new `view_total` write happens in the SAME transaction as the
-- per-user upsert above it — one round trip, two counters, both correct or
-- both rolled back together.
create or replace function public.record_activity_view(p_user uuid, p_activity uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count int;
begin
  insert into public.activity_views (user_id, activity_id, view_count, first_viewed_at, last_viewed_at)
  values (p_user, p_activity, 1, now(), now())
  on conflict (user_id, activity_id) do update
    set view_count = public.activity_views.view_count + 1,
        last_viewed_at = now()
  returning view_count into new_count;

  update public.activities set view_total = view_total + 1 where id = p_activity;

  return new_count;
end;
$$;

-- Re-applied exactly as `0012_activity_views.sql` first documented: Postgres
-- grants EXECUTE on a newly created function to PUBLIC by default, and
-- Supabase's own defaults grant it to anon/authenticated too — `create or
-- replace` does not touch privileges, but every revoke/grant is repeated
-- here anyway so this file is a complete, re-runnable statement of the
-- function's final privileges, not a diff someone has to reconstruct by
-- reading two migrations side by side.
revoke all on function public.record_activity_view(uuid, uuid) from public;
revoke all on function public.record_activity_view(uuid, uuid) from anon, authenticated;
grant execute on function public.record_activity_view(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 5. toggle_activity_heart — the one atomic write for a heart
-- ---------------------------------------------------------------------------
--
-- `for update` locks the activity row for the duration of this transaction,
-- same posture as `approve_activity_revision` (0013): a concurrent toggle of
-- the SAME activity by a DIFFERENT user serializes instead of both reading a
-- stale `heart_count`. Refusing on `not found or not v_visible` collapses
-- "does not exist" and "not live" into the same raised exception — the
-- caller (`toggleActivityHeart`, `@lib/activities/hearts`) already resolved
-- that distinction with its own pre-fetch before ever calling this RPC, the
-- same shape `recordReport` (0013) uses for its own self-report guard; this
-- raise is defense in depth against a hand-run or forged call.
create or replace function public.toggle_activity_heart(p_user uuid, p_activity uuid)
returns table(hearted boolean, heart_count int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author_id uuid;
  v_visible   boolean;
  v_existing  boolean;
begin
  select author_id, visible into v_author_id, v_visible
  from public.activities
  where id = p_activity
  for update;

  if not found or not v_visible then
    raise exception 'activity % is not live', p_activity;
  end if;
  if v_author_id = p_user then
    raise exception 'an activity author cannot heart their own activity';
  end if;

  select exists(
    select 1 from public.activity_hearts
    where user_id = p_user and activity_id = p_activity
  ) into v_existing;

  if v_existing then
    delete from public.activity_hearts
    where user_id = p_user and activity_id = p_activity;
  else
    insert into public.activity_hearts (user_id, activity_id) values (p_user, p_activity);
  end if;

  return query
    select not v_existing, a.heart_count
    from public.activities a
    where a.id = p_activity;
end;
$$;

revoke all on function public.toggle_activity_heart(uuid, uuid) from public;
revoke all on function public.toggle_activity_heart(uuid, uuid) from anon, authenticated;
grant execute on function public.toggle_activity_heart(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 6. Search + sort indexes
-- ---------------------------------------------------------------------------
--
-- Supabase keeps extensions OUT of `public` by convention, in `extensions` —
-- so the opclass below is schema-qualified (`extensions.gin_trgm_ops`)
-- rather than relying on `search_path` to find it.
create extension if not exists pg_trgm with schema extensions;

create index activities_title_trgm_idx
  on public.activities using gin (title extensions.gin_trgm_ops);

-- "gustadas" sort: live activities, most-hearted first, ties broken by
-- newest publication.
create index activities_heart_count_published_idx
  on public.activities (heart_count desc, published_at desc) where visible;

-- "vistas" sort: live activities, most-viewed first, same tie-break.
create index activities_view_total_published_idx
  on public.activities (view_total desc, published_at desc) where visible;

commit;
