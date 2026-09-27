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
 */
import { countBlanks, hasAudio, type Payload, type Pool, type Slot } from './exercisePayload';
import { comparatorFor } from './exerciseGrading';
import { isAllowedMediaUrl } from './exerciseMedia';

/** Closed union of every rule this validator enforces. */
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
  | 'exercise_too_few_mechanics'
  | 'media_url_not_allowed';

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

/** Short, kebab-case, non-empty (authoring-brief §6.5). "English" is not
 * machine-checkable, so it is out of scope for a structural gate. */
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Fewer than this many distinct mechanics is a style warning, never a
 * publish blocker (authoring-brief §5.5; design §7). */
const MECHANICS_FOR_VARIETY_RULE = 2;

function issue(
  code: ValidationCode,
  severity: ValidationIssue['severity'],
  opts: {
    slotId?: string | null;
    poolName?: string | null;
    blockId?: string | null;
    detail?: string;
  } = {},
): ValidationIssue {
  return {
    code,
    severity,
    slotId: opts.slotId ?? null,
    poolName: opts.poolName ?? null,
    blockId: opts.blockId ?? null,
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

  if (countBlanks(slot.label) > 1) {
    found.push(issue('slot_multiple_blanks', 'error', { slotId: slot.id }));
  }

  if (comparatorFor(slot.input) === null) {
    found.push(
      issue('slot_unknown_mechanic', 'error', { slotId: slot.id, detail: slot.input }),
    );
  }

  return found;
}

/** A shared `drop` pool needs more tiles than the `drop` slots drawing from it
 * (authoring-brief §6.9): a placed tile is removed from the pool for every
 * other `drop` slot, so an exactly-sized pool leaves the last slot with
 * exactly one option — it answers itself. Skips a pool that does not exist;
 * `slot_pool_missing` already covers that. */
function checkDropPools(payload: Payload): ValidationIssue[] {
  const dropSlotsByPool = new Map<string, number>();
  for (const slot of payload.slots) {
    if (slot.input !== 'drop' || slot.pool === undefined) continue;
    if (payload.pools[slot.pool] === undefined) continue;
    dropSlotsByPool.set(slot.pool, (dropSlotsByPool.get(slot.pool) ?? 0) + 1);
  }

  const found: ValidationIssue[] = [];
  for (const [poolName, dropCount] of dropSlotsByPool) {
    const pool = payload.pools[poolName]!;
    if (pool.length <= dropCount) {
      found.push(issue('drop_pool_too_small', 'error', { poolName }));
    }
  }
  return found;
}

/**
 * `block_coverage_mismatch` (specs/exercise-blocks/spec.md; design.md §6).
 *
 * `parsePayload` already enforces the all-or-nothing coverage rule when
 * `blocks` comes from stored `jsonb`, so a payload built that way never
 * reaches this check with a mismatch — this rule exists for the authoring
 * surface, which may hand the validator a `Payload` assembled directly (e.g.
 * a live draft) BEFORE it has been round-tripped through that parser gate.
 *
 * Absent `payload.blocks` is not a mismatch — it just means the legacy
 * render path is in effect, exactly as {@link hasAudio} and friends treat an
 * absent optional field.
 */
function checkBlockCoverage(payload: Payload): ValidationIssue[] {
  if (payload.blocks === undefined) return [];
  const found: ValidationIssue[] = [];

  const slotIds = new Set(payload.slots.map((s) => s.id));
  const seen = new Set<string>();

  for (const block of payload.blocks) {
    if (block.kind !== 'row') continue;
    if (!slotIds.has(block.slotId)) {
      found.push(
        issue('block_coverage_mismatch', 'error', {
          slotId: block.slotId,
          blockId: block.id,
          detail: 'dangling',
        }),
      );
    } else if (seen.has(block.slotId)) {
      found.push(
        issue('block_coverage_mismatch', 'error', {
          slotId: block.slotId,
          blockId: block.id,
          detail: 'duplicate',
        }),
      );
    }
    seen.add(block.slotId);
  }

  for (const slotId of slotIds) {
    if (!seen.has(slotId)) {
      found.push(
        issue('block_coverage_mismatch', 'error', { slotId, detail: 'missing' }),
      );
    }
  }

  return found;
}

/**
 * `media_url_not_allowed` (media URL policy, owner decision pending — see
 * `exerciseMedia.ts`'s header). Every `media` block's `image`/`audio` must
 * be `https:` on an allow-listed host; `parseBlock` only enforces the
 * scheme, so this is the one place the FULL authoring policy is checked
 * before an exercise reaches `live`.
 */
function checkBlockMedia(payload: Payload): ValidationIssue[] {
  if (payload.blocks === undefined) return [];
  const found: ValidationIssue[] = [];

  for (const block of payload.blocks) {
    if (block.kind !== 'media') continue;
    if (block.image !== undefined && !isAllowedMediaUrl(block.image)) {
      found.push(
        issue('media_url_not_allowed', 'error', { blockId: block.id, detail: block.image }),
      );
    }
    if (block.audio !== undefined && !isAllowedMediaUrl(block.audio)) {
      found.push(
        issue('media_url_not_allowed', 'error', { blockId: block.id, detail: block.audio }),
      );
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

  issues.push(...checkDropPools(payload));
  issues.push(...checkBlockCoverage(payload));
  issues.push(...checkBlockMedia(payload));

  if (input.skill === 'listening' && !hasAudio(payload)) {
    issues.push(issue('listening_requires_audio', 'error'));
  }

  if (!SLUG_PATTERN.test(input.slug)) {
    issues.push(issue('slug_invalid', 'error', { detail: input.slug }));
  }

  const distinctMechanics = new Set(payload.slots.map((s) => s.input));
  if (distinctMechanics.size < MECHANICS_FOR_VARIETY_RULE) {
    issues.push(issue('exercise_too_few_mechanics', 'warning'));
  }

  const sorted = sortIssues(payload, issues);
  return { ok: sorted.every((i) => i.severity !== 'error'), issues: sorted };
}
