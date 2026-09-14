# Research — user-authored-exercises

**Artifact**: `gentle-ai.sdd-research/v1`
**Revision**: 3 (supersedes rev 1 `blocked`, and rev 2 which diverged across stores)
**Outcome**: `partial`
**Change**: `user-authored-exercises`
**Store mode**: `hybrid` (OpenSpec + Engram, identical bytes)
**Retrieval date**: 2026-09-12 — all sources below share this `accessed_at`

> **Why revision 3.** Revision 2 was written to both stores but exceeded the Engram observation limit and was truncated to 50,000 chars, leaving the two stores divergent. Per the hybrid persistence contract, this revision was rebuilt from retained canonical intent — not from either surviving store — and sized to persist identically in both.

---

## Quick path

1. Admission was **partial**: `documentation` granted and verified at runtime; `open-web` granted but its declared tool is **absent from this runtime**, so it was denied.
2. **Lane A (auth) is ANSWERED.** The blocking question is resolved, including the sharp one — the "anon key gets nothing" posture **survives** auth intact.
3. **Lane D (generated columns) is substantially ANSWERED**, migration-safety premise confirmed, plus two unanticipated gotchas.
4. **Lane C is PARTIAL** — notable finding: official dnd-kit docs now describe a *different, newer* package line than the one installed.
5. **Lane B is BLOCKED.** No provider recommendation is emitted.
6. `proposal_ready` = **false**; `partial` is denied readiness by the lifecycle matrix.

---

## Admission record

| Field | Value |
|---|---|
| Envelope | `gentle-ai.sdd-research-capability/v1`, `granted_by: gentle-orchestrator` |
| Requested classes | `documentation`, `open-web` |
| Admission result | **partial** |
| Observed exact grants | `documentation = [context7]` only |

### Per-class runtime verification

Each declared class was checked against the actual runtime tool inventory, not against its declaration alone.

| Class | id | Declared tools | Present? | Result |
|---|---|---|---|---|
| `documentation` | `context7` | `mcp_Context7_resolve-library-id`, `mcp_Context7_query-docs` | Both present | **ADMITTED** |
| `open-web` | `webfetch` | `mcp_Webfetch` | **Absent** | **DENIED** |

**Why `open-web` was denied**: the declared tool does not exist in this runtime. A declared-but-unsupported class confers no capability. No substitute was used — not Sanity MCP's `read_docs`/`search_docs` (a different, Sanity-scoped server), not Engram (persistence is not an evidence grant), not filesystem reads (not an external class). Inferring evidence capability from generic MCP presence is forbidden.

**Superseded envelope**: the launch preamble restated attempt 1's denial state (`documentation=[] open-web=[]`). The turn body supplied a corrected, schema-qualified envelope, which is the artifact admission keys on. That envelope was admitted, then verified per-class as above.

### Provenance caveat

Context7 returns **indexed snapshots** of publisher docs, not a live fetch by this agent. `accessed_at` is the date the index was consulted, not proof the live page matched.

Four Supabase JS-reference URLs returned by the index have anchors visibly mismatched to their content (`.../auth-passkey-delete`, `.../using-filters-likeanyof`, `.../from`, `.../analytics-buckets-deletebucket` all returning auth-method docs). Indexing artifact. The content is unambiguous and corroborated across independent pages, so claims are retained — but those four URLs are **not citable verbatim**.

---

## Sources

All class `documentation`, all `accessed_at` 2026-09-12.

| id | Publisher | Title / URL |
|---|---|---|
| S1 | Supabase | `createServerClient` API ref — `github.com/supabase/ssr/blob/main/_autodocs/api-reference-createServerClient.md` |
| S2 | Supabase | Deprecated cookie functions — `.../ssr/blob/main/_autodocs/deprecated-functions.md` |
| S3 | Supabase | Cookie method types — `.../ssr/blob/main/_autodocs/types.md` |
| S4 | Supabase | Design: cookie chunking — `.../ssr/blob/main/docs/design.md` |
| S5 | Supabase | Configuration: default cookie options — `.../ssr/blob/main/_autodocs/configuration.md` |
| S6 | Supabase | Common patterns: middleware-first — `.../ssr/blob/main/_autodocs/common-patterns.md` |
| S7 | Supabase | `src/cookies.ts` signOut chunk clearing — `.../ssr/blob/main/src/cookies.ts` |
| S8 | Supabase | JS ref `getUser` — `supabase.com/docs/reference/javascript/start` |
| S9 | Supabase | JS ref `getSession` — *(anchor unreliable)* |
| S10 | Supabase | Auth JWTs — `supabase.com/docs/guides/auth/jwts` |
| S11 | Supabase | Next.js tutorial `/auth/confirm` — `supabase.com/docs/guides/getting-started/tutorials/with-nextjs` |
| S12 | Supabase | JS ref `signInWithOtp` — *(anchor unreliable)* |
| S13 | Supabase | JS ref `verifyOtp` — *(anchor unreliable)* |
| S14 | Supabase | Row Level Security — `supabase.com/docs/guides/database/postgres/row-level-security` |
| S15 | Supabase | Securing your data / frontend access — `supabase.com/docs/guides/database/secure-data` |
| S16 | Supabase | Understanding API keys — `supabase.com/docs/guides/getting-started/api-keys` |
| S17 | Supabase | Migrating to new API keys — `supabase.com/docs/guides/getting-started/migrating-to-new-api-keys` |
| S18 | Supabase | Auth custom SMTP — `supabase.com/docs/guides/auth/auth-smtp` |
| S19 | Supabase | Going into prod: rate limits & email link validity — `supabase.com/docs/guides/deployment/going-into-prod` |
| S20 | Supabase | **Auth quickstart — Astro** — `supabase.com/docs/guides/auth/quickstarts/astrojs` |
| S21 | Supabase | Getting-started quickstart — Astro — `supabase.com/docs/guides/getting-started/quickstarts/astrojs` |
| S22 | Astro | **Backend guide — Supabase** — `github.com/withastro/docs/.../guides/backend/supabase.mdx` |
| S23 | Astro | API ref `AstroCookies` — `github.com/withastro/docs/.../reference/api-reference.mdx` |
| S24 | PostgreSQL | DDL Generated Columns — `postgresql.org/docs/current/ddl-generated-columns.html` |
| S25 | PostgreSQL | `ALTER TABLE` — `postgresql.org/docs/current/sql-altertable.html` |
| S26 | PostgreSQL | `CREATE TABLE` GENERATED ALWAYS AS — `postgresql.org/docs/current/sql-createtable.html` |
| S27 | PostgreSQL | `CREATE INDEX` — `postgresql.org/docs/current/sql-createindex.html` |
| S28 | PostgreSQL | 11.8 Partial Indexes — `postgresql.org/docs/current/indexes-partial.html` |
| S29 | PostgreSQL | `ADD COLUMN ... GENERATED ... STORED` — `postgresql.org/docs/current/textsearch-tables.html` |
| S30 | dnd kit | Multiple sortable lists — `dndkit.com/react/guides/multiple-sortable-lists` |
| S31 | dnd kit | Keyboard sensor — `dndkit.com/extend/sensors/keyboard-sensor` |
| S32 | dnd kit | Sortable state management — `dndkit.com/react/guides/sortable-state-management` |
| S33 | dnd kit | Sensors: replacing vs extending — `dndkit.com/react/guides/sensors` |
| S34 | Supabase | Migrating to SSR from auth helpers — `supabase.com/docs/guides/auth/server-side/migrating-to-ssr-from-auth-helpers` |

