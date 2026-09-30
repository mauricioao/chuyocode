/**
 * Activity blocks contract (PR A, "Activities foundation").
 *
 * An activity's content is `blocks jsonb` on `public.activities` (0011
 * migration): an ORDERED list of typed blocks, each its own module — a
 * `worksheet` (an uploaded image with answer zones drawn on top) or a `quiz`
 * (the existing traditional exercise payload, unchanged and untouched: this
 * module reuses `parsePayload` from `../exercisePayload` rather than
 * redefining it).
 *
 * Zero I/O, same posture as `exercisePayload.ts`: `blocks` reaches us as raw
 * `jsonb`, so {@link parseBlocks} is the one gate that turns `unknown` into
 * something a creator/player may trust. Every block is REBUILT field by
 * field, never spread — an unknown authored key cannot survive the boundary
 * (same reasoning as `parseSlot`/`parsePool` there).
 *
 * FAIL-SAFE, ALL-OR-NOTHING AT THE TOP LEVEL: unlike `parsePayload`'s pools
 * and blocks (which degrade individual bad entries), a malformed block here
 * fails the WHOLE list. An activity's blocks list is edited and re-saved as
 * one unit by its author (PR B), so there is no "half-good" activity to
 * preserve the way there is a "half-good" exercise payload; and a worksheet
 * zone is graded geometry — a silently dropped zone is a silently ungradeable
 * region on an otherwise-intact image, which must never happen quietly.
 */
import { parsePayload, type Payload, type PoolItem } from '../exercisePayload';
import { parseImagePath } from './paths';

/** A worksheet's uploaded image and its natural pixel dimensions. */
export interface ImageRef {
  path: string;
  width: number;
  height: number;
}

/** One graded region drawn over a worksheet image, in fractional coordinates. */
export interface Zone {
  id: string;
  /** Fractional coordinates in `[0, 1]`, relative to the image's top-left. */
  x: number;
  y: number;
  w: number;
  h: number;
  kind: 'text' | 'choice';
  /** Accepted answers, trimmed and non-empty. At least one is required. */
  answers: string[];
  /** `choice` only: the offered options, which must include every answer. */
  options?: string[];
  /**
   * Optional author-supplied text for the "Escuchar/Listen" affordance (D4)
   * — a worksheet is an uploaded IMAGE, so unlike a `quiz` slot's own
   * `label` there is no machine-readable text to read aloud unless the
   * author types one. `undefined` = no affordance for this zone. Trimmed,
   * non-empty, capped at {@link MAX_ZONE_SPEAK_LENGTH} characters.
   */
  speak?: string;
  /**
   * Optional author-supplied "¿Por qué?" explanation (D5), shown to the
   * learner only AFTER checking, only for THIS zone, and only while it is
   * incorrect — never before checking, never for a correct answer.
   * `undefined` = no explanation for this zone. Trimmed, non-empty, capped
   * at {@link MAX_ZONE_EXPLANATION_LENGTH} characters — same
   * trim/cap/all-or-nothing posture as {@link speak}.
   */
  explanation?: string;
}

/** A worksheet image's rotation, clockwise from its uploaded orientation. */
export type Rotation = 0 | 90 | 180 | 270;

/** An uploaded worksheet image with answer zones drawn on top. */
export interface WorksheetBlock {
  id: string;
  type: 'worksheet';
  /** Author-editable label (creator polish round 2). `undefined` = use the positional default ("Hoja N") in the UI. */
  name?: string;
  /**
   * Clockwise rotation applied on top of the uploaded image, for a
   * landscape worksheet authored/scanned sideways. Zones are stored in THIS
   * rotated image's own coordinate space — i.e. exactly what the author sees
   * on screen — so the player only ever needs to apply the same rotation to
   * the image and render zones unchanged. Defaults to `0` for every
   * worksheet saved before this field existed (backward compatible).
   */
  rotation: Rotation;
  image: ImageRef;
  zones: Zone[];
}

