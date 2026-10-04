/**
 * presentationSlides — pure, zero-I/O helpers that turn an activity's own
 * `blocks` into Presentation mode v1's deck (owner spec, section 4: "one
 * slide per quiz item in order across all Preguntas blocks").
 *
 * WORKSHEET BLOCKS ARE NEVER PART OF THIS DECK — presentation mode only
 * plays the `quiz` ("Preguntas") blocks; a worksheet's own image/zones stay
 * off this route entirely, both to keep the deck exactly what section 1
 * describes and so a worksheet zone's answers are never shipped to this
 * route's client bundle for a block that never renders here (`[id]/
 * presentar.astro`'s own header: "only serializable props to the island").
 *
 * {@link hasPresentableQuiz} is the SINGLE source of truth for "does this
 * activity have anything to present" — shared, unchanged, between the
 * practice page's own entry-point gate (`[id].astro`, "Presentar" button)
 * and `presentar.astro`'s own defensive 404 (a direct visit must get the
 * exact same answer the button's own visibility already promised, even
 * though the button already gates the common path).
 */
import type { Block } from './blocks';
import type { Payload, Slot } from '../exercisePayload';

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
