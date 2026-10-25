-- Atomic discard for a content-less draft activity (T4 follow-up,
-- "offer to discard"): `descartar.ts`'s own read-then-write pair (its
-- step 4-5 activity select, step 7 revision select, step 9 UPDATE) is a
-- check-and-flip across TWO round trips with no lock held in between — a
-- concurrent `guardar` (a second tab) can commit a fresh revision between
-- this endpoint's own reads and its final UPDATE, and the existing
-- `updated_at` optimistic-concurrency filter only catches that race when the
-- metadata row itself changed, never when the LATEST REVISION's content
-- changed without `activities.updated_at` moving (`guardar.ts` only bumps it
-- on its OWN final step, after the revision write already landed — see that
-- file's own header). This migration closes the gap with ONE atomic
-- Postgres function instead.
--
-- Run this in the Supabase SQL Editor (or via the Supabase CLI) AFTER
-- 0022_activity_block_kinds.sql.
--
-- It adds:
--
--   `public.discard_empty_draft(p_activity, p_author, p_expected_revision,
--   p_expected_blocks)` -- the ONE atomic "is this still safe to discard, and
--   if so, discard it" check-and-flip:
--
--     1. locks the activity row (`for update`) at (id, author_id, status =
--        'draft') — not found returns `'not_found'` (missing, not owned, or
--        no longer a draft; same 404-for-every-case posture `descartar.ts`'s
--        own header documents for its first select);
--     2. reads the activity's LATEST revision (highest `created_at`);
--     3. compares its id AND its exact `blocks` against what the caller
--        already classified as content-less (`p_expected_revision`/
--        `p_expected_blocks`, read by `descartar.ts` BEFORE calling this
--        function) — either one being `is distinct from` what the caller
--        saw means something committed a new revision since, so this
--        returns `'changed'` rather than trusting a classification that may
--        no longer hold;
--     4. only once both match exactly: flips the activity to `status =
--        'removed'` and returns `'removed'`.
--
--   The row lock from step 1 is held for the whole function (same
--   transaction), so no OTHER write to this same activity row can land
--   between the comparison in step 3 and the UPDATE in step 4 — the
--   remaining gap `descartar.ts`'s own header called out ("a fully atomic
--   check-and-flip needs a single Postgres function") is now closed.
--   `guardar.ts`'s own final UPDATE additionally filters on
--   `status <> 'removed'` (application-code change, no migration needed for
--   that half), so a `guardar` racing a discard that wins this lock first
--   can never silently resurrect a removed activity by writing over it.
--
--   `descartar.ts` calls this function for every discard from now on; while
--   this migration has not yet been applied in a given environment, the
--   endpoint falls back to its previous optimistic-`UPDATE` path (detected
--   by the RPC's own "function/procedure does not exist" error codes,
--   `PGRST202`/`42883`) so existing deployments keep working unmodified
--   until the migration runs.

begin;

create or replace function public.discard_empty_draft(
  p_activity uuid,
  p_author uuid,
  p_expected_revision uuid,
  p_expected_blocks jsonb
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_activity_id     uuid;
  v_revision_id     uuid;
  v_revision_blocks jsonb;
begin
  select id into v_activity_id
    from public.activities
   where id = p_activity
     and author_id = p_author
     and status = 'draft'
  for update;

  if not found then
    return 'not_found';
  end if;

  select id, blocks
    into v_revision_id, v_revision_blocks
    from public.activity_revisions
   where activity_id = p_activity
   order by created_at desc
   limit 1;

  -- Either the latest revision's IDENTITY or its exact BLOCKS drifted from
  -- what the caller already classified as content-less — a concurrent
  -- `guardar` committed something in between, so this discard is no longer
  -- safe to trust.
  if v_revision_id is distinct from p_expected_revision
     or v_revision_blocks is distinct from p_expected_blocks then
    return 'changed';
  end if;

  update public.activities
     set status     = 'removed',
         updated_at = now()
   where id = p_activity;

  return 'removed';
end;
$$;

revoke all on function public.discard_empty_draft(uuid, uuid, uuid, jsonb) from public;
revoke all on function public.discard_empty_draft(uuid, uuid, uuid, jsonb) from anon, authenticated;
grant execute on function public.discard_empty_draft(uuid, uuid, uuid, jsonb) to service_role;

commit;
