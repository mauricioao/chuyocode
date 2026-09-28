# Apply Progress — Slice 3c: Flush auth cookies onto the returned response

**Artifact**: `gentle-ai.sdd-apply/v1` · **Unit**: `slice-03c-cookie-flush`
**Change**: `user-authored-exercises` · **Corrects**: tasks 3.5, 3.6, 3.7 (delivery), 3.8 (coverage)
**Store**: `hybrid` (OpenSpec + Engram `sdd/user-authored-exercises/apply-progress/slice-03c`)
**Mode**: Strict TDD · **Test runner**: `pnpm test` → `vitest run`
**Branch**: `fix/auth-cookie-flush` (local, based on `fix/auth-confirm-pkce-code`) · **Not pushed**

> Per-unit file, per the convention slice 3b established. Nothing from an earlier
> unit is merged, compressed, or overwritten here.

---

## Why this unit exists

A real magic-link round trip was run against a Netlify deploy preview. The link
reached `/api/auth/confirm` — proven by the final URL, `/es/?auth=link-invalid`,
which only `withAuthError()` produces — and redemption failed.

Then DevTools → Application → Cookies for that origin showed **zero cookies. Not
a missing one. None at all.**

PKCE needs a code verifier cookie written on the sign-in response and read back
at confirm time. If no cookie was ever stored, `exchangeCodeForSession` cannot
succeed, and `link-invalid` is exactly what that produces. Slice 3b made the
route able to redeem a `code`; this unit is about the cookie that redemption
depends on ever reaching the browser.

---

## 🔴 The missing test IS the unit

The suite was green — **1062 passing** — while the browser received nothing.

Every auth test asserted what the code CALLED. `supabaseSession.test.ts` proved
`setAll` invoked `cookies.set` / `cookies.delete` on Astro's jar. The three
endpoint suites mocked `@lib/supabaseSession` wholesale, so no cookie mechanism
ran in them at all. **No test anywhere asserted that a `Set-Cookie` header exists
on the `Response` object an endpoint returns.**

That is not an oversight in a corner. It is the difference between testing the
call and testing the delivery, and the delivery is the entire job of these three
routes. A suite built that way cannot distinguish "the cookie was written" from
"the cookie reached the caller", which is precisely the distinction that failed.

The RED run below is the receipt. Every new assertion failed with the same shape:

```
× POST /api/auth/signin  > carries the verifier cookie on the response it returns
  → expected [] to deeply equal [ Array(1) ]
× GET  /api/auth/confirm > carries the session cookie on a successful code exchange
  → expected [] to deeply equal [ Array(1) ]
× POST /api/auth/signout > carries every clearing directive on the response it returns
  → expected [] to deeply equal [ …(2) ]
× middleware              > flushes the rotated session cookie onto the response after next()
  → expected [] to deeply equal [ Array(1) ]
```

`[]` is `res.headers.getSetCookie()`. Empty, on every path, on every route.

---

## 🔴 What I concluded about `AstroCookies` and a hand-built `Response`

The task hypothesis was that returning a hand-constructed `Response` breaks
`AstroCookies`. **I read the installed source rather than assume it, and that
hypothesis is NOT confirmed.** Reported as found, because a fabricated root cause
is worse than an honest "the mechanism is fragile for a different reason".

Verified in the installed dependencies (`astro@5.18.2`, `@astrojs/netlify@6.6.5`):

| Step | Evidence |
|---|---|
| The endpoint and the render context share ONE `AstroCookies` instance | `astro/dist/core/render-context.js:37` constructs `cookies = new AstroCookies(request)`; line 452 passes that same `cookies` into the endpoint's `APIContext` |
| Astro attaches the jar to **whatever `Response` the route returned** | `render-context.js:253` → `attachCookiesToResponse(response, this.cookies)`, which is `Reflect.set(response, Symbol.for("astro.cookies"), cookies)` — it does not care how the `Response` was built |
| The Netlify adapter consumes the jar and appends the headers | `@astrojs/netlify/dist/ssr-function.js:30-34` → `for (const h of app.setCookieHeaders(response)) response.headers.append("Set-Cookie", h)` |

**So a hand-built `Response` does not, by itself, discard `AstroCookies` in this
Astro + adapter combination.** I could not reproduce the zero-cookie symptom from
source reading alone, and I am not going to claim a root cause I did not observe.

What I can state, and what justifies the change regardless:

1. **It is untestable from the route.** The header does not exist on the object
   the handler returns; it is materialized later, by framework and adapter code
   this repo does not own and does not run under vitest. The best a test can do
   is assert the jar was called — which is exactly the assertion that was green
   while sign-in was dead. Moving the write onto the returned `Response` is what
   makes the contract assertable at all, and the 25 new tests are the payoff.
