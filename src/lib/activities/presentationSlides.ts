/**
 * presentationSlides — pure, zero-I/O helpers that turn an activity's own
 * `blocks` into Presentation mode's deck.
 *
 * Presentation mode v1 (owner spec, section 4) only ever played `quiz`
 * ("Preguntas") blocks — a worksheet's own image/zones never reached this
 * route at all. The "worksheet zoom tour" (sprint week 3) EXTENDS the same
 * deck to also walk a worksheet's own answer zones, in the SAME authored
 * block order as everything else: an overview slide (the whole page,
 * zones numbered — {@link PresentationSlide}'s `'worksheet-overview'`
 * kind), then one slide per zone in READING order ({@link
 * orderZonesForReading}, `zoneGeometry.ts`), interleaved with any quiz
 * question slides exactly as the blocks themselves are ordered. A
 * worksheet block with no image yet, or no zones at all (an editor
 * mid-draft empty state), contributes nothing — see
 * {@link collectPresentationWorksheets}.
 *
 * {@link hasPresentableContent} is the SINGLE source of truth for "does this
 * activity have anything to present" — shared, unchanged, between the
 * practice page's own entry-point gate (`[id].astro`, "Presentar" button)
 * and `presentar.astro`'s own defensive 404 (a direct visit must get the
 * exact same answer the button's own visibility already promised, even
 * though the button already gates the common path). {@link hasPresentableQuiz}
 * stays as its own narrower predicate (quiz questions only) — still correct
 * and still used on its own (the cover slide's own question count).
 */
import type { Block, ImageRef, Rotation, Zone, AudioMarker } from './blocks';
import type { Payload, Slot } from '../exercisePayload';
import { orderZonesForReading } from './zoneGeometry';
import { rotatedSize } from './canvasViewport';
import { zoneExceedsMaxZoom, type Size } from './presentationCamera';
import { STAGE_SAFE_WIDTH, STAGE_SAFE_HEIGHT } from './fitStage';
import {
  deriveGameItems,
  deriveGroupSortGroups,
  groupSortPoolName,
  seedFromString,
  shuffleWithSeed,
  type GameItem,
} from './gameModes';
import { deriveClozeGameSentences, type ClozeGameSegment } from './clozeSentences';

/** A deterministic word shuffle that is never the sentence's own original order — same anti-identity rule `QuizReorder.tsx`'s own tile shuffle follows, applied here to plain words (no interactive tile ids needed for a static slide). */
function shuffledWords(words: readonly string[], seed: number): string[] {
  if (words.length < 2) return [...words];
  let order = shuffleWithSeed(words, seed);
  if (order.every((word, i) => word === words[i])) {
    order = [...order];
    [order[0], order[1]] = [order[1]!, order[0]!];
  }
  return order;
}

/** One question slide's own data: the slot to show, the payload that resolves its pool (if any), and the block it came from. */
export interface PresentationQuestion {
  blockId: string;
  payload: Payload;
  slot: Slot;
}

/**
 * Every question slide, in order: each `quiz` block's own `payload.slots`,
 * blocks visited in their authored order, slots visited in their own
 * authored order within each block. A `worksheet` block contributes
 * nothing.
 */
export function collectPresentationQuestions(blocks: readonly Block[]): PresentationQuestion[] {
  const questions: PresentationQuestion[] = [];
  for (const block of blocks) {
    if (block.type !== 'quiz') continue;
    for (const slot of block.payload.slots) {
      questions.push({ blockId: block.id, payload: block.payload, slot });
    }
  }
  return questions;
}

/** Does this activity have at least one presentable question? See this module's own header for why both callers share this one function. */
export function hasPresentableQuiz(blocks: readonly Block[]): boolean {
  return collectPresentationQuestions(blocks).length > 0;
}

/** One worksheet page's own data a presentation slide needs: the block it came from, its image/rotation, and every zone already in READING order (top-to-bottom, left-to-right — `zoneGeometry.ts`'s own `orderZonesForReading`, the same order the practice page's mobile bottom sheet already steps through). */
export interface PresentationWorksheetPage {
  blockId: string;
  name?: string;
  image: ImageRef;
  rotation: Rotation;
  zones: Zone[];
}

/**
 * Every worksheet block that can actually be presented — an image AND at
 * least one zone — in authored order. A block mid-authoring with no image
 * yet, or with an image but no zones drawn, contributes nothing: there is
 * nothing a zoom tour could show for it.
 */