---

# Lane A — Supabase Auth for Astro SSR — **ANSWERED**

## A1 — `@supabase/ssr` API surface — VERIFIED

The `getAll`/`setAll` contract is **current, not superseded**. The opposite holds: `get`/`set`/`remove` is deprecated.

Signature (S1):

```typescript
export function createServerClient<Database = any, SchemaName ...>(
  supabaseUrl: string,
  supabaseKey: string,
  options: SupabaseClientOptions<SchemaName> & {
    cookieOptions?: CookieOptionsWithName;
    cookies: CookieMethodsServer | CookieMethodsServerDeprecated;
    cookieEncoding?: "raw" | "base64url";
  },
): SupabaseClient<Database, SchemaName>
```

`GetAllCookies` returns `{name, value}[] | null`, sync or async (S3). `SetAllCookies` takes **two** params: `cookies` (`{name, value, options}[]`; empty value = delete) and `headers` (`Record<string,string>`, "HTTP response headers that must be set alongside cookies") (S3).

> **Gotcha — two-argument `setAll`.** Most published examples, including Supabase's own Astro quickstart (S20), implement `setAll(cookiesToSet)` and drop the `headers` argument. Implement both.

Deprecation rationale (S4), quoted: *"it was necessary to deprecate the `get`, `set` and `remove` cookie access methods starting in version 0.4.0 in favor of `getAll` and `setAll`. This is because when a storage item needs to be set, all cookies that have chunk-like names need to be properly set and cleared. These cannot be known in advance… all users must switch to `getAll` and `setAll`, as in the next major version the individual `get`, `set` and `remove` methods will not be supported."*

**Sources**: S1–S4. **UNVERIFIED**: the published version number (npm = denied class). The API shape is from the package repo's `main` branch — authoritative shape, not a version stamp.

## A2 — Astro integration: two official recipes disagree — VERIFIED

**There IS an official Supabase recipe for Astro** (S20) — this strengthens the exploration's Q1 Option B from "adapter glue we invent" to "first-party recipe for this exact framework":

```typescript
import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import type { AstroCookies } from "astro";

export function createClient({ request, cookies }: { request: Request; cookies: AstroCookies }) {
  return createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() { return parseCookieHeader(request.headers.get("Cookie") ?? ""); },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => cookies.set(name, value, options));
      },
    },
  });
}
```

Install line on that page: `npm install @supabase/supabase-js @supabase/ssr @astrojs/node` (S20).

**Astro's own guide still shows the manual approach** (S22): raw `supabase-js`, `exchangeCodeForSession`, then `cookies.set("sb-access-token", access_token, { path: "/" })`.

### Recommendation: the Supabase recipe

| | Supabase (S20) | Astro guide (S22) |
|---|---|---|
| Refresh-token rotation | Library | Hand-rolled |
| Large-JWT cookie chunking | Library (S4) | Not handled |
| PKCE state | Library | Not handled |
| Cookie flags in the published example | Passes library `options` | **`path` only — no `httpOnly`/`secure`/`sameSite`** |
| New dependency | `@supabase/ssr` | None |

> **Security note.** S22 writes access AND refresh tokens with `{ path: "/" }` and nothing else — readable by client JavaScript. That is materially worse than this project's existing `src/lib/pass.ts` precedent, which is documented HttpOnly. Do not copy S22's cookie flags.

Tradeoff plainly: Supabase's recipe costs one dependency plus a small adapter; Astro's costs zero dependencies and requires us to implement refresh rotation, chunking and PKCE correctly ourselves — three things whose failure modes are silent session loss or token leakage. For a project with no auth infrastructure and no auth test surface, take the dependency.

