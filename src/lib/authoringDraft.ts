/**
 * The authoring `Draft` model and its mutations (slice 15, design.md §8:
 * "Pure `Draft` model and mutations").
 *
 * PURE, ZERO I/O, NO REACT — exactly like `exercisePayload.ts` and
 * `exerciseValidator.ts`. `ExerciseAuthorIsland` is the only caller that
 * mutates React state; every function here takes a `Draft` and returns a
 * NEW one, never mutating its input, so the island can hand this straight
 * to `useState`'s updater form.
 *
 * A `Draft` is a `Payload` with `blocks` MANDATORY rather than optional: the
 * authoring surface always works in "blocks" mode — one `RowBlock` per slot,
 * plus whatever `prose`/`media` context the author adds around them
 * (`specs/exercise-blocks/spec.md`). `layout` is deliberately absent: the
 * authoring UI never sets it explicitly in this slice, so `poolPlacement()`
 * simply derives the default from slot count, exactly as it already does
 * for every exercise that omits the field.
 *
 * ID GENERATION IS THE CALLER'S JOB, ON PURPOSE. A function that minted its
 * own ids (via `Math.random()`/`Date.now()`) could not be asserted with
 * `toEqual` — the one property every other pure module in this codebase
 * insists on (`exerciseValidator.ts`'s determinism test is the canonical
 * example). `ExerciseAuthorIsland` supplies ids from a plain incrementing
 * counter.
 */
import type { Block, MediaBlock, Payload, Pool, PoolItem, ProseBlock, RowBlock, Slot } from './exercisePayload';

/** The authoring-time shape: a `Payload` whose `blocks` is always present. */
export interface Draft {
  media?: { audio?: string };
  pools: Record<string, Pool>;
  slots: Slot[];
  blocks: Block[];
}

/** The empty starting point for a brand-new exercise (`crear/index.astro`). */
export function createEmptyDraft(): Draft {
  return { pools: {}, slots: [], blocks: [] };
}

/**
 * Build a `Draft` from a stored/fetched `Payload` (`crear/[id].astro`,
 * editing an existing exercise).
 *
 * `payload.blocks` is absent on every exercise authored before slice 13
 * shipped (`exercisePayload.ts`'s own "additive by construction" rule), so
 * this SYNTHESIZES one plain `RowBlock` per slot, in slot order, when
 * `blocks` is missing — the minimal, deterministic bootstrap into "blocks
 * mode" that gives the editor full coverage to work with. An exercise that
 * already has `blocks` keeps them verbatim.
 */
export function payloadToDraft(payload: Payload): Draft {
  const blocks: Block[] =
    payload.blocks ??
    payload.slots.map((slot): RowBlock => ({ kind: 'row', id: `row-${slot.id}`, slotId: slot.id }));

  return {
    ...(payload.media ? { media: payload.media } : {}),
    pools: payload.pools,
    slots: payload.slots,
    blocks,
  };
}

/**
 * The inverse of {@link payloadToDraft} — what `ExercisePreview` and the
 * eventual save/publish request both send downstream. A `Draft` is already
 * structurally a `Payload` (`blocks` merely narrowed from optional to
 * mandatory), so this is a plain reshape, never a re-derivation.
 */
export function draftToPayload(draft: Draft): Payload {
  return {
    ...(draft.media ? { media: draft.media } : {}),
    pools: draft.pools,
    slots: draft.slots,
    blocks: draft.blocks,
  };
}

/**
 * Move the block at `fromIndex` to `toIndex`, clamping `toIndex` into range.
 *
 * Index-based rather than id-based: `BlockList` (slice 14) already resolves
 * a drag gesture into a fully reordered array via dnd-kit's own
 * `arrayMove`, so the island wires its `onReorder` straight to
 * `{ ...draft, blocks: next }`. This function exists for the cases that
 * reorder by POSITION instead of by drag event — and to give the reorder
 * rule itself a direct, pure unit test independent of dnd-kit.
 */
