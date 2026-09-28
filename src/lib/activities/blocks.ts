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
import { parsePayload, type Payload } from '../exercisePayload';
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
 * Parse one zone, or `null` if it could never be graded or drawn.
 *
 * Geometry rules mirror what a normalized (fraction-of-image) rectangle must
 * satisfy to stay ON the image: `x`/`y` in `[0, 1]`, `w`/`h` strictly
 * positive and no larger than the remaining room (`x + w <= 1`, `y + h <=
 * 1`). `choice` additionally requires at least two options and EVERY answer
 * to be one of them — an answer the learner could never see offered is not a
 * gradeable choice zone.
 */
function parseZone(value: unknown): Zone | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== 'string' || value.id.length === 0) return null;

  if (!isUnitNumber(value.x) || !isUnitNumber(value.y)) return null;
  if (!isPositiveUnitNumber(value.w) || !isPositiveUnitNumber(value.h)) return null;
  if (value.x + value.w > 1 || value.y + value.h > 1) return null;

  if (typeof value.kind !== 'string' || !ZONE_KINDS.has(value.kind)) return null;
  const kind = value.kind as Zone['kind'];

  const answers = parseTrimmedStrings(value.answers);
  if (answers.length === 0) return null;

  const zone: Zone = {
    id: value.id,
    x: value.x,
    y: value.y,
    w: value.w,
    h: value.h,
    kind,
    answers,
  };

  if (kind === 'choice') {
    const options = parseTrimmedStrings(value.options);
    if (options.length < 2) return null;
    if (!answers.every((answer) => options.includes(answer))) return null;
    zone.options = options;
  }

  return zone;
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
): WorksheetBlock | null {
  const image = parseImageRef(value.image);
  if (!image) return null;

  const rotation = parseRotation(value.rotation);
  if (rotation === null) return null;

  // No minimum: a worksheet mid-authoring (image uploaded, no zone drawn
  // yet) is still a valid, saveable draft block — only the maximum is a hard
  // limit (`design.md`/task spec: "<= 60 zones per worksheet").
  if (!Array.isArray(value.zones)) return null;
  if (value.zones.length > MAX_ZONES_PER_WORKSHEET) return null;

  const zones: Zone[] = [];
  for (const raw of value.zones) {
    const zone = parseZone(raw);
    if (!zone) return null;
    zones.push(zone);
  }

  return { id, type: 'worksheet', name, rotation, image, zones };
}

/** Parse a quiz block's own fields, or `null` if its payload cannot be parsed. */
function parseQuizBlock(
  id: string,
  name: string | undefined,
  value: Record<string, unknown>,
): QuizBlock | null {
  const payload = parsePayload(value.payload);
  if (!payload) return null;
  return { id, type: 'quiz', name, payload };
}

/** Parse one block, or `null` if its own shape is unusable. */
function parseBlock(value: unknown): Block | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== 'string' || value.id.length === 0) return null;

  const name = parseName(value.name);
  if (name === INVALID_NAME) return null;

  switch (value.type) {
    case 'worksheet':
      return parseWorksheetBlock(value.id, name, value);
    case 'quiz':
      return parseQuizBlock(value.id, name, value);
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
 * the player.
 */
export function parseBlocks(value: unknown): Block[] | null {
  if (!Array.isArray(value)) return null;
  if (value.length > MAX_BLOCKS) return null;

  const blocks: Block[] = [];
  const seenIds = new Set<string>();
  for (const raw of value) {
    const block = parseBlock(raw);
    if (!block) return null;
    if (seenIds.has(block.id)) return null;
    seenIds.add(block.id);
    blocks.push(block);
  }

  return blocks;
}
