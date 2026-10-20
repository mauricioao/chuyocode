-- Mold-aware discovery filtering — owner decision 2026-10-19: "polish
-- activity type by activity type ... hide 'Varios juegos', it serves too
-- many purposes and will get out of hand" (`src/lib/activities/flags.ts`'s
-- `VARIOS_JUEGOS_ENABLED`), FOLLOWED UP 2026-10-20: "Hide the 'Varios
-- juegos' FILTER OPTION; we should only be able to filter by the OTHER
-- activity types" — the community `?tipo=` filter must offer one option per
-- REMAINING activity type (Worksheet + each quiz template mold), never
-- "Varios juegos" itself.
--
-- Run this in the Supabase SQL Editor (or via the Supabase CLI) AFTER
-- 0021_activity_audio.sql.
--
-- Filtering by MOLD (not just "worksheet vs quiz") needs a mold-aware
-- derived column: `activities.block_types` (0011) only ever holds
-- `block.type` (`'worksheet'`/`'quiz'`), never `block.template`
-- (`src/lib/activities/blocks.ts`'s `QuizTemplate`). This migration adds
-- that column, replicating 0011's own DERIVED-search-column pattern (see its
-- header comment):
--
--   `public.activities.block_kinds` -- a derived `text[]`, kept in sync by
--   the server (`src/lib/activities/moderation.ts`'s `approveRevision`,
--   via `blocks.ts`'s `blockKind`) alongside `block_types`/`block_count`, in
--   the SAME `approve_activity_revision` transaction. One entry per block,
--   deduped: `'worksheet'` for a worksheet block, the mold itself
--   (`'match'`/`'reorder'`/`'cloze'`/`'groupsort'`) for a templated quiz
--   block, or `'basic'` for a mold-less ("Básico"/"Varios juegos") quiz
--   block, `template === undefined`. A feed/search query can then filter by
--   exact kind, or exclude `'basic'`, without deserializing every
--   candidate's `blocks` jsonb — exactly the reason `block_types`/
--   `block_count` exist.
--
--   `public.approve_activity_revision(...)` gains ONE new trailing
--   parameter, `p_block_kinds text[]`, written into the same `update
--   public.activities set ...` as `block_types`/`block_count`. Postgres
--   identifies a function by name AND argument list — `create or replace
--   function` with a DIFFERENT argument list does not replace the existing
--   overload, it adds a second one next to it (there is no earlier
--   precedent for adding a parameter to an existing function in this
--   migration set, 0014-0021, to follow instead: every `create or replace`
--   there kept the exact same parameter list). The stale 5-arg overload is
--   therefore dropped explicitly first, so exactly one
--   `approve_activity_revision` exists afterward.
--
-- `getPublishedActivities`/`getActivityCount` (`src/lib/activities/
-- activities.ts`) exclude `block_kinds @> {basic}` while
-- `VARIOS_JUEGOS_ENABLED` is `false` — community list, "Para ti hoy"/
-- recommendations (both pure selectors over `getPublishedActivities`'
-- pool), and the desk folder's "N actividades" count all cascade from
-- those two functions — and filter `?tipo=<kind>` with
-- `block_kinds @> {<kind>}` (`discoveryQuery.ts`'s `isBlockKindFilter`
-- never accepts `'basic'` while that flag is off, so the UI itself never
-- offers it either). `getActivitiesByAuthor` (the author's own "Mis
-- actividades") and the moderation review-queue reads are UNCHANGED — a
-- "Varios juegos" activity stays editable by its author and visible to
-- moderation, only public discovery stops listing/filtering by it. It also
-- stays reachable by direct link: `getPublishedActivity` (singular) is
-- untouched.
--
-- GIN index, same reasoning as `block_types`' own (0011): `block_kinds` is
-- queried with `@>` ("contains"), which a GIN index serves efficiently at
-- this table's scale.

begin;

-- 1. The derived column itself. `not null default '{}'` means every
-- existing row (none of them could have been written with this vocabulary
-- in mind) starts with nothing derived — merely stale (never WRONG in a way
-- that hides something that should stay visible, nor in a way that matches
-- a filter it should not) until the backfill below runs, or its next
-- approval recomputes it.
alter table public.activities add column block_kinds text[] not null default '{}';

create index activities_block_kinds_idx
  on public.activities using gin (block_kinds);

-- 2. approve_activity_revision: drop the stale 5-arg overload, then recreate
-- with the new trailing p_block_kinds parameter. Body otherwise UNCHANGED
-- from 0013 except for the one new SET clause.
drop function if exists public.approve_activity_revision(uuid, uuid, jsonb, text[], int);

create or replace function public.approve_activity_revision(
  p_revision uuid,
  p_reviewer uuid,
  p_blocks jsonb,
  p_block_types text[],
  p_block_count int,
  p_block_kinds text[]
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
         block_kinds           = p_block_kinds,
         reviewed_by           = p_reviewer,
         reviewed_at           = now(),
         review_note           = null,
         updated_at            = now()
   where id = v_activity_id;
end;
$$;

-- 3. Backfill already-published activities: step 1's default (`'{}'`) would
-- otherwise leave an existing activity's filter/exclusion stale until its
-- NEXT approval — the owner wants the new filter (and the existing "Varios
-- juegos" exclusion) to apply to existing activities now, not after a future
-- edit. One derived kind per block (mirroring `blocks.ts`'s own
-- `blockKind`): `'worksheet'` for a worksheet block, `coalesce(b->>'template',
-- 'basic')` for a quiz block — the app never writes `template: null`, a
-- mold-less ("Básico") quiz block simply omits the key
-- (`JSON.stringify({ template: undefined, ... })` drops it), so a missing
-- key and `coalesce` both land on `'basic'` the same way `blockKind` does.
update public.activities a
   set block_kinds = coalesce((
         select array_agg(distinct kind)
           from (
             select case
                      when b->>'type' = 'worksheet' then 'worksheet'
                      else coalesce(b->>'template', 'basic')
                    end as kind
               from public.activity_revisions r,
                    jsonb_array_elements(r.blocks) as b
              where r.id = a.published_revision_id
           ) derived_kinds
       ), '{}')
 where a.published_revision_id is not null;

revoke all on function public.approve_activity_revision(uuid, uuid, jsonb, text[], int, text[]) from public;
revoke all on function public.approve_activity_revision(uuid, uuid, jsonb, text[], int, text[]) from anon, authenticated;
grant execute on function public.approve_activity_revision(uuid, uuid, jsonb, text[], int, text[]) to service_role;

commit;