/** The existing traditional exercise payload, as one activity block. */
export interface QuizBlock {
  id: string;
  type: 'quiz';
  /** Author-editable label (creator polish round 2). `undefined` = use the positional default ("Hoja N") in the UI. */
  name?: string;
  payload: Payload;
}

export type Block = WorksheetBlock | QuizBlock;

/** An activity holds at most this many blocks. */
export const MAX_BLOCKS = 20;

/** A single worksheet block holds at most this many zones. */
export const MAX_ZONES_PER_WORKSHEET = 60;

/** A block's author-editable name may not exceed this many characters. */
export const MAX_BLOCK_NAME_LENGTH = 60;

/** A zone's optional "Escuchar/Listen" text (D4) may not exceed this many characters. */
export const MAX_ZONE_SPEAK_LENGTH = 200;

/** A zone's optional "¿Por qué?" explanation (D5) may not exceed this many characters. */
export const MAX_ZONE_EXPLANATION_LENGTH = 300;

/**
 * `parseBlocks`' two validation postures (creator polish round 3, owner
 * feedback #1):
 *
 *  - `'submit'` (the default, unchanged from before this round): every field
 *    that grading/the public reads must be COMPLETE — a zone needs at least
 *    one answer, a `choice` zone needs >= 2 options with every answer among
 *    them. Used for `enviar` and anything the public reads
 *    (`getPublishedActivity`/`getPublishedActivities`).
 *  - `'draft'`: everything that matters for SAFETY/INTEGRITY still applies
 *    unchanged (ids, types, coordinates in `[0, 1]` and inside the image,
 *    the `MAX_BLOCKS`/`MAX_ZONES_PER_WORKSHEET` limits, image paths, name
 *    length, rotation values, field-by-field rebuild) — only the
 *    COMPLETENESS checks above are relaxed, so an author mid-drafting (a
 *    zone with no answer yet, a choice zone with one option) can still
 *    autosave. Used by `guardar` (a save is not a publish) and by
 *    `getActivityForEdit` (the editor must be able to reopen its own
 *    in-progress draft).
 */
export type BlocksParseMode = 'draft' | 'submit';

const ZONE_KINDS: ReadonlySet<string> = new Set(['text', 'choice']);
const ROTATIONS: ReadonlySet<number> = new Set([0, 90, 180, 270]);

/** Narrow `unknown` to a plain object without trusting its keys. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A finite number in `[0, 1]`. */
function isUnitNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

/** A finite number in `(0, 1]` — a size, which must be strictly positive. */
function isPositiveUnitNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 1;
}

/** Keep only non-empty, trimmed strings, trimming each survivor. */
function parseTrimmedStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw): string[] => {
    if (typeof raw !== 'string') return [];
    const trimmed = raw.trim();
    return trimmed.length > 0 ? [trimmed] : [];
  });
}

/**
 * Parse one worksheet image reference, or `null` if it is unusable.
 *
 * `path` must match the storage layout exactly ({@link parseImagePath}):
 * reject anything else, including a full URL or a path containing `..` —
 * neither can ever be produced by the upload/approval flow, so an activity
 * carrying one could only be a forged payload.
 */
function parseImageRef(value: unknown): ImageRef | null {
  if (!isRecord(value)) return null;
  if (typeof value.path !== 'string' || !parseImagePath(value.path)) return null;
  if (typeof value.width !== 'number' || !Number.isFinite(value.width) || value.width <= 0) {
    return null;
  }
  if (typeof value.height !== 'number' || !Number.isFinite(value.height) || value.height <= 0) {
    return null;
  }
  return { path: value.path, width: value.width, height: value.height };
}

/**
 * Parse one zone, or `null` if it is unusable.
 *
 * Geometry rules mirror what a normalized (fraction-of-image) rectangle must
 * satisfy to stay ON the image: `x`/`y` in `[0, 1]`, `w`/`h` strictly
 * positive and no larger than the remaining room (`x + w <= 1`, `y + h <=
 * 1`) — enforced in EVERY mode, a zone off the image is never safe to store.
 *
 * `mode === 'submit'` additionally requires the zone to be GRADEABLE: at
 * least one answer, and a `choice` zone needs >= 2 options with EVERY answer
 * among them (an answer the learner could never see offered is not a
 * gradeable choice zone). `mode === 'draft'` skips those two completeness
 * checks — an author mid-drafting may have drawn a zone with no answer yet,
 * or a `choice` zone with one option — but still trims/caps every string the
 * same way.
 */
