# Exercise Reactions Specification

## Purpose

Defines identity-backed per-user reactions, the dislike reason taxonomy, and the tunable, quality-reason-only threshold that flips an exercise into `auditing`.

## Requirements

### Requirement: One Reaction Per User Per Exercise

The system MUST enforce exactly one reaction row per `(user_id, exercise_id)` pair, identified by the authenticated user, never by a cookie or anonymous token.

#### Scenario: Signed-in user reacts to an exercise

- GIVEN an authenticated learner who has not reacted to exercise X
- WHEN they submit a dislike with reason `wrong_answer`
- THEN a reaction row is created for `(user_id, exercise_id=X)`

#### Scenario: Signed-in user changes their existing reaction

- GIVEN an authenticated learner who already disliked exercise X with reason `typo`
- WHEN they submit a new reaction with reason `ambiguous` for exercise X
- THEN the existing row is updated in place, and the unique constraint is preserved

#### Scenario: Unauthenticated visitor cannot react

- GIVEN no session cookie
- WHEN a request attempts to submit a reaction
- THEN the server rejects it and no reaction row is created

### Requirement: Dislike Reason Taxonomy

Every dislike MUST carry exactly one reason from `ambiguous`, `wrong_answer`, `too_hard`, or `typo`.

#### Scenario: Dislike without a valid reason is rejected

- GIVEN an authenticated learner submitting a dislike
- WHEN no reason, or a reason outside the taxonomy, is provided
- THEN the reaction is rejected

### Requirement: Only Quality-Defect Reasons Count Toward the Audit Threshold

Dislikes with reason `ambiguous`, `wrong_answer`, or `typo` MUST count toward the audit threshold. Dislikes with reason `too_hard` MUST NOT count toward it.

#### Scenario: too_hard dislikes accumulate without triggering auditing

- GIVEN a `live` exercise and a configured threshold of N
- WHEN it receives N `too_hard` dislikes and zero dislikes of any other reason
- THEN `status` remains `live`

#### Scenario: Quality-reason dislikes reach the threshold and trigger auditing

- GIVEN a `live` exercise and a configured threshold of N
- WHEN it receives N dislikes combined across `ambiguous`, `wrong_answer`, and `typo`
- THEN `status` becomes `auditing`, atomically with the triggering reaction

### Requirement: Threshold Is Configurable Data

The audit threshold MUST be stored in a single-row configuration table, writable only by the service role, and read at trigger time. Changing it MUST NOT require a deploy.

#### Scenario: Threshold is updated without a deploy

- GIVEN the current threshold is 5
- WHEN an operator updates the config table's threshold value to 10 via SQL
- THEN an exercise that would have reached `auditing` at 5 quality-reason dislikes does not, and reaching `auditing` now requires 10
</content>