**Sources**: S4, S20, S21, S22, S23.

## A3 — `getUser()` vs `getSession()` — VERIFIED. **Use `getUser()`.**

`getUser` (S8), quoted: *"fetches the user object directly from the database and validates the user's access token JWT on the server, making it authentic for authorization rules. It should always be used for authorization checks on the server, whereas getSession is insecure on the server but can be used client-side for faster results."*

`getSession` (S9), quoted: *"Because `getSession` loads data directly from attached client storage such as request cookies, the returned user object must not be implicitly trusted in insecure environments. To securely verify a user's identity and access, use `getClaims()` to verify the JWT or use `getUser()` to fetch the authenticated user object directly from the Auth server."*

Mechanism (S10) — an authenticated round trip:

```http
GET https://project-id.supabase.co/auth/v1/user
apikey: publishable key
Authorization: Bearer <JWT>
```

**Decision for every route guard: `getUser()`.** `getSession()` must never gate server-side authorization.

**Nuance for design**: `getClaims()` is offered as an equally valid verification path (S9), and the `@supabase/ssr` repo's own current middleware pattern calls `await supabase.auth.getClaims()` to refresh (S6) — it can verify locally for asymmetric keys, avoiding a per-request round trip. **Safe default is `getUser()`**; `getClaims()` is a documented performance option whose per-algorithm semantics were **not** fully verified here.

**Sources**: S6, S8, S9, S10.

## A4 — Magic link end to end — PARTIALLY VERIFIED

**Verified:**
- `signInWithOtp` **supports PKCE for email**; "destination URLs for magic links are determined by the configured site URL and allowed redirect URLs" (S12). PKCE applies.
- The emailed link carries **`token_hash`** + **`type`**. S13: *"The TokenHash included in email templates can also be used to sign in, such as during the PKCE flow for Server Side Auth."*
- Valid email `type` values: `email`, `recovery`, `invite`, `email_change` — **`signup` and `magiclink` are deprecated** (S13). Use `type: 'email'`.
- A **confirmation route is required**. Canonical shape (S11), which ports directly to an Astro endpoint:

```typescript
const token_hash = searchParams.get('token_hash')
const type = searchParams.get('type') as EmailOtpType | null
redirectTo.searchParams.delete('token_hash')   // strip the single-use secret
redirectTo.searchParams.delete('type')
const { error } = await supabase.auth.verifyOtp({ type, token_hash })
```

> **Gotcha**: S11 deliberately deletes `token_hash`/`type` before redirecting onward, to keep the single-use secret out of browser history and referrers. Reproduce that.

- `token_hash` + `verifyOtp` beats the implicit fragment flow: a URL fragment is client-only and unreachable by SSR middleware — structurally incompatible with a server-verified session.
- **Redirect allow-list is mandatory**: "The redirect URL must be added to your Supabase redirect allow list" (S12).

**UNVERIFIED**: the exact redirect option name on `signInWithOtp` (widely `options.emailRedirectTo`) was not returned verbatim; and whether the default email template emits a `token_hash` link or a fragment link — a **likely required dashboard change** (see prerequisites).

**Sources**: S11, S12, S13.

## A5 — THE SHARP QUESTION — VERIFIED. **The posture survives.**

### (b) Does an authenticated JWT grant table access under RLS with zero policies? — **No.**

S14: *"Once enabled, data is inaccessible via the API using a publishable key until policies are defined."*

S15: *"Frontend applications typically use the Data API alongside Row Level Security (RLS) and a publishable key (or legacy anon key). Publishable keys are safe to expose on the frontend because row access permissions are evaluated against RLS access policies and the user's JWT. In contrast, secret and service role keys bypass RLS entirely."*

Access is evaluated against **policies AND the JWT together**. With RLS enabled and **zero policies** there is nothing to grant, so an authenticated JWT grants exactly what an anonymous one does: nothing. `0003_exercises.sql:13` — *"the anon key gets nothing, which is the whole point"* — stays true after auth, and stays true for logged-in users.

