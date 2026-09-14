# Exercise Moderation Specification

## Purpose

Defines the moderation dashboard: the auditing queue, manual hide, soft removal, author notification, and the audit log. Access is role-gated; every mutating action is logged and independently re-verified server-side.

## Requirements

### Requirement: Moderation Queue Lists Auditing Exercises

The moderation dashboard MUST list exercises with `status = 'auditing'`, accessible only to users with the `moderator` role.

#### Scenario: Moderator opens the queue

- GIVEN two exercises with `status = 'auditing'`
- WHEN a moderator opens the moderation dashboard
- THEN both exercises appear in the queue

### Requirement: Manual Hide Records Who and When

A moderator hiding an exercise MUST set `hidden_at` and `hidden_by` together, in the same action.

#### Scenario: Moderator hides an exercise

- GIVEN an exercise in the queue
- WHEN a moderator hides it
- THEN `hidden_at` is set to the action time and `hidden_by` is set to that moderator's identity
- AND the exercise becomes invisible

### Requirement: Removal Is Soft and Logged

Removing an exercise from moderation MUST set `status = 'removed'` and MUST write a row to the moderation action log.

#### Scenario: Moderator removes an exercise

- GIVEN an exercise in the queue
- WHEN a moderator removes it
- THEN its status becomes `removed`
- AND an `exercise_moderation_actions` row records the moderator, the action, and the timestamp

### Requirement: Author Notification on needs_work or Removal

Setting an exercise to `needs_work`, or removing it, MUST trigger a transactional email to its author via Resend.

#### Scenario: Moderator flags an exercise as needs_work

- GIVEN a moderator identifies a fixable issue in an auditing exercise
- WHEN they set it to `needs_work` and the notify action runs
- THEN the author receives an email describing the issue

### Requirement: Moderation Mutating Endpoints Independently Verify the Caller

Every mutating moderation endpoint (hide, remove, notify) MUST independently re-verify the caller's session and `moderator` role server-side, regardless of whether the dashboard UI is reachable.

#### Scenario: Direct unauthenticated request to a moderation endpoint

- GIVEN no session cookie is present
- WHEN a POST request is sent directly to the hide, remove, or notify endpoint
- THEN the server rejects the request and no exercise state changes

#### Scenario: Direct request from an authenticated non-moderator

- GIVEN a signed-in user without the `moderator` role
- WHEN they send a direct POST request to a moderation mutating endpoint
- THEN the server rejects the request and no exercise state changes
</content>
