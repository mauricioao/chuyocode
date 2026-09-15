# Apply Progress — Slice 3b: Confirm the PKCE `code`

**Artifact**: `gentle-ai.sdd-apply/v1` · **Unit**: `slice-03b-confirm-pkce`
**Change**: `user-authored-exercises` · **Corrects**: task 3.6
**Store**: `hybrid` (OpenSpec + Engram `sdd/user-authored-exercises/apply-progress/slice-03b`)
**Mode**: Strict TDD · **Test runner**: `pnpm test` → `vitest run`
**Branch**: `fix/auth-confirm-pkce-code` (local, based on merged slice 3) · **Not pushed**

> **Why this file is not in `apply-progress.md`.** That file reached 47,975 of
> Engram's silent 50,000-character limit and its last append already compressed
> slice 1 away to fit. From this unit onward, progress is one file per work unit
> with its own Engram topic key, so no future unit is paid for by deleting a past
> one. The pointer note at the top of `apply-progress.md` records the same.

---

## Why this unit exists

Slice 3 shipped a magic-link flow whose tests were green, whose typecheck was
clean, and which **could not sign a single person in**. The gap was not a bug in
any line of code. It was an assumption in task 3.6 that nobody had tested against
the real Supabase project until the owner clicked an actual emailed link.

Three findings, each verified rather than assumed:

1. **Supabase's default email link returns the session in the URL FRAGMENT.**
   Their own documentation: *"the default email link will redirect the user after
   verification to the redirect URL with the session in the query fragments.
   Since the session is returned in the query fragments by default, you won't be
   able to access it on the server-side."* A fragment is never transmitted to a
   server. Our confirm route is a server route. It was reading a value that
   structurally cannot arrive.

2. **The documented fix is a custom email template carrying `token_hash` — and
   that door is locked.** `confirm.ts` already implemented the `token_hash` path
   exactly as task 3.6 specified. It just never receives one, because editing
   email templates is not available on this project's Supabase plan. No amount of
   correctness in that branch matters if nothing ever sends its input.

3. **It was already solvable in our own code, with no plan change.** Verified
   directly in the installed dependency rather than taken on faith:

   ```
   node_modules/@supabase/ssr/dist/main/createServerClient.js:37 → flowType: "pkce"
   node_modules/@supabase/ssr/dist/main/createBrowserClient.js:44 → flowType: "pkce"
   ```

   Line 37 sits **after** the `...options?.auth` spread on line 36, so it is not
   a default a caller can override — it is imposed. `createSessionClient` in
   `src/lib/supabaseSession.ts` builds on `createServerClient`, so our session
   client has always been a PKCE client. Under PKCE the verify endpoint redirects
   with **`?code=<auth_code>` as a QUERY parameter**, and a query parameter is
   readable server-side.

So `confirm.ts` was never wrong. It was incomplete: it knew one credential, and
the flow we actually run hands it the other one.

---

## 🔴 The security hole this unit also closed

`src/lib/authRedirect.ts` read:

```ts
const STRIPPED_PARAMS = ['token_hash', 'type'] as const;
```

`code` is a single-use session credential in exactly the sense `token_hash` is —
`exchangeCodeForSession` turns it into a live session in one call — and it was
**not on that list**. A crafted `next` carrying `?code=…` would have survived into
the 303 `Location` header, and from there into browser history and into the
`Referer` of the next request the destination page made. That is precisely the
leak the T2 defense exists to prevent.

The important part is not the missing string. It is that **the test suite proved
`token_hash` was stripped and said nothing about `code`** — a suite that passes
while the hole is open. The RED run below is the receipt that the hole was real:

```
× stripAuthParams — T2 token leakage > removes the PKCE `code` from the redirect target
  → expected '/es/?code=6a1f0c39-2b7d-4e18-9c55-0d3a' to be '/es/'
```

That is the credential, intact, in a value destined for `Location`.

---

## The precedence decision

**When a URL carries both `code` and `token_hash`, `code` wins, and a failed
`code` exchange does NOT fall back to the `token_hash` beside it.**

Supabase never sends both. A URL carrying both was composed by hand, so the order
is an attack surface, not a formality, and leaving it to whichever `if` happened
to come first would have been a coin flip on a security property.

The asymmetry that decides it:

| | `code` | `token_hash` |
|---|---|---|
| Binding | PKCE verifier cookie, held only by the browser that requested the link | None — bearer |
| Redeemable from another device | No | **Yes, by anyone holding it** |