export function collectPresentationWorksheets(blocks: readonly Block[]): PresentationWorksheetPage[] {
  const pages: PresentationWorksheetPage[] = [];
  for (const block of blocks) {
    if (block.type !== 'worksheet' || !block.image || block.zones.length === 0) continue;
    pages.push({
      blockId: block.id,
      name: block.name,
      image: block.image,
      rotation: block.rotation,
      zones: orderZonesForReading(block.zones),
    });
  }
  return pages;
}

/** Does this activity have at least one presentable worksheet page (an image with >= 1 zone)? */
export function hasPresentableWorksheet(blocks: readonly Block[]): boolean {
  return collectPresentationWorksheets(blocks).length > 0;
}

/**
 * Does this activity have ANYTHING presentation mode can show — a quiz
 * question or a worksheet zone? The broader single source of truth for
 * "Presentar" visibility and `presentar.astro`'s own defensive 404 — see
 * this module's own header. Replaces the old quiz-only {@link
 * hasPresentableQuiz} at both of those call sites now that a worksheet-only
 * activity is presentable too.
 */
export function hasPresentableContent(blocks: readonly Block[]): boolean {
  return hasPresentableQuiz(blocks) || hasPresentableWorksheet(blocks);
}

/**
 * The prompt's own type size, in STAGE pixels (owner spec, section 3: "prompt
 * 64-96px (shrink long prompts within that range)"). A short question
 * (`length <= {@link PROMPT_SHRINK_FROM_LENGTH}`) gets the full 96px; a long
 * one (`length >= {@link PROMPT_SHRINK_TO_LENGTH}`) is floored at 64px —
 * still comfortably readable from the back of a classroom — with a linear
 * ramp between the two so growth is never a sudden jump.
 */
export const PROMPT_FONT_MAX_PX = 96;
export const PROMPT_FONT_MIN_PX = 64;
const PROMPT_SHRINK_FROM_LENGTH = 30;
const PROMPT_SHRINK_TO_LENGTH = 90;

export function promptFontSize(label: string): number {
  const length = label.trim().length;
  if (length <= PROMPT_SHRINK_FROM_LENGTH) return PROMPT_FONT_MAX_PX;
  if (length >= PROMPT_SHRINK_TO_LENGTH) return PROMPT_FONT_MIN_PX;
  const t = (length - PROMPT_SHRINK_FROM_LENGTH) / (PROMPT_SHRINK_TO_LENGTH - PROMPT_SHRINK_FROM_LENGTH);
  return Math.round(PROMPT_FONT_MAX_PX - t * (PROMPT_FONT_MAX_PX - PROMPT_FONT_MIN_PX));
}

/**
 * One slide of the deck, in the SAME authored block order
 * {@link buildPresentationSlides} walks — a discriminated union so
 * `PresentationIsland.tsx` can render each kind differently while the
 * reducer (`presentationReducer.ts`) stays content-agnostic (it only needs
 * to know how MANY slides there are and which ones are "revealable" —
 * {@link revealableSlides}).
 *
 *  - `'question'` — unchanged from v1: one quiz slot, reveal shows the
 *    correct option/answer.
 *  - `'match'` (build item 5, "Match in presentation"): a `template:
 *    'match'` quiz block contributes ONE slide for its whole pair list
 *    instead of one slide per pair — the simplest shape that still works on
 *    a projector (owner build item 5): every prompt listed at once, reveal
 *    shows every answer at once, no drag gesture needed in front of a
 *    class. `pairs` reuses `gameModes.ts`'s own {@link GameItem} (same
 *    `{ id, prompt, answer }` the practice board already derives), so answer
 *    resolution (plain text or a pool item's display text) can never drift
 *    between the two.
 *  - `'worksheet-overview'` — the whole page, zones numbered, NEVER
 *    revealable (a plain glance, not a question).
 *  - `'worksheet-zone'` — one answer zone, in reading order; unrevealed it
 *    is an empty highlighted blank, revealed it shows the expected answer
 *    plus the zone's own "¿Por qué?" explanation (if it has one).
 */
