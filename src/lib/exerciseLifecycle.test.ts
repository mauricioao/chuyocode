/**
 * Tests for the exercise status state machine (src/lib/exerciseLifecycle.ts).
 *
 * `canTransition` is a pure table, so every legal edge from design.md §3
 * ("Status state machine — enforced in TypeScript, not SQL") gets one case,
 * plus one illegal edge per state to prove the table is closed, not just
 * permissive.
 */
import { describe, it, expect } from 'vitest';
import { canTransition, STATUSES, type Status } from './exerciseLifecycle';

describe('canTransition', () => {
  it.each([
    ['draft', 'live'],
    ['live', 'auditing'],
    ['live', 'needs_work'],
    ['auditing', 'needs_work'],
    ['auditing', 'live'],
    ['needs_work', 'live'],
    ['draft', 'removed'],
    ['live', 'removed'],
    ['auditing', 'removed'],
    ['needs_work', 'removed'],
  ] satisfies Array<[Status, Status]>)('allows %s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  it.each([
    ['draft', 'auditing'],
    ['live', 'draft'],
    ['auditing', 'draft'],
    ['needs_work', 'draft'],
    ['removed', 'live'],
  ] satisfies Array<[Status, Status]>)('rejects %s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
  });

  it('removed is terminal: no transition out of it, not even to itself', () => {
    for (const to of STATUSES) {
      expect(canTransition('removed', to)).toBe(false);
    }
  });

  it('is reflexive-false: a status never "transitions" to itself', () => {
    for (const status of STATUSES) {
      expect(canTransition(status, status)).toBe(false);
    }
  });
});
