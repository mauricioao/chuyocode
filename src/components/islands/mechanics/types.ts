/**
 * The contract every mechanic renderer implements.
 *
 * A mechanic is "how the learner answers" (`slot.input`), never "what the
 * learner perceives" — audio, images and video are the OTHER axis and live in
 * `payload.media` (docs/exercise-model.md, "The two axes"). Keeping the props
 * identical across mechanics is what lets the registry dispatch on `slot.input`
 * alone, with no branch per mechanic.
 */
import type { PoolItem, Slot } from '@/lib/exercisePayload';

export interface MechanicRendererProps {
  /** The slot being answered. `slot.answer` is present but never read here. */
  slot: Slot;
  /** Options resolved from the slot's pool. Empty when the learner types. */
  items: PoolItem[];
  /** Current answer, always an array — even for single-value mechanics. */
  value: string[];
  /** Report a new answer for this slot. */
  onChange: (next: string[]) => void;
  /** Locked after grading, so feedback cannot be edited out from under itself. */
  disabled?: boolean;
}

/** A renderer is any component honouring {@link MechanicRendererProps}. */
export type MechanicRenderer = (props: MechanicRendererProps) => React.ReactNode;