export type PresentationSlide =
  | { kind: 'question'; blockId: string; payload: Payload; slot: Slot }
  | { kind: 'match'; blockId: string; name?: string; pairs: GameItem[] }
  | {
      /**
       * "Reordenar" in presentation mode: ONE SLIDE PER SENTENCE (unlike
       * `'match'`'s single combined slide) — a sentence's own shuffled words
       * are computed HERE, deterministically (`words`), so the deck never
       * reshuffles between renders; `sentence` is the correct order, shown
       * only once revealed.
       */
      kind: 'reorder';
      blockId: string;
      slotId: string;
      sentence: string;
      words: string[];
    }
  | {
      /**
       * "Completar la frase" in presentation mode: ONE SLIDE PER SENTENCE,
       * same posture as `'reorder'` above — `segments` is the sentence's own
       * text/blank structure, already resolved by `clozeSentences.ts`'s own
       * `deriveClozeGameSentences`, unrevealed a blank shows an empty line,
       * revealed it shows its own correct word.
       */
      kind: 'cloze';
      blockId: string;
      seq: number;
      segments: ClozeGameSegment[];
    }
  | {
      /**
       * "Ordenar por grupos" in presentation mode: ONE combined slide for
       * the whole board, same posture as `'match'` above — every group
       * listed with its name; "Mostrar respuesta" fills each group with its
       * own items at once, no drag gesture needed in front of a class.
       */
      kind: 'groupsort';
      blockId: string;
      name?: string;
      groups: { id: string; label: string; items: string[] }[];
    }
  | {
      kind: 'worksheet-overview';
      blockId: string;
      name?: string;
      image: ImageRef;
      rotation: Rotation;
      zones: Zone[];
      /** "Colocar un audio propio": this page's own audio markers, played from the overview slide only (never zoomed-into on a per-zone slide) — see `PresentationIsland.tsx`'s own `WorksheetStageLayer`. `undefined`/absent = none, every worksheet saved before this field existed. */
      audio?: AudioMarker[];
    }
  | {
      kind: 'worksheet-zone';
      blockId: string;
      image: ImageRef;
      rotation: Rotation;
      zone: Zone;
      /** 1-based position among THIS page's own zones (reading order) — resets per worksheet block, matching the overview slide's own numbered badges. */
      zoneIndex: number;
      zoneCount: number;
    };

/**
 * The whole presentation deck's content slides (cover/summary excluded —
 * those stay index-derived, not data-derived), in authored block order:
 * each `quiz` block contributes one slide per question, each presentable
 * `worksheet` block ({@link collectPresentationWorksheets}) contributes one
 * overview slide followed by one slide per zone in reading order. A block
 * of either type that contributes nothing (an empty quiz, an imageless or
 * zoneless worksheet) is simply skipped, same as v1's own `collectPresentationQuestions`.
 */
export function buildPresentationSlides(blocks: readonly Block[]): PresentationSlide[] {
  const slides: PresentationSlide[] = [];
  for (const block of blocks) {
    if (block.type === 'quiz') {
      if (block.template === 'match') {
        // One combined slide for the whole pair list — see this module's
        // own `PresentationSlide` doc on `'match'`. An incomplete match
        // (fewer than `gameModes.ts`'s own `MIN_MATCH_ITEMS`, or every pair
        // still unanswered) derives zero items and contributes nothing,
        // same as an empty Básico quiz.
        const pairs = deriveGameItems(block.payload);
        if (pairs.length > 0) {
          slides.push({ kind: 'match', blockId: block.id, name: block.name, pairs });
        }
        continue;
      }
      if (block.template === 'reorder') {
        // ONE SLIDE PER SENTENCE (unlike `'match'`'s single combined slide,
        // see this module's own `PresentationSlide` doc on `'reorder'`): a
        // sentence shorter than 2 words has nothing to reorder, same
        // `gameModes.ts` rule `reorderEligible` enforces for the practice
        // board, and is simply skipped here.
        for (const slot of block.payload.slots) {
          const sentence = slot.answer[0] ?? slot.label;
          const words = sentence.trim().split(/\s+/).filter(Boolean);
          if (words.length < 2) continue;
          slides.push({
            kind: 'reorder',
            blockId: block.id,
            slotId: slot.id,
            sentence,
            words: shuffledWords(words, seedFromString(`${block.id}:${slot.id}:present`)),
          });
        }
        continue;
      }
      if (block.template === 'cloze') {
        // ONE SLIDE PER SENTENCE, same posture as `'reorder'` above — a
        // sentence with no real blank yet (still bracket-less) derives no
        // entry at all (`deriveClozeGameSentences` already skips it).
        for (const sentence of deriveClozeGameSentences(block.payload)) {
          slides.push({ kind: 'cloze', blockId: block.id, seq: sentence.seq, segments: sentence.segments });
        }
        continue;
      }
      if (block.template === 'groupsort') {
        // ONE COMBINED SLIDE for the whole board — see this module's own
        // `PresentationSlide` doc on `'groupsort'`. No group yet (an empty
        // block) derives zero groups and contributes nothing, same as an
        // empty `'match'`.
        const groups = deriveGroupSortGroups(block.payload);
        const poolName = groupSortPoolName(block.payload);
        const pool = poolName ? (block.payload.pools[poolName] ?? []) : [];
        const textFor = (itemId: string) => {
          const item = pool.find((candidate) => candidate.id === itemId);
          return item?.text ?? item?.media ?? itemId;
        };
        const resolved = groups
          .filter((group) => group.itemIds.length > 0)
          .map((group) => ({ id: group.id, label: group.label, items: group.itemIds.map(textFor) }));
        if (resolved.length > 0) {
          slides.push({ kind: 'groupsort', blockId: block.id, name: block.name, groups: resolved });
        }
        continue;
      }
      for (const slot of block.payload.slots) {
        slides.push({ kind: 'question', blockId: block.id, payload: block.payload, slot });
      }
      continue;
    }
    if (!block.image || block.zones.length === 0) continue;
    const zones = orderZonesForReading(block.zones);
    const overviewSlide: Extract<PresentationSlide, { kind: 'worksheet-overview' }> = {
      kind: 'worksheet-overview',
      blockId: block.id,
      name: block.name,
      image: block.image,
      rotation: block.rotation,
      zones,
    };
    if (block.audio && block.audio.length > 0) overviewSlide.audio = block.audio;
    slides.push(overviewSlide);
    zones.forEach((zone, i) => {
      slides.push({
        kind: 'worksheet-zone',
        blockId: block.id,
        image: block.image!,
        rotation: block.rotation,
        zone,
        zoneIndex: i + 1,
        zoneCount: zones.length,
      });
    });
  }
  return slides;
}

