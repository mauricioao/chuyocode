-- Book download counters (feature: "Más descargados" ranking).
--
-- Run this in the Supabase SQL Editor (or via the Supabase CLI) BEFORE using
-- the /api/descargar/[slug] endpoint. It creates:
--   1. `book_downloads` — one row per book slug with a running download count.
--   2. `increment_download(text)` — an atomic upsert-increment so concurrent
--      downloads never lose a count (no read-modify-write race).
--
-- Writes happen ONLY from the server via the service-role key, so Row Level
-- Security stays enabled with NO public policies: the anon key cannot read or
-- write this table, and the ranking read also goes through the server.

create table if not exists public.book_downloads (
  slug        text primary key,
  count       bigint      not null default 0,
  updated_at  timestamptz not null default now()
);

-- Fast "top N by downloads" ordering for the ranking query.
create index if not exists book_downloads_count_desc_idx
  on public.book_downloads (count desc);

-- Atomic increment: insert the slug at 1, or bump the existing counter by 1.
-- SECURITY DEFINER so it runs with the function owner's rights; callers still
-- need table access (the service-role key bypasses RLS, which is how the server
-- invokes it).
create or replace function public.increment_download(book_slug text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.book_downloads (slug, count)
  values (book_slug, 1)
  on conflict (slug)
  do update set count = book_downloads.count + 1,
                updated_at = now();
$$;

-- Enable RLS with no policies: only the service-role key (which bypasses RLS)
-- can touch this table. The anon key gets nothing.
alter table public.book_downloads enable row level security;
