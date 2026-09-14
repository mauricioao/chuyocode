# Exercise Blocks Specification

## Purpose

Defines the `blocks` payload contract: an ordered list of `prose`, `media`, and single-slot `row` blocks. This contract is additive — an exercise with no `blocks` must render exactly as it does today.

## Requirements

### Requirement: Block Types and Single-Slot Row Contract

An exercise's `blocks` payload MUST be an ordered list of blocks, each of type `prose`, `media`, or `row`. A `row` block MUST have exactly one slot.

#### Scenario: A row block is authored with one slot

- GIVEN an author writes a row block's sentence containing exactly one run of 3 or more underscores
- WHEN the block is parsed
- THEN it produces a row block payload with exactly one slot

### Requirement: Gap Detection Creates a Configurable Slot

A run of three or more consecutive underscores (`BLANK_MARKER`) in a row block's sentence text MUST be parsed as a gap. Each detected gap MUST become one slot, independently configurable (mechanic type, accepted answers or pool).

#### Scenario: Author types a gap in the sentence field

- GIVEN an author is editing a row block's sentence text
- WHEN they type a run of 3 or more underscores
- THEN the live parser detects a gap at that position
- AND the block editor exposes slot configuration for it

### Requirement: One Blank Per Slot Is a Hard Model Limit

A `row` block MUST have exactly one blank. A sentence containing more than one run of 3+ underscores in the same row block MUST fail structural validation.

#### Scenario: Author attempts a second gap in the same row

- GIVEN a row block's sentence already contains one detected gap
- WHEN the author types a second run of 3 or more underscores in the same sentence
- THEN the structural validator rejects the block as invalid

### Requirement: prose and media Blocks Are Context-Only

`prose` and `media` blocks MUST NOT carry graded content. The gap's text MUST remain in the `row` block's `slot.label`, never duplicated into a `prose` block.

#### Scenario: Author adds prose context around a row block

- GIVEN an exercise with a `row` block
- WHEN the author adds a `prose` block referencing the same sentence
- THEN the graded gap text still resolves from `slot.label`, not from the prose block

### Requirement: Absent Blocks Renders Exactly as Today

An exercise with no `blocks` payload MUST render identically to the pre-existing renderer behavior.

#### Scenario: Legacy exercise with no blocks is rendered

- GIVEN an exercise saved before `blocks` existed, with `blocks` absent or null
- WHEN it is rendered by the exercise island
- THEN it renders exactly as it did before this change, with no stepper or renderer differences

#### Scenario: Existing exercise test suite is unaffected

- GIVEN the existing exercise test suite that asserts current rendering behavior
- WHEN this change ships with no `blocks` on any pre-existing exercise
- THEN none of those tests require modification because of `blocks`
</content>