/**
 * Which of `slides`' own entries support "reveal" at all — parallel array,
 * same order/length. A `'question'` or `'worksheet-zone'` slide does; a
 * `'worksheet-overview'` slide (a plain glance at the whole page) never
 * does, so `presentationReducer.ts`'s own `next`/`reveal` skip straight to
 * advancing on one instead of waiting for a reveal that can never happen.
 */
export function revealableSlides(slides: readonly PresentationSlide[]): boolean[] {
  return slides.map((slide) => slide.kind !== 'worksheet-overview');
}

/**
 * One thing on this activity that would NOT project well — the "Listo para
 * enviar" checklist's own non-blocking warning (owner spec, sprint week 3):
 * a quiz prompt long enough that {@link promptFontSize} has already floored
 * it at {@link PROMPT_FONT_MIN_PX}, or a worksheet zone small enough that
 * framing it ({@link zoneExceedsMaxZoom}, `presentationCamera.ts`) would
 * need more than a sane max zoom. Never blocks a submit — see
 * `SubmitForReviewDialog.tsx`'s own render of this list.
 */
export interface ProjectionWarning {
  blockId: string;
  /** Present only for a `'worksheet_zone_too_small'` warning. */
  zoneId?: string;
  /** Present only for a `'quiz_prompt_too_long'` warning. */
  slotId?: string;
  reason: 'quiz_prompt_too_long' | 'worksheet_zone_too_small';
}

/** The stage a worksheet zone actually gets at presentation time — the safe area inside the 1920x1080 stage (`fitStage.ts`), same box `PresentationIsland.tsx`'s own camera fits a zone into. */
const PROJECTION_STAGE: Size = { width: STAGE_SAFE_WIDTH, height: STAGE_SAFE_HEIGHT };

/**
 * Every {@link ProjectionWarning} this activity's content would trigger, in
 * authored block order (quiz prompts scanned via {@link
 * collectPresentationQuestions}, worksheet zones via {@link
 * collectPresentationWorksheets}) — a flat list, since a block can trigger
 * more than one.
 */
export function listProjectionWarnings(blocks: readonly Block[]): ProjectionWarning[] {
  const warnings: ProjectionWarning[] = [];

  for (const { blockId, slot } of collectPresentationQuestions(blocks)) {
    if (promptFontSize(slot.label) <= PROMPT_FONT_MIN_PX) {
      warnings.push({ blockId, slotId: slot.id, reason: 'quiz_prompt_too_long' });
    }
  }

  for (const page of collectPresentationWorksheets(blocks)) {
    const pageSize = rotatedSize(page.image, page.rotation);
    for (const zone of page.zones) {
      if (zoneExceedsMaxZoom(zone, pageSize, PROJECTION_STAGE)) {
        warnings.push({ blockId: page.blockId, zoneId: zone.id, reason: 'worksheet_zone_too_small' });
      }
    }
  }

  return warnings;
}