If `token_hash` won, an attacker could append **their own** `token_hash` to a
link, send it to a victim, and the victim's browser would sign in as the
**attacker**. Every exercise the victim then authored would land in the
attacker's account. That is session fixation, and it is reachable with nothing
more than a crafted URL.

If `code` wins, the same attack fails by construction: the attacker's code
requires the attacker's verifier cookie, which the victim's browser does not
have. The exchange is rejected and the visitor gets the "ask for a new link"
invitation.

**No fallback** follows from the same reasoning. Falling through from a failed
exchange to the `token_hash` sitting next to it would reopen the exact hole the
precedence closes — the attacker would simply supply a `code` they know is dead.
This is locked by its own test, `does NOT fall back to the token_hash when the
code exchange fails`, which asserts `verifyOtp` is never called.

The rule lives in one pure function, `selectCredential`, so the precedence is a
readable `if` order rather than an emergent property of handler control flow.

---

## ⚠️ The limitation this introduces, stated plainly

**PKCE is browser-bound.** Requesting a link mints a code verifier that the
session client writes as a cookie on the `/api/auth/signin` response.
`exchangeCodeForSession` needs that cookie back at confirm time. Therefore:

> The link must be opened in the **same browser** that requested it.

Request it on a laptop, open the mail on a phone, and there is no verifier. The
exchange fails and the visitor is told to ask for a new link — correct behaviour,
but indistinguishable to them from a broken link. This is inherent to PKCE and
cannot be fixed inside the confirm route.

This is why the `token_hash` path is **kept rather than deleted as dead code**: it
needs no verifier, so it is the device-independent option the day a custom email
template becomes available. Deleting it would discard the only escape from this
limitation.

Both facts are recorded in the module headers of `src/pages/api/auth/confirm.ts`
and `src/pages/api/auth/signin.ts`, so the next person to debug a "broken" link
finds the explanation at the code rather than in this artifact.

---

## Files changed

| File | Action | What was done |
|---|---|---|
| `src/lib/authRedirect.ts` | Modified | `code` added to `STRIPPED_PARAMS`; header and JSDoc now name both credentials |
| `src/lib/authRedirect.test.ts` | Modified | +3 cases: `code` single, `code` combined with `token_hash`, `code` repeated |
| `src/pages/api/auth/confirm.ts` | Modified | `selectCredential` (pure) + `exchangeCodeForSession` branch; module header documents both credentials, the precedence, and the browser-bound limitation |
| `src/pages/api/auth/confirm.test.ts` | Modified | +12 cases across two new groups: the `code` path and credential precedence |
| `src/pages/api/auth/signin.ts` | Modified | Header corrected — it claimed the email carries a `token_hash`; now documents the verifier cookie this response writes |
| `openspec/changes/user-authored-exercises/tasks.md` | Modified | Task 3.6 annotated with the correction |
| `openspec/changes/user-authored-exercises/apply-progress.md` | Modified | Closed at slice 3; pointer to `apply-progress/` and why |

---

## TDD Cycle Evidence

| Unit | Test file | Layer | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| WU1 — strip `code` | `src/lib/authRedirect.test.ts` | Unit | ✅ `2 passed (2)` files, `51 passed (51)` before any edit | ✅ Observed `3 failed \| 34 passed (37)`, failure text showed the credential surviving into the target | ✅ `37 passed (37)` | ✅ 3 cases: single, combined-with-`token_hash`, repeated | ➖ None needed — one entry added to an existing list |
| WU2 — redeem `code` | `src/pages/api/auth/confirm.test.ts` | Integration | ✅ `17 passed (17)` before any edit | ✅ Observed `5 failed \| 24 passed (29)` | ✅ `29 passed (29)` | ✅ 12 cases across the `code` path and precedence | ✅ Precedence extracted to the pure `selectCredential`; 29 still green |

### RED observed for WU2 — the five failures, and what each proved

```
→ expected "spy" to be called 1 times, but got 0 times
→ expected '/en/libros?auth=link-invalid' to be '/en/libros'
→ expected '/es/libros?orden=reciente&auth=link-i…' to be '/es/libros?orden=reciente'
→ expected "spy" to be called with arguments: [ Array(1) ]
→ expected "spy" to not be called at all, but actually been called 1 times
```

Read in order: `exchangeCodeForSession` was never reached; a valid `?code=` link
redirected to `auth=link-invalid` (the visitor was told their good link was bad);
the same on a link with a real destination; the exchange was never called with
the code; and with both credentials present the route redeemed the **bearer**
`token_hash` — the session-fixation path, live.

### Honest note on three `code`-path cases that passed at RED