**This is the most important result in the pass.** The existing architecture (RLS on, zero policies, all reads via the server's service-role client) needs **no change** to accommodate authentication. Auth adds identity; it does not add client database access. **No RLS policies need to be written for this feature.**

### (a) Must the publishable key reach the browser?

**Verified**: publishable keys are *safe* to expose (S15, S16), and with zero policies additionally powerless — so even the worst case is not a regression. Supabase's Astro quickstart does ship it, storing it as `PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and "Variables prefixed with `PUBLIC_` are exposed to Astro client-side and server-side code" (S21).

**REASONED — design inference, explicitly not a source claim**: S20 builds the client inside a server-side function taking `request` and `cookies`. If every auth call (`signInWithOtp`, `verifyOtp`, `signOut`) happens in Astro API routes and middleware, the key is server-only and needs no `PUBLIC_` prefix. Nothing in the admitted sources *requires* client exposure for a server-rendered magic-link flow. Preferable here, but our inference — design should treat it as a decision to validate, not a certainty.

### (c) Is the new publishable/secret key scheme relevant? — **Yes, an upgrade worth taking.**

S16: *"Publishable keys (format `sb_publishable_...`) have low privileges and are safe to expose in client-side code; Secret keys (format `sb_secret_...`) have elevated privileges, bypass Row Level Security, and must only be used in backend components; `anon` and `service_role` keys are the legacy JWT versions of publishable and secret keys, respectively."*

Functionally equivalent (S17: "The publishable key maintains the same RLS policies and auth behavior") — but with one concrete gain (S17): *"Secret keys return HTTP 401 if invoked from a browser environment."*

This project's entire read path runs on the service-role key. Migrating to a secret key adds a hard, server-enforced guard against the exact accident — a service-role-equivalent key reaching the client — that would be catastrophic given zero RLS policies. **Defence-in-depth worth scoping as a separate small change.**

**Sources**: S14, S15, S16, S17, S20, S21.

## A6 — Session mechanics — VERIFIED, with a critical default to override

### Gotcha: `httpOnly` defaults to **false**

Verbatim (S5):

```typescript
const DEFAULT_COOKIE_OPTIONS = {
  path: "/", sameSite: "lax", httpOnly: false, maxAge: 400 * 24 * 60 * 60,
};
```

**`@supabase/ssr` does not set `httpOnly` for you, and never sets `secure`.** Without explicit `cookieOptions`, session cookies are readable by client JS and sent over plain HTTP. Set both deliberately:

```typescript
createServerClient(url, key, {
  cookies: { getAll, setAll },
  cookieOptions: { httpOnly: true, secure: true, sameSite: "lax", path: "/" },
})
```

The library's own "secure auth token" example shows exactly this shape (S5). Use `sameSite: 'lax'`, **not** `'strict'` — the magic link arrives as a cross-site top-level navigation into the confirm route, and `'strict'` withholds cookies on exactly that navigation.

### Division of responsibility

| Concern | Handled by |
|---|---|
| Large-JWT cookie chunking | **Library** — the stated reason `getAll`/`setAll` exist (S4) |
| Refresh-token rotation | **Library**, but only if middleware calls a session method every request (S6) |
| Sign-out chunk clearing | **Library** — `removeItem` filters chunk-like names, clears with `maxAge: 0` (S7) |
| `httpOnly` / `secure` | **Us** (S5) |
| `sameSite`, `path`, `maxAge` | Library defaults exist; override deliberately (S5) |

### Middleware must actively refresh

Refresh is not passive. S6 calls a session method *before* route code, then flushes pending cookies onto the response:

```typescript
await supabase.auth.getClaims();          // refresh before route code runs
const response = await next();
for (const { name, value, options } of pendingCookies) { /* apply to response */ }
```

Maps cleanly onto Astro's `onRequest(context, next)`. Note S6 buffers cookies then flushes after `next()`; with `AstroCookies`, `cookies.set()` already targets the outgoing response, so buffering may be unnecessary — **confirm during design**.

### Sign-out gotcha

S7 documents a real bug class: with `cookieOptions.domain` set, stale host-only cookies can **resurrect a signed-out session** (the browser sends both scopes; a parser may pick the stale one). The library clears both. Practical rule: **do not set a custom cookie `domain`** without a concrete reason.

**Sources**: S4, S5, S6, S7.

## A7 — `@supabase/ssr` on `@astrojs/netlify` — **UNVERIFIED**

No admitted source addressed the Netlify adapter, Node-vs-Edge runtime, or Netlify cookie header handling. Issue trackers and Netlify docs need the denied class.

Honest gap: **Supabase's official Astro quickstart targets `@astrojs/node`, not `@astrojs/netlify`** (S20), so the recipe is not verified against this project's adapter. `getAll` reads `request.headers.get('Cookie')` — standard `Request` API, a good portability sign — but that is inference, not a verified compatibility claim.

**What would settle it**: `@astrojs/netlify` docs + the `supabase/ssr` issue tracker; or a throwaway Netlify preview-deploy spike.

## A8 — Env vars — PARTIALLY VERIFIED / REASONED

**Verified** (S21), the quickstart's two variables:

```text
PUBLIC_SUPABASE_URL=...
PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

**Reasoned for this codebase** (inference, not a source claim): `src/lib/env.ts` already manages the Supabase URL and service-role key. The genuinely new secret is the **publishable/anon key**, unused by the existing clients. Per A5(a) it can plausibly be server-only rather than `PUBLIC_`-prefixed, following the `OPTIONAL_ENV_KEYS` pattern at `src/lib/env.ts:57-64`. Design owns this.

---

# Lane B — Transactional email — **MOSTLY BLOCKED**

## B1 — Provider comparison — **UNVERIFIED. No recommendation emitted.**

Comparing Resend / Postmark / SendGrid / AWS SES on **current pricing**, **deliverability reputation**, and **SDK ergonomics** requires vendor pages and public reporting — all behind the denied class.

**No provider is named.** Doing so would be exactly the unsourced assertion the constraints forbid, and pricing/deliverability are the claims most likely to be stale in training data. An admitted gap is the correct output.

**What would settle it**: `open-web` access to each vendor's pricing and Node SDK docs.

## B2 — Recommended provider's SDK shape — **UNVERIFIED (blocked by B1)**

No subject until B1 resolves; reporting one provider's SDK would imply a recommendation this research did not earn.

The Netlify half is reasoning-answerable: the SSR entry is already a Node serverless function (`astro.config.mjs:8-13`), and any provider with a plain HTTPS REST API is callable via standard `fetch`. Design inference, not a verified SDK claim.

## B3 — SPF/DKIM/DMARC — **UNVERIFIED**, with two verified adjacent constraints

Generic domain-auth requirements are provider-specific and were not retrievable. But two **verified** hazards from S19 matter regardless of provider:

1. *"disable link tracking when using custom SMTP services to avoid overwriting or deforming confirmation links."* Link tracking rewrites URLs — **a rewritten magic link is a broken magic link.**
2. *"Enterprise email scanners can inadvertently invalidate single-use Supabase Auth magic links by making automatic GET requests. To avoid this, modify the email template to link to a custom domain with an explicit Sign-in button that redirects to the actual magic link URL."*

**Sources**: S19.

## B4 — Bilingual templating — **UNVERIFIED**. Provider-specific; not retrievable.

## B5 — Supabase Auth email: scope, SMTP, shared provider — PARTIALLY VERIFIED

**Confirmed: Auth email is scoped to auth actions only.** The admin link-generation API enumerates its full coverage — `signUp`, `invite`, `magicLink`, `recovery`, `emailChangeCurrent`, `emailChangeNew`. No general-purpose send capability exists. This **confirms** the exploration's Q9 Option B verdict ("wrong tool") for moderation email.

**Confirmed: custom SMTP is configurable** via dashboard or Management API (S18):

```bash
curl -X PATCH "https://api.supabase.com/v1/projects/$PROJECT_REF/config/auth" \
  -d '{ "smtp_host": "...", "smtp_port": 587, "smtp_user": "...", "smtp_pass": "...",
        "smtp_admin_email": "no-reply@example.com", "smtp_sender_name": "..." }'
