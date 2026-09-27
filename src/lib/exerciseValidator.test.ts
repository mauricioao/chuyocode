/**
 * Structural validator contract (openspec/changes/user-authored-exercises,
 * design.md §7; specs/exercise-validation/spec.md).
 *
 * PURE, ZERO I/O. Table-driven: one case per `ValidationCode`, run through the
 * SAME `validateExercise` call so the sort/severity contract is exercised
 * identically for every rule, plus a determinism check and the real seeded
 * exercise as a must-pass fixture.
 */
import { describe, it, expect } from 'vitest';
import { validateExercise, type ValidationIssue, type ValidatorInput } from './exerciseValidator';
import type { Payload } from './exercisePayload';

/** A `ValidatorInput` around one payload, with taxonomy fields that are
 * themselves valid so a test only ever exercises the rule it names. */
function inputFor(payload: Payload, overrides: Partial<ValidatorInput> = {}): ValidatorInput {
  return {
    skill: 'writing',
    level: 'A1',
    focus: 'present-simple',
    slug: 'valid-slug',
    payload,
    ...overrides,
  };
}

interface Case {
  name: string;
  payload: Payload;
  issue: Partial<ValidationIssue> & Pick<ValidationIssue, 'code'>;
  overrides?: Partial<ValidatorInput>;
}

const SHAPE_CASES: Case[] = [
  {
    name: 'slot_answer_empty — a slot with no accepted answer',
    payload: {
      pools: {},
      slots: [{ id: 's1', label: 'The cat ___ on the mat', input: 'text', answer: [] }],
    },
    issue: { code: 'slot_answer_empty', severity: 'error', slotId: 's1' },
  },
  {
    name: 'slot_answer_unknown_id — a pooled slot answers an id absent from its pool',
    payload: {
      pools: { opts: [{ id: 'a', text: 'sit' }, { id: 'b', text: 'sits' }] },
      slots: [{ id: 's1', label: 'The cat ___ on the mat', input: 'choice', pool: 'opts', answer: ['zzz'] }],
    },
    issue: { code: 'slot_answer_unknown_id', severity: 'error', slotId: 's1', detail: 'zzz' },
  },
  {
    name: 'slot_pool_missing — a slot names a pool that does not exist',
    payload: {
      pools: {},
      slots: [{ id: 's1', label: 'The cat ___ on the mat', input: 'choice', pool: 'opts', answer: ['a'] }],
    },
    issue: { code: 'slot_pool_missing', severity: 'error', slotId: 's1', poolName: 'opts' },
  },
  {
    name: 'pool_duplicate_id — two options in the same pool share an id',
    payload: {
      pools: { opts: [{ id: 'a', text: 'sit' }, { id: 'a', text: 'sits' }] },
      slots: [{ id: 's1', label: 'The cat ___ on the mat', input: 'choice', pool: 'opts', answer: ['a'] }],
    },
    issue: { code: 'pool_duplicate_id', severity: 'error', poolName: 'opts', detail: 'a' },
  },
  {
    name: 'pool_duplicate_text — two options in the same pool share visible text',
    payload: {
      pools: { opts: [{ id: 'a', text: 'sit' }, { id: 'b', text: 'sit' }] },
      slots: [{ id: 's1', label: 'The cat ___ on the mat', input: 'choice', pool: 'opts', answer: ['a'] }],
    },
    issue: { code: 'pool_duplicate_text', severity: 'error', poolName: 'opts', detail: 'sit' },
  },
  {
    name: 'pool_empty — a referenced pool has zero items',
    payload: {
      pools: { opts: [] },
      slots: [{ id: 's1', label: 'The cat ___ on the mat', input: 'choice', pool: 'opts', answer: ['a'] }],
    },
    issue: { code: 'pool_empty', severity: 'error', poolName: 'opts' },
  },
];

describe.each(SHAPE_CASES)('validateExercise — $name', ({ payload, issue, overrides }) => {
  it('reports the issue and fails the exercise', () => {
    const result = validateExercise(inputFor(payload, overrides));
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining(issue));
  });
});

describe('validateExercise — determinism', () => {
  const payload: Payload = {
    pools: { opts: [{ id: 'a', text: 'sit' }, { id: 'b', text: 'sits' }] },
    slots: [{ id: 's1', label: 'The cat ___ on the mat', input: 'choice', pool: 'opts', answer: ['b'] }],
  };

  it('produces the identical pass/fail result and issue list on repeat runs', () => {
    const first = validateExercise(inputFor(payload));
    const second = validateExercise(inputFor(payload));
    expect(second).toEqual(first);
  });
});

describe('validateExercise — the seeded exercise (supabase/seeds/exercises_a1_test.sql)', () => {
  // The one row already live in the database. If this ever fails, the
  // validator is wrong, not the content: this exercise is in production.
  const seededPayload: Payload = {
    pools: {
      verbs: [
        { id: 'v_has', text: 'has' },
        { id: 'v_explains', text: 'explains' },
        { id: 'v_have', text: 'have' },
        { id: 'v_discusses', text: 'discusses' },
      ],
      frequency: [
        { id: 'f_daily', text: 'daily' },
        { id: 'f_weekly', text: 'weekly' },
        { id: 'f_monthly', text: 'monthly' },
      ],
      aux: [
        { id: 'au_does', text: 'Does' },
        { id: 'au_do', text: 'Do' },
        { id: 'au_did', text: 'Did' },
      ],
    },
    slots: [
      { id: 's1', label: 'Every morning, our team ___ a short meeting.', input: 'drop', pool: 'verbs', answer: ['v_has'] },
      { id: 's2', label: 'Each developer ___ what they did yesterday.', input: 'drop', pool: 'verbs', answer: ['v_explains'] },
      { id: 's3', label: 'The standup happens ___, Monday to Friday.', input: 'select', pool: 'frequency', answer: ['f_daily'] },
      { id: 's4', label: '___ your team write down the action items afterward?', input: 'choice', pool: 'aux', answer: ['au_does'] },
      { id: 's5', label: 'After the standup, developers usually ___ working on their tasks.', input: 'text', answer: ['continue', 'keep', 'resume'] },
    ],
  };

  it('is structurally valid — no issues, pass', () => {
    const result = validateExercise({
      skill: 'writing',
      level: 'A1',
      focus: 'present-simple',
      slug: 'daily-standup-routine',
      payload: seededPayload,
    });
    expect(result).toEqual({ ok: true, issues: [] });
  });
});