export function moveBlock(draft: Draft, fromIndex: number, toIndex: number): Draft {
  if (fromIndex < 0 || fromIndex >= draft.blocks.length) return draft;
  const clampedTo = Math.max(0, Math.min(toIndex, draft.blocks.length - 1));
  if (clampedTo === fromIndex) return draft;

  const blocks = [...draft.blocks];
  const [moved] = blocks.splice(fromIndex, 1);
  blocks.splice(clampedTo, 0, moved as Block);
  return { ...draft, blocks };
}

/** Remove one block. When it is a `row` block, its slot is removed too — a
 * row with no block editing it is not reachable from the authoring UI at
 * all, so leaving an orphan slot behind would silently break coverage. */
export function removeBlock(draft: Draft, blockId: string): Draft {
  const target = draft.blocks.find((b) => b.id === blockId);
  const blocks = draft.blocks.filter((b) => b.id !== blockId);
  const slots =
    target?.kind === 'row' ? draft.slots.filter((s) => s.id !== target.slotId) : draft.slots;
  return { ...draft, blocks, slots };
}

/** Append a new, empty `prose` block. */
export function addProseBlock(draft: Draft, id: string, text = ''): Draft {
  const block: ProseBlock = { kind: 'prose', id, text };
  return { ...draft, blocks: [...draft.blocks, block] };
}

/** Append a new, empty `media` block — its `image`/`audio`/`alt` are filled
 * in afterwards via {@link setBlockImage}, {@link setBlockAudio}, {@link setBlockAlt}. */
export function addMediaBlock(draft: Draft, id: string): Draft {
  const block: MediaBlock = { kind: 'media', id };
  return { ...draft, blocks: [...draft.blocks, block] };
}

/**
 * Append a new `row` block AND the `text`-mechanic slot it references — a
 * `row` block is meaningless without a slot, so the two are created
 * together, matching the all-or-nothing coverage rule this whole model is
 * built around.
 */
export function addRowBlock(draft: Draft, blockId: string, slotId: string): Draft {
  const slot: Slot = { id: slotId, label: '', input: 'text', answer: [] };
  const block: RowBlock = { kind: 'row', id: blockId, slotId };
  return { ...draft, slots: [...draft.slots, slot], blocks: [...draft.blocks, block] };
}

/** Replace a `prose` block's text. A no-op for any other block id. */
export function setBlockText(draft: Draft, blockId: string, text: string): Draft {
  return {
    ...draft,
    blocks: draft.blocks.map((b) => (b.id === blockId && b.kind === 'prose' ? { ...b, text } : b)),
  };
}

/** Set (or clear, with `undefined`) a `media` block's image URL. */
export function setBlockImage(draft: Draft, blockId: string, image: string | undefined): Draft {
  return {
    ...draft,
    blocks: draft.blocks.map((b) => {
      if (b.id !== blockId || b.kind !== 'media') return b;
      const next = { ...b };
      if (image === undefined) delete next.image;
      else next.image = image;
      return next;
    }),
  };
}

/** Set (or clear) a `media` block's audio URL. */
export function setBlockAudio(draft: Draft, blockId: string, audio: string | undefined): Draft {
  return {
    ...draft,
    blocks: draft.blocks.map((b) => {
      if (b.id !== blockId || b.kind !== 'media') return b;
      const next = { ...b };
      if (audio === undefined) delete next.audio;
      else next.audio = audio;
      return next;
    }),
  };
}

/** Set (or clear) a `media` block's alt text. */
export function setBlockAlt(draft: Draft, blockId: string, alt: string | undefined): Draft {
  return {
    ...draft,
    blocks: draft.blocks.map((b) => {
      if (b.id !== blockId || b.kind !== 'media') return b;
      const next = { ...b };
      if (alt === undefined) delete next.alt;
      else next.alt = alt;
      return next;
    }),
  };
}

/**
 * Replace a slot's label — the row editor's live-gap-parsing textarea calls
 * this on EVERY keystroke (specs/exercise-authoring/spec.md, "Authoring
 * Uses a Plain Textarea with Live Gap Parsing"). Storage only; the live
 * feedback itself is `splitLabelAtBlank`/`countBlanks`, read straight off
 * this value by the editor component.
 */
