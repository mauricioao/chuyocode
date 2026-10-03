-- Dedupe the public activity view counter (`activities.view_total`):
-- count at most one view per (user, activity) pair every 30 minutes,
-- instead of once per call.
--
-- Run this in the Supabase SQL Editor (or via the Supabase CLI) AFTER
-- 0017_courses.sql.
--
-- Verified defect: `record_activity_view` (0012, re-applied by 0014) runs
-- `update public.activities set view_total = view_total + 1` on EVERY
-- call, with no bound at all. One signed-in user looping
-- `POST /api/actividades/[id]/visto` inflates that activity's PUBLIC
-- `view_total` without limit, manipulating the "vistas" sort order on the
-- Descubrir page (`activities_view_total_published_idx`, 0014;
-- `src/lib/activities/activities.ts`) — a ranking anyone can buy with a
-- loop, not a count of distinct interest. The per-user `activity_views`
-- counter (`view_count`), surfaced on the practice page as "Ya lo viste ·
-- N veces" via `recordActivityView`/`ActivityViewBadge`, is NOT public and
-- is untouched by this migration — it already counts every call on
-- purpose, same as before.
--
-- Fix: `record_activity_view` keeps its SAME signature, return value,
-- `security definer`, and `set search_path = public` (`create or replace`,
-- same posture 0014 used to re-apply it over 0012's original). Before the
-- existing per-user upsert — left completely unchanged, it still bumps that
-- user's own private `view_count`/`last_viewed_at` on every call, same as
-- always — this now reads that (user, activity) row's previous
-- `last_viewed_at` `for update`, serializing concurrent calls from the SAME
-- user for the SAME activity (same posture `toggle_activity_heart`/
-- `approve_activity_revision` already use their own row lock for). The
-- public `view_total` is then incremented only when there was no previous
-- row at all, or that previous `last_viewed_at` is already more than 30
-- minutes old — a SLIDING window measured from the same user's previous
-- view (counted or not): only a view that comes 30+ minutes after the last
-- one counts again, so steady viewing every few minutes counts once.
--
-- Same privilege posture every migration since `0012_activity_views.sql`
-- documents: `create or replace` does not touch privileges, so every
-- revoke/grant is repeated here for a complete, re-runnable statement of
-- the function's final privileges.

begin;

create or replace function public.record_activity_view(p_user uuid, p_activity uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count int;
  v_had_previous boolean;
  v_previous_last_viewed timestamptz;
begin
  select last_viewed_at into v_previous_last_viewed
  from public.activity_views
  where user_id = p_user and activity_id = p_activity
  for update;

  v_had_previous := found;

  insert into public.activity_views (user_id, activity_id, view_count, first_viewed_at, last_viewed_at)
  values (p_user, p_activity, 1, now(), now())
  on conflict (user_id, activity_id) do update
    set view_count = public.activity_views.view_count + 1,
        last_viewed_at = now()
  returning view_count into new_count;

  -- Sliding 30-minute window: count this view toward the PUBLIC view_total
  -- only the first time ever, or when this user's previous view (counted or
  -- not) is more than 30 minutes old — never on every call, which is the
  -- defect this migration fixes.
  if not v_had_previous or v_previous_last_viewed < now() - interval '30 minutes' then
    update public.activities set view_total = view_total + 1 where id = p_activity;
  end if;

  return new_count;
end;
$$;

revoke all on function public.record_activity_view(uuid, uuid) from public;
revoke all on function public.record_activity_view(uuid, uuid) from anon, authenticated;
grant execute on function public.record_activity_view(uuid, uuid) to service_role;

commit;
