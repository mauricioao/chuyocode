# Exercise Authoring Specification

## Purpose

Defines the authoring UI: plain-textarea block editing with live gap parsing, drag-reorder, the publish flow, terms acceptance, and "my exercises." Every mutating route re-verifies the caller server-side.

## Requirements

### Requirement: Authoring Uses a Plain Textarea with Live Gap Parsing

The authoring UI MUST use a plain `<textarea>` for sentence input, live-parsed against `BLANK_MARKER` as the author types.

#### Scenario: Author sees gap feedback while typing

- GIVEN an author editing a row block's sentence in the authoring UI
- WHEN they type a run of 3 or more underscores
- THEN the UI immediately reflects the detected gap, with no page reload or explicit "parse" action

### Requirement: Blocks Can Be Reordered

The authoring UI MUST allow an author to reorder blocks within an exercise before publish.

#### Scenario: Author reorders two blocks

- GIVEN an exercise draft with blocks in order [A, B]
- WHEN the author drags block B above block A
- THEN the saved block order becomes [B, A]

### Requirement: Publish Flow Validates, Resolves Slug, and Shows Final URL

Publishing MUST run the structural validator, resolve slug collisions, and show the author the final resolved URL before completing.

#### Scenario: Author completes a successful publish

- GIVEN a draft exercise that passes validation and has a unique slug
- WHEN the author confirms publish
- THEN the exercise becomes `live` and the author sees the resulting URL

### Requirement: Terms Acceptance Recorded on First Publish

The system MUST record terms acceptance the first time an author publishes any exercise, and MUST NOT require re-acceptance on subsequent publishes.

#### Scenario: First-time author accepts terms

- GIVEN an author who has never published before
- WHEN they publish their first exercise having checked the terms checkbox
- THEN acceptance is recorded against their account
- AND their next publish does not present the checkbox again

#### Scenario: Author attempts first publish without accepting terms

- GIVEN a first-time author who has not checked the terms checkbox
- WHEN they attempt to publish
- THEN publish is blocked until the checkbox is checked

### Requirement: My Exercises Lists Own Work by Status with an Edit Entry

"My exercises" MUST list only the authenticated author's own exercises, filterable by `draft`, `live`, and `needs_work`, each with an entry point to edit.

#### Scenario: Author views their exercise list

- GIVEN an author with exercises in `draft`, `live`, and `needs_work`
- WHEN they open "my exercises"
- THEN they see only their own exercises, and each can be opened for editing

### Requirement: Mutating Authoring Endpoints Re-Verify the Caller Server-Side

Every mutating authoring endpoint (save draft, publish, edit) MUST independently verify the caller's identity and ownership server-side, regardless of UI state.

#### Scenario: Direct unauthenticated publish request

- GIVEN no session cookie
- WHEN a POST request is sent directly to the publish endpoint
- THEN the server rejects it and no exercise is published

#### Scenario: Direct request to edit another author's exercise

- GIVEN an authenticated author who does not own exercise Y
- WHEN they send a direct POST request to edit exercise Y's payload
- THEN the server rejects the request
</content>
