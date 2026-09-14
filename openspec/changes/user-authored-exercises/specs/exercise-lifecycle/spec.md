# Exercise Lifecycle Specification

## Purpose

Defines the `status` state machine, the generated `visible` column, ownership, soft delete, and edit-after-publish behavior. Load-bearing rule: automatic entry into `auditing` is a lifecycle move, never a visibility move. Only an explicit, auditable moderator action hides an exercise.

## Requirements

### Requirement: Exercise Status Lifecycle

Each exercise MUST have a `status` of exactly one of `draft`, `live`, `auditing`, `needs_work`, or `removed`.

#### Scenario: New exercise starts as draft

- GIVEN an author begins creating an exercise
- WHEN it is first saved
- THEN its status is `draft`

#### Scenario: Publishing transitions draft to live

- GIVEN a draft exercise that passes structural validation
- WHEN the author publishes it
- THEN status becomes `live` and `published_at` is set

### Requirement: Generated Visibility Column

The system MUST derive `visible` as `status in ('live', 'auditing') and hidden_at is null`, stored as a generated column.

#### Scenario: A live exercise with no hide record is visible

- GIVEN `status = 'live'` and `hidden_at = null`
- WHEN `visible` is evaluated
- THEN it is `true`

#### Scenario: Direct write to visible is rejected

- GIVEN any exercise row
- WHEN a write attempts to set `visible` directly
- THEN it is rejected because the column is generated

### Requirement: Auditing Exercises Remain Visible

Automatic entry into `auditing` MUST NOT remove an exercise from any read path. It MUST stay reachable at its deep link and in facet, list, and related queries while `status = 'auditing'`.

#### Scenario: An exercise flips to auditing and is still reachable by direct link

- GIVEN `status = 'live'`
- WHEN quality-reason dislikes cross the threshold and status becomes `auditing`
- THEN a request for its deep-link slug still returns the exercise, with `visible = true`

#### Scenario: An auditing exercise still appears in facet and related queries

- GIVEN `status = 'auditing'`
- WHEN a learner browses the facet grid or a related-exercises list matching its level and focus
- THEN the exercise is included in the results

### Requirement: Manual Hide Is the Only Path to Invisibility

An exercise MUST become invisible only through an explicit moderator action that records `hidden_at` and `hidden_by` together. No automatic process may set these fields.

#### Scenario: A moderator hides an exercise

- GIVEN `status = 'auditing'`
- WHEN a moderator sets `hidden_at` and `hidden_by`
- THEN `visible` becomes `false` and the exercise no longer appears in any read path

#### Scenario: Dislikes alone never set hidden_at

- GIVEN an exercise crossing the audit threshold
- WHEN the threshold trigger fires
- THEN `hidden_at` and `hidden_by` remain null; only `status` changes to `auditing`

### Requirement: Exercise Ownership

Each exercise MUST have an `author_id`. An author MUST be able to edit only exercises they own.

#### Scenario: Author edits their own exercise

- GIVEN an author who owns exercise X
- WHEN they open the edit flow for X
- THEN it loads and allows changes

#### Scenario: Author attempts to edit another author's exercise

- GIVEN an author who does not own exercise Y
- WHEN they send a direct request to edit Y
- THEN the server rejects it with an authorization error

### Requirement: Soft Delete Only

Removing an exercise MUST set `status = 'removed'`. The system MUST NOT hard-delete an exercise row through any user-facing or moderation action.

#### Scenario: A moderator removes an exercise

- GIVEN an exercise visible to learners
- WHEN a moderator removes it
- THEN status becomes `removed`, the row still exists, and `visible` becomes `false`

### Requirement: Editing a Published Exercise Re-Validates and Clears needs_work

Saving an edit to a `live` or `needs_work` exercise MUST re-run the structural validator. Successful re-validation of a `needs_work` exercise MUST clear it back to `live`.

#### Scenario: Author fixes a needs_work exercise

- GIVEN `status = 'needs_work'`
- WHEN the author edits it and validation passes
- THEN `status` returns to `live`

#### Scenario: Author edits a live exercise and introduces a structural error

- GIVEN `status = 'live'`
- WHEN the author saves an edit that fails validation
- THEN the edit is rejected and `status` remains `live`

### Requirement: Slug Collision Handling

On publish, a slug colliding with an existing `(level, focus, slug)` MUST be retried once with a short suffix; the system MUST show the author the final resolved URL before publish completes.

#### Scenario: Slug is unique on first attempt

- GIVEN a slug with no existing match at that level and focus
- WHEN publish runs
- THEN the exercise publishes with that slug and the author sees that URL

#### Scenario: Slug collides and is retried once

- GIVEN a slug colliding with an existing one at the same level and focus
- WHEN the publish flow retries with a short suffix
- THEN the exercise publishes under the suffixed slug and the author sees it before completion

### Requirement: Account Deletion Preserves Exercises

Deleting a user from `auth.users` MUST succeed. Exercises they authored MUST survive with their author reference moved to a placeholder.

#### Scenario: An author's account is deleted

- GIVEN a user who authored one or more live exercises
- WHEN their account is deleted
- THEN deletion succeeds and their exercises remain reachable, with `author_id` referencing a placeholder
</content>
