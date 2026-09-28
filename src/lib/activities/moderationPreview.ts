/**
 * Pure, zero-I/O read-only summarization for the moderator queue's block
 * preview (PR E, "Moderation", `ModerationBlockPreview`). Turns a
 * {@link Zone}/quiz {@link Slot} into the plain-text answer a moderator needs
 * to judge correctness — never rendered to a learner, so it can be blunter
 * than `WorksheetPlayer`'s own zone geometry: a joined answer list under the
 * image, not an overlay positioned on top of it.
 */
import type { Zone } from './blocks';
import type { Payload, Slot } from '../exercisePayload';

/** A zone's accepted answers, joined for display — `''` for a draft zone with none yet. */
export function zoneAnswerSummary(zone: Zone): string {
  return zone.answers.join(' / ');
}

/** A `choice` zone's offered options, joined for display — `''` for a `text` zone or one with none yet. */
export function zoneOptionsSummary(zone: Zone): string {
  if (zone.kind !== 'choice') return '';
  return (zone.options ?? []).join(' / ');
}

/**
 * A quiz slot's accepted answer(s), resolved to human-readable text: a
 * pool-backed slot's `answer` holds pool item IDS, so each is resolved to
 * that item's own `text` (falling back to the raw id when the pool or item
 * is missing — a boundary read, not assumed); a slot with no `pool` holds
 * literal answer strings already.
 */
export function quizSlotAnswerSummary(payload: Payload, slot: Slot): string {
  if (!slot.pool) return slot.answer.join(' / ');

  const pool = payload.pools[slot.pool] ?? [];
  const byId = new Map(pool.map((item) => [item.id, item]));
  return slot.answer
    .map((answerId) => {
      const item = byId.get(answerId);
      return item?.text ?? item?.media ?? answerId;
    })
    .join(' / ');
}