```

**Rate limits — the common claim needs care.** What S18 actually says: *"After configuring custom SMTP settings, a default rate limit of 30 messages per hour is applied to your project… You can adjust this limit… by visiting the Rate Limits configuration page."*

Read carefully: 30/hour is applied **after** configuring custom SMTP, and it is adjustable. The **built-in sender's own limit was not returned by any admitted source**, so the premise "the built-in sender has strict rate limits" is **UNVERIFIED as stated**. What *is* verified: Supabase applies and exposes a configurable per-project auth email rate limit, and custom SMTP is the supported production path.

**Can one provider serve both?** The architecture is compatible — Supabase Auth consumes **SMTP credentials** (S18); moderation email would use an **HTTP API** from our own route. Any provider offering both surfaces can serve both, collapsing DNS and domain verification into one setup.

Whether a *specific* provider does is a B1 question, and B1 is blocked. So the defensible output is a **selection criterion**: require dual SMTP + API support when choosing. That criterion is itself a real result of this lane — it simply cannot be resolved to a name here.

**Sources**: S18, S19, S34, and the `generateLink` admin reference.

---

# Lane C — `@dnd-kit/sortable` — **PARTIAL**

## C0 — Finding: the official docs now describe a *different package line*

| Line | Imports | Provider | Hook shape |
|---|---|---|---|
| **Classic** (this project) | `@dnd-kit/core`, `@dnd-kit/sortable` | `DndContext` | `useSortable({ id })`, styled via `CSS.Transform.toString(transform)` (S30) |
| **Next-gen** | `@dnd-kit/react`, `@dnd-kit/react/sortable` | `DragDropProvider` | `useSortable({ id, index, group, type, accept })` → `{ ref }` (S32) |

The Context7 entry carries version tag `_dnd_kit_react_0_1_21`, and sensor docs use next-gen style (`KeyboardSensor.configure({...})`, S31). `DropRenderer.tsx` is on the **classic** line with `@dnd-kit/core@^6.3.1`.

> **Implication**: copying from the current dnd-kit site risks importing next-gen API into a classic-API codebase. Pin docs to the classic line; treat any `DragDropProvider` / `@dnd-kit/react` example as **not applicable**.

## C1 — Version and peer compatibility — **UNVERIFIED**

Versions and `peerDependencies` live on npm — the denied class.
**What would settle it**: `npm view @dnd-kit/sortable version peerDependencies`. One command, seconds.

## C2 — Minimal correct usage — PARTIALLY VERIFIED

Classic `useSortable` confirmed (S30):

```javascript
import {useSortable} from '@dnd-kit/sortable';
import {CSS} from '@dnd-kit/utilities';

