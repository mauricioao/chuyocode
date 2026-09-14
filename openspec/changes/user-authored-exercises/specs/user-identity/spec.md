# User Identity Specification

## Purpose

Establishes magic-link authentication with a server-verified session. Every request resolves identity server-side into `context.locals.user`, and that resolution — not any client-side signal — drives which markup gets rendered and which mutations are allowed.

## Requirements

### Requirement: Magic Link Sign-In

The system MUST let a visitor request a sign-in link by submitting an email address, with no password.

#### Scenario: Visitor requests a magic link

- GIVEN an unauthenticated visitor on the sign-in page
- WHEN they submit a valid email address
- THEN the system sends a magic-link email containing a `token_hash` link
- AND the response does not reveal whether that email already has an account

### Requirement: Server-Side Magic Link Confirmation

The system MUST confirm a magic link through a server route that calls `verifyOtp({ type: 'email', token_hash })`. It MUST NOT depend on the client-side implicit fragment flow.

#### Scenario: Visitor clicks a valid magic link

- GIVEN a visitor received a magic-link email
- WHEN they open the link and the server confirm route verifies the `token_hash`
- THEN the visitor's session is established server-side
- AND the redirect URL no longer contains `token_hash` or `type`

#### Scenario: Visitor clicks an expired or already-used link

- GIVEN a magic link that has expired or was already consumed
- WHEN the visitor opens it
- THEN the confirm route rejects the token and no session is created
- AND the visitor sees a message inviting them to request a new link

### Requirement: Session Verification via getUser()

The system MUST resolve the caller's identity per request by calling `getUser()`. No server-side authorization decision MAY be based on `getSession()`.

#### Scenario: Authenticated request resolves identity server-side

- GIVEN a request carrying a valid session cookie
- WHEN middleware runs
- THEN `context.locals.user` is populated from a `getUser()` call

#### Scenario: Tampered or stale session cookie is rejected

- GIVEN a request carrying a session cookie that `getUser()` rejects
- WHEN middleware runs
- THEN `context.locals.user` is null and every downstream check treats the request as unauthenticated

### Requirement: Render Gating for Authenticated-Only UI

The system MUST decide, server-side and before render, whether to include authenticated-only markup. An unauthenticated visitor MUST NOT receive that markup in the HTML response under any hiding mechanism.

#### Scenario: Unauthenticated visitor requests a page with an authenticated-only section

- GIVEN `context.locals.user` is null
- WHEN the server renders a page containing an authenticated-only section (e.g. the "my exercises" entry point)
- THEN the response HTML does not contain that section's markup
- AND no CSS class or client-side script is relied on to hide it instead

### Requirement: Auth State as a Server-Provided Prop

A React island MUST receive auth state as a prop passed down from the server render. An island MUST NOT resolve identity itself.

#### Scenario: Island renders using server-supplied auth state

- GIVEN a page renders an interactive island that needs to know whether the viewer is signed in
- WHEN the server renders the page
- THEN the auth state is passed to the island as a prop
- AND the island's code contains no path that queries Supabase for the current user on its own

### Requirement: Session Cookie Security

The system MUST set session cookies with `httpOnly: true`, `sameSite: 'lax'`, and `path: '/'`. These three flags are unconditional and MUST NOT vary by environment.

The `secure` flag is environment-qualified. In production the system MUST set `secure: true`. In local development over `http://` the system MAY set `secure: false`, because a browser discards a `Secure` cookie on a non-HTTPS origin, which would make local sign-in impossible. This mirrors the existing house rule at `src/pages/api/me-gusta/[id].ts:107`.

The library default MUST NOT be relied on: `@supabase/ssr`'s `DEFAULT_COOKIE_OPTIONS` ship `httpOnly: false` and never set `secure`, so every flag above MUST be set explicitly.

#### Scenario: Session cookie is issued on sign-in in production

- GIVEN a visitor completes magic-link confirmation
- AND the deployment is production
- WHEN the session cookie is set
- THEN the cookie has `httpOnly=true`, `secure=true`, `sameSite=lax`, and `path=/`

#### Scenario: Session cookie is issued on sign-in in local development

- GIVEN a visitor completes magic-link confirmation
- AND the deployment is local development served over `http://`
- WHEN the session cookie is set
- THEN the cookie has `httpOnly=true`, `sameSite=lax`, and `path=/`
- AND `secure` is false, so the browser retains the cookie and sign-in completes

#### Scenario: Library cookie defaults are never inherited

- GIVEN the session client is constructed
- WHEN its cookie options are inspected
- THEN `httpOnly` is set explicitly rather than left at the library default of `false`

### Requirement: Sign-Out

The system MUST let a signed-in user end their session.

#### Scenario: Signed-in user signs out

- GIVEN an authenticated user
- WHEN they trigger sign-out
- THEN their session cookie is cleared
- AND subsequent requests from that browser are treated as unauthenticated
</content>