function parseZone(value: unknown, mode: BlocksParseMode): Zone | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== 'string' || value.id.length === 0) return null;

  if (!isUnitNumber(value.x) || !isUnitNumber(value.y)) return null;
  if (!isPositiveUnitNumber(value.w) || !isPositiveUnitNumber(value.h)) return null;
  if (value.x + value.w > 1 || value.y + value.h > 1) return null;

  if (typeof value.kind !== 'string' || !ZONE_KINDS.has(value.kind)) return null;
  const kind = value.kind as Zone['kind'];

  const answers = parseTrimmedStrings(value.answers);
  if (mode === 'submit' && answers.length === 0) return null;

  const speak = parseZoneSpeak(value.speak);
  if (speak === INVALID_SPEAK) return null;

  const explanation = parseZoneExplanation(value.explanation);
  if (explanation === INVALID_EXPLANATION) return null;

  const zone: Zone = {
    id: value.id,
    x: value.x,
    y: value.y,
    w: value.w,
    h: value.h,
    kind,
    answers,
  };
  if (speak !== undefined) zone.speak = speak;
  if (explanation !== undefined) zone.explanation = explanation;

  if (kind === 'choice') {
    const options = parseTrimmedStrings(value.options);
    if (mode === 'submit') {
      if (options.length < 2) return null;
      if (!answers.every((answer) => options.includes(answer))) return null;
    }
    zone.options = options;
  }

  return zone;
}

/**
 * Parse a zone's optional `speak` text (D4, "Escuchar/Listen"), or the
 * sentinel `INVALID_SPEAK` if present but unusable — same all-or-nothing
 * posture as {@link parseName}: a non-string, or one that stays over
 * {@link MAX_ZONE_SPEAK_LENGTH} after trimming, fails the WHOLE block. A
 * missing value, or one that is blank after trimming, is NOT an error: both
 * parse to `undefined`, meaning "no affordance for this zone".
 */
const INVALID_SPEAK = Symbol('invalid-speak');