export function Item({id}) {
  const {attributes, listeners, setNodeRef, transform, transition} = useSortable({id});
  const style = { transform: CSS.Transform.toString(transform), transition };
  return <div ref={setNodeRef} style={style} {...attributes} {...listeners} />;
}
```

Note this pulls `@dnd-kit/utilities` for `CSS` — a **second** package. The exploration's "one small dependency" framing is slightly optimistic; budget two.

**UNVERIFIED**: `SortableContext` (props, required `strategy`) and `arrayMove` were not returned. The minimal usage is therefore **incomplete** — the wrapper and the reorder helper, the two pieces that actually do the sorting, are unconfirmed.

## C3 — Keyboard accessibility — PARTIALLY VERIFIED

Default bindings (S31):

```ts
const defaultKeyboardCodes = {
  start: ['Space','Enter'], cancel: ['Escape'], end: ['Space','Enter','Tab'],
  up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'],
};
```

S33, load-bearing: *"When replacing defaults, it is critical to include the KeyboardSensor to maintain accessibility for keyboard users."* `DropRenderer.tsx` already registers `KeyboardSensor` — the existing pattern is correct; repeat it.

Directly useful for an authoring UI whose draggable blocks contain text inputs (S31):

```ts
KeyboardSensor.configure({
  preventActivation: (event, source) => event.target instanceof HTMLInputElement,
})
```

Without an equivalent, **pressing Space inside a block's textarea starts a drag instead of typing a space** — a concrete bug the authoring UI would otherwise ship.

**Caveat**: S31/S33 are next-gen pages. The *concept* transfers; the **classic-line API for suppressing activation is UNVERIFIED**. Design must confirm the classic equivalent.

**Free vs ours**: arrow-key movement, start/end/cancel bindings, and screen-reader announcement plumbing ship with the library; input-focus suppression and domain-specific announcements are ours.

## C4 — Maintenance status — PARTIALLY VERIFIED

An actively documented next-gen `@dnd-kit/react` line indicates the project is **actively developed**, not abandoned — a positive adoption signal.

**UNVERIFIED**: release cadence, last-publish dates, issue health, and whether the classic line is maintenance-only. Requires GitHub/npm.

**Alternatives**: resolution surfaced `@hello-pangea/dnd` (maintained `react-beautiful-dnd` fork, "powerful keyboard and screen reader support"). **Named for completeness only** — not evaluated here, and switching drag-and-drop vendors when `@dnd-kit/core` is installed and working would be a poor trade absent a specific reason.

---

# Lane D — Postgres generated columns — **SUBSTANTIALLY ANSWERED**

## D1 — Supabase's Postgres version — **UNVERIFIED**; support floor confirmed

The hosted default version was not returned by any admitted source. But the question that matters *is* answered: STORED generated columns require **PostgreSQL 12 or newer** (S29, verbatim: "Requires PostgreSQL 12 or newer"). PG12 is long EOL and Supabase has shipped 15+ for years, so the practical risk is **negligible**.

**What would settle it**: `select version();` — ten seconds. Not a research blocker.

## D2 — Partial index on a generated column — VERIFIED, with a new gotcha

`CREATE INDEX` accepts `[ WHERE predicate ]` for "a partial index containing entries for only a subset of the table" (S27). And S24's enumerated restrictions on generated columns — immutable functions only, no subqueries, current row only, no reference to another generated column or system columns (except `tableoid`), no default, no identity, not a partition key — **do not include indexing**.

### Gotcha 1 — current Postgres defaults generated columns to **VIRTUAL**

S24: *"By default, the generated column is virtual, but it can be specified as STORED or VIRTUAL explicitly."*
S26: *"VIRTUAL generated columns are computed on read, consume no disk storage… STORED generated columns are evaluated on write and stored on disk."*

This is a **recent behavioural change**. In PG 12–17 `STORED` was mandatory and omitting it was a syntax error; in current PG, omitting it silently yields a VIRTUAL column.

**The migration MUST write `STORED` explicitly.** The exploration's DDL already does — keep it exactly so, and treat the keyword as load-bearing, not decorative. (Whether VIRTUAL can back a partial index was not verified and does not matter, since we specify STORED.)

### Gotcha 2 — partial-index matching may not survive PostgREST

S28, verbatim: *"PostgreSQL supports partial indexes with arbitrary predicates over a table's columns, but a query can only use the index if its WHERE condition mathematically implies the index predicate. Because predicate matching occurs during query planning rather than at runtime, **parameterized query clauses generally do not match partial indexes**."*

The three read sites call `.eq('published', true)` through supabase-js → PostgREST. If PostgREST emits that **parameterized** rather than as a literal, the planner may **fail to match** `WHERE published` and skip the index.

Note this risk **already exists today** — `published` is plain now and the index is already partial. Going generated does not create it. But it is a genuine, previously unflagged performance question, and this feature is the right moment to measure it.

**What would settle it**: `EXPLAIN` the query PostgREST actually emits; confirm `Index Scan using exercises_level_focus_published_idx`.

**Sources**: S24, S26, S27, S28.

## D3 — PostgREST filtering on a generated column — **UNVERIFIED**

No admitted source addressed PostgREST's handling of generated columns.

**Reasoned expectation** (inference, not a source claim): a STORED generated column is physically stored and visible in `information_schema`, and PostgREST builds its schema cache from the catalog, so `.eq('published', true)` should behave identically. What genuinely changes is **writes**: a generated column cannot be inserted or updated directly, so any path writing `published` will start erroring.

> **Action for design**: grep every **write** to `published` before this migration lands. The exploration verified three *read* sites (`exercises.ts:141`, `:250`, `:356`) but never enumerated writes. Seed SQL and any authoring insert path are the likely offenders. **This is the most probable way this migration breaks something.**

## D4 — Migration safety — VERIFIED. **The premise was correct.**

### No `ALTER COLUMN ... SET GENERATED` exists for adding a generation expression

The current `ALTER TABLE` synopsis (S25) documents exactly two generation-expression operations: *"SET EXPRESSION AS replaces the generation expression for a generated column and rewrites existing data in stored generated columns. DROP EXPRESSION converts a stored generated column into a normal base column, retaining existing data while disabling future automatic generation."*

- `SET EXPRESSION AS` operates on a column that is **already generated** — it cannot promote a plain one.
- `DROP EXPRESSION` goes the **wrong direction** (generated → plain).

No clause converts plain → generated. **Premise confirmed.** Confidence high — this is the authoritative synopsis. Strictly, this is absence-of-evidence within an enumerated synopsis rather than an explicit prohibition, which is the strongest form such a claim takes.

### Required procedure

`ADD COLUMN ... GENERATED ... STORED` **is** supported (S29). So the path is drop-and-re-add:

```sql
-- 1. drop the dependent partial index EXPLICITLY (do not rely on CASCADE)
DROP INDEX IF EXISTS exercises_level_focus_published_idx;

-- 2. drop the plain column
ALTER TABLE exercises DROP COLUMN published;

-- 3. re-add generated — STORED is load-bearing (see D2)
ALTER TABLE exercises
  ADD COLUMN published boolean
  GENERATED ALWAYS AS (status = 'published') STORED;

