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

# Visual snapshots

`tests/e2e/visual.spec.ts` screenshots home (`/es/`), the Inglés catalog
(`/es/ingles/actividades`) and the news list (`/es/noticias`) at three
viewports and compares them with the win32 baselines in
`tests/e2e/visual.spec.ts-snapshots/`. It never reads live content, so a new
news item, a changed view count or a different "Actividad del día" cannot
break it.

## Running

1. Docker Desktop running and local Supabase started (`pnpm db:start`, as
   above).
2. ```sh
   pnpm test:visual                      # compare
   pnpm test:visual --update-snapshots   # re-record after an intended UI change
   ```
   That is all: no `.env` and no exported variables are needed. Look at every
   re-recorded PNG before committing it.

## Where the data comes from

`playwright.visual.config.ts` (its own config, separate from
`playwright.config.ts`) starts two fresh servers — never reusing one that is
already running — and sets every data-related env var explicitly:

| Server | Port | What it is |
| --- | --- | --- |
| `tests/e2e/visual/sanityFixtureServer.mjs` | 4335 | Stand-in for the Sanity API. Evaluates the app's real GROQ queries (with `groq-js`) against the synthetic, hand-written dataset in `tests/e2e/visual/sanityFixtures.mjs`, and paints a generated SVG for every fixture image. |
| `astro dev` | 4334 | The app, with `SANITY_FIXTURE_API_HOST=http://127.0.0.1:4335` and the LOCAL Supabase URL/keys. |

- **Sanity** — `SANITY_FIXTURE_API_HOST` (`src/lib/sanityConfig.ts`) points
  the Sanity client and the image URL builder at the fixture server. It only
  accepts a loopback origin and is unset everywhere else, where the client
  config is exactly the production one.
- **Supabase** — the URL and keys come from `supabase status` (the local
  Docker stack only); the config, setup and teardown all refuse a
  non-loopback URL. `tests/e2e/visual/globalSetup.ts` writes 21 published
  activities with fixed ids, titles and counts
  (`tests/e2e/visual/activityFixtures.ts`), arranged so the server-side
  "Actividad del día" pick for today lands on the same card every day;
  `globalTeardown.ts` deletes them again. `supabase/seed.sql` is untouched.
- Each test first checks a fixture title on the page, so a run that reached
  other data fails with a clear message rather than a pixel diff.

To change what the pages show, edit the fixture files and re-record the
baselines.
