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
   The service-role key lets `desk-minimized-tray-part6b.spec.ts` publish
   its own activity before the suite and delete it after; it only does so
   when `SUPABASE_URL` is localhost. Without it that spec falls back to
   the first activity in `/sitemap.xml` and skips when there is none.
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

## Adding a newly-passing spec

Add the file to the `chromium-signed-in` project's `testMatch` in
`playwright.config.ts`. Keep it off `chromium`'s default run (same file,
`testIgnore` is not needed there as long as the test itself still calls
`test.skip` gracefully for an anonymous session).
