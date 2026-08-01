-- Grant table privileges to `service_role` for the "Más vistos" ranking read.
--
-- Run this in the Supabase SQL Editor AFTER 0001_book_downloads.sql.
--
-- WHY THIS IS NEEDED (the bug it fixes):
--   In Postgres, `service_role` has the BYPASSRLS attribute, so it skips Row
--   Level Security policies — but BYPASSRLS does NOT bypass table-level GRANTs.
--   A table created with `CREATE TABLE` from the SQL Editor is owned by
--   `postgres` and grants NO privileges to `service_role` automatically.
--
--   The result is an asymmetry: `increment_download()` is SECURITY DEFINER, so
--   it runs with the owner's rights and CAN write (that is why rows exist), but
--   a direct `SELECT` from the server (getMostDownloadedSlugs) runs as
--   `service_role` and fails with:
--     42501  permission denied for table book_downloads
--     hint:  GRANT SELECT ON public.book_downloads TO service_role;
--
--   This grant closes that gap. RLS stays enabled with no public policies, so
--   the `anon` role still gets nothing — only the server (service-role) reads.

-- Read access for the server-side ranking query (getMostDownloadedSlugs).
grant select on table public.book_downloads to service_role;

-- Full CRUD for the service-role so future direct writes/maintenance from the
-- server work too (the counter itself goes through the SECURITY DEFINER RPC, but
-- this keeps the privileged server role consistent with its intended access).
grant insert, update, delete on table public.book_downloads to service_role;

-- Allow the service-role to execute the atomic increment RPC explicitly.
grant execute on function public.increment_download(text) to service_role;
