/**
 * Content classifier for a `'draft'`-parsed {@link Block} list — "did the
 * author actually type or upload anything yet?" (T4, "offer to discard": the
 * owner's own report — picking a mold on `/crear` always creates a real row
 * in "Mis actividades" even when the author leaves without touching it).
 *
 * ONLY TYPE IMPORTS — zero runtime dependency on `./blocks`/`../exercisePayload`
 * (both already zero-I/O themselves), so this stays safe to import straight
 * into the client bundle (`ActivityEditorIsland.tsx`'s own guard), not just
 * server-side (`descartar.ts`).
 *
 * The title, the level, a background PRESET, a custom block name and every
 * empty row/slot/pool entry do NOT count — only something the learner would
 * actually see/hear: an uploaded image, typed text, a recorded/uploaded
 * audio clip. This is deliberately NOT "is the document dirty" (which also
 * flips on a title edit) — see `ActivityEditorIsland.tsx`'s own
 * `isEmptyDraft`, which combines this with `status === 'draft'`.
 */
import type { Block, QuizBlock, WorksheetBlock } from './blocks';
import type { Block as PayloadBlock, Payload, Pool } from '../exercisePayload';

/** A string counts as content only once trimmed to something non-empty. */
function hasText(value: string | undefined): boolean {
  return (value ?? '').trim().length > 0;
}

/** Any pool, anywhere, holding an item with real text or real media. */
function poolsHaveContent(pools: Record<string, Pool>): boolean {
  return Object.values(pools).some((pool) => pool.some((item) => hasText(item.text) || hasText(item.media)));
}

/**
 * `payload.blocks` (specs/exercise-blocks/spec.md): a `row` carries no
 * content of its own (it only REFERENCES a slot, already covered by the
 * slots check below) — only `prose` (real text) and `media` (an uploaded
 * image/audio) can ever hold content here.
 */
function payloadBlocksHaveContent(blocks: PayloadBlock[] | undefined): boolean {
  if (!blocks) return false;
  return blocks.some((block) => {
    if (block.kind === 'prose') return hasText(block.text);
    if (block.kind === 'media') return Boolean(block.image) || Boolean(block.audio);
    return false;
  });
}

/** A quiz block's `payload` — questions, pools, listening audio, prose/media context blocks. */
function quizPayloadHasContent(payload: Payload): boolean {
  const slotsHaveContent = payload.slots.some(
    (slot) => hasText(slot.label) || hasText(slot.explanation) || slot.answer.some((answer) => hasText(answer)),
  );
  if (slotsHaveContent) return true;
  if (poolsHaveContent(payload.pools)) return true;
  if (hasText(payload.media?.audio)) return true;
  return payloadBlocksHaveContent(payload.blocks);
}

/**
 * A quiz block's own fields outside `payload`: a question CONTEXT image
 * (`promptImages`, owner decision 2026-10-16) on any slot, or a decorative
 * BACKGROUND image (plantillas: fondo) — never a preset, which is a CSS
 * gradient with nothing uploaded behind it.
 */
function quizBlockHasContent(block: QuizBlock): boolean {
  if (quizPayloadHasContent(block.payload)) return true;
  if (block.promptImages && Object.keys(block.promptImages).length > 0) return true;
  return block.background?.kind === 'image';
}

/**
 * A worksheet block's only possible content is its uploaded image — zones
 * and audio markers can never exist without one already (`blocks.ts`'s own
 * `parseWorksheetBlock`), so checking the image alone covers the whole block.
 */
function worksheetBlockHasContent(block: WorksheetBlock): boolean {
  return Boolean(block.image);
}

/** Does ANY block in this `'draft'`-parsed list hold real authored content? */
export function hasContent(blocks: Block[]): boolean {
  return blocks.some((block) => (block.type === 'worksheet' ? worksheetBlockHasContent(block) : quizBlockHasContent(block)));
}