2. **It depends on two steps in someone else's code, with a silent failure mode.**
   Both must keep working across every Astro and adapter upgrade. When either
   stops, there is no error and no log — just a visitor who is never signed in.
   That is the same class of hazard the module header already warns about for
   `middlewareMode: 'edge'`.
3. **`AstroCookies` keys its outgoing map by cookie NAME.** `cookies.js:154`
   (`#ensureOutgoingMap().set(key, …)`) means two directives for the same name
   collapse into whichever was written last. `@supabase/ssr` **deliberately**
   emits a host-only clear beside a domain-scoped one for the same name when a
   parent domain is configured, and its own source comments explain why: the
   browser returns both and a parser may pick the stale one, resurrecting a
   session after sign-out. That is a real defect of the jar path, not a
   hypothetical, and it is now covered by
   `keeps two directives for the same name at different scopes`.
4. **The repo already had the right precedent.** `src/pages/api/me-gusta/[id].ts`
   sets its dedup cookie by appending to the `Headers` it returns and works in
   production. Supabase documents the same pattern for frameworks that build
   their own responses.

So: this is a robustness and testability fix with a concrete correctness
component (#3), not a proven fix for the observed zero-cookie symptom. **The
deploy-preview symptom should be re-checked against this build before it is
called closed.** That is listed under Next steps.

### Discovery worth keeping

`setAll` is NOT called on every Supabase operation. `createServerClient` only
applies storage from its `onAuthStateChange` handler
(`@supabase/ssr/dist/main/createServerClient.js`), for `SIGNED_IN`,
`TOKEN_REFRESHED`, `USER_UPDATED`, `PASSWORD_RECOVERY`, `SIGNED_OUT`,
`MFA_CHALLENGE_VERIFIED`. `signInWithOtp` fires none of those. The PKCE verifier
still gets written because `cookies.js` special-cases it: `storage.setItem` calls
`applyServerStorage` immediately for any key ending in `-code-verifier`, with the
comment *"We don't have an `onAuthStateChange` event that can let us know that
the PKCE code verifier is being set."* Worth knowing before anyone debugs a
cookie that "should" have been written.

---

## What changed, and the one-mechanism rule

`createSessionClient` no longer writes through `AstroCookies` at all. It
serializes each cookie with `@supabase/ssr`'s own `serializeCookieHeader` into a
`pendingCookies: string[]` buffer, alongside the existing `pendingHeaders` map.
`flushSessionHeaders(headers, session)` puts both onto a `Headers` the caller
owns: headers with `set`, cookies with `append`.

All four call sites flush:

| Caller | Flushes onto |
|---|---|
| `signin.ts` | the JSON `Response` it builds |
| `confirm.ts` | the 303 `Response`, on **every** exit including both failure paths |
| `signout.ts` | the 303 `Response` |
| `middleware.ts` | the `Response` returned by `next()` |

**No duplicates, and it is structural rather than disciplined.** Keeping the
`AstroCookies` writes as well would emit every cookie twice, because the adapter
appends the jar's copy on top of this one. So the jar path was removed entirely
and the `cookies` parameter deleted from `createSessionClient` — a route cannot
accidentally use both, because the second mechanism no longer exists. Four tests
assert the count directly (`toHaveLength(1)` / `toHaveLength(2)`).

### Why a list, not a map keyed by name

Stated in the `SessionState` doc comment and locked by a test: a name-keyed
buffer reintroduces exactly the collapse described in finding #3 above.

### T3 — asserted, not assumed

`signin.ts` guarantees byte-identical responses for known and unknown addresses.
A verifier is minted **before** Supabase is asked about the address, so both
classes carry one — but a response that set a cookie for one class and not the
other would be the enumeration oracle returning through a header instead of a
body. Three tests assert it: known address, unknown address, and the case where
Supabase itself rejects the address. The three pre-existing full-fingerprint
comparisons (which compare every header) also still pass, and now include
`set-cookie` in the comparison.

The 400 paths mint nothing, because no client is built for a malformed body.
`uniformAccepted(null)` covers that, and
`sets no cookie on a request it rejects before contacting Supabase` proves it.

`markPrivate` still runs **after** the flush on every route, so a permissive
`Cache-Control` the library asked for cannot cache a session response. The two
existing tests that guard that ordering are untouched and green.

---

## Middleware — not regressed

Constraint: middleware's slice-2 behaviour and tests must survive. They do.

- All 28 pre-existing tests still pass, plus 3 new ones (31 total).
- One assertion was edited, and only its argument list:
  `builds the client from this request, its cookie jar, and the environment` →
  `builds the client from this request and the environment`. The cookie jar is no
  longer a parameter of `createSessionClient`. The test's purpose — that the
  client is built from this request with the right `isProd` — is unchanged, and
  it still fails if either is wrong.
- Middleware moved to the same explicit mechanism rather than keeping a second
  one, for the no-duplicates reason above. Its header flush became
  `flushSessionHeaders(response.headers, session)`, which sets the same headers
  it set before and additionally appends the rotated session cookie. The existing
  `flushes the buffered auth headers onto the response after next()` and
  `returns the downstream response intact when nothing was buffered` both still
  pass unmodified.

---

## Files changed

| File | Action | What was done |
|---|---|---|
| `src/lib/supabaseSession.ts` | Modified | `SessionState` (`pendingHeaders` + `pendingCookies`); `flushSessionHeaders`; `setAll` serializes via `serializeCookieHeader` instead of writing to `AstroCookies`; `cookies` parameter removed; header documents why one mechanism |
| `src/lib/supabaseSession.test.ts` | Modified | AstroCookies assertions replaced by serialized-value assertions; new `flushSessionHeaders` group (5 cases); same-name-different-scope case |
| `src/middleware.ts` | Modified | Flushes cookies + headers onto the `next()` response |
| `src/middleware.test.ts` | Modified | Partial mock so the real `flushSessionHeaders` runs; +3 cases for the rotated cookie |
| `src/pages/api/auth/signin.ts` | Modified | `uniformAccepted(session)` flushes onto the JSON response; `session` nullable so a construction throw still answers uniformly |
| `src/pages/api/auth/signin.test.ts` | Modified | +5 cases asserting `Set-Cookie` on the returned `Response`, incl. two T3 classes |
| `src/pages/api/auth/confirm.ts` | Modified | `redirect(target, session)` flushes on every exit |
| `src/pages/api/auth/confirm.test.ts` | Modified | +6 cases: both success paths, both failure paths, ordering, and the no-credential case |
| `src/pages/api/auth/signout.ts` | Modified | Flushes the clearing directives onto the 303 |
| `src/pages/api/auth/signout.test.ts` | Modified | +4 cases: both chunks, `Max-Age=0`, and clearing despite a provider error |

---

## TDD Cycle Evidence

| Unit | Test file | Layer | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| WU1 — cookies on the returned `Response` | `supabaseSession.test.ts`, `middleware.test.ts`, `signin/confirm/signout.test.ts` | Unit + Integration | ✅ `59 passed (59)` files, `1062 passed \| 10 skipped (1072)` and typecheck `0 errors` before any edit | ✅ Observed `5 failed (5)` files, `26 failed \| 93 passed (119)`; every new `Set-Cookie` assertion reported `expected [] to deeply equal […]` | ✅ `5 passed (5)` files, `119 passed (119)` | ✅ 25 cases across 5 files: 4 routes × (success, failure, none) + serialization + same-name scopes + exactly-once | ✅ Doc comments corrected to match the shipped mechanism; dead cookie-jar stubs removed from the confirm/signout fixtures; full suite re-run green after |

Single work unit, deliberately. The mechanism cannot be split across commits
without leaving one commit in which the app writes cookies nowhere at all, which
fails the "repo still makes sense after applying only this commit" rule.

### Two intermediate RED→GREEN iterations, recorded rather than hidden

The first GREEN run left 18 failures. Both causes were in the **test fixtures**,
not the production change, and both are worth recording because both were real
bugs I introduced:

1. `middleware.test.ts` mocked `@lib/supabaseSession` with a bare factory, so the
   new `flushSessionHeaders` export did not exist on the mock — 15 failures,
   `No "flushSessionHeaders" export is defined on the … mock`. Fixed with a
   partial mock (`importActual`), which is also the correct shape: the flush is
   the thing under test and must not be stubbed.
2. `signin.test.ts` shared ONE `pendingCookies` array across every
   `createSessionClient` call, so the T3 tests — which call `POST` twice in one
   test — accumulated two cookies on the second response and the fingerprints
   diverged. 3 failures. Fixed by returning a fresh buffer per call, which is
   what the real client does: one per request, holding one caller's cookies.

Neither was a production defect. Recorded so the next reader knows the T3
fingerprint tests were exercised against a genuinely divergent response and
passed only once the fixture modelled per-request buffers correctly.

### Honest note on three cases that passed at RED

`sets no cookie on a request it rejects before contacting Supabase`,
`sets no cookie when the link carried no credential at all`, and
`adds no cookie to the response when the session was not rotated` all expect
`[]`, so they passed at RED trivially — everything returned `[]` at RED. They are
not RED evidence. They are the triangulation partners that keep the fix honest:
without them, a change that unconditionally appended a cookie would also be
green. They only became meaningful at GREEN, where the other 22 cases return
non-empty and these three still return empty.

---

## Work Unit Evidence

| Evidence | WU1 — cookies on the returned `Response` |
|---|---|
| Focused test command | `pnpm vitest run src/lib/supabaseSession.test.ts src/middleware.test.ts src/pages/api/auth` |
| Exact result | `Test Files 5 passed (5)` · `Tests 119 passed (119)` |
| Runtime harness | **N/A with reason.** The true runtime boundary is a browser receiving a `Set-Cookie` from a deployed function — the same boundary that was only reachable by hand when this bug was found. No harness in this repo can drive it: `pnpm test:e2e` (Playwright) has no magic-link spec because the mail transport is the blocked half of task 3.8. What this unit CAN do without a deploy is assert the header on the real `Response` object each handler returns, through real `Request`/`Response`/`Headers`, with only Supabase's auth surface stubbed — and that is the layer the previous suite skipped entirely. |
| Rollback boundary | Revert `b69738a`. Restores the `AstroCookies` write path, the `cookies` parameter on `createSessionClient`, and the four call sites; removes `flushSessionHeaders`, `pendingCookies`, and the 25 tests. Touches nothing outside the five source files and their five test files, and no other slice. |

---

## Verification

| Command | Observed result |
|---|---|
| `pnpm test` (run 1) | `Test Files 59 passed (59)` · `Tests 1087 passed \| 10 skipped (1097)` · `Duration 24.72s` |
| `pnpm test` (run 2) | `Test Files 59 passed (59)` · `Tests 1087 passed \| 10 skipped (1097)` · `Duration 22.37s` |
| `pnpm typecheck` | `Result (150 files): 0 errors, 0 warnings, 0 hints` |

Full output was captured to file and searched case-sensitively for `FAIL`: **zero
matches** on both runs. (A case-insensitive search returns 55 hits, all of them
the words `fail-safe` / `fails open` inside test names — noted so nobody repeats
that false alarm.)

Baseline on this branch was `1062 passed | 10 skipped`. This unit adds 25 tests
(5 in `supabaseSession.test.ts`, 3 in `middleware.test.ts`, 5 in
`signin.test.ts`, 6 in `confirm.test.ts`, 4 in `signout.test.ts`, plus 2 replaced
AstroCookies cases becoming 4 serialization cases). 1062 + 25 = 1087, so the
delta is fully accounted for and nothing was silently removed. Both runs are
identical, which is the flake check.

No environmental failures were encountered. The `ShareDialog` flake noted in an
earlier unit did not reappear.

---

## Review budget — measured, not estimated

| Scope | Changed lines (`+` and `-`) |
|---|---|
| Production code (5 files) | 238 |
| Tests (5 files) | 525 |
| **`src/` total** | **763** |

763 is **363 lines over** the 400 budget, and I am reporting it rather than
shrinking it.

**One honest slicing pass was made and rejected**, for a specific reason. The
only split that keeps each commit reviewable would be (A) add `pendingCookies` +
`flushSessionHeaders` while KEEPING the `AstroCookies` writes, then (B) switch
the four callers and delete the jar path. Commit A delivers no behaviour — it
adds a buffer nobody reads — which is the "commit by file type" anti-pattern, and
commit B still carries most of the diff. Any split that does deliver behaviour
leaves an intermediate commit where cookies are written nowhere.

**69% of the diff is tests** (525 of 763), and those tests are the entire point of
the unit: their absence is what let a dead sign-in ship green. Deleting them to
reach 400 would remove the deliverable to satisfy a proxy for reviewer load.

Recommendation: **`size:exception`**, with the reviewer's attention directed at
`src/lib/supabaseSession.ts` (79/22) and the four flush call sites (88/49) — 238
lines of production code, well inside budget on its own. The 525 test lines are
five near-identical assertion blocks and read quickly as a group.

---

## Spec / task impact

No new spec deviation beyond the one slice 3b already raised and left open for
`sdd-spec`. This unit is a delivery correction inside the mechanism the existing
requirements already describe.

Worth a scenario when that spec correction is made: **the session cookie must be
present on the response that completes confirmation, and the clearing directives
on the response that completes sign-out.** Nothing in
`specs/user-identity/spec.md` states that today, which is structurally why no
test asserted it.

---

## Status

Cookie emission corrected across all three auth endpoints and middleware. One
commit on `fix/auth-cookie-flush`, not pushed, no PR opened:

- `b69738a` — `fix(auth): emit Supabase cookies on the response each route returns`

### Next steps

1. **Re-run the real magic-link round trip against a deploy preview built from
   this branch, and re-check DevTools → Cookies.** This is the only thing that
   can confirm or refute the zero-cookie symptom, and it is deliberately NOT
   claimed as fixed here — see the `AstroCookies` section above. If cookies are
   still absent, the cause is elsewhere (adapter mode, origin mismatch, or the
   `Secure` flag against the preview's scheme) and this unit has at least removed
   two steps of framework indirection from the search space.
2. Task 3.8's magic-link E2E remains blocked on mail transport, unchanged.
