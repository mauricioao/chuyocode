# User Roles Specification

## Purpose

Provides many-to-many role assignment and server-side role authorization for moderation surfaces. Role-gated access is always a role check, never a hardcoded identity check.

## Requirements

### Requirement: Role Assignment Storage

The system MUST store role assignments in a many-to-many relation associating a user with one or more roles.

#### Scenario: A user is granted the moderator role

- GIVEN a user with no roles
- WHEN a `moderator` role row is inserted for that user
- THEN a subsequent role check for that user returns `moderator`

#### Scenario: A user's role is revoked

- GIVEN a user with the `moderator` role
- WHEN their role row is deleted
- THEN a subsequent role check for that user no longer returns `moderator`

### Requirement: Server-Side Role Authorization

The system MUST check a caller's role server-side, via the service-role client, for every role-gated action. The system MUST NOT gate access by a hardcoded user identity.

#### Scenario: Non-moderator requests the moderation dashboard

- GIVEN a signed-in user with no `moderator` role
- WHEN they request the moderation dashboard route
- THEN the server denies access and renders no moderation markup

#### Scenario: Moderator requests the moderation dashboard

- GIVEN a signed-in user with the `moderator` role
- WHEN they request the moderation dashboard route
- THEN the server grants access and renders the moderation queue

### Requirement: Moderation Endpoints Re-Verify Role Independently of the UI

Every mutating moderation API route MUST independently re-check the caller's role server-side, regardless of whether the UI that would normally trigger the call is reachable.

#### Scenario: Direct unauthenticated request to a moderation endpoint

- GIVEN no session cookie is present
- WHEN a POST request is sent directly to a moderation mutating endpoint (hide, remove, or notify)
- THEN the server rejects the request with an authorization error
- AND no exercise state changes

#### Scenario: Direct request from an authenticated non-moderator

- GIVEN a signed-in user without the `moderator` role
- WHEN they send a direct POST request to a moderation mutating endpoint
- THEN the server rejects the request with an authorization error
- AND no exercise state changes
</content>
