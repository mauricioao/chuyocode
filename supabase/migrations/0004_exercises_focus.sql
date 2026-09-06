-- Focus axis for English exercises (feature: english-exercises-section).
--
-- Run this in the Supabase SQL Editor (or via the Supabase CLI) AFTER
-- 0003_exercises.sql.
--
--
-- WHY THIS EXISTS — the model had the wrong PRIMARY axis
--
-- `topic` (travel, food, code-review) was never the SUBJECT of an exercise. It
-- is the CONTEXT the language is practised in: the vocabulary setting, the
-- situation the sentences happen to describe. What a learner or a teacher looks
-- for FIRST is the LANGUAGE POINT — present simple, conditionals, phrasal
-- verbs. Filing exercises under "Travel" answers "where does this happen?"
-- while the question actually being asked is "what am I practising?".
--
-- So `focus` becomes the PRIMARY axis, and `topic` is DEMOTED to secondary
-- context. `topic` is deliberately NOT removed: "Present simple, in a food
-- context" is a more useful exercise than "Present simple" alone, and the
-- setting is what keeps a drill feeling like language rather than homework.
--
-- `topic` also becomes NULLABLE, for the same reason inverted. A pure grammar
-- drill has no natural setting, and a NOT NULL context column forces the author
-- to invent one — which pollutes the exact axis that is supposed to mean
-- something. An absent context must be representable as absent.
--
-- This lands now, at ~5 published rows, precisely BECAUSE it cannot land later:
-- `focus` goes into the URL beside `slug`, and the uniqueness key moves with it
-- (docs/exercise-model.md, "Deep links" — a published slug is permanent).


-- ---------------------------------------------------------------------------
-- 1. The new column: added NULLABLE and WITHOUT A DEFAULT.
-- ---------------------------------------------------------------------------
--
-- The table already holds rows, so a plain `add column focus text not null`
-- would ABORT: Postgres has no value to write into the rows that already exist.
-- There are exactly two ways past that, and they are not equivalent.
--
--   (a) Add WITH a default, then drop the default.
--   (b) Add nullable, BACKFILL explicitly, then set NOT NULL.
--
-- This migration takes (b). A default is not just a migration convenience — it
-- survives as an authoring hazard. While it exists, every INSERT that simply
-- FORGOT `focus` succeeds and files that exercise under whatever the default
-- happened to be: a real, routable, completely wrong language point. Dropping
-- the default afterwards closes the window, but only for as long as nobody
-- re-adds one, which is a convention rather than a constraint.
--
-- With no default at any point, the NOT NULL added in step 4 is the real thing:
-- an INSERT that omits `focus` fails loudly, at the source. That is the whole
-- reason the taxonomy is closed (src/lib/exerciseTaxonomy.ts).
--
-- Adding a nullable column with no default is also catalog-only in Postgres 11+
-- — no table rewrite, no matter how many rows exist.
alter table public.exercises add column if not exists focus text;


-- ---------------------------------------------------------------------------
-- 2. Backfill the known seed rows.
-- ---------------------------------------------------------------------------
--
-- Matched on `(level, slug)` rather than `slug` alone so a future row that
-- reuses one of these slugs at another level is never touched by mistake.
--
-- `topic` is left exactly as it was: these five all have a genuine context, and
-- demoting the axis does not mean discarding the values already on it.
--
-- Two of these are EDITORIAL JUDGEMENT, not facts read off the row, and the
-- maintainer should confirm them against the actual payloads:
--   * at-the-airport -> question-forms (an airport exercise is asking and
--     answering; `prepositions` is the other plausible reading)
--   * standup-update -> past-simple (a standup update is "yesterday I did…";
--     `present-perfect` is the other plausible reading)
update public.exercises set focus = 'quantifiers'
  where focus is null and level = 'A2' and slug = 'quantifiers-and-present-simple';

update public.exercises set focus = 'question-forms'
  where focus is null and level = 'A2' and slug = 'at-the-airport';

