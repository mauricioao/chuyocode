# Apply Progress: User-Authored Exercises

**Artifact**: `gentle-ai.sdd-apply/v1` · **Rev**: 2 · **Change**: `user-authored-exercises`
**Store**: `hybrid` (OpenSpec + Engram `sdd/user-authored-exercises/apply-progress`)
**Mode**: Strict TDD · **Test runner**: `pnpm test` → `vitest run`
**Batches so far**: Slice 1 (`feat/auth-session-client`, merged as PR #13) · Slice 2 (`feat/auth-middleware`, local)

This artifact is CUMULATIVE. Rev 2 merges slice 2 into rev 1 rather than replacing it.

---

# Slice 1 — `feat/auth-session-client` · COMPLETE, merged

## Baseline (task 1.0) — recorded BEFORE any change

| Command | Observed result |
|---|---|
| `pnpm test` | **PASS** — `Test Files 52 passed (52)` · `Tests 927 passed \| 10 skipped (937)` |
| `pnpm typecheck` | **FAIL** — `Result (137 files): 15 errors, 0 warnings, 0 hints` · exit 1 |

The 15 errors were pre-existing on `main` and untouched by slice 1 (12 of them
`SearchFilter.astro` inline-script `any` inference, plus `index.astro`,
`noticias.test.ts`, `middleware.test.ts:32`, and one Playwright fixture). None sat
in a file slice 1 authored.

**Resolved since.** PR #11 (`fix/typecheck-baseline`) fixed all 15. `pnpm typecheck`
now reports 0 errors, so slice 1's issue #1 ("the project's own gate cannot be met
by any slice") and issue #2 (`middleware.test.ts:32`) are both closed.

## Completed tasks

- [x] 1.1 RED `src/lib/supabaseSession.test.ts`
- [x] 1.2 Bump `package.json`: `@supabase/supabase-js` `^2.58.0` → `^2.114.0`; add `@supabase/ssr@0.12.7`
- [x] 1.3 GREEN `src/lib/supabaseSession.ts` (NEW)
- [x] 1.4 `src/lib/supabase.ts` header note documenting the third client kind
- [x] 1.5 Re-read the vendored `PostgrestBuilder implements PromiseLike` path
- [x] 1.6 Verify `pnpm why @supabase/supabase-js` reports a single resolved version
- [x] 1.7 Verify the full suite before slice 2 builds on this

## Files changed

| File | Action | What was done |
|---|---|---|
| `src/lib/supabaseSession.test.ts` | Created | 13 unit tests: cookie-flag matrix, explicit-flag proof, `cookieOptions` pass-through, `getAll` parse + non-string filter, `setAll` set/delete/header buffering |
| `src/lib/supabaseSession.ts` | Created | `sessionCookieOptions(isProd)`, `createSessionClient({request, cookies, isProd})`, `SessionClient` interface |
| `package.json` | Modified | `@supabase/supabase-js` `^2.58.0` → `^2.114.0`; added `@supabase/ssr` `0.12.7` |
| `pnpm-lock.yaml` | Modified | Generated. Resolves `supabase-js` to `2.116.0`, `postgrest-js` to `2.116.0` |
| `src/lib/supabase.ts` | Modified | Header note only. No behavior change to either existing client |
| `src/lib/exercises.test.ts` | Modified | Comment only. Refreshed the vendored-path citation after the bump |

## TDD cycle evidence

| Task | Test file | Layer | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 1.1 → 1.3 | `src/lib/supabaseSession.test.ts` | Unit | N/A (new file) | ✅ Observed failing: `Cannot find module './supabaseSession'` | ✅ `13 passed (13)` | ✅ 13 cases across 5 behaviors | ➖ None needed |
| 1.2 | — (dependency bump) | — | ✅ 927/927 baseline captured first | ➖ Not applicable | ✅ `940 passed \| 10 skipped` | ➖ N/A | ➖ N/A |
| 1.4 | — (comment only) | — | ✅ Covered by full suite | ➖ Not applicable | ✅ Suite green | ➖ N/A | ➖ N/A |
| 1.5 | `src/lib/exercises.test.ts` | Unit | ✅ Green before and after | ➖ Comment-only change | ✅ Suite green | ➖ N/A | ➖ N/A |

Tests written: **13**. Passing: **13**. Pure functions created: **1**.

## Verification commands

| Command | Observed result |
|---|---|
| `pnpm install` | **PASS** — `+ @supabase/ssr 0.12.7` · `- @supabase/supabase-js 2.110.7` · `+ @supabase/supabase-js 2.116.0` |
| `pnpm why @supabase/supabase-js` | **PASS — single resolved version** (`2.116.0`); one directory in `node_modules/.pnpm` |
| `pnpm test` | **PASS** — `Test Files 53 passed (53)` · `Tests 940 passed \| 10 skipped (950)` |
| `pnpm typecheck` | **FAIL (pre-existing)** — 15 errors, identical to baseline. Since fixed by PR #11 |

## Deviations from design (slice 1)

1. **`parseCookieHeader` no longer emits `undefined` values at `0.12.7`.** The filter
   the design asks for was implemented anyway, so the `GetAllCookies` contract stays
   true under version drift; the test drives that branch through a spy because the
   real parser can no longer produce it.
2. **Scope addition, within the slice.** Strict TDD forbids shipping `getAll`/`setAll`
   untested, so RED coverage for both was written before the implementation.

## Workload / PR boundary (slice 1)

- **Mode**: stacked PR slice (`stacked-to-main`), `size:exception` recommended and accepted
- **Authored review budget**: **445 lines**, 11% over the 400 budget; 63% of the diff
  is the TDD test file and house-style comment blocks
- **Commits**: `3ed324c` (deps bump) · `e5030ee` (session client)
- **Delivered**: merged to `main` as PR #13

---

# Slice 2 — `feat/auth-middleware` · COMPLETE except the owner-blocked spike

## Baseline (task 2.0) — recorded BEFORE any change, verbatim

The first reading was **RED**, and the cause was environmental, not code:

| Command | Observed result |
|---|---|
| `pnpm test` (first attempt) | **FAIL** — `Test Files 1 failed \| 52 passed (53)` · `Tests 928 passed \| 10 skipped (938)`. Cause: `Error: Cannot find package '@supabase/ssr' imported from 'mock:@supabase/ssr'` |

`package.json:31` declares `@supabase/ssr: 0.12.7` and `pnpm-lock.yaml` resolves it,
but `node_modules/@supabase/ssr` did not exist: the working tree had merged PR #13
without re-installing. `pnpm install --frozen-lockfile` fixed it
(`+ @supabase/ssr 0.12.7` · `- @supabase/supabase-js 2.110.7` · `+ @supabase/supabase-js 2.116.0`,
`Done in 30.3s`). No source file was touched to reach the baseline.

Baseline after the install, which is the number slice 2 is measured against:

| Command | Observed result |
|---|---|
| `pnpm test` | **PASS** — `Test Files 53 passed (53)` · `Tests 941 passed \| 10 skipped (951)` |
| `pnpm typecheck` | **PASS** — `Result (139 files): 0 errors, 0 warnings, 0 hints` |

Typecheck is 0 errors, so the task-2.0 stop condition did not trigger. **Anything red
after slice 2 is slice 2's**, with the one proven exception recorded under Issues.

## Completed tasks

- [x] 2.1 RED `src/middleware.test.ts`: `needsSession(pathname)` — `false` for `_astro/*` and any dotted first segment; `true` otherwise
- [x] 2.2 RED (HARD RULE guard): unit test reads `astro.config.mjs` as text, asserts it contains neither `middlewareMode` nor `cacheOnDemandPages`
- [x] 2.3 RED T7 `src/lib/httpCache.test.ts`: `markPrivate(headers)` sets `cache-control: private, no-store`
- [x] 2.4 GREEN `Locals.user: User | null` (never optional) in `src/env.d.ts`
- [x] 2.5 GREEN `src/middleware.ts` ordering per design §1
- [x] 2.6 GREEN `src/lib/httpCache.ts` (NEW)
- [x] 2.7 GREEN comment in `astro.config.mjs` documenting the edge-mode prohibition
- [ ] 2.8 Preview-deploy spike — **BLOCKED on the owner.** Not attempted, not faked. Checklist below
- [x] 2.9 Verify `pnpm test && pnpm typecheck`

## Files changed

| File | Action | What was done |
|---|---|---|
| `src/lib/httpCache.ts` | Created | `PRIVATE_CACHE_CONTROL = 'private, no-store'`, `markPrivate(headers)`. Uses `set`, never `append` |
| `src/lib/httpCache.test.ts` | Created | 5 tests: exact directive, absent → set, permissive → overwritten, other headers untouched, idempotent |
| `src/astroConfig.test.ts` | Created | 4 tests. Reads `astro.config.mjs` as raw text; anchors on `output: 'server'` + `adapter: netlify(),`, then asserts neither forbidden option appears |
| `src/middleware.ts` | Modified | `needsSession` exported; `locals.user = null` first; `getUser()` → `locals.user`; `pendingHeaders` flushed after `next()`. Lang behavior byte-for-byte preserved |
| `src/middleware.test.ts` | Modified | +19 tests: 11 for `needsSession`, 8 for session resolution and ordering. Existing 6 locale tests unmodified |
| `src/env.d.ts` | Modified | `Locals.user: User \| null`, non-optional, with the reasoning inline |
| `astro.config.mjs` | Modified | Comment only. 16-line prohibition block above `adapter: netlify(),` |
| `src/pages/[lang]/ingles/ingles.test.ts` | Modified | Harness: `locals: { user: null, ...locals }`. Forced by 2.4 |
| `src/pages/[lang]/libros/libros.test.ts` | Modified | Same harness fix |
| `src/pages/[lang]/noticias/noticias.test.ts` | Modified | Same harness fix |

Out of scope and untouched, as instructed: every route under `src/pages/api/auth/**`
(slice 3), every migration, every UI file. `PRD-arquitectura.md` remains untracked and
uncommitted.

## TDD cycle evidence

| Task | Test file | Layer | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 2.1 | `src/middleware.test.ts` | Unit | ✅ 6/6 existing locale tests green first | ✅ Observed: `TypeError: needsSession is not a function` — `10 failed \| 6 passed (16)` | ✅ `25 passed (25)` | ✅ 11 cases: 5 true, 4 false, 2 first-segment-only | ➖ None needed |
| 2.2 | `src/astroConfig.test.ts` | Unit | N/A (new file) | ✅ Observed by MUTATION — see below | ✅ `4 passed (4)` | ✅ 4 cases: 2 anchors + both forbidden options | ➖ None needed |
| 2.3 → 2.6 | `src/lib/httpCache.test.ts` | Unit | N/A (new file) | ✅ Observed: `Failed to load url ./httpCache` · `Tests: no tests` | ✅ `5 passed (5)` | ✅ 5 cases incl. the permissive-overwrite case that forces `set` over `append` | ➖ None needed |
| 2.4 | (typecheck) | Type | ✅ 0 errors captured first | ✅ Observed: 3 × `ts(2741): Property 'user' is missing … but required in type 'Locals'` | ✅ `0 errors` | ➖ Structural — one possible shape | ➖ N/A |
| 2.5 | `src/middleware.test.ts` | Unit | ✅ 6/6 locale tests green first, still green after | ✅ Observed: `18 failed \| 7 passed (25)` before implementation | ✅ `25 passed (25)` | ✅ 8 cases: redirect, 404, 3 skipped paths, signed-in, rejected cookie, header flush, no-buffer | ➖ None needed |
| 2.7 | `src/astroConfig.test.ts` | Unit | ✅ Guard green before and after the comment landed | ➖ Comment only — no behavior | ✅ `4 passed (4)` | ➖ N/A | ➖ N/A |

**Task 2.2's RED was earned, not assumed.** A guard test for a condition that already
holds passes at birth, which proves nothing. `adapter: netlify(),` was temporarily
rewritten to `adapter: netlify({ middlewareMode: 'edge', cacheOnDemandPages: true }),`
and the suite run: `Tests 3 failed | 1 passed (4)` — both forbidden options caught,
plus the no-options anchor. The mutation was then reverted with
`git checkout -- astro.config.mjs` and the guard re-run green. That is the RED
observation, and it is also the only proof the assertion has teeth.

**Task 2.4's RED came from the type checker, which is the correct layer.** The point of
a non-optional `Locals.user` is that a forgotten assignment is a compile error rather
than a silent permanent sign-out. It immediately found three page-render harnesses
that were building a `locals` object without it. That is the guard working on its first
day, not collateral damage.

Triangulation, per behavior:

| Behavior | Cases forcing real logic |
|---|---|
| `needsSession` | `_astro` with a dotted filename vs `_astro/` with none — proves the `_astro` branch independently of the dot branch. `/favicon.ico` and `/robots.txt` — two extensions. `/es/libros/clean.architecture` and `/es/v1.2/notas` — a dot in a LATER segment must still be `true`, which is what forces "first segment" rather than "any segment" |
| `markPrivate` | Absent header (set) vs a live `public, max-age=3600` (overwrite) — an `append` implementation passes the first and fails the second. Plus idempotency, which `append` also fails |
| Middleware ordering | `/` and `/fr/x` assert `locals.user === null` **and** `createSessionClient` not called — a naive "resolve first, route later" implementation passes the null assertion and fails the call assertion |
| Session resolution | `signedIn('user-1')` vs `anonymous({message:'invalid JWT…'})` — a hardcoded `null` satisfies one and not the other |
| Header flush | One buffered `cache-control` (must appear on the response) vs an empty map (response returned intact, body still `OK`) |

Tests written: **28** (19 middleware, 5 httpCache, 4 astroConfig). Passing: **28**.
Layers: Unit (28). Approval tests: none — slice 2 refactored no existing behavior;
`src/middleware.ts`'s locale logic was preserved verbatim and its 6 original tests
were not edited, which is the equivalent evidence. Pure functions created: **2**
(`needsSession`, `markPrivate`).

No banned assertion patterns. There is one loop over a literal 3-element array in
`skips the session round trip for static assets`; it is guarded by
`expect(next).toHaveBeenCalledTimes(skipped.length)`, so it cannot be a ghost loop.
No assertion touches a CSS class or an internal.

## Work unit evidence

Slice 2 is three independent work units, committed separately.

| Unit | Focused test command and result | Rollback boundary |
|---|---|---|
| `httpCache` | `pnpm vitest run src/lib/httpCache.test.ts` → `Test Files 1 passed (1) · Tests 5 passed (5)` | Delete `src/lib/httpCache.ts` and `src/lib/httpCache.test.ts`. Nothing imports them yet |
| config guard | `pnpm vitest run src/astroConfig.test.ts` → `Test Files 1 passed (1) · Tests 4 passed (4)` | Delete `src/astroConfig.test.ts` and revert the 16-line comment in `astro.config.mjs`. No executable config change to unwind |
| middleware | `pnpm vitest run src/middleware.test.ts` → `Test Files 1 passed (1) · Tests 25 passed (25)` | Revert `src/middleware.ts` to setting only `locals.lang`, drop `Locals.user` from `src/env.d.ts`, revert the three harness one-liners. No schema, no route, no UI |

Combined focused run:
`pnpm vitest run src/astroConfig.test.ts src/middleware.test.ts src/lib/httpCache.test.ts src/lib/supabaseSession.test.ts`
→ `Test Files 4 passed (4) · Tests 47 passed (47)`.

**Runtime harness: N/A at this layer, and that gap is exactly task 2.8.** Slice 2
introduces the first real runtime boundary in the change — middleware calling Supabase
inside a Netlify Function — and it cannot be exercised locally in a way that proves
anything about the deployed runtime. The `@supabase/ssr`-on-`@astrojs/netlify`
question is open in design §"Open questions" and was assigned to task 2.8 precisely
because only a deploy can close it. Unit tests here prove **ordering and contract**,
not transport. Slices 3–4 must not branch until 2.8 passes.

## Task 2.8 — owner checklist (BLOCKED, not complete)

Not attempted: it needs a Netlify preview deploy only the owner can trigger. Below is
what must be OBSERVED for the spike to count as passed. Steps 5, 7 and 8 are the ones
that actually decide it.

**Read this first — a scope problem in the task as written.** Task 2.8 asks to confirm
"a `@supabase/ssr` session survives a real request", but slice 2 ships **no way to
create a session**: `/api/auth/signin` and `/api/auth/confirm` arrive in slice 3, and
nothing on this branch renders from `locals.user`. Two honest paths:

- **(a) Recommended — run the spike at the head of slice 3**, where the magic-link
  round trip exists and step 3 is natural. The design's constraint ("before slices 3–4
  build on it") is still met if it is the first thing slice 3 does and slice 4 waits.
- **(b) Run it now with an out-of-band session**: mint tokens against the Supabase
  project outside the app, then set the cookie by hand. This proves transport but needs
  the throwaway probe in step 7.

### Deploy
1. Netlify preview deploy of the branch. In the deploy's **Functions** tab, confirm an
   SSR Node function is listed and that **Edge Functions lists nothing for rendering**.
   If rendering moved to the edge, stop — `context.locals` is being JSON-serialized and
   the session client is already dead.
2. Confirm `SUPABASE_URL` and `SUPABASE_ANON_KEY` are set on the preview deploy context
   (server-only, no `PUBLIC_` prefix). If they are missing, `loadEnv()` throws at module
   load and the failure will read as a middleware bug.

### Prove the session round-trips
3. Establish a session by path (a) or (b) above.
4. Request a locale page with the cookie attached:
   `curl -i -b "<cookie-header>" https://<preview>/es/`.
   The cookie name to look for is **`sb-<project-ref>-auth-token`**, and with a real
   JWT it will be **chunked**: `sb-<ref>-auth-token.0`, `.1`, … because the value
   exceeds the 4 KB per-cookie limit. Chunking is the single most likely thing to break
   on a serverless adapter, so use a REAL token, never a short fake one.
5. **Proof the session survived the runtime**: the response must carry a `set-cookie`
   for `sb-<ref>-auth-token*` whose value **differs** from the one sent — that is
   `getUser()` having refreshed the token inside the Netlify Function and the refreshed
   value having reached the response through `AstroCookies`. No `set-cookie` at all is
   acceptable **only** when the access token had not yet expired. To force the refresh
   path, wait past the access-token TTL or shorten it in the Supabase dashboard.
6. Inspect the flags on that `set-cookie`: `HttpOnly`, `Secure`, `SameSite=Lax`,
   `Path=/`. **`Secure` MUST be present** — the preview is HTTPS, so
   `import.meta.env.PROD` is true there. Its absence means the build ran in dev mode
   and every cookie hardening in slice 1 is inert in production.
7. **Proof identity actually resolved, not just that a cookie moved.** Steps 4–6 alone
   prove transport. Deploy a throwaway `src/pages/api/whoami.ts` returning
   `{ id: locals.user?.id ?? null }`, and delete it before merge. With the session
   cookie it must return the real user id. If it returns `null` while step 5 passed,
   cookies survive and identity does not — which is the failure mode the whole spike
   exists to detect.

### Negative control — do not skip
8. Repeat step 4 with **no cookie**. There must be no session `set-cookie`, and the
   whoami probe must return `{"id":null}`. Without this a cached response reads as a pass.
9. Request `https://<preview>/_astro/<any-hashed-asset>` and `https://<preview>/favicon.ico`.
   Neither may produce a session `set-cookie`. This is `needsSession` observed in the
   real runtime, and it is the only place it can be observed end to end.

### Record
10. Paste into the PR body: the request/response header pairs from 4–6, both whoami
    outputs from 7–8, and the Functions-vs-Edge-Functions listing from step 1.

**PASS requires the refreshed `set-cookie` (step 5) AND the non-null whoami id (step 7)
from the same Netlify Function deploy, AND both negative controls (8, 9).** Anything
less does not close the design's open question.

## Verification commands (slice 2)

| Command | Observed result |
|---|---|
| `pnpm install --frozen-lockfile` | **PASS** — `Done in 30.3s`. `+ @supabase/ssr 0.12.7` · `- @supabase/supabase-js 2.110.7` · `+ @supabase/supabase-js 2.116.0`. Required before any test could run; see Baseline |
| `pnpm test` | **PASS** — `Test Files 55 passed (55)` · `Tests 969 passed \| 10 skipped (979)`. Run **three consecutive times**, identical each time. Baseline was 53 / 941 / 10; the delta is exactly this slice's 2 new test files and 28 new tests |
| `pnpm typecheck` | **PASS** — `Result (142 files): 0 errors, 0 warnings, 0 hints`. File count 139 → 142 for the three new files, all of which typecheck clean |
| `pnpm vitest run src/middleware.test.ts` | **PASS** — `Tests 25 passed (25)` |
| `pnpm vitest run src/astroConfig.test.ts` | **PASS** — `Tests 4 passed (4)` |
| `pnpm vitest run src/lib/httpCache.test.ts` | **PASS** — `Tests 5 passed (5)` |
| `pnpm test:e2e` | **NOT RUN** — not in slice 2's task list (2.9 names `pnpm test && pnpm typecheck` only) |

## Deviations from design (slice 2)

1. **The forbidden option names are documented in the guard test, not in
   `astro.config.mjs`.** Design §1 specifies the guard as "a unit test reads
   `astro.config.mjs` as text and asserts it contains neither `middlewareMode` nor
   `cacheOnDemandPages`", and task 2.7 separately asks for a comment in that file
   documenting the prohibition. **These two collide**: a comment naming either
   identifier fails the guard, because raw text cannot tell a comment from a setting.
   Resolved in the strictest direction — the guard stays literal, and 2.7's 16-line
   comment describes both options in prose and points to `src/astroConfig.test.ts` for
   the names. The comment also says WHY the names are absent, so a future editor does
   not "improve" it and break the build mysteriously. The alternative — stripping
   comments before asserting — would let a commented-out setting pass the guard, and a
   commented-out setting is one keystroke from live.

2. **Three test harnesses outside the task list were changed.** `Locals.user` being
   non-optional (task 2.4) is a breaking type change, and `ingles.test.ts`,
   `libros.test.ts` and `noticias.test.ts` each build a `locals` object for the Astro
   Container API. Each gained `user: null` — the anonymous default those renders
   already assumed. No assertion was weakened, no test was deleted, and no production
   behavior changed. This is the non-optional field doing its job.

3. **The config guard lives at `src/astroConfig.test.ts`, not beside the file it
   guards.** `vitest.config.ts` includes only `src/**/*.{test,spec}.{ts,tsx}` and
   `tests/unit/**`; `tests/unit/` does not exist, and a repo-root `astro.config.test.ts`
   would silently never run — the worst possible outcome for a guard. Placing it under
   `src/` follows the existing precedent of `src/styles/tailwind-tokens.test.ts`, which
   also asserts on a sibling file's text and has no matching source module.

4. **`getUser()` is called without a `try`/`catch`, exactly as design §1 writes it.**
   See Issues #4: this is a deliberate literal implementation, not an oversight, and it
   carries a real consequence worth an explicit decision.

Nothing else deviates. The ordering (`locals.user = null` → redirect → 404 → lang →
`needsSession` gate → `getUser()` → `next()` → flush), the `getUser()`-never-
`getSession()` rule, the `PRIVATE_CACHE_CONTROL` value, and the non-optional
`Locals.user` all match design §1, §2 and the `user-identity` spec.

## Issues found (slice 2)

1. **`node_modules` was stale on a freshly merged `main`, and the symptom looked like a
   code failure.** `@supabase/ssr` is declared in `package.json` and resolved in
   `pnpm-lock.yaml`, but absent from `node_modules`, so `pnpm test` failed with
   `Cannot find package '@supabase/ssr'` pointing at `src/lib/supabaseSession.ts:31`.
   Nothing was wrong with the code. **Anyone pulling `main` after PR #13 must run
   `pnpm install` before the suite will run.** Worth a line in the contributing notes,
   or a `preinstall`/CI step, because the error names a source file and not the cause.

2. **`src/components/islands/ShareDialog.test.tsx` flakes in the full parallel suite,
   and it is PRE-EXISTING.** The test
   `ShareDialog > stops claiming "copied" after the reset window` intermittently fails
   with `expected 'Copiado' to be 'Copiar'` — a fake-timer/React-state flush race that
   only surfaces under concurrent worker load. Proven not to be slice 2's:
   - In isolation it passed **8/8** consecutive runs.
   - With slice 2 **stashed** (`git stash push -u -- src astro.config.mjs`, clean
     `main` tree), three full-suite runs gave `1 failed` / `941 passed` / `941 passed`
     — the failure was the **same file**.
   - With slice 2 restored, three consecutive full-suite runs gave
     `969 passed | 10 skipped` every time.
   So the true `main` baseline is "941 passing **with a known intermittent failure in
   `ShareDialog.test.tsx`**", and my task-2.0 reading happened to be a clean run. This
   should be fixed as its own work unit (wrap the timer advance and the assertion in
   `act`, or await a state settle) — it will otherwise be misattributed to whichever
   slice is unlucky next.

3. **Review budget exceeded: 481 authored lines against 400, and against a ~250
   estimate.** See the boundary section below. A cohesive three-way split exists and
   the commits are already shaped for it.

4. **`getUser()` has no failure path, and that is a fail-OPEN-to-500 decision nobody has
   explicitly made.** Design §1 writes
   `locals.user = (await client.auth.getUser()).data.user ?? null`, which is what
   shipped. `getUser()` returns `{data, error}` for auth failures — the tampered-cookie
   scenario is covered and tested — but a **network** failure reaching Supabase
   **throws**, and an uncaught throw in middleware is a **500 on every page of the
   site**, including pages with no authenticated content at all. A `try`/`catch`
   degrading to `locals.user = null` would keep the site readable during a Supabase
   outage and would match the house fail-safe idiom in `exercises.ts` and `sanity.ts`.
   It was **not** added: it is production behavior the design does not specify, adding
   it unilaterally would be freelancing, and strict TDD forbids shipping it without a
   test written first. **This needs a design decision before slice 3**, which puts far
   more traffic through the same call.

5. **Task 2.8 as written cannot be fully executed at slice 2.** There is no sign-in
   route and nothing renders from `locals.user` until slice 3, so "confirm a session
   survives a real request" has no session to confirm. Both honest paths are in the
   checklist above; running it at the head of slice 3 is the recommendation.

## Workload / PR boundary (slice 2)

- **Mode**: stacked PR slice (`stacked-to-main`)
- **Current work unit**: slice 2, branch `feat/auth-middleware`, local only
- **Boundary**: starts at `93a9490` (`main`, PR #13 merged), ends at `630f72e`.
  Delivers `locals.user`, the cache-safety helper, and the config guard. No route, no
  UI, no migration, and nothing yet reads `locals.user`, which is what keeps the slice
  autonomous and trivially revertible.
- **Commits** (work units, each independently green and revertible):
  - `141e883` `feat(auth): add private cache-control helper for session responses`
  - `dd17419` `test(config): guard the Netlify adapter against auth-breaking options`
  - `630f72e` `feat(auth): resolve the session user in middleware`
- **Authored review budget**: **481 lines** (`additions + deletions`):

  | File | Lines |
  |---|---|
  | `src/middleware.test.ts` | 181 |
  | `src/middleware.ts` | 104 |
  | `src/astroConfig.test.ts` | 56 |
  | `src/lib/httpCache.test.ts` | 53 |
  | `src/lib/httpCache.ts` | 44 |
  | `src/env.d.ts` | 16 |
  | `astro.config.mjs` | 16 |
  | 3 page-test harnesses | 11 |

- **Over budget by 20%, and unlike slice 1 it CAN be split.** One honest slicing pass
  gives three units that are already the three commits, all under budget and all
  independently reviewable:

  | Unit | Commit | Lines | Independent? |
  |---|---|---|---|
  | cache safety | `141e883` | 97 | Yes — no consumers yet |
  | config guard | `dd17419` | 72 | Yes — test + comment only |
  | middleware + identity | `630f72e` | 312 | Yes — the core |

  The third unit cannot shrink further: `Locals.user` (16) forces the three harness
  fixes (11), and `needsSession` plus the ordering plus the header flush are one
  behavior with one test file. 290 of the 481 lines (60%) are TDD test code and may
  not be cut to reach a number.
- **Recommendation**: promote the three commits to three chained PRs rather than
  accepting `size:exception`. The split costs nothing — the commits already are it.
  If the owner prefers one PR, then `size:exception` at 481 lines, 20% over.

## Delivery state

**Not pushed. No pull request. Not merged.** Delivery is the owner's decision.
Branch `feat/auth-middleware` is local, at `630f72e`, three commits ahead of `93a9490`.
`PRD-arquitectura.md` remains untracked and uncommitted, as instructed.

---

## Remaining tasks (slice 3 onward — NOT started)

- [ ] 2.8 Preview-deploy spike — **BLOCKED on the owner.** Gates slices 3–4
- [ ] 3.1–3.9 `feat/auth-routes` — magic-link round trip, `safeNextPath` (T1), confirm-URL stripping (T2), no-enumeration sign-in
- [ ] 4.1–4.4 `feat/auth-signin-ui` — localized sign-in page

Slice 2 leaves slice 3 four things it should not rediscover:

1. `markPrivate(Astro.response.headers)` exists and must be called by every
   auth-dependent page and endpoint. It has no callers yet — slice 3 adds the first.
2. `locals.user` is `User | null` and **never** `undefined`. Any new page-render test
   harness must pass `user: null` explicitly or it will not typecheck.
3. Task 2.8's spike is still open and gates slice 3's own E2E. Run it FIRST.
4. Issue #4 (`getUser()` with no failure path) should be decided before slice 3
   multiplies the call sites.

## Status

**8 / 9 slice-2 tasks complete** (2.1–2.7, 2.9), plus baseline task 2.0.
Task 2.8 is **blocked on the owner**, deliberately not attempted and not faked.
Cumulative: **15 / 16 executable tasks** across slices 1 and 2.
`pnpm test` → `969 passed | 10 skipped`, three consecutive runs.
`pnpm typecheck` → `0 errors`.
Ready for independent SDD verification of slice 2.
