# Signed-in e2e

Most of `tests/e2e/` runs anonymous (`pnpm test:e2e`) against whatever
Supabase/Sanity project your `.env` already points at. The specs gated on a
signed-in session (grep `no e2e auth fixture` across `tests/e2e/`) instead
need a real account to sign in as, which this fixture provides — **always
against local Supabase, never production**.

## One-time / per-session setup

1. Docker Desktop running.
2. Start local Supabase (applies `supabase/migrations/*` and seeds two test
   users from `supabase/seed.sql` — regular + moderator, see that file for
   the exact emails/password):
   ```sh
   pnpm db:start
   ```
   Prints `API_URL`, `ANON_KEY`, etc. — `pnpm supabase status` reprints them
   later.
3. Export the local Supabase env for this shell session (values from step 2;
   `ANON_KEY` is the fixed local demo JWT, not a secret):
   ```sh
   export SUPABASE_URL=http://127.0.0.1:54321
   export SUPABASE_ANON_KEY=<ANON_KEY from `pnpm db:start`>
   export SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY from `pnpm db:start`>
   ```
   The service-role key lets any self-seeding spec (`support/
   localSupabaseAdmin.ts`'s own `localSupabaseAdmin()`) create its own
   row(s) before the suite and delete them after; it only does so when
   `SUPABASE_URL` is localhost — `desk-minimized-tray-part6b.spec.ts`
   publishes its own activity (falls back to the first one in
   `/sitemap.xml`, skipping when there is none) and
   `editor-mobile-layout.spec.ts` seeds its own draft "Varios juegos"
   activity owned by the regular fixture user (skips entirely without it —
   there is no fallback, the editor only ever shows the signed-in author's
   own activities).
   `SANITY_PROJECT_ID`/`SANITY_DATASET` still need a value (src/lib/env.ts
   requires all four to boot): the public ids from `sanity.config.ts`
   (`z9wkqssq` / `production_`). Export them too rather than relying on a
   `.env`, so nothing in the run points at a production service.
4. Run the signed-in suite (boots its own `pnpm dev` with the env above):
   ```sh
   pnpm test:e2e:auth
   ```

## How it works

`tests/e2e/auth.setup.ts` (the `setup` Playwright project) signs in through
the real `POST /api/auth/password` endpoint for each role and saves the
resulting session as storageState (`playwright/.auth/*.json`, gitignored).
The `chromium-signed-in` project depends on `setup` and reuses that session,
so each spec file signs in once per run, not once per test.

Specs already written against a signed-in session (e.g.
`tests/e2e/desk-widgets-part4.spec.ts`) need no changes to start asserting
for real: their own `gotoHubOrSkip` helper only skips when the loaded page
is NOT the hub, which stops happening once a valid session cookie is
present.

## Self-seeding a spec's own fixture row(s)

A spec that needs a row no fixture/seed covers (an activity, in practice)
seeds it itself rather than depending on one created by hand outside the
test run — a hand-seeded row silently stops existing the moment anyone
cleans up the database, and every test then skips without failing loudly.
Use `support/localSupabaseAdmin.ts`'s `localSupabaseAdmin()` (`null` unless
`SUPABASE_URL` is `localhost`/`127.0.0.1` and `SUPABASE_SERVICE_ROLE_KEY` is
set — never a remote project) and `localSupabaseRest()` in a `test.beforeAll`/
`test.afterAll` pair, same shape `desk-minimized-tray-part6b.spec.ts` and
`editor-mobile-layout.spec.ts` both use. Add
`test.describe.configure({ mode: 'default' })` so parallel workers never race
to create/delete the same shared row, and keep every test's own `test.skip`
fallback for when seeding did not run (no local admin access).

## Adding a newly-passing spec

Add the file to the `chromium-signed-in` project's `testMatch` in
`playwright.config.ts`. Keep it off `chromium`'s default run (same file,
`testIgnore` is not needed there as long as the test itself still calls
`test.skip` gracefully for an anonymous session).