function parseZoneSpeak(value: unknown): string | undefined | typeof INVALID_SPEAK {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') return INVALID_SPEAK;
  const trimmed = value.trim();
  if (trimmed.length > MAX_ZONE_SPEAK_LENGTH) return INVALID_SPEAK;
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Parse a zone's optional `explanation` text (D5, "¿Por qué?"), or the
 * sentinel `INVALID_EXPLANATION` if present but unusable — same
 * all-or-nothing posture as {@link parseZoneSpeak}: a non-string, or one
 * that stays over {@link MAX_ZONE_EXPLANATION_LENGTH} after trimming, fails
 * the WHOLE block. A missing value, or one that is blank after trimming, is
 * NOT an error: both parse to `undefined`, meaning "no explanation for this
 * zone".
 */
const INVALID_EXPLANATION = Symbol('invalid-explanation');

function parseZoneExplanation(value: unknown): string | undefined | typeof INVALID_EXPLANATION {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') return INVALID_EXPLANATION;
  const trimmed = value.trim();
  if (trimmed.length > MAX_ZONE_EXPLANATION_LENGTH) return INVALID_EXPLANATION;
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Parse a block's optional `name`, or the sentinel `INVALID_NAME` if present
 * but unusable (a non-string, or one that stays over the limit after
 * trimming) — the caller fails the whole block on that sentinel, same
 * all-or-nothing posture as every other field here. A missing name, or one
 * that is blank after trimming, is NOT an error: both parse to `undefined`,
 * meaning "no custom name — the UI derives a positional default".
 */
const INVALID_NAME = Symbol('invalid-name');

function parseName(value: unknown): string | undefined | typeof INVALID_NAME {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') return INVALID_NAME;
  const trimmed = value.trim();
  if (trimmed.length > MAX_BLOCK_NAME_LENGTH) return INVALID_NAME;
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Parse a worksheet's `rotation`, or `null` if present but not one of the
 * four right angles. Missing entirely defaults to `0` — every worksheet
 * saved before this field existed.
 */
function parseRotation(value: unknown): Rotation | null {
  if (value === undefined) return 0;
  if (typeof value === 'number' && ROTATIONS.has(value)) return value as Rotation;
  return null;
}

/** Parse a worksheet block's own fields, or `null` if any part is unusable. */
function parseWorksheetBlock(
  id: string,
  name: string | undefined,
  value: Record<string, unknown>,
  mode: BlocksParseMode,
): WorksheetBlock | null {
  const image = parseImageRef(value.image);
  if (!image) return null;

  const rotation = parseRotation(value.rotation);
  if (rotation === null) return null;

  // No minimum in EITHER mode here: a worksheet mid-authoring (image
  // uploaded, no zone drawn yet) is still a valid, saveable draft block —
  // only the maximum is a hard limit (`design.md`/task spec: "<= 60 zones
  // per worksheet"). `enviar.ts` enforces its OWN "at least one zone"
  // completeness rule on top, via `findIncompleteBlock` below, once it can
  // name which block is missing zones.
  if (!Array.isArray(value.zones)) return null;
  if (value.zones.length > MAX_ZONES_PER_WORKSHEET) return null;

  const zones: Zone[] = [];
  for (const raw of value.zones) {
    const zone = parseZone(raw, mode);
    if (!zone) return null;
    zones.push(zone);
  }

  return { id, type: 'worksheet', name, rotation, image, zones };
}

/**
 * Parse a quiz block's own fields, or `null` if its payload cannot be
 * parsed.
 *
 * `mode` is forwarded straight to `parsePayload` (`exercisePayload.ts`'s own
 * `PayloadParseMode`, same two values as this module's `BlocksParseMode`): a
 * `'draft'` quiz block may have zero questions, or a question with no answer
 * yet, exactly like a `'draft'` worksheet zone — see
 * {@link BlocksParseMode}'s own doc.
 */
function parseQuizBlock(
  id: string,
  name: string | undefined,
  value: Record<string, unknown>,
  mode: BlocksParseMode,
): QuizBlock | null {
  const payload = parsePayload(value.payload, mode);
  if (!payload) return null;
  return { id, type: 'quiz', name, payload };
}

/** Parse one block, or `null` if its own shape is unusable. */
function parseBlock(value: unknown, mode: BlocksParseMode): Block | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== 'string' || value.id.length === 0) return null;

  const name = parseName(value.name);
  if (name === INVALID_NAME) return null;

  switch (value.type) {
    case 'worksheet':
      return parseWorksheetBlock(value.id, name, value, mode);
    case 'quiz':
      return parseQuizBlock(value.id, name, value, mode);
    default:
      return null;
  }
}

/**
 * Validate raw `jsonb` into an ordered {@link Block} list, or `null` when it
 * is unusable.
 *
 * ALL-OR-NOTHING (see file header): the first unparseable block fails the
 * whole list, and block ids must be unique within it — a duplicate id makes
 * "which block is this zone/answer on" ambiguous for both the creator and
 * the player. `mode` (default `'submit'`, unchanged from before creator
 * polish round 3) only relaxes the COMPLETENESS checks inside a zone — see
 * {@link BlocksParseMode}'s own doc.
 */
export function parseBlocks(value: unknown, mode: BlocksParseMode = 'submit'): Block[] | null {
  if (!Array.isArray(value)) return null;
  if (value.length > MAX_BLOCKS) return null;

  const blocks: Block[] = [];
  const seenIds = new Set<string>();
  for (const raw of value) {
    const block = parseBlock(raw, mode);
    if (!block) return null;
    if (seenIds.has(block.id)) return null;
    seenIds.add(block.id);
    blocks.push(block);
  }

  return blocks;
}

/** What's still missing before a `'draft'`-parsed block list would also pass `'submit'`. */
export interface IncompleteBlockInfo {
  blockId: string;
  /**
   * `null` for a block-level gap (a worksheet with no zones at all, or a
   * quiz block with no questions at all). Otherwise the zone id, or — for a
   * quiz block — the incomplete question's slot id.
   */
  zoneId: string | null;
  reason:
    | 'no_zones'
    | 'no_answers'
    | 'too_few_options'
    | 'answer_not_in_options'
    | 'quiz_no_slots'
    | 'quiz_no_answer'
    | 'quiz_too_few_options'
    | 'quiz_answer_not_in_pool';
}

/** Mechanics whose answer is one id drawn from a shared pool — same set `SlotAnswerEditor.tsx` authors against. */
const POOLED_MECHANICS: ReadonlySet<string> = new Set(['choice', 'select', 'drop']);

/**
 * The first SUBMIT-incomplete question in one quiz block's payload, or
 * `null` — the quiz counterpart of the worksheet zone loop below: a question
 * with no answer yet, a pooled question (`choice`/`select`/`drop`) with < 2
 * pool items, or a marked-correct answer id that names no pool item.
 */
function findIncompleteSlot(payload: Payload): { zoneId: string; reason: IncompleteBlockInfo['reason'] } | null {
  for (const slot of payload.slots) {
    if (slot.answer.length === 0) {
      return { zoneId: slot.id, reason: 'quiz_no_answer' };
    }
    if (slot.pool !== undefined) {
      const items: PoolItem[] = payload.pools[slot.pool] ?? [];
      if (POOLED_MECHANICS.has(slot.input) && items.length < 2) {
        return { zoneId: slot.id, reason: 'quiz_too_few_options' };
      }
      const ids = new Set(items.map((item) => item.id));
      if (!slot.answer.every((answer) => ids.has(answer))) {
        return { zoneId: slot.id, reason: 'quiz_answer_not_in_pool' };
      }
    }
  }
  return null;
}

/**
 * Find the first SUBMIT-incomplete spot in an already `'draft'`-parsed block
 * list — a worksheet with no zones yet (or a zone still missing what grading
 * needs: no answer, a `choice` zone with < 2 options, or an answer not among
 * its options), or a quiz block with no questions yet (or a question missing
 * what grading needs — see {@link findIncompleteSlot}). `null` means every
 * block already satisfies `'submit'`'s stricter rules too, i.e. nothing here
 * blocks `enviar`.
 *
 * Used by `enviar.ts` to name the EXACT block/zone (or block/question) a
 * rejected submit must point the author back to, instead of a generic
 * "something's wrong".
 */
export function findIncompleteBlock(blocks: Block[]): IncompleteBlockInfo | null {
  for (const block of blocks) {
    if (block.type === 'worksheet') {
      if (block.zones.length === 0) {
        return { blockId: block.id, zoneId: null, reason: 'no_zones' };
      }
      for (const zone of block.zones) {
        if (zone.answers.length === 0) {
          return { blockId: block.id, zoneId: zone.id, reason: 'no_answers' };
        }
        if (zone.kind === 'choice') {
          const options = zone.options ?? [];
          if (options.length < 2) {
            return { blockId: block.id, zoneId: zone.id, reason: 'too_few_options' };
          }
          if (!zone.answers.every((answer) => options.includes(answer))) {
            return { blockId: block.id, zoneId: zone.id, reason: 'answer_not_in_options' };
          }
        }
      }
      continue;
    }

    if (block.payload.slots.length === 0) {
      return { blockId: block.id, zoneId: null, reason: 'quiz_no_slots' };
    }
    const incompleteSlot = findIncompleteSlot(block.payload);
    if (incompleteSlot) {
      return { blockId: block.id, zoneId: incompleteSlot.zoneId, reason: incompleteSlot.reason };
    }
  }
  return null;
}