export function setRowLabel(draft: Draft, slotId: string, label: string): Draft {
  return { ...draft, slots: draft.slots.map((s) => (s.id === slotId ? { ...s, label } : s)) };
}

/** Change a slot's mechanic (`choice`/`select`/`text`/`drop`/…). */
export function setSlotInput(draft: Draft, slotId: string, input: string): Draft {
  return { ...draft, slots: draft.slots.map((s) => (s.id === slotId ? { ...s, input } : s)) };
}

/** Set (or clear) which pool a slot draws from. */
export function setSlotPool(draft: Draft, slotId: string, pool: string | undefined): Draft {
  return {
    ...draft,
    slots: draft.slots.map((s) => {
      if (s.id !== slotId) return s;
      const next = { ...s };
      if (pool === undefined) delete next.pool;
      else next.pool = pool;
      return next;
    }),
  };
}

/**
 * Replace a slot's accepted answers wholesale — one of the three functions
 * this module's tests are named after (design §8).
 */
export function setSlotAnswer(draft: Draft, slotId: string, answer: string[]): Draft {
  return { ...draft, slots: draft.slots.map((s) => (s.id === slotId ? { ...s, answer } : s)) };
}

/**
 * Set (or clear, with a blank-after-trim value) a slot's optional "¿Por
 * qué?" explanation (D5) — same "blank after trim = absent" rule
 * `WorksheetZoneEditor.tsx`'s own `setSpeak` gives a zone's `speak` field,
 * so a cleared field and a never-set one are the same on-disk shape.
 */
export function setSlotExplanation(draft: Draft, slotId: string, explanation: string): Draft {
  const trimmed = explanation.trim();
  return {
    ...draft,
    slots: draft.slots.map((s) => {
      if (s.id !== slotId) return s;
      const next = { ...s };
      // Stores the RAW value (not `trimmed`) while the author is still
      // typing — same reasoning as `WorksheetZoneEditor.tsx`'s own
      // `setSpeak`: trimming on every keystroke would eat a trailing space
      // the author is mid-typing before the next word. `parseSlot`
      // (`exercisePayload.ts`) trims for real at the parse boundary.
      if (trimmed.length > 0) next.explanation = explanation;
      else delete next.explanation;
      return next;
    }),
  };
}

/** Replace a whole named pool's items. Creates the pool if it did not exist. */
export function setPool(draft: Draft, poolName: string, pool: Pool): Draft {
  return { ...draft, pools: { ...draft.pools, [poolName]: pool } };
}

/** Append one item to a named pool (creating the pool if needed). */
export function addPoolItem(draft: Draft, poolName: string, item: PoolItem): Draft {
  const existing = draft.pools[poolName] ?? [];
  return setPool(draft, poolName, [...existing, item]);
}

/** Remove one item, by id, from a named pool. A no-op for an unknown pool. */
export function removePoolItem(draft: Draft, poolName: string, itemId: string): Draft {
  const existing = draft.pools[poolName];
  if (!existing) return draft;
  return setPool(draft, poolName, existing.filter((item) => item.id !== itemId));
}

/** Replace one pool item's visible text, by id. */
export function setPoolItemText(
  draft: Draft,
  poolName: string,
  itemId: string,
  text: string,
): Draft {
  const existing = draft.pools[poolName];
  if (!existing) return draft;
  return setPool(
    draft,
    poolName,
    existing.map((item) => (item.id === itemId ? { ...item, text } : item)),
  );
}

/** Set (or clear) one pool item's media URL, by id. */
export function setPoolItemMedia(
  draft: Draft,
  poolName: string,
  itemId: string,
  media: string | undefined,
): Draft {
  const existing = draft.pools[poolName];
  if (!existing) return draft;
  return setPool(
    draft,
    poolName,
    existing.map((item) => {
      if (item.id !== itemId) return item;
      const next = { ...item };
      if (media === undefined) delete next.media;
      else next.media = media;
      return next;
    }),
  );
}
