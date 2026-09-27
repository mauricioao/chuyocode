/**
 * The deterministic structural validator (openspec/changes/user-authored-
 * exercises, design.md §7; specs/exercise-validation/spec.md).
 *
 * PURE, ZERO I/O. It checks payload SHAPE — never a learner's answer — so it
 * can run identically at publish time, on every later edit, and inline in the
 * authoring UI for live feedback.
 *
 * NO HUMAN STRINGS. This module emits `ValidationCode`s only; bilingual copy
 * lives in {@link "./exerciseValidatorCopy"} (existing `COPY` pattern), so the
 * validator itself is testable without a locale.
 *
 * NOT A SEMANTIC GATE. It cannot tell a distractor is also correct in that
 * exact sentence (authoring-brief §6.11), that a `text` slot's answer list is
 * complete (§6.3), or that `focus`/`level` matches the sentence (§6.7/§6.12).
 * Those require reading English; this is a structural gate only.
 *
 * Slices 10-11: slice 10 delivers block/shape/pool rules below; the
 * mechanic-specific rules (multiple blanks, unknown mechanic, drop pool
 * sizing, listening/audio, slug format, mechanic variety) land in slice 11.
 */
import type { Payload, Pool, Slot } from './exercisePayload';

/**
 * Closed union of every rule this validator enforces.
 *
 * `block_coverage_mismatch` is RESERVED, not yet wired: `Payload` has no
 * `blocks` field until slice 12 (openspec design §6, "Renderer integration")
 * lands it. Code is the source of truth over the old design here — there is
 * nothing to check yet, so no rule fires for this code today.
 */
export type ValidationCode =
  | 'payload_unparseable'
  | 'slot_answer_empty'
  | 'slot_answer_unknown_id'
  | 'slot_pool_missing'
  | 'slot_multiple_blanks'
  | 'slot_unknown_mechanic'
  | 'pool_duplicate_id'
  | 'pool_duplicate_text'
  | 'pool_empty'
  | 'drop_pool_too_small'
  | 'listening_requires_audio'
  | 'slug_invalid'
  | 'block_coverage_mismatch'
  | 'exercise_too_few_mechanics';

export interface ValidationIssue {
  code: ValidationCode;
  severity: 'error' | 'warning';
  /** Where the author must look; `null` when exercise-wide. */
  slotId: string | null;
  poolName: string | null;
  blockId: string | null;
  /** Machine-readable context, e.g. the offending id. Never prose. */
  detail?: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

export interface ValidatorInput {
  skill: string;
  level: string;
  focus: string;
  slug: string;
  payload: Payload;
}

function issue(
  code: ValidationCode,
  severity: ValidationIssue['severity'],
  opts: { slotId?: string | null; poolName?: string | null; detail?: string } = {},
): ValidationIssue {
  return {
    code,
    severity,
    slotId: opts.slotId ?? null,
    poolName: opts.poolName ?? null,
    blockId: null,
    ...(opts.detail !== undefined ? { detail: opts.detail } : {}),
  };
}

/** Pool-shape rules for one named pool: duplicate ids, duplicate visible
 * text, or zero items. Independent of which slot(s) reference it. */
function checkPool(name: string, pool: Pool): ValidationIssue[] {
  const found: ValidationIssue[] = [];

  if (pool.length === 0) {
    found.push(issue('pool_empty', 'error', { poolName: name }));
    return found;
  }

  const seenIds = new Set<string>();
  const duplicateIds = new Set<string>();
  const seenText = new Set<string>();
  const duplicateText = new Set<string>();

  for (const item of pool) {
    if (seenIds.has(item.id)) duplicateIds.add(item.id);
    seenIds.add(item.id);
    if (item.text !== undefined) {
      if (seenText.has(item.text)) duplicateText.add(item.text);
      seenText.add(item.text);
    }
  }

  for (const id of [...duplicateIds].sort()) {
    found.push(issue('pool_duplicate_id', 'error', { poolName: name, detail: id }));
  }
  for (const text of [...duplicateText].sort()) {
    found.push(issue('pool_duplicate_text', 'error', { poolName: name, detail: text }));
  }

  return found;
}

/** Slot-shape rules: non-empty answer, and — for a pooled slot — a pool that
 * exists and answer ids that resolve inside it. */
function checkSlot(slot: Slot, payload: Payload): ValidationIssue[] {
  const found: ValidationIssue[] = [];

  if (slot.answer.length === 0) {
    found.push(issue('slot_answer_empty', 'error', { slotId: slot.id }));
  }

  if (slot.pool !== undefined) {
    const pool = payload.pools[slot.pool];
    if (pool === undefined) {
      found.push(
        issue('slot_pool_missing', 'error', { slotId: slot.id, poolName: slot.pool }),
      );
    } else {
      const ids = new Set(pool.map((item) => item.id));
      for (const answerId of slot.answer) {
        if (!ids.has(answerId)) {
          found.push(
            issue('slot_answer_unknown_id', 'error', {
              slotId: slot.id,
              poolName: slot.pool,
              detail: answerId,
            }),
          );
        }
      }
    }
  }

  return found;
}

/** Sort key: the index of the slot an issue points at, or -1 for an
 * exercise-/pool-wide issue (`slotId: null`), so those surface first. */
function slotIndex(payload: Payload, slotId: string | null): number {
  if (slotId === null) return -1;
  return payload.slots.findIndex((s) => s.id === slotId);
}

function sortIssues(payload: Payload, issues: ValidationIssue[]): ValidationIssue[] {
  return [...issues].sort((a, b) => {
    const ai = slotIndex(payload, a.slotId);
    const bi = slotIndex(payload, b.slotId);
    if (ai !== bi) return ai - bi;
    if (a.code !== b.code) return a.code < b.code ? -1 : 1;
    const ad = a.detail ?? '';
    const bd = b.detail ?? '';
    if (ad !== bd) return ad < bd ? -1 : 1;
    return 0;
  });
}

/**
 * Validate one exercise's shape. Deterministic: identical input always
 * produces the identical issue list (specs/exercise-validation/spec.md).
 */
export function validateExercise(input: ValidatorInput): ValidationResult {
  const { payload } = input;
  const issues: ValidationIssue[] = [];

  for (const [name, pool] of Object.entries(payload.pools)) {
    issues.push(...checkPool(name, pool));
  }

  for (const slot of payload.slots) {
    issues.push(...checkSlot(slot, payload));
  }

  const sorted = sortIssues(payload, issues);
  return { ok: sorted.every((i) => i.severity !== 'error'), issues: sorted };
}
