-- Activity provenance ("Duplicar y adaptar", D7): a nullable pointer from a
-- duplicated activity back to the activity it was copied from.
--
-- Run this in the Supabase SQL Editor (or via the Supabase CLI) AFTER
-- 0015_activity_search_unaccent.sql.
--
-- `POST /api/actividades/[id]/duplicar` (application code, not this
-- migration) creates a brand-new activity owned by the caller, `draft`,
-- seeded from the ORIGINAL's PUBLISHED revision — never the original
-- author's own pending drafts — with every worksheet image copied into the
-- caller's own upload folder and every block/zone id regenerated. This
-- column is the ONLY thing that migration needs from the schema: a nullable
-- self-reference recording which activity (if any) a given activity was
-- duplicated from.
--
-- `on delete set null`, same posture as every other "reference to a thing
-- that might go away" column on this table (`published_revision_id`,
-- `reviewed_by`): the original being removed later must not cascade into
-- deleting the duplicate, which is now its own independent activity with its
-- own author and its own moderation lifecycle. The credit line the editor and
-- (once published) the practice page show ("Basado en «…»") simply stops
-- rendering a link once the source is gone (or never renders at all once
-- `source_activity_id` itself goes null) — the duplicate's own content is
-- unaffected either way.
--
-- NOT part of `activities_live_has_revision` or any other existing
-- constraint: provenance is purely informational, never gates moderation or
-- visibility.
--
-- No RLS/grant changes needed: `activities` already has RLS on with zero
-- policies and full `service_role` grants (0011 migration) — a new nullable
-- column needs no new grant, BYPASSRLS's own table-GRANT caveat notwithstanding
-- (that caveat is about missing GRANTs on the TABLE, already present here).

begin;

alter table public.activities
  add column source_activity_id uuid references public.activities(id) on delete set null;

-- The duplicate endpoint's own daily rate limit ("max 20 duplicates per user
-- per day") counts rows where `source_activity_id is not null and author_id
-- = caller and created_at > now() - interval '1 day'` — a partial index on
-- exactly that predicate keeps that count cheap regardless of how many
-- activities an author has created overall.
create index activities_duplicates_by_author_idx
  on public.activities (author_id, created_at)
  where source_activity_id is not null;

commit;