`never carries the code into the redirect target`, `strips the code even when it
rides inside next`, and `keeps the code out of the redirect on the failure path`
were green the moment WU2's tests ran, because **WU1 had already closed that hole
one commit earlier**. They are not trivial passes — they exercise
`stripAuthParams` through the full route and would fail if WU1 were reverted —
but they are regression guards for WU1 rather than RED evidence for WU2. WU2's
RED evidence is the five failures above.

`does not verify an OTP when the credential is a code` also passed at RED, for a
degenerate reason: the route called nothing at all on a `?code=` URL. Its real
value is as the partner of the precedence test, which **did** fail, and which
proves `verifyOtp` is now skipped by decision rather than by accident.

---

## Work Unit Evidence

| Evidence | WU1 — strip `code` | WU2 — redeem `code` |
|---|---|---|
| Focused test command | `pnpm vitest run src/lib/authRedirect.test.ts` | `pnpm vitest run src/pages/api/auth/confirm.test.ts` |
| Exact result | `Test Files 1 passed (1)` · `Tests 37 passed (37)` | `Test Files 1 passed (1)` · `Tests 29 passed (29)` |
| Runtime harness | **N/A with reason.** The only true runtime boundary is a real emailed link reaching a real mailbox — the blocked half of task 3.8. No harness in this repo can send one. The route is exercised through real `Request`/`Response` objects with Supabase's auth surface stubbed, which is the highest layer available without mail. | Same |
| Rollback boundary | Revert `8452ea7`. Removes one entry from `STRIPPED_PARAMS` and 3 test cases. Touches nothing else. | Revert `341a2e8`. Removes `selectCredential`, the `exchangeCodeForSession` branch, 12 test cases, and header text. The `token_hash` path returns to being the sole credential — i.e. back to the broken-but-green state, not to a different bug. |

---

## Verification

| Command | Observed result |
|---|---|
| `pnpm test` (run 1) | `Test Files 59 passed (59)` · `Tests 1062 passed \| 10 skipped (1072)` · `Duration 33.36s` |
| `pnpm test` (run 2) | `Test Files 59 passed (59)` · `Tests 1062 passed \| 10 skipped (1072)` · `Duration 21.85s` |
| `pnpm typecheck` | `Result (150 files): 0 errors, 0 warnings, 0 hints` |

Baseline on this branch was `1047 passed | 10 skipped`. This unit adds 15 tests
(3 in `authRedirect.test.ts`, 12 in `confirm.test.ts`); 1047 + 15 = 1062, so the
delta is fully accounted for and nothing was silently removed. Both `pnpm test`
runs are identical, which is the flake check.

`pnpm test:e2e` was not run: this unit adds no E2E spec, and the magic-link E2E it
would carry is the blocked half of task 3.8.

---

## 🔴 Spec deviation — requires a decision before archive

`specs/user-identity/spec.md` now contradicts the shipped system in two places,
and this is reported rather than silently patched, because rewriting a spec to
match the code is how a spec stops being a check on anything.

**Requirement: Server-Side Magic Link Confirmation** says:

> The system MUST confirm a magic link through a server route that calls
> `verifyOtp({ type: 'email', token_hash })`.

**Scenario: Visitor requests a magic link** says:

> THEN the system sends a magic-link email containing a `token_hash` link

Both name one credential. The site's links carry `code`, and `verifyOtp` is not
what redeems them.

The requirement's **intent** is intact and, if anything, better served: the whole
point of that sentence is the clause after it — *"It MUST NOT depend on the
client-side implicit fragment flow"* — and the `code` path is server-side
confirmation. What is wrong is the mechanism named as if it were the only one.

Suggested correction, for `sdd-spec` rather than for this phase: keep the
prohibition on the fragment flow, and state the requirement as server-side
redemption of whichever credential the link carries — `exchangeCodeForSession`
for the PKCE `code`, `verifyOtp` for a `token_hash` — with the precedence and the
browser-bound limitation as scenarios.

A second gap worth a scenario: nothing in the spec covers the same-browser
constraint, which is a user-visible failure mode a real person will hit.

---

## Status

Task 3.6 corrected. Task 3.8 remains partially blocked, unchanged by this unit:
the mail transport is still unprovable here, and now there is one more reason to
want that E2E — the same-browser constraint is exactly the kind of thing only a
real round trip catches.

Two commits on `fix/auth-confirm-pkce-code`, not pushed, no PR opened:

- `8452ea7` — `fix(auth): strip the PKCE code from post-confirm redirect targets`
- `341a2e8` — `feat(auth): confirm magic links sent by the default email template`

Authored diff across both: well inside the 400-line review budget. No
`size:exception` needed.
