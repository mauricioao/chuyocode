# Exercise Validation Specification

## Purpose

Defines the deterministic structural validator: the only server-side gate between an author and live content. It checks payload shape, never a learner's answer, and runs at every point a payload could become invalid.

## Requirements

### Requirement: Validator Is Deterministic and Structural Only

The validator MUST check payload shape deterministically — identical input always produces the identical result — and MUST NOT evaluate or grade a learner's answer.

#### Scenario: Validator runs on identical input twice

- GIVEN a fixed exercise payload
- WHEN the validator runs twice on that same payload
- THEN both runs produce the same pass/fail result and the same error list

#### Scenario: Validator does not touch answer grading

- GIVEN a structurally valid exercise payload
- WHEN the validator runs
- THEN it reports pass/fail on shape only, and does not compute or compare a learner's answer

### Requirement: Validator Runs Before Publish

The system MUST run the structural validator before an exercise transitions from `draft` to `live`. A failing validation MUST prevent publish.

#### Scenario: Author publishes a structurally valid draft

- GIVEN a draft exercise whose payload passes all structural rules
- WHEN the author triggers publish
- THEN the validator runs, passes, and the exercise becomes `live`

#### Scenario: Author attempts to publish a structurally invalid draft

- GIVEN a draft exercise with an invalid block (for example, a `row` block with zero slots)
- WHEN the author triggers publish
- THEN the validator rejects it, publish does not proceed, and the exercise stays `draft`

### Requirement: Validator Runs on Every Edit of a Published Exercise

Saving an edit to a `live` or `needs_work` exercise MUST re-run the same structural validator used at publish time, before the save is accepted.

#### Scenario: Edit to a live exercise is validated

- GIVEN a `live` exercise
- WHEN the author saves an edited payload
- THEN the validator runs against the edited payload before the save is accepted

#### Scenario: Edit that breaks structure is rejected without changing the live exercise

- GIVEN a `live` exercise
- WHEN the author saves an edit that fails structural validation
- THEN the save is rejected and the previously stored payload is unchanged
</content>
