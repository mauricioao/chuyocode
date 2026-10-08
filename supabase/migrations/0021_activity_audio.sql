-- Worksheet audio markers ("colocar un audio propio") — storage buckets only.
--
-- Run this in the Supabase SQL Editor (or via the Supabase CLI) AFTER
-- 0020_account_deletion.sql.
--
-- An audio marker (`src/lib/activities/blocks.ts`'s `AudioMarker`, stored in
-- `WorksheetBlock.audio`) is a non-graded play button placed on a worksheet
-- image — the author either uploads a file or records one with the
-- microphone in the editor, and a moderator can listen before approving.
--
-- SAME TWO-STAGE SHAPE AS THE IMAGE BUCKETS (`0011_activities.sql`), nothing
-- new at the database/table level — `activities`/`activity_revisions`
-- already store a marker's path as part of `blocks jsonb`:
--
--   `activity-audio-uploads` -- PRIVATE. Every fresh upload/recording lands
--   here first (pre-moderation), exactly like `activity-uploads`. Never
--   public — a rejected or not-yet-reviewed recording must not be reachable
--   by guessing its path.
--
--   `activity-audio` -- PUBLIC. Only a moderator-approved copy is written
--   here (the approval flow's own `copyToAudioBucket`, mirroring
--   `copyToImagesBucket` — not this migration).
--
-- UNLIKE the image pipeline (which re-encodes everything to webp before
-- upload), an audio marker keeps whatever format it actually arrived in:
-- `audio/webm` (also what the editor's own `MediaRecorder` produces),
-- `audio/mp4`/`audio/x-m4a`, `audio/mpeg` (mp3), `audio/ogg`, or
-- `audio/wav` — see `src/lib/activities/paths.ts`'s own `AUDIO_EXTENSIONS`
-- and `src/lib/activities/audioFormat.ts`'s magic-byte checks, enforced by
-- `src/pages/api/actividades/audio.ts` before anything reaches storage.
--
-- 5 MB cap per object (owner-proposed limit, `MAX_UPLOAD_BYTES` in
-- `audio.ts` — a named constant, easy to change) — deliberately higher than
-- the 2 MB image cap: even a short voice recording can exceed 2 MB at a
-- browser-default bitrate.
--
-- No `storage.objects` policy for `anon`/`authenticated` on either bucket —
-- same posture as the image buckets: every read and write goes through the
-- server's service-role key, via short-lived signed URLs
-- (`src/lib/activities/storage.ts`), never a direct client-to-Supabase-
-- Storage call.
--
-- `on conflict (id) do nothing` makes this migration re-runnable against an
-- environment where the buckets already exist.

begin;

-- PRIVATE: every fresh upload/recording lands here first (pre-moderation).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'activity-audio-uploads',
  'activity-audio-uploads',
  false,
  5242880,
  array['audio/webm', 'audio/mp4', 'audio/x-m4a', 'audio/mpeg', 'audio/ogg', 'audio/wav']
)
on conflict (id) do nothing;

-- PUBLIC: only a moderator-approved copy is written here (the approval
-- flow's own `copyToAudioBucket`, not this migration).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'activity-audio',
  'activity-audio',
  true,
  5242880,
  array['audio/webm', 'audio/mp4', 'audio/x-m4a', 'audio/mpeg', 'audio/ogg', 'audio/wav']
)
on conflict (id) do nothing;

-- No `storage.objects` policy for `anon`/`authenticated` on either bucket:
-- every read and write goes through the server's service-role key via
-- short-lived signed URLs (`src/lib/activities/storage.ts`).

commit;