-- 4. recreate the partial index
CREATE INDEX exercises_level_focus_published_idx
  ON exercises (level, focus) WHERE published;
```

> **Why explicit `DROP INDEX` over `DROP COLUMN ... CASCADE`**: `CASCADE` drops the index *silently*. If step 4 is forgotten or fails, you lose the index with no error — a silent regression on the hot read path. Explicit dropping makes the dependency visible in the migration and in review.

### Expression legality — VERIFIED

Checking `(status = 'published')` against S24's restrictions: immutable (`text = text`) ✅; no subquery ✅; current row only ✅; `status` is not itself generated ✅; no system columns ✅; no default/identity ✅; table not partitioned ✅. **Legal.**

### Impact on 300+ rows — VERIFIED and benign

S25 Notes: *"adding a column with a volatile default, an identity column, **a stored generated column**, or a constrained domain type causes the entire table and its indexes to be rewritten."* The migration **does** rewrite the table; at ~300 rows this is instantaneous.

**Data safety** hinges on one ordering rule:

1. Add `status`, backfill from current `published` (`case when published then 'published' else 'draft' end`), set `NOT NULL`.
2. **Only then** drop the index, drop `published`, re-add it generated.

Backfilling `status` *after* dropping `published` destroys the source of truth and silently turns all 300 rows into drafts. **This ordering is the single highest-risk detail in the migration.**

### One transaction? — **UNVERIFIED**

Postgres DDL is transactional as a general matter, but no admitted source stated it for this sequence and I will not assert it from memory.
**What would settle it**: wrap in `BEGIN; … COMMIT;` on a branch database and observe. At 300 rows, testing beats citing.

**Sources**: S24, S25, S26, S27, S29.

---

## Contradictions found

| # | Contradiction | Resolution |
|---|---|---|
| 1 | Supabase's Astro quickstart (S20) uses `@supabase/ssr`; Astro's own guide (S22) uses manual `sb-access-token` cookies. Two official publishers, two recipes. | Prefer S20 — maintained by the party that owns the auth system, and it delegates refresh/chunking/PKCE. S22's cookie flags are additionally insecure as published. |
| 2 | S3 defines `setAll(cookies, headers)` with two required params; S20's own example implements one. | Implement both per the type contract (S3); treat S20 as abbreviated. |
| 3 | S9 recommends `getClaims()` **or** `getUser()`; S8 says `getUser()` "should always be used" server-side; S6's middleware uses `getClaims()`. | Use `getUser()` for authorization (strongest, most explicit guidance). `getClaims()` is a documented alternative not fully verified here. |
| 4 | dnd-kit docs mix classic (`DndContext`) and next-gen (`DragDropProvider`) APIs across pages. | This project is classic-line. Transfer concepts, not code. |

## Uncertainty and freshness

- **Freshness**: all sources retrieved 2026-09-12 from the Context7 index, which mirrors publisher docs rather than fetching live. Drift is possible and unmeasured.
- **No version stamps**: npm was unreachable, so **no claim here is pinned to a package version**. `@supabase/ssr` shape comes from the repo's `main`; `@dnd-kit/sortable` has no version evidence at all.
- **PostgreSQL "current" channel**: the VIRTUAL-by-default behaviour (D2 Gotcha 1) is recent-version behaviour — precisely why the live server version (D1) should be confirmed before writing the migration.
- **Four Supabase reference URLs** have unreliable anchors; content corroborated, URLs not citable verbatim.

---

## Decisions this research unblocks

| Exploration ref | Decision | Supported? |
|---|---|---|
| **Q1** auth approach | `@supabase/ssr` + `createServerClient` wired to `AstroCookies` (Option B), now backed by a **first-party Supabase quickstart for Astro** | ✅ Unblocked |
| **Q1** session verification | `getUser()` for all server-side authorization; never `getSession()` | ✅ Unblocked |
| **Q1** magic link viability | Viable: PKCE supported for email; `token_hash` + `verifyOtp` on a server confirm route; use `type: 'email'` (`magiclink` deprecated) | ✅ Unblocked |
| **Q1** security posture | **RLS-on + zero-policies survives auth unchanged.** No RLS policies needed for this feature | ✅ Unblocked — lower risk than assumed |
| **Q6** roles via service-role reads | Reinforced: authenticated JWTs grant no table access, so server-side role lookup stays the only workable model. Option B stands | ✅ Reinforced |
| **Q5 / D** `published` generated | Valid. Expression legal, STORED supported, partial index survives, rewrite trivial at this size. Procedure specified | ✅ Unblocked, 3 named hazards |
| **Q8 / C** block reordering | Classic `useSortable` confirmed; `SortableContext`, `arrayMove`, version compatibility not | ⚠️ Partial — do not finalize the dependency |
| **Q9 / B** email provider | No recommendation | ❌ Still blocked |
| **Q9** Auth email wrong tool for moderation mail | Confirmed — scoped to signup/invite/magiclink/recovery/email-change | ✅ Unblocked |

### Guidance for `sdd-design`

- **Lane A may be designed against.** The foundation is solid.
- **Lane D may be designed against**, with the three hazards (explicit `STORED`, backfill ordering, write-site audit) as explicit task requirements.
- **Lane B must NOT be designed against.** Do not name a provider. Either re-run research with working `open-web`, or have the owner choose — arguably a product decision anyway.
- **Lane C**: design the reordering *behaviour*; leave exact `@dnd-kit/sortable` wiring as an implementation detail confirmed at install time.

---

## Remaining unknowns

| # | Unknown | Lane | What would settle it |
|---|---|---|---|
| 1 | Email provider choice, pricing, deliverability | B1–B4 | `open-web` vendor docs — **or an owner decision**, since this is largely a product choice |
| 2 | `@supabase/ssr` on `@astrojs/netlify` | A7 | Netlify adapter docs + `supabase/ssr` issues; or a 30-min preview-deploy spike |
| 3 | Exact `signInWithOtp` redirect option name | A4 | The `signInWithOtp` JS reference page |
| 4 | Whether the default magic-link template emits `token_hash` or a fragment link | A4 | Supabase dashboard → Auth → Email Templates |
| 5 | `@dnd-kit/sortable` version + peer range | C1 | `npm view @dnd-kit/sortable version peerDependencies` |
| 6 | `SortableContext` props and `arrayMove` signature | C2 | Classic-line docs, or package typings after install |
| 7 | Classic-line equivalent of `preventActivation` | C3 | Same as #6 |
| 8 | Project's actual Postgres version | D1 | `select version();` |
| 9 | PostgREST filtering/**writing** on generated columns | D3 | PostgREST docs or a spike; **plus a repo-wide grep for writes to `published`** |
| 10 | Whether the migration runs in one transaction | D4 | Wrap in `BEGIN; … COMMIT;` on a branch DB and observe |
| 11 | Built-in Supabase Auth sender's own rate limit | B5 | Supabase rate-limits documentation |

**Unknowns 5, 8, 9 and 10 are resolvable inside this repo or with a single command** — no further research run needed. Only 1, 2, 3, 4, 6, 7 and 11 require external access.

---

## Owner prerequisites

Start these now — several carry multi-day external lead time and gate implementation.

### Immediate — blocks Lane A implementation

| # | Prerequisite | Where | Lead | Src |
|---|---|---|---|---|
| 1 | **Add redirect URLs to the Supabase allow-list** — local dev, the Netlify deploy-preview pattern, and production. A URL not on this list **silently fails**. | Dashboard → Authentication → URL Configuration | Minutes | S12 |
| 2 | **Set the Site URL** — magic-link destinations derive from it plus the allow-list. | Same page | Minutes | S12 |
| 3 | **Inspect the magic-link email template**: does it emit a `token_hash` link or an implicit fragment link? The server-side flow requires `token_hash`; the template may need editing. | Dashboard → Authentication → Email Templates | Minutes | S11, S13 |
| 4 | **Report `select version();`** — settles unknown #8 and confirms the STORED/VIRTUAL default that Lane D's migration depends on. | SQL editor | Seconds | S24, S29 |

### High lead time — start today

| # | Prerequisite | Why slow | Src |
|---|---|---|---|
| 5 | **Choose an email provider.** Research could not recommend one; everything below depends on it. **Impose this criterion: the provider must offer both an HTTP API and SMTP credentials**, so one provider and one verified domain serve both moderation email and Supabase Auth email. | Blocks 6–9 | B5 |
| 6 | **Create the account and verify the sending domain.** | Provider-side review: hours to days | — |
| 7 | **Publish SPF, DKIM and DMARC DNS records.** Registrar access plus propagation — not a code task, and the classic source of "we're ready except email doesn't deliver." | Hours to 48h | — |
| 8 | **Configure custom SMTP in Supabase Auth** once 6–7 are done. Note the default **30 messages/hour** limit applied after configuring custom SMTP; adjustable on the Rate Limits page. | Minutes, gated on 7 | S18 |
| 9 | **Disable link tracking** on any domain sending Supabase Auth email. Tracking rewrites URLs and **deforms magic links**, breaking sign-in. | Minutes, easy to forget | S19 |

### Design-time decisions for the owner

| # | Decision | Context |
|---|---|---|
| 10 | **Magic-link email-scanner mitigation.** Enterprise scanners issue automatic GETs that consume single-use links, so the user's own click fails. Supabase's documented mitigation is a template linking to a custom page with an explicit "Sign in" button. Accept the risk in v1, or build the interstitial? | S19 |
| 11 | **Adopt the new publishable/secret API keys?** Secret keys return HTTP 401 from a browser — a hard guard against leaking a service-role-equivalent key, valuable given zero RLS policies. Scope as a small separate change. | S16, S17 |
| 12 | **Account recovery for magic-link auth.** Exploration surfaced this (requirement #1); nothing here resolves it. With magic link, losing email access means losing the account outright. | Exploration |

---

## Product choices (non-authoritative, separate from evidence)

`pending`. No product decision is made or implied. The evidence above supports technical decisions only; product discovery is orchestrator-owned.

Two prerequisites are genuinely product decisions and should route to the owner, not to design: **#5** (email provider) and **#12** (account recovery).

---

## Readiness

| Field | Value |
|---|---|
| Research outcome | `partial` |
| Evidence validity | valid for the admitted `documentation` class; **no claims emitted for the denied `open-web` class** |
| `proposal_ready` | **false** |

Per the readiness matrix, **any `partial` outcome is denied readiness** regardless of store or decision state. `sdd-propose` must not be invoked from this state.

**Two viable paths** — an orchestrator/owner choice:

1. **Re-run research** with a working `open-web` tool to close Lane B and unknowns 2, 3, 6, 7, 11.
2. **Accept the partial result and re-scope.** Lane B is substantially a *product* decision (which vendor to pay). If the owner picks a provider, Lane B stops being a research question. Lanes A and D — the two that actually gate architecture — are answered well enough to design against today.

Path 2 is likely the better use of time. Lane A was the blocking lane, and Lane A is done.