update public.exercises set focus = 'past-simple'
  where focus is null and level = 'A2' and slug = 'standup-update';

update public.exercises set focus = 'modal-verbs'
  where focus is null and level = 'A2' and slug = 'review-comments';

update public.exercises set focus = 'present-simple'
  where focus is null and level = 'B1' and slug = 'present-simple';


-- ---------------------------------------------------------------------------
-- 3. Park anything this migration could not classify.
-- ---------------------------------------------------------------------------
--
-- Any row still NULL is a row whose language point NOBODY KNOWS — this file
-- cannot read an exercise and decide what it teaches. Guessing a real focus
-- would publish an exercise filed under the wrong language point, which is a
-- worse outcome than hiding it: the learner cannot tell they were served the
-- wrong thing, and nothing anywhere reports it.
--
-- So such a row is UNPUBLISHED and marked with a sentinel that is deliberately
-- OUTSIDE the closed taxonomy. That choice is load-bearing:
--   * `published = false` keeps it off every screen immediately.
--   * `focus = 'unassigned'` fails `isFocus`, so even if someone republishes it
--     by hand the facets discard it and the route 404s instead of routing to a
--     lie. A real focus value used as a placeholder would do the opposite.
--   * It is trivially greppable: `select … where focus = 'unassigned'`.
update public.exercises
  set focus = 'unassigned', published = false
  where focus is null;


-- ---------------------------------------------------------------------------
-- 4. Now the column can carry its real constraint.
-- ---------------------------------------------------------------------------
alter table public.exercises alter column focus set not null;


-- ---------------------------------------------------------------------------
-- 5. `topic` becomes optional — an absent context is a legitimate answer.
-- ---------------------------------------------------------------------------
alter table public.exercises alter column topic drop not null;


-- ---------------------------------------------------------------------------
-- 6. Uniqueness moves from (level, topic, slug) to (level, focus, slug).
-- ---------------------------------------------------------------------------
--
-- The key has to follow the URL, and the URL is now
-- `/[lang]/ingles/[level]/[focus]/[slug]`. Leaving it on `topic` would allow two
-- rows to resolve to the SAME deep link the moment one of them has a null topic
-- — and NULLs do not conflict in a unique index, so the database would not even
-- complain.
--
-- Still per-level, not global: `ordering-coffee` may exist at A1 and at B2
-- without collision, which is what keeps slugs short and human-readable.
alter table public.exercises drop constraint if exists exercises_level_topic_slug_key;
alter table public.exercises drop constraint if exists exercises_level_focus_slug_key;
alter table public.exercises add constraint exercises_level_focus_slug_key
  unique (level, focus, slug);


-- ---------------------------------------------------------------------------
-- 7. The listing/facets index follows the same move.
-- ---------------------------------------------------------------------------
--
-- Both reads that matter are now keyed on focus: the flat `(level, focus)` scan
-- behind the entry screen and the per-pair listing query
-- (src/lib/exercises.ts). An index on `(level, topic)` would serve neither.
drop index if exists public.exercises_level_topic_published_idx;
create index if not exists exercises_level_focus_published_idx
  on public.exercises (level, focus) where published;


-- ---------------------------------------------------------------------------
-- 8. Documentation that travels with the schema.
-- ---------------------------------------------------------------------------
--
-- `\d+ exercises` in psql shows these, so the focus/topic split is legible to
-- someone who reaches the database without this repo in front of them.
comment on column public.exercises.focus is
  'PRIMARY axis: the language point being practised (present-simple, phrasal-verbs, …). Closed vocabulary — see FOCUSES in src/lib/exerciseTaxonomy.ts. In the URL, so permanent once published.';
comment on column public.exercises.topic is
  'SECONDARY axis: the vocabulary CONTEXT the language point is practised in (travel, food, code-review). Nullable on purpose — a pure grammar drill has no natural setting and must not be forced to invent one.';
